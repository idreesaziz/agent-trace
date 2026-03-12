export type EventType = 'reasoning' | 'tool_call' | 'tool_result' | 'state_change';

export interface ReasoningData {
  text: string;
  [key: string]: any;
}

export interface ToolCallData {
  tool_name: string;
  tool_args: Record<string, any>;
  [key: string]: any;
}

export interface ToolResultData {
  tool_name: string;
  result: any;
  error?: string;
  [key: string]: any;
}

export interface StateChangeData {
  keys_changed: string[];
  before: Record<string, any>;
  after: Record<string, any>;
  [key: string]: any;
}

export interface TraceEvent {
  id?: number;
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
  start_time: number;
  end_time: number;
  events: TraceEvent[];
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
export async function fetchEvents(): Promise<TraceEvent[]> {
  const response = await fetch('/api/events');
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch all events and group them by run_id to return a list of AgentRuns.
 */
export async function fetchAgentRuns(): Promise<AgentRun[]> {
  const events = await fetchEvents();
  const runMap = new Map<string, AgentRun>();

  for (const event of events) {
    const timestampMs = getTimestampMs(event.timestamp);

    if (!runMap.has(event.run_id)) {
      runMap.set(event.run_id, {
        run_id: event.run_id,
        project_name: event.project_name,
        start_time: timestampMs,
        end_time: timestampMs,
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

  // Sort events chronologically within each run
  for (const run of runMap.values()) {
    run.events.sort((a, b) => getTimestampMs(a.timestamp) - getTimestampMs(b.timestamp));
  }

  // Return runs sorted by newest start time first
  return Array.from(runMap.values()).sort((a, b) => b.start_time - a.start_time);
}

/**
 * Fetch a single run and its events by its run_id.
 */
export async function fetchRunById(runId: string): Promise<AgentRun | null> {
  const runs = await fetchAgentRuns();
  return runs.find((r) => r.run_id === runId) || null;
}