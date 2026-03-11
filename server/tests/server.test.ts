import request from 'supertest';
import http from 'http';

// Mock better-sqlite3 to use an in-memory database to prevent touching the file system
let dbInstance: any;
jest.mock('better-sqlite3', () => {
  const ActualDatabase = jest.requireActual('better-sqlite3');
  return jest.fn(function (path: string, options: any) {
    dbInstance = new ActualDatabase(':memory:', options);
    return dbInstance;
  });
});

describe('AgentTrace Server API', () => {
  let server: http.Server;
  let originalPort: string | undefined;

  beforeAll(() => {
    // Intercept server start to capture the HTTP server instance
    const originalListen = http.Server.prototype.listen;
    jest.spyOn(http.Server.prototype, 'listen').mockImplementation(function (this: http.Server, ...args: any[]) {
      server = this;
      return originalListen.apply(this, args as any) as any;
    });

    // Use ephemeral port to avoid EADDRINUSE conflicts
    originalPort = process.env.PORT;
    process.env.PORT = '0';

    // Require index.ts to evaluate and start the Express server
    require('../src/index');
  });

  afterAll((done) => {
    // Restore the original port
    if (originalPort !== undefined) {
      process.env.PORT = originalPort;
    } else {
      delete process.env.PORT;
    }

    const closeDb = () => {
      if (dbInstance) {
        dbInstance.close();
      }
      done();
    };

    if (server) {
      server.close(() => closeDb());
    } else {
      closeDb();
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

      const response = await request(server)
        .post('/api/trace')
        .send(payload);
      
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
      
      // Ensure nothing was saved to the database
      const row = dbInstance.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
      expect(row.count).toBe(0);
    });

    it('should return 400 when reasoning data is invalid', async () => {
      const payload = {
        project_name: 'test-project',
        agent: 'test-agent',
        event_type: 'reasoning',
        data: {
          // 'content' is strictly required for reasoning, omitted here
          prompt: 'some prompt'
        },
        timestamp: Date.now(),
        event_id: 'evt-2'
      };

      const response = await request(server)
        .post('/api/trace')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.errors).toBeDefined();
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

      const response = await request(server)
        .post('/api/trace')
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const row = dbInstance.prepare('SELECT * FROM events WHERE event_id = ?').get('evt-3');
      expect(row).toBeDefined();
      expect(row.agent).toBe('test-agent');
      expect(JSON.parse(row.data)).toEqual(payload.data);
    });

    it('should return 409 when inserting duplicate event_id', async () => {
      const payload = {
        project_name: 'test-project',
        agent: 'test-agent',
        event_type: 'reasoning',
        data: { content: 'First try' },
        timestamp: Date.now(),
        event_id: 'evt-4'
      };

      await request(server).post('/api/trace').send(payload);
      const duplicateResponse = await request(server).post('/api/trace').send(payload);

      expect(duplicateResponse.status).toBe(409);
      expect(duplicateResponse.body.success).toBe(false);
    });
  });

  describe('GET Endpoints', () => {
    beforeEach(async () => {
      // Insert some mock data directly into the database to bypass validation constraints 
      // in POST during GET tests, focusing purely on GET logic.
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
        const response = await request(server).get('/api/runs');
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.runs).toBeDefined();
        expect(response.body.runs.length).toBe(2);
        
        const run1 = response.body.runs.find((r: any) => r.run_id === 'run-1');
        expect(run1).toBeDefined();
        expect(run1.project_name).toBe('project-A');
        expect(run1.event_count).toBe(2);
        expect(run1.start_time).toBe(1000);
        expect(run1.end_time).toBe(2000);
      });

      it('should filter runs by project_name', async () => {
        const response = await request(server).get('/api/runs?project_name=project-B');
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.runs.length).toBe(1);
        expect(response.body.runs[0].run_id).toBe('run-2');
      });
    });

    describe('GET /api/events', () => {
      it('should retrieve individual trace events', async () => {
        const response = await request(server).get('/api/events');
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.events).toBeDefined();
        expect(response.body.events.length).toBe(3);
      });

      it('should retrieve events filtered by run_id', async () => {
        const response = await request(server).get('/api/events?run_id=run-1');
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.events).toBeDefined();
        expect(response.body.events.length).toBe(2);
        expect(response.body.events.every((e: any) => e.run_id === 'run-1')).toBe(true);
      });

      it('should retrieve events filtered by project_name', async () => {
        const response = await request(server).get('/api/events?project_name=project-A');
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.events).toBeDefined();
        expect(response.body.events.length).toBe(2);
        expect(response.body.events.every((e: any) => e.project_name === 'project-A')).toBe(true);
      });
    });
  });
});