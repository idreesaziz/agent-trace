import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// In-memory store for MVP
const traces: any[] = [];

app.post('/api/trace', (req, res) => {
    const trace = req.body;
    
    // Append server timestamp and save
    const enrichedTrace = { ...trace, received_at: new Date().toISOString() };
    traces.push(enrichedTrace);
    
    console.log(`[TRACE RECEIVED] Project: ${trace.project_name} | Agent: ${trace.agent} | Event: ${trace.event_type}`);
    res.status(200).json({ status: 'success' });
});

app.get('/api/traces', (req, res) => {
    res.status(200).json(traces);
});

app.get('/', (req, res) => {
    res.send('AgentTrace API Server is running. UI integration coming soon!');
});

app.listen(PORT, () => {
    console.log(`🚀 AgentTrace server running at http://localhost:${PORT}`);
});
