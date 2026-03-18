import { AgentEvent, AgentRun } from './types';

export interface FilterOptions {
  search?: string;
  eventType?: string;
}

/**
 * Normalizes an event timestamp to milliseconds.
 */
export function getTimestampMs(ts: string | number): number {
  if (typeof ts === 'number') {
    // If it's a Unix timestamp in seconds (e.g. from Python time.time()), convert to ms
    return ts < 1e12 ? ts * 1000 : ts;
  }
  return new Date(ts).getTime();
}

/**
 * Fetch all raw trace events from the backend API.
 */
export async function fetchEvents(filters?: FilterOptions): Promise<AgentEvent[]> {
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
  
  let events: AgentEvent[] = await response.json();
  
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
      
      try {
        const dataStr = JSON.stringify(e.data).toLowerCase();
        if (dataStr.includes(term)) return true;
      } catch (err) {
        // Ignore serialization errors for malformed event data
      }
      
      return false;
    });
  }
  
  return events;
}

/**
 * Fetch all agent runs, grouping individual events by their run_id.
 */
export async function fetchAgentRuns(): Promise<AgentRun[]> {
  const events = await fetchEvents();
  
  const runMap = new Map<string, AgentEvent[]>();
  for (const event of events) {
    if (!runMap.has(event.run_id)) {
      runMap.set(event.run_id, []);
    }
    runMap.get(event.run_id)!.push(event);
  }
  
  const runs: AgentRun[] = [];
  for (const [run_id, runEvents] of runMap.entries()) {
    if (runEvents.length === 0) continue;
    
    // Sort events by timestamp
    runEvents.sort((a, b) => getTimestampMs(a.timestamp) - getTimestampMs(b.timestamp));
    
    const firstEvent = runEvents[0];
    const lastEvent = runEvents[runEvents.length - 1];
    
    runs.push({
      run_id,
      project_name: firstEvent.project_name,
      agent: firstEvent.agent,
      start_time: firstEvent.timestamp,
      end_time: lastEvent.timestamp,
      event_count: runEvents.length,
      events: runEvents
    });
  }
  
  // Sort runs by start time descending
  runs.sort((a, b) => getTimestampMs(b.start_time) - getTimestampMs(a.start_time));
  
  return runs;
}

/**
 * Fetch trace events for a specific agent run ID from the backend API.
 */
export async function fetchRunById(runId: string): Promise<AgentRun | null> {
  const response = await fetch(`/api/events?run_id=${encodeURIComponent(runId)}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch run: ${response.status} ${response.statusText}`);
  }
  
  const events: AgentEvent[] = await response.json();
  
  // Fallback in case the backend doesn't filter by run_id yet
  const runEvents = events.filter(e => e.run_id === runId);
  
  if (runEvents.length === 0) {
    return null;
  }
  
  runEvents.sort((a, b) => getTimestampMs(a.timestamp) - getTimestampMs(b.timestamp));
  
  // Safely calculate min and max timestamps using reduce to avoid Call Stack Exceeded limits on large arrays
  const minTs = runEvents.reduce((min, e) => {
    const ts = getTimestampMs(e.timestamp);
    return ts < min ? ts : min;
  }, getTimestampMs(runEvents[0].timestamp));

  const maxTs = runEvents.reduce((max, e) => {
    const ts = getTimestampMs(e.timestamp);
    return ts > max ? ts : max;
  }, getTimestampMs(runEvents[0].timestamp));

  const minEvent = runEvents.find(e => getTimestampMs(e.timestamp) === minTs) || runEvents[0];
  const maxEvent = runEvents.find(e => getTimestampMs(e.timestamp) === maxTs) || runEvents[runEvents.length - 1];

  return {
    run_id: runId,
    project_name: runEvents[0].project_name,
    agent: runEvents[0].agent,
    start_time: minEvent.timestamp,
    end_time: maxEvent.timestamp,
    event_count: runEvents.length,
    events: runEvents
  };
}

/**
 * Fetch trace events for a specific agent run ID returning just the events.
 */
export async function fetchEventsByRunId(runId: string): Promise<AgentEvent[]> {
  const run = await fetchRunById(runId);
  return run ? run.events : [];
}

/**
 * Uploads/Restores bulk trace events to the backend.
 */
export async function importTraces(events: AgentEvent[]): Promise<void> {
  const response = await fetch('/api/events/bulk', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(events)
  });
  
  if (!response.ok) {
    throw new Error(response.statusText || 'Failed to import traces');
  }
}

/**
 * Exports runs to a JSON file and triggers a browser download.
 */
export async function exportTraces(runId?: string): Promise<void> {
  let events: AgentEvent[] = [];
  
  if (runId) {
    const run = await fetchRunById(runId);
    if (run) {
      events = run.events;
    }
  } else {
    events = await fetchEvents();
  }
  
  const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  
  // Create a file-friendly timestamp string using native JavaScript date methods
  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
  a.download = runId ? `trace-${runId}-${timestampStr}.json` : `traces-${timestampStr}.json`;
  
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}