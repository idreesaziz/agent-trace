import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import db, { initDb, insertEvent, getEvents, exportRunEvents, insertEvents } from './db';
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

// Export events to JSON
app.get('/api/export', (req, res) => {
  try {
    const { run_id } = req.query;

    let queryStr = `SELECT event_id, project_name, run_id, parent_id, agent, event_type, data, timestamp FROM events`;
    const params: any[] = [];

    if (run_id) {
      queryStr += ` WHERE run_id = ?`;
      params.push(String(run_id));
    }
    
    queryStr += ` ORDER BY timestamp ASC`;

    const events = db.prepare(queryStr).all(...params) as any[];

    // Parse data field back to JSON
    const formattedEvents = events.map((row) => {
      try {
        return { ...row, data: JSON.parse(row.data) };
      } catch (e) {
        return row;
      }
    });

    res.setHeader('Content-disposition', 'attachment; filename=agent-trace-export.json');
    res.setHeader('Content-type', 'application/json');
    res.status(200).send(JSON.stringify(formattedEvents, null, 2));
  } catch (error: any) {
    console.error('Error exporting events:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

// Export a specific run
app.get('/api/export/:run_id', (req, res) => {
  try {
    const { run_id } = req.params;
    const events = exportRunEvents(run_id);

    res.setHeader('Content-disposition', `attachment; filename=agent-trace-${run_id}.json`);
    res.setHeader('Content-type', 'application/json');
    res.status(200).send(JSON.stringify(events, null, 2));
  } catch (error: any) {
    console.error('Error exporting events:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

// Bulk import events
app.post('/api/import', (req, res) => {
  try {
    const events = z.array(AgentEventSchema).parse(req.body);
    
    insertEvents(events);
    
    res.status(200).json({ success: true, count: events.length });
  } catch (error: any) {
    console.error('Error importing events:', error);
    res.status(400).json({ success: false, error: error.message || 'Invalid payload' });
  }
});

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`AgentTrace Server listening on port ${PORT}`);
  });
}

export default app;