import request from 'supertest';

// Mock better-sqlite3 to use an in-memory database to prevent touching the file system
var mockDbInstance: any;
jest.mock('better-sqlite3', () => {
  const ActualDatabase = jest.requireActual('better-sqlite3');
  return jest.fn(function (path: string, options: any) {
    mockDbInstance = new ActualDatabase(':memory:', options);
    return mockDbInstance;
  });
});

// Import the Express app after the mock is in place
import app from '../src/index';

describe('AgentTrace Server API', () => {

  afterAll(() => {
    if (mockDbInstance) {
      mockDbInstance.close();
    }
  });

  afterEach(() => {
    if (mockDbInstance) {
      // Clean the events table after each test run for test isolation
      mockDbInstance.prepare('DELETE FROM events').run();
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
      const row = mockDbInstance.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
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

      const row = mockDbInstance.prepare('SELECT * FROM events WHERE event_id = ?').get('evt-3');
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
      const row = mockDbInstance.prepare('SELECT COUNT(*) as count FROM events WHERE event_id = ?').get('evt-4') as { count: number };
      expect(row.count).toBe(1);
    });
  });

  describe('POST /api/import', () => {
    it('should successfully import valid events', async () => {
      const payload = [
        {
          project_name: 'import-project',
          agent: 'import-agent',
          event_type: 'reasoning',
          data: { content: 'imported' },
          timestamp: Date.now(),
          event_id: 'evt-import-1',
          run_id: 'run-import'
        }
      ];

      const response = await request(app)
        .post('/api/import')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1);

      const row = mockDbInstance.prepare('SELECT * FROM events WHERE event_id = ?').get('evt-import-1');
      expect(row).toBeDefined();
      expect(row.project_name).toBe('import-project');
    });

    it('should return 400 when import data is invalid', async () => {
      const invalidPayload = [
        {
          project_name: 'import-project',
          // missing agent
          event_type: 'reasoning',
          data: { content: 'imported' },
          timestamp: Date.now(),
          event_id: 'evt-import-2'
        }
      ];

      const response = await request(app)
        .post('/api/import')
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET Endpoints', () => {
    beforeEach(async () => {
      const insertStmt = mockDbInstance.prepare(`
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

    describe('GET /api/search', () => {
      it('should search events by fts text', async () => {
        const response = await request(app).get('/api/search?search=step');
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBe(2);
        expect(response.body.some((e: any) => e.event_id === 'evt-get-1')).toBe(true);
        expect(response.body.some((e: any) => e.event_id === 'evt-get-3')).toBe(true);
      });

      it('should search events by tool name in data', async () => {
        const response = await request(app).get('/api/search?search=search');
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBe(1);
        expect(response.body[0].event_id).toBe('evt-get-2');
      });

      it('should filter search by run_id', async () => {
        const response = await request(app).get('/api/search?search=step&run_id=run-1');
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBe(1);
        expect(response.body[0].event_id).toBe('evt-get-1');
      });
    });

    describe('GET /api/export', () => {
      it('should export all events in correct format', async () => {
        const response = await request(app).get('/api/export');
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('application/json');
        expect(response.headers['content-disposition']).toContain('attachment; filename=agent-trace-export.json');
        
        const data = JSON.parse(response.text);
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(3);
        expect(data[0]).toHaveProperty('event_id');
        expect(data[0]).toHaveProperty('project_name');
        expect(data[0].data).toBeDefined();
        expect(typeof data[0].data).toBe('object');
      });

      it('should export events for a specific run_id via query param', async () => {
        const response = await request(app).get('/api/export?run_id=run-1');
        expect(response.status).toBe(200);
        const data = JSON.parse(response.text);
        expect(data.length).toBe(2);
        expect(data.every((e: any) => e.run_id === 'run-1')).toBe(true);
      });

      it('should export events for a specific run_id via route param', async () => {
        const response = await request(app).get('/api/export/run-2');
        expect(response.status).toBe(200);
        expect(response.headers['content-disposition']).toContain('attachment; filename=agent-trace-run-2.json');
        const data = JSON.parse(response.text);
        expect(data.length).toBe(1);
        expect(data[0].run_id).toBe('run-2');
      });
    });
  });
});