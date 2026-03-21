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

    CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
      project_name,
      agent,
      data,
      content='events',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS events_ai AFTER INSERT ON events BEGIN
      INSERT INTO events_fts(rowid, project_name, agent, data)
      VALUES (new.id, new.project_name, new.agent, new.data);
    END;

    CREATE TRIGGER IF NOT EXISTS events_ad AFTER DELETE ON events BEGIN
      INSERT INTO events_fts(events_fts, rowid, project_name, agent, data)
      VALUES ('delete', old.id, old.project_name, old.agent, old.data);
    END;

    CREATE TRIGGER IF NOT EXISTS events_au AFTER UPDATE ON events BEGIN
      INSERT INTO events_fts(events_fts, rowid, project_name, agent, data)
      VALUES ('delete', old.id, old.project_name, old.agent, old.data);
      INSERT INTO events_fts(rowid, project_name, agent, data)
      VALUES (new.id, new.project_name, new.agent, new.data);
    END;
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

export function insertEvents(events: AgentEvent[]) {
  const stmt = db.prepare(`
    INSERT INTO events (
      event_id, project_name, run_id, parent_id, agent, event_type, data, timestamp
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(event_id) DO NOTHING
  `);
  
  const insertMany = db.transaction((eventsToInsert: AgentEvent[]) => {
    for (const event of eventsToInsert) {
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
  });

  insertMany(events);
}

export function getEvents(options: { search?: string; event_type?: string; limit?: number; offset?: number; run_id?: string } = {}) {
  let queryStr = `SELECT events.* FROM events`;
  const params: any[] = [];

  if (options.search) {
    queryStr += ` JOIN events_fts ON events.id = events_fts.rowid`;
  }

  queryStr += ` WHERE 1=1`;

  if (options.run_id) {
    queryStr += ` AND events.run_id = ?`;
    params.push(String(options.run_id));
  }

  if (options.event_type) {
    queryStr += ` AND events.event_type = ?`;
    params.push(String(options.event_type));
  }

  if (options.search) {
    const searchTerm = String(options.search).replace(/"/g, '""');
    queryStr += ` AND events_fts MATCH ?`;
    params.push(`"${searchTerm}"*`);
  }

  queryStr += ` ORDER BY events.timestamp ASC`;

  if (options.limit !== undefined) {
    queryStr += ` LIMIT ?`;
    params.push(Number(options.limit));
  }

  if (options.offset !== undefined) {
    queryStr += ` OFFSET ?`;
    params.push(Number(options.offset));
  }

  const rows = db.prepare(queryStr).all(...params) as any[];

  return rows.map((row) => {
    try {
      return { ...row, data: JSON.parse(row.data) };
    } catch (e) {
      return row;
    }
  });
}

export function exportRunEvents(runId: string): AgentEvent[] {
  const stmt = db.prepare(`SELECT * FROM events WHERE run_id = ? ORDER BY timestamp ASC`);
  const rows = stmt.all(runId) as any[];
  
  return rows.map((row) => {
    try {
      return { ...row, data: JSON.parse(row.data) };
    } catch (e) {
      return row;
    }
  });
}

export function exportAllEvents(): AgentEvent[] {
  const stmt = db.prepare(`SELECT * FROM events ORDER BY timestamp ASC`);
  const rows = stmt.all() as any[];
  
  return rows.map((row) => {
    try {
      return { ...row, data: JSON.parse(row.data) };
    } catch (e) {
      return row;
    }
  });
}

export default db;