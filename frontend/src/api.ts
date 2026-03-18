export type EventType = 'reasoning' | 'tool_call' | 'tool_result' | 'state_change';

export interface ReasoningData {
  text?: string;
  content?: string;
  [key: string]: any;
}

export interface ToolCallData {
  tool_name: string;
  tool_args?: Record<string, any>;
  arguments?: Record<string, any> | string;
  [key: string]: any;
}

export interface ToolResultData {
  tool_name: string;
  result: any;
  error?: string;
  [key: string]: any;
}

export interface StateChangeData {
  keys_changed?: string[];
  before: Record<string, any>;
  after: Record<string, any>;
  [key: string]: any;
}

export interface TraceEvent {
  id?: number | string;
  run_id: string;
  project_name: string;
  agent: string;
  event_type: EventType | string;
  data: ReasoningData | ToolCallData | ToolResultData | StateChangeData | Record<string, any>;
  timestamp: string | number;
}

export interface AgentRun {
  run_id: string;
  project_name: string;
  agent?: string;
  start_time: number;
  end_time: number;
  event_count?: number;
  events: TraceEvent[];
}

export interface FilterOptions {
  search?: string;
  eventType?: string;
}

/**
 * Normalizes an event timestamp to milliseconds.
 */
function getTimestampMs(ts: string | number): number {
  if (typeof ts === 'number') {
    // If it's a Unix timestamp in seconds (e.g. from Python time.time()), convert to ms
    return ts < 1e12 ? ts * 1000 : ts;
  }
  return new Date(ts).getTime();
}

/**
 * Fetch all raw trace events from the backend API.
 */
export async function fetchEvents(filters?: FilterOptions): Promise<TraceEvent[]> {
  const params = new URLSearchParams();
  if (filters?.eventType && filters.eventType !== 'all') {
    params.append('event_type', filters.eventType);
  }
  if (filters?.search) {
    params.append('search', filters.search);
  }
  
  const queryString = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/events${queryString}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status} ${response.statusText}`);
  }
  
  let events: TraceEvent[] = await response.json();
  
  // Client-side fallback filtering in case backend doesn't support query parameters yet
  if (filters?.eventType && filters.eventType !== 'all') {
    events = events.filter(e => e.event_type === filters.eventType);
  }
  if (filters?.search) {
    const term = filters.search.toLowerCase();
    events = events.filter(e => {
      if (e.event_type.toLowerCase().includes(term)) return true;
      if (e.agent && e.agent.toLowerCase().includes(term)) return true;
      if (e.project_name && e.project_name.toLowerCase().includes(term)) return true;
      
      const dataStr = JSON.stringify(e.data).toLowerCase();
      if (dataStr.includes(term)) return true;
      
      return false;
    });
  }
  
  return events;
}

/**
 * Fetch trace events for a specific agent run ID from the backend API.
 */
export async function fetchEventsByRunId(runId: string, filters?: FilterOptions): Promise<TraceEvent[]> {
  const params = new URLSearchParams();
  if (filters?.eventType && filters.eventType !== 'all') {
    params.append('event_type', filters.eventType);
  }
  if (filters?.search) {
    params.append('search', filters.search);
  }
  
  const queryString = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/runs/${runId}/events${queryString}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch events for run ${runId}: ${response.status} ${response.statusText}`);
  }
  
  let events: TraceEvent[] = await response.json();

  // Client-side fallback filtering
  if (filters?.eventType && filters.eventType !== 'all') {
    events = events.filter(e => e.event_type === filters.eventType);
  }
  if (filters?.search) {
    const term = filters.search.toLowerCase();
    events = events.filter(e => {
      if (e.event_type.toLowerCase().includes(term)) return true;
      if (e.agent && e.agent.toLowerCase().includes(term)) return true;
      
      const dataStr = JSON.stringify(e.data).toLowerCase();
      if (dataStr.includes(term)) return true;
      
      return false;
    });
  }
  
  return events;
}

/**
 * Fetch all events and group them by run_id to return a list of AgentRuns.
 */
export async function fetchAgentRuns(filters?: FilterOptions): Promise<AgentRun[]> {
  const events = await fetchEvents(filters);
  const runMap = new Map<string, AgentRun>();

  for (const event of events) {
    const timestampMs = getTimestampMs(event.timestamp);

    if (!runMap.has(event.run_id)) {
      runMap.set(event.run_id, {
        run_id: event.run_id,
        project_name: event.project_name,
        agent: event.agent,
        start_time: timestampMs,
        end_time: timestampMs,
        event_count: 0,
        events: [],
      });
    }

    const run = runMap.get(event.run_id)!;
    run.events.push(event);

    if (timestampMs < run.start_time) {
      run.start_time = timestampMs;
    }
    if (timestampMs > run.end_time) {
      run.end_time = timestampMs;
    }
  }

  // Sort events chronologically within each run and update event counts
  for (const run of runMap.values()) {
    run.events.sort((a, b) => getTimestampMs(a.timestamp) - getTimestampMs(b.timestamp));
    run.event_count = run.events.length;
  }

  // Return runs sorted by newest start time first
  return Array.from(runMap.values()).sort((a, b) => b.start_time - a.start_time);
}

/**
 * Fetch a specific agent run by ID.
 * To maintain the full run context (like start time and full metadata), 
 * we fetch all events first, then apply the filter for the UI representation.
 */
export async function fetchRunById(runId: string, filters?: FilterOptions): Promise<AgentRun> {
  const allEventsResponse = await fetch(`/api/runs/${runId}/events`);
  if (!allEventsResponse.ok) {
    throw new Error(`Failed to fetch events for run ${runId}: ${allEventsResponse.status} ${allEventsResponse.statusText}`);
  }
  
  let allEvents: TraceEvent[] = await allEventsResponse.json();
  
  if (!allEvents || allEvents.length === 0) {
    throw new Error(`No events found for run ${runId}`);
  }

  let start_time = Infinity;
  let end_time = -Infinity;
  
  for (const event of allEvents) {
    const ts = getTimestampMs(event.timestamp);
    if (ts < start_time) start_time = ts;
    if (ts > end_time) end_time = ts;
  }
  
  allEvents.sort((a, b) => getTimestampMs(a.timestamp) - getTimestampMs(b.timestamp));

  // Apply filters if any
  let filteredEvents = allEvents;
  if (filters?.eventType && filters.eventType !== 'all') {
    filteredEvents = filteredEvents.filter(e => e.event_type === filters.eventType);
  }
  if (filters?.search) {
    const term = filters.search.toLowerCase();
    filteredEvents = filteredEvents.filter(e => {
      if (e.event_type.toLowerCase().includes(term)) return true;
      if (e.agent && e.agent.toLowerCase().includes(term)) return true;
      const dataStr = JSON.stringify(e.data).toLowerCase();
      if (dataStr.includes(term)) return true;
      return false;
    });
  }

  return {
    run_id: runId,
    project_name: allEvents[0].project_name,
    agent: allEvents[0].agent,
    start_time: start_time === Infinity ? 0 : start_time,
    end_time: end_time === -Infinity ? 0 : end_time,
    event_count: filteredEvents.length,
    events: filteredEvents,
  };
}