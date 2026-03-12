import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link, useParams } from 'react-router-dom';
import { Activity, Clock, Layers, AlertCircle, ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// ============================================================================
// Types
// ============================================================================

export type EventType = 'reasoning' | 'tool_call' | 'tool_result' | 'state_change' | string;

export interface AgentEvent {
  id?: number;
  project_name: string;
  run_id: string;
  event_type: EventType;
  agent: string;
  data: any;
  timestamp: number;
}

export interface AgentRun {
  run_id: string;
  project_name: string;
  startTime: number;
  endTime: number;
  eventCount: number;
  events: AgentEvent[];
}

// ============================================================================
// API Client
// ============================================================================

export const apiClient = {
  /**
   * Fetches raw events from the backend.
   */
  async fetchEvents(): Promise<AgentEvent[]> {
    const response = await fetch('/api/events');
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error fetching events: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Fetches events and groups them into logical agent runs.
   */
  async fetchGroupedRuns(): Promise<AgentRun[]> {
    const events = await this.fetchEvents();

    const runsMap = new Map<string, AgentEvent[]>();
    for (const event of events) {
      if (!runsMap.has(event.run_id)) {
        runsMap.set(event.run_id, []);
      }
      runsMap.get(event.run_id)!.push(event);
    }

    const runs: AgentRun[] = Array.from(runsMap.entries()).map(([run_id, runEvents]) => {
      // Sort chronologically ascending
      runEvents.sort((a, b) => a.timestamp - b.timestamp);

      return {
        run_id,
        project_name: runEvents[0].project_name,
        startTime: runEvents[0].timestamp * 1000,
        endTime: runEvents[runEvents.length - 1].timestamp * 1000,
        eventCount: runEvents.length,
        events: runEvents,
      };
    });

    // Sort runs by newest first (descending start time)
    return runs.sort((a, b) => b.startTime - a.startTime);
  }
};

// ============================================================================
// Components
// ============================================================================

const RunList: React.FC = () => {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadRuns = async () => {
      try {
        setLoading(true);
        const data = await apiClient.fetchGroupedRuns();
        if (isMounted) {
          setRuns(data);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Failed to load runs');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadRuns();
    return () => { isMounted = false; };
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading traces...</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-500 flex items-center justify-center">
        <AlertCircle className="w-5 h-5 mr-2" /> {error}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center">
          <Activity className="mr-3 w-8 h-8 text-blue-600" /> AgentTrace
        </h1>
        <p className="text-gray-500 mt-2">Recent agent execution traces</p>
      </div>
      {runs.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No agent runs found. Waiting for traces...
        </div>
      ) : (
        <div className="space-y-4">
          {runs.map(run => (
            <Link 
              to={`/run/${run.run_id}`} 
              key={run.run_id} 
              className="block bg-white border rounded-lg p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">{run.project_name}</h2>
                  <div className="text-sm text-gray-500 font-mono mt-1">{run.run_id}</div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
              <div className="flex space-x-6 mt-4 text-sm text-gray-600">
                <div className="flex items-center">
                  <Clock className="w-4 h-4 mr-1.5 text-gray-400" />
                  {formatDistanceToNow(run.startTime, { addSuffix: true })}
                </div>
                <div className="flex items-center">
                  <Layers className="w-4 h-4 mr-1.5 text-gray-400" />
                  {run.eventCount} events
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

const RunDetail: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<AgentRun | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadRun = async () => {
      try {
        setLoading(true);
        const data = await apiClient.fetchGroupedRuns();
        if (isMounted) {
          const found = data.find(r => r.run_id === runId);
          if (found) {
            setRun(found);
          } else {
            setError('Run not found');
          }
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Failed to load run details');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadRun();
    return () => { isMounted = false; };
  }, [runId]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading trace details...</div>;
  }

  if (error || !run) {
    return (
      <div className="p-8 text-center text-red-500 flex items-center justify-center">
        <AlertCircle className="w-5 h-5 mr-2" /> {error || 'Run not found'}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-6">
        <Link to="/" className="text-blue-600 hover:underline flex items-center text-sm mb-4">
          &larr; Back to Runs
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{run.project_name}</h1>
        <p className="text-gray-500 font-mono text-sm mt-1">{run.run_id}</p>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-4 border-b bg-gray-50 text-sm font-medium text-gray-500 grid grid-cols-12 gap-4">
          <div className="col-span-2">Time</div>
          <div className="col-span-2">Agent</div>
          <div className="col-span-2">Event Type</div>
          <div className="col-span-6">Data</div>
        </div>
        <div className="divide-y divide-gray-100">
          {run.events.map((event, idx) => (
            <div key={idx} className="p-4 text-sm grid grid-cols-12 gap-4 items-start hover:bg-gray-50">
              <div className="col-span-2 text-gray-500">
                {new Date(event.timestamp * 1000).toLocaleTimeString()}
              </div>
              <div className="col-span-2 font-medium text-gray-900 truncate" title={event.agent}>
                {event.agent}
              </div>
              <div className="col-span-2">
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold">
                  {event.event_type}
                </span>
              </div>
              <div className="col-span-6">
                <pre className="text-xs text-gray-700 bg-gray-100 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(event.data, null, 2)}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/" element={<RunList />} />
          <Route path="/run/:runId" element={<RunDetail />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);