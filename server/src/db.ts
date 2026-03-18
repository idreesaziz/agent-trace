import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';

const dataDir = path.resolve(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'agent-trace.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');

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

export const agentEventSchema = z.object({
  project_name: z.string(),
  agent: z.string(),
  event_type: z.string(),
  data: z.record(z.string(), z.any()),
  timestamp: z.number(),
  event_id: z.string(),
  run_id: z.string().nullable().optional(),
  parent_id: z.string().nullable().optional()
});

export type AgentEvent = z.infer<typeof agentEventSchema>;

export function insertEvent(event: AgentEvent) {
  const stmt = db.prepare(`
    INSERT INTO events (
      event_id, project_name, run_id, parent_id, agent, event_type, data, timestamp
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(event_id) DO NOTHING
  `);
  stmt.run(
    event.event_id,
    event.project_name,
    event.run_id || null,
    event.parent_id || null,
    event.agent,
    event.event_type,
    JSON.stringify(event.data),
    event.timestamp
  );
}

export function getEvents(options: { search?: string; event_type?: string; limit?: number; offset?: number } = {}) {
  let queryStr = `SELECT * FROM events WHERE 1=1`;
  const params: any[] = [];

  if (options.event_type) {
    queryStr += ` AND event_type = ?`;
    params.push(options.event_type);
  }

  if (options.search) {
    queryStr += ` AND (data LIKE ? OR agent LIKE ? OR event_id LIKE ? OR run_id LIKE ? OR project_name LIKE ?)`;
    const term = `%${options.search}%`;
    params.push(term, term, term, term, term);
  }

  queryStr += ` ORDER BY timestamp DESC`;

  if (options.limit !== undefined) {
    queryStr += ` LIMIT ?`;
    params.push(options.limit);
    if (options.offset !== undefined) {
      queryStr += ` OFFSET ?`;
      params.push(options.offset);
    }
  }

  return db.prepare(queryStr).all(...params);
}

export function getGroupedRuns(options: { limit?: number; offset?: number; project_name?: string; search?: string; event_type?: string } = {}) {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
  
  let queryStr = `
    SELECT 
      run_id,
      project_name,
      COUNT(*) as total_events,
      MIN(timestamp) as start_time,
      MAX(timestamp) as end_time
    FROM events
    WHERE run_id IS NOT NULL
  `;
  const params: any[] = [];

  if (options.project_name) {
    queryStr += ' AND project_name = ?';
    params.push(options.project_name);
  }

  if (options.search || options.event_type) {
    queryStr += ` AND run_id IN (SELECT DISTINCT run_id FROM events WHERE run_id IS NOT NULL`;
    if (options.event_type) {
      queryStr += ` AND event_type = ?`;
      params.push(options.event_type);
    }
    if (options.search) {
      queryStr += ` AND (data LIKE ? OR agent LIKE ? OR event_id LIKE ?)`;
      const term = `%${options.search}%`;
      params.push(term, term, term);
    }
    queryStr += `)`;
  }

  queryStr += `
    GROUP BY run_id, project_name
    ORDER BY MAX(timestamp) DESC
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  return db.prepare(queryStr).all(...params);
}

export function getTraceEvents(runId: string, options: { search?: string; event_type?: string } = {}) {
  let queryStr = `
    SELECT * FROM events
    WHERE run_id = ?
  `;
  const params: any[] = [runId];

  if (options.event_type) {
    queryStr += ` AND event_type = ?`;
    params.push(options.event_type);
  }

  if (options.search) {
    queryStr += ` AND (data LIKE ? OR agent LIKE ? OR event_id LIKE ?)`;
    const term = `%${options.search}%`;
    params.push(term, term, term);
  }

  queryStr += ` ORDER BY timestamp ASC`;

  return db.prepare(queryStr).all(...params);
}

export default db;