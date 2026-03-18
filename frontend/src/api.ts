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
        events: [] 
      }));
    }
  } catch (err) {
    // Ignore fetch errors to gracefully fallback to old logic
  }

  // Fallback to fetchEvents and manual grouping if /api/runs is unavailable
  const events = await fetchEvents(filters);
  
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