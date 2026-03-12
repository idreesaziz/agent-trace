import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Clock, Box, Layers, ArrowRight, ServerCrash, Bot } from 'lucide-react';
import { format } from 'date-fns';
import * as apiClient from '../api';
import { AgentRun as RunGroup } from '../types';

export default function Dashboard() {
  const [runs, setRuns] = useState<RunGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    apiClient.fetchAgentRuns()
      .then(data => {
        if (isMounted) {
          setRuns(data as unknown as RunGroup[]);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err.message || 'Failed to fetch agent runs');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-gray-500 flex items-center justify-center gap-2 h-64">
        <Activity className="animate-spin w-5 h-5 text-blue-500" /> Loading runs...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-red-500 flex items-center justify-center gap-2 h-64">
        <ServerCrash className="w-6 h-6" /> Error: {error}
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Activity className="w-8 h-8 text-blue-500" />
        <h1 className="text-2xl font-bold text-gray-900">AgentTrace Dashboard</h1>
      </div>

      {runs.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No trace events found. Run your agent with the Python SDK to send events.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="p-4 font-medium text-gray-600">Project</th>
                <th className="p-4 font-medium text-gray-600">Agent</th>
                <th className="p-4 font-medium text-gray-600">Run ID</th>
                <th className="p-4 font-medium text-gray-600">Start Time</th>
                <th className="p-4 font-medium text-gray-600">Events</th>
                <th className="p-4 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => {
                const agentName = run.agent || (run.events && run.events.length > 0 ? run.events[0].agent : 'Unknown');
                const eventCount = run.event_count || (run.events ? run.events.length : 0);

                let formattedTime = 'Unknown';
                if (run.start_time) {
                  const dateObj = new Date(run.start_time);
                  if (!isNaN(dateObj.getTime())) {
                    formattedTime = format(dateObj, 'MMM d, yyyy HH:mm:ss');
                  }
                }

                return (
                  <tr key={run.run_id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-4 text-gray-900 font-medium">
                      <div className="flex items-center gap-2">
                        <Box className="w-4 h-4 text-gray-400" />
                        {run.project_name}
                      </div>
                    </td>
                    <td className="p-4 text-gray-600">
                      <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4 text-gray-400" />
                        {agentName}
                      </div>
                    </td>
                    <td className="p-4 text-gray-500 font-mono text-sm">
                      <Link to={`/trace/${run.run_id}`} className="text-blue-600 hover:underline">
                        {run.run_id}
                      </Link>
                    </td>
                    <td className="p-4 text-gray-600">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400" />
                        {formattedTime}
                      </div>
                    </td>
                    <td className="p-4 text-gray-600">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-gray-400" />
                        {eventCount} events
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <Link 
                        to={`/trace/${run.run_id}`} 
                        className="inline-flex items-center justify-center p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                        title="View Trace"
                      >
                        <ArrowRight className="w-5 h-5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}