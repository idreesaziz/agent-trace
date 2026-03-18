import { AgentEvent, AgentRun } from './types';

export interface FilterOptions {
  search?: string;
  eventType?: string;
  runId?: string;
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
  if (filters?.runId) {
    params.append('run_id', filters.runId);
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
  if (filters?.runId) {
    events = events.filter(e => e.run_id === filters.runId);
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
 * Fetch all agent runs, optionally filtering by search or event type.
 */
export async function fetchAgentRuns(filters?: FilterOptions): Promise<AgentRun[]> {
  const params = new URLSearchParams();
  if (filters?.eventType && filters.eventType !== 'all') {
    params.append('event_type', filters.eventType);
  }
  if (filters?.search) {
    params.append('search', filters.search);
  }

  const queryString = params.toString() ? `?${params.toString()}` : '';
  
  try {
    const response = await fetch(`/api/runs${queryString}`);
    
    if (response.ok) {
      const runData = await response.json();
      
      return runData.map((r: any) => ({
        run_id: r.run_id,
        project_name: r.project_name,
        agent: r.agent || 'Multiple', // Fallback as /api/runs might not return agent
        start_time: r.start_time,
        end_time: r.end_time,
        event_count: r.total_events,
        events: [] // Will be populated when fetching a specific run
      }));
    } else {
      throw new Error(`Failed to fetch runs: ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    console.error('Failed to fetch agent runs:', err);
    throw err;
  }
}

/**
 * Fetch a single agent run by ID, including all of its events.
 */
export async function fetchRunById(runId: string): Promise<AgentRun | null> {
  try {
    const events = await fetchEvents({ runId });
    
    if (!events || events.length === 0) {
      return null;
    }
    
    // Ensure chronological order
    const sortedEvents = [...events].sort((a, b) => getTimestampMs(a.timestamp) - getTimestampMs(b.timestamp));
    const firstEvent = sortedEvents[0];
    const lastEvent = sortedEvents[sortedEvents.length - 1];
    
    return {
      run_id: runId,
      project_name: firstEvent.project_name,
      agent: firstEvent.agent,
      start_time: firstEvent.timestamp as string,
      end_time: lastEvent.timestamp as string,
      event_count: sortedEvents.length,
      events: sortedEvents
    };
  } catch (err) {
    console.error(`Error fetching run ${runId}:`, err);
    throw err;
  }
}

/**
 * Helper to trigger download of events as JSON
 */
export function downloadEventsAsJson(events: AgentEvent[], filename: string): void {
  const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export all events for a specific run as a JSON file
 */
export async function exportRunEvents(runId: string): Promise<void> {
  const events = await fetchEvents({ runId });
  if (!events || events.length === 0) {
    throw new Error(`No events found for run ${runId}`);
  }
  const filename = `agent-trace-${runId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  downloadEventsAsJson(events, filename);
}

/**
 * Import an array of trace events
 */
export async function importTraceEvents(events: AgentEvent[]): Promise<void> {
  try {
    const response = await fetch('/api/trace/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(events.map((ev: any) => {
        const { id, ...eventData } = ev; // strip id for auto-increment
        return eventData;
      }))
    });
    if (response.ok) return;
  } catch (err) {
    // Fallback to individual POSTs if bulk fails
  }

  for (const ev of events) {
    const { id, ...eventData } = ev as any;
    const res = await fetch('/api/trace', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventData)
    });
    
    if (!res.ok) {
      throw new Error(`Failed to import event: ${res.statusText}`);
    }
  }
}