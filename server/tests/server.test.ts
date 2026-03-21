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

// Import the Express app initialization function after the mock is in place
import { createServer } from '../src/index';

const app = createServer();

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

      const row = mockDbInstance.prepare('SELECT * FROM events WHERE event_id = ?').get('evt-3') as any;
      expect(row).toBeDefined();
      expect(row.agent).toBe('test-agent');
      expect(JSON.parse(row.data)).toEqual(payload.data);
    });

    it('should silently handle duplicate event_id via ON CONFLICT DO NOTHING', async () => {
      const payload = {
        project_name: 'test-project',
        agent: 'test-agent',
        event_type: 'reasoning',
        data: { content: 'test duplicate' },
        timestamp: Date.now(),
        event_id: 'evt-4'
      };

      // First request
      let response = await request(app)
        .post('/api/trace')
        .send(payload);
      expect(response.status).toBe(200);

      // Second request
      response = await request(app)
        .post('/api/trace')
        .send(payload);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const row = mockDbInstance.prepare('SELECT COUNT(*) as count FROM events WHERE event_id = ?').get('evt-4') as { count: number };
      expect(row.count).toBe(1);
    });
  });

  describe('GET /api/events', () => {
    it('should return a list of events', async () => {
      const payload = {
        project_name: 'test-project',
        agent: 'test-agent',
        event_type: 'reasoning',
        data: { content: 'test content' },
        timestamp: Date.now(),
        event_id: 'evt-5'
      };

      await request(app).post('/api/trace').send(payload);

      const response = await request(app).get('/api/events');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0].event_id).toBe('evt-5');
    });
  });
});