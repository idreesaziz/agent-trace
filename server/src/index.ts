import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';

// --- Schema Definitions ---
export const EventTypeSchema = z.enum([
  'reasoning',
  'tool_call',
  'tool_result',
  'state_change',
  'message',
  'error'
]);

export const ReasoningDataSchema = z.object({
  content: z.string(),
  prompt: z.string().nullable().optional(),
  model: z.string().nullable().optional()
});

export const ToolCallDataSchema = z.object({
  tool_name: z.string(),
  arguments: z.record(z.string(), z.any()),
  tool_call_id: z.string().nullable().optional()
});

export const ToolResultDataSchema = z.object({
  tool_name: z.string(),
  result: z.any(),
  tool_call_id: z.string().nullable().optional(),
  is_error: z.boolean().default(false)
});

export const StateChangeDataSchema = z.object({
  keys_changed: z.array(z.string()),
  old_state: z.record(z.string(), z.any()),
  new_state: z.record(z.string(), z.any()),
  reason: z.string().nullable().optional()
});

export const AgentEventSchema = z.object({
  project_name: z.string(),
  agent: z.string(),
  event_type: z.string(),
  data: z.record(z.string(), z.any()),
  timestamp: z.number(),
  event_id: z.string(),
  run_id: z.string().nullable().optional(),
  parent_id: z.string().nullable().optional()
});

export type EventType = z.infer<typeof EventTypeSchema>;
export type ReasoningData = z.infer<typeof ReasoningDataSchema>;
export type ToolCallData = z.infer<typeof ToolCallDataSchema>;
export type ToolResultData = z.infer<typeof ToolResultDataSchema>;
export type StateChangeData = z.infer<typeof StateChangeDataSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;

// --- Database Initialization ---
const dataDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const isTestEnv = process.env.NODE_ENV === 'test';
const dbPath = isTestEnv ? ':memory:' : path.join(dataDir, 'agent-trace.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent performance
if (!isTestEnv) {
  db.pragma('journal_mode = WAL');
}

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE NOT NULL,
      project_name TEXT NOT NULL,
      run_id TEXT,
      parent_id TEXT,
      agent TEXT NOT NULL,
      event_type TEXT NOT NULL,
      data TEXT NOT NULL,
      timestamp REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_events_project_name ON events(project_name);
    CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id);
    CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent);
    CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
  `);
}

// Initialize the SQLite database
initDb();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.post('/api/trace', (req, res) => {
  try {
    const payload = AgentEventSchema.parse(req.body);

    if (payload.event_type === 'reasoning') {
      ReasoningDataSchema.parse(payload.data);
    } else if (payload.event_type === 'tool_call') {
      ToolCallDataSchema.parse(payload.data);
    } else if (payload.event_type === 'tool_result') {
      ToolResultDataSchema.parse(payload.data);
    } else if (payload.event_type === 'state_change') {
      StateChangeDataSchema.parse(payload.data);
    }

    const stmt = db.prepare(`
      INSERT INTO events (
        event_id, project_name, run_id, parent_id, agent, event_type, data, timestamp
      ) VALUES (
        @event_id, @project_name, @run_id, @parent_id, @agent, @event_type, @data, @timestamp
      )
    `);

    stmt.run({
      event_id: payload.event_id,
      project_name: payload.project_name,
      run_id: payload.run_id || null,
      parent_id: payload.parent_id || null,
      agent: payload.agent,
      event_type: payload.event_type,
      data: JSON.stringify(payload.data),
      timestamp: payload.timestamp
    });

    res.status(200).json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: error.errors });
    }
    console.error('Error in /api/trace:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.get('/api/runs', (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT 
        run_id,
        project_name,
        MIN(timestamp) as start_time,
        MAX(timestamp) as end_time,
        COUNT(*) as event_count,
        COUNT(DISTINCT agent) as agent_count
      FROM events
      GROUP BY run_id, project_name
      ORDER BY start_time DESC
    `);
    
    const runs = stmt.all();
    res.status(200).json({ success: true, runs });
  } catch (error) {
    console.error('Error fetching runs:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.get('/api/runs/:run_id/events', (req, res) => {
  try {
    const { run_id } = req.params;
    
    const stmt = db.prepare(`
      SELECT *
      FROM events
      WHERE run_id = ?
      ORDER BY timestamp ASC
    `);
    
    const events = stmt.all(run_id).map((event: any) => ({
      ...event,
      data: JSON.parse(event.data)
    }));
    
    res.status(200).json({ success: true, events });
  } catch (error) {
    console.error('Error fetching run events:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AgentTrace server running on port ${PORT}`);
});

export default app;