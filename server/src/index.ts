import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import db, { initDb, insertEvent } from './db';
import { AgentEventSchema } from './schema';

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for bulk payload ingestion

// Initialize the database connection and schema
initDb();

// Ingest agent trace events from SDKs
app.post('/api/trace', (req, res) => {
  try {
    const event = AgentEventSchema.parse(req.body);
    insertEvent(event);
    res.status(200).json({ success: true });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Invalid payload' });
  }
});

// Bulk ingest an array of trace events
app.post('/api/trace/bulk', (req, res) => {
  try {
    const events = z.array(AgentEventSchema).parse(req.body);
    
    const insertMany = db.transaction((eventsList: any[]) => {
      for (const event of eventsList) {
        insertEvent(event);
      }
    });
    
    insertMany(events);
    res.status(200).json({ success: true, count: events.length });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message || 'Invalid payload' });
  }
});

// Retrieve ingested events for the frontend, with optional search and filtering
app.get('/api/events', (req, res) => {
  try {
    const { search, event_type, run_id, limit = 1000, offset = 0 } = req.query;

    let queryStr = `SELECT * FROM events WHERE 1=1`;
    const params: any[] = [];

    if (run_id) {
      queryStr += ` AND run_id = ?`;
      params.push(String(run_id));
    }

    if (event_type) {
      queryStr += ` AND event_type = ?`;
      params.push(String(event_type));
    }

    if (search) {
      const searchTerm = `%${String(search)}%`;
      queryStr += ` AND (data LIKE ? OR agent LIKE ? OR project_name LIKE ?)`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    queryStr += ` ORDER BY timestamp ASC LIMIT ? OFFSET ?`;
    params.push(Number(limit), Number(offset));

    const events = db.prepare(queryStr).all(...params) as any[];

    // Parse data field back to JSON
    const formattedEvents = events.map((row) => {
      try {
        return { ...row, data: JSON.parse(row.data) };
      } catch (e) {
        return row;
      }
    });

    res.status(200).json(formattedEvents);
  } catch (error: any) {
    console.error('Error fetching events:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

// Retrieve grouped runs, with optional search and filtering
app.get('/api/runs', (req, res) => {
  try {
    const { search, event_type, project_name, limit = 100, offset = 0 } = req.query;

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

    if (project_name) {
      queryStr += ` AND project_name = ?`;
      params.push(String(project_name));
    }

    if (event_type) {
      queryStr += ` AND run_id IN (SELECT DISTINCT run_id FROM events WHERE event_type = ?)`;
      params.push(String(event_type));
    }

    if (search) {
      const searchTerm = `%${String(search)}%`;
      queryStr += ` AND run_id IN (SELECT DISTINCT run_id FROM events WHERE data LIKE ? OR agent LIKE ? OR project_name LIKE ?)`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    queryStr += `
      GROUP BY run_id, project_name
      ORDER BY MAX(timestamp) DESC
      LIMIT ? OFFSET ?
    `;
    params.push(Number(limit), Number(offset));

    const runs = db.prepare(queryStr).all(...params);

    res.status(200).json(runs);
  } catch (error: any) {
    console.error('Error fetching runs:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AgentTrace server running on port ${PORT}`);
});

export default app;