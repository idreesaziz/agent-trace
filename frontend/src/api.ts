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
  const endpoint = filters?.search ? '/api/search' : '/api/events';
  const response = await fetch(`${endpoint}${queryString}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.status} ${response.statusText}`);
  }
  
  const events: AgentEvent[] = await response.json();
  
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
  
  const response = await fetch(`/api/runs${queryString}`);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch runs: ${response.status} ${response.statusText}`);
  }
  
  const runData = await response.json();
  
  return runData.map((r: any) => ({
    run_id: r.run_id,
    project_name: r.project_name,
    agent: r.agent || 'Multiple', // Fallback as /api/runs might not include agent
    start_time: r.start_time,
    end_time: r.end_time,
    event_count: r.total_events,
    events: []
  }));
}

/**
 * Export events to a JSON file format.
 */
export async function exportEvents(runId?: string): Promise<AgentEvent[]> {
  const endpoint = runId ? `/api/export/${runId}` : '/api/export';
  const response = await fetch(endpoint);
  
  if (!response.ok) {
    throw new Error(`Failed to export events: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Bulk import events.
 */
export async function importEvents(events: AgentEvent[]): Promise<{ success: boolean; count?: number }> {
  const response = await fetch('/api/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(events)
  });

  if (!response.ok) {
    let errorMsg = `Failed to import events: ${response.status} ${response.statusText}`;
    try {
      const data = await response.json();
      if (data && data.error) {
        errorMsg = `Failed to import events: ${data.error}`;
      }
    } catch (e) {
      // Ignore if response is not JSON
    }
    throw new Error(errorMsg);
  }

  return response.json();
}