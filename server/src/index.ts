import express from 'express';
import cors from 'cors';
import { initDb, insertEvent, getEvents } from './db';
import { AgentEventSchema } from './schema';

const app = express();

app.use(cors());
app.use(express.json());

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

// Retrieve ingested events for the frontend
app.get('/api/events', (req, res) => {
  try {
    const events = getEvents();
    res.status(200).json(events);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`AgentTrace server running on port ${PORT}`);
  });
}

export default app;