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

  it('should successfully ingest a valid reasoning event', async () => {
    const payload = {
      project_name: 'test-project',
      agent: 'test-agent',
      event_type: 'reasoning',
      data: {
        content: 'Thinking about the problem',
        prompt: 'Solve it',
        model: 'gpt-4'
      },
      timestamp: Date.now(),
      event_id: 'evt-3'
    };

    const response = await request(server)
      .post('/api/trace')
      .send(payload);
    
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });

    // Verify DB
    const rows = dbInstance.prepare('SELECT * FROM events WHERE event_id = ?').all('evt-3');
    expect(rows).toHaveLength(1);
    expect(rows[0].project_name).toBe('test-project');
    expect(JSON.parse(rows[0].data)).toEqual(payload.data);
  });

  it('should successfully ingest a valid tool_call event', async () => {
    const payload = {
      project_name: 'test-project',
      agent: 'test-agent',
      event_type: 'tool_call',
      data: {
        tool_name: 'calculator',
        arguments: { a: '1', b: '2' },
        tool_call_id: 'call-1'
      },
      timestamp: Date.now(),
      event_id: 'evt-4'
    };

    const response = await request(server)
      .post('/api/trace')
      .send(payload);

    expect(response.status).toBe(200);

    const rows = dbInstance.prepare('SELECT * FROM events WHERE event_id = ?').all('evt-4');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].data)).toEqual(payload.data);
  });

  it('should successfully ingest a valid tool_result event', async () => {
    const payload = {
      project_name: 'test-project',
      agent: 'test-agent',
      event_type: 'tool_result',
      data: {
        tool_name: 'calculator',
        result: '3',
        tool_call_id: 'call-1',
        is_error: false
      },
      timestamp: Date.now(),
      event_id: 'evt-5'
    };

    const response = await request(server)
      .post('/api/trace')
      .send(payload);

    expect(response.status).toBe(200);

    const rows = dbInstance.prepare('SELECT * FROM events WHERE event_id = ?').all('evt-5');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].data)).toEqual(payload.data);
  });

  it('should successfully ingest a valid state_change event', async () => {
    const payload = {
      project_name: 'test-project',
      agent: 'test-agent',
      event_type: 'state_change',
      data: {
        keys_changed: ['status'],
        old_state: { status: 'idle' },
        new_state: { status: 'running' },
        reason: 'started execution'
      },
      timestamp: Date.now(),
      event_id: 'evt-6'
    };

    const response = await request(server)
      .post('/api/trace')
      .send(payload);

    expect(response.status).toBe(200);

    const rows = dbInstance.prepare('SELECT * FROM events WHERE event_id = ?').all('evt-6');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].data)).toEqual(payload.data);
  });

  it('should successfully ingest an unknown event_type without strictly validating nested data', async () => {
    const payload = {
      project_name: 'test-project',
      agent: 'test-agent',
      event_type: 'custom_event',
      data: { custom: true, nested: { prop: 1 } },
      timestamp: Date.now(),
      event_id: 'evt-7'
    };

    const response = await request(server)
      .post('/api/trace')
      .send(payload);
    
    expect(response.status).toBe(200);

    const rows = dbInstance.prepare('SELECT * FROM events WHERE event_id = ?').all('evt-7');
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('custom_event');
    expect(JSON.parse(rows[0].data)).toEqual(payload.data);
  });
});