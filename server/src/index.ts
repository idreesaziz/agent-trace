import express from 'express';
import cors from 'cors';
import path from 'path';
import { z } from 'zod';
import db, { initDb, insertEvent, getEvents, exportRunEvents, insertEvents } from './db';
import { AgentEventSchema } from './schema';

export function createServer() {
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

  // Search events using FTS
  app.get('/api/search', (req, res) => {
    try {
      const { search, event_type, run_id, limit = 1000, offset = 0 } = req.query;

      const events = getEvents({
        search: search ? String(search) : undefined,
        event_type: event_type ? String(event_type) : undefined,
        run_id: run_id ? String(run_id) : undefined,
        limit: Number(limit),
        offset: Number(offset)
      });

      res.status(200).json(events);
    } catch (error: any) {
      console.error('Error searching events:', error);
      res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
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
      const formattedEvents = events.map((row: any) => {
        try {
          return { ...row, data: JSON.parse(row.data) };
        } catch (e) {
          return row;
        }
      });

      res.status(200).json(formattedEvents);
    } catch (error: any) {
      console.error('Error retrieving events:', error);
      res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
    }
  });

  // Retrieve grouped agent runs
  app.get('/api/runs', (req, res) => {
    try {
      const { project_name, limit = 100, offset = 0 } = req.query;

      let queryStr = `
        SELECT 
          run_id,
          project_name,
          MIN(timestamp) as start_time,
          MAX(timestamp) as end_time,
          COUNT(*) as total_events
        FROM events
        WHERE run_id IS NOT NULL
      `;
      const params: any[] = [];

      if (project_name) {
        queryStr += ` AND project_name = ?`;
        params.push(String(project_name));
      }

      queryStr += `
        GROUP BY run_id, project_name
        ORDER BY start_time DESC
        LIMIT ? OFFSET ?
      `;
      params.push(Number(limit), Number(offset));

      const runs = db.prepare(queryStr).all(...params);
      res.status(200).json(runs);
    } catch (error: any) {
      console.error('Error retrieving runs:', error);
      res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
    }
  });

  // Export events for a specific run
  app.get('/api/export/:run_id', (req, res) => {
    try {
      const { run_id } = req.params;
      const events = exportRunEvents(run_id);
      
      if (events.length === 0) {
        return res.status(404).json({ success: false, error: 'Run not found or has no events' });
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="trace_${run_id}.json"`);
      res.status(200).send(JSON.stringify(events, null, 2));
    } catch (error: any) {
      console.error('Error exporting events:', error);
      res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
    }
  });

  // Import events from a JSON file
  app.post('/api/import', (req, res) => {
    try {
      const events = z.array(AgentEventSchema).parse(req.body);
      insertEvents(events);
      res.status(200).json({ success: true, count: events.length });
    } catch (error: any) {
      res.status(400).json({ success: false, error: error.message || 'Invalid payload for import' });
    }
  });

  // Serve static frontend build
  const frontendPath = path.join(__dirname, '..', '..', 'frontend', 'dist');
  app.use(express.static(frontendPath));

  // Fallback to index.html for React Router
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });

  return app;
}

export default createServer;

// Start server only if this file is run directly
if (require.main === module) {
  const app = createServer();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`AgentTrace Server running on port ${PORT}`);
  });
}