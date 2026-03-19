import request from 'supertest';

// Mock better-sqlite3 to use an in-memory database to prevent touching the file system
let dbInstance: any;
jest.mock('better-sqlite3', () => {
  const ActualDatabase = jest.requireActual('better-sqlite3');
  return jest.fn(function (path: string, options: any) {
    dbInstance = new ActualDatabase(':memory:', options);
    return dbInstance;
  });
});

// Import the Express app after the mock is in place
import app from '../src/index';

describe('AgentTrace Server API', () => {

  afterAll(() => {
    if (dbInstance) {
      dbInstance.close();
    }
  });

  afterEach(() => {
    if (dbInstance) {
      // Clean the events table after each test run for test isolation
      dbInstance.prepare('DELETE FROM events').run();
    }
  });

  describe('POST /api/trace', () => {
    it('should return 400 when required fields are missing', async () => {
      const payload = {
        project_name: 'test-project',
        // missing 'agent'
        event_type: 'reasoning',
        data: { content: 'test' },
        timestamp: Date.now(),
        event_id: 'evt-1'
      };

      const response = await request(app)
        .post('/api/trace')
        .send(payload);
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      
      // Ensure nothing was saved to the database
      const row = dbInstance.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
      expect(row.count).toBe(0);
    });

    it('should return 400 when data field has wrong type', async () => {
      const payload = {
        project_name: 'test-project',
        agent: 'test-agent',
        event_type: 'reasoning',
        data: 'not-an-object',
        timestamp: Date.now(),
        event_id: 'evt-2'
      };

      const response = await request(app)
        .post('/api/trace')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should successfully ingest a valid trace event', async () => {
      const payload = {
        project_name: 'test-project',
        agent: 'test-agent',
        event_type: 'reasoning',
        data: { content: 'This is my thought process.' },
        timestamp: Date.now(),
        event_id: 'evt-3'
      };

      const response = await request(app)
        .post('/api/trace')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const row = dbInstance.prepare('SELECT * FROM events WHERE event_id = ?').get('evt-3');
      expect(row).toBeDefined();
      expect(row.agent).toBe('test-agent');
      expect(JSON.parse(row.data)).toEqual(payload.data);
    });

    it('should silently handle duplicate event_id via ON CONFLICT DO NOTHING', async () => {
      const payload = {
        project_name: 'test-project',
        agent: 'test-agent',
        event_type: 'reasoning',
        data: { content: 'First try' },
        timestamp: Date.now(),
        event_id: 'evt-4'
      };

      await request(app).post('/api/trace').send(payload);
      const duplicateResponse = await request(app).post('/api/trace').send(payload);

      // ON CONFLICT DO NOTHING means the server returns 200 (idempotent)
      expect(duplicateResponse.status).toBe(200);

      // Only one row should exist
      const row = dbInstance.prepare('SELECT COUNT(*) as count FROM events WHERE event_id = ?').get('evt-4') as { count: number };
      expect(row.count).toBe(1);
    });
  });

  describe('GET Endpoints', () => {
    beforeEach(async () => {
      const insertStmt = dbInstance.prepare(`
        INSERT INTO events (
          event_id, project_name, run_id, parent_id, agent, event_type, data, timestamp
        ) VALUES (
          @event_id, @project_name, @run_id, @parent_id, @agent, @event_type, @data, @timestamp
        )
      `);

      const events = [
        {
          project_name: 'project-A',
          run_id: 'run-1',
          parent_id: null,
          agent: 'agent-1',
          event_type: 'reasoning',
          data: JSON.stringify({ content: 'step 1' }),
          timestamp: 1000,
          event_id: 'evt-get-1'
        },
        {
          project_name: 'project-A',
          run_id: 'run-1',
          parent_id: 'evt-get-1',
          agent: 'agent-1',
          event_type: 'tool_call',
          data: JSON.stringify({ tool_name: 'search', arguments: { q: 'test' } }),
          timestamp: 2000,
          event_id: 'evt-get-2'
        },
        {
          project_name: 'project-B',
          run_id: 'run-2',
          parent_id: null,
          agent: 'agent-2',
          event_type: 'reasoning',
          data: JSON.stringify({ content: 'step 1' }),
          timestamp: 1500,
          event_id: 'evt-get-3'
        }
      ];

      for (const ev of events) {
        insertStmt.run(ev);
      }
    });

    describe('GET /api/runs', () => {
      it('should retrieve grouped agent runs', async () => {
        const response = await request(app).get('/api/runs');
        
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBe(2);
        
        const run1 = response.body.find((r: any) => r.run_id === 'run-1');
        expect(run1).toBeDefined();
        expect(run1.project_name).toBe('project-A');
        expect(run1.total_events).toBe(2);
        expect(run1.start_time).toBe(1000);
        expect(run1.end_time).toBe(2000);
      });

      it('should filter runs by project_name', async () => {
        const response = await request(app).get('/api/runs?project_name=project-B');
        
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBe(1);
        expect(response.body[0].run_id).toBe('run-2');
      });
    });

    describe('GET /api/events', () => {
      it('should retrieve individual trace events', async () => {
        const response = await request(app).get('/api/events');
        
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBe(3);
      });

      it('should retrieve events filtered by run_id', async () => {
        const response = await request(app).get('/api/events?run_id=run-1');
        
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBe(2);
        expect(response.body.every((e: any) => e.run_id === 'run-1')).toBe(true);
      });

      it('should retrieve events filtered by event_type', async () => {
        const response = await request(app).get('/api/events?event_type=reasoning');
        
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBe(2);
        expect(response.body.every((e: any) => e.event_type === 'reasoning')).toBe(true);
      });
    });
  });
});