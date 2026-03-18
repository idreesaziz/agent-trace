import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Clock, Box, Layers, ArrowRight, ServerCrash, Bot, Search, Filter } from 'lucide-react';
import { format } from 'date-fns';
import * as apiClient from '../api';
import { AgentRun as RunGroup } from '../types';

export default function Dashboard() {
  const [runs, setRuns] = useState<RunGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');

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

  const filteredRuns = useMemo(() => {
    return runs.filter(run => {
      const agentName = run.agent || (run.events && run.events.length > 0 ? run.events[0].agent : 'Unknown');
      const projectName = run.project_name || '';
      const runId = run.run_id || '';

      const matchesSearch = 
        projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        agentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        runId.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesEventType = eventTypeFilter === '' || 
        (run.events && run.events.some(e => e.event_type === eventTypeFilter));

      return matchesSearch && matchesEventType;
    });
  }, [runs, searchTerm, eventTypeFilter]);

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <Activity className="w-8 h-8 text-blue-500" />
          <h1 className="text-2xl font-bold text-gray-900">AgentTrace Dashboard</h1>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative w-full sm:w-auto">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search runs..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
          </div>
          <div className="relative w-full sm:w-auto">
            <Filter className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              className="w-full pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white cursor-pointer"
            >
              <option value="">All Events</option>
              <option value="reasoning">Reasoning</option>
              <option value="tool_call">Tool Call</option>
              <option value="tool_result">Tool Result</option>
              <option value="state_change">State Change</option>
            </select>
          </div>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No trace events found. Run your agent with the Python SDK to send events.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
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
                {filteredRuns.map(run => {
                  const agentName = run.agent || (run.events && run.events.length > 0 ? run.events[0].agent : 'Unknown');
                  const eventCount = run.event_count || (run.events ? run.events.length : 0);

                  let formattedTime = 'Unknown';
                  if (run.start_time) {
                    const ts = typeof run.start_time === 'number' && run.start_time < 1e12 ? run.start_time * 1000 : run.start_time;
                    const dateObj = new Date(ts);
                    if (!isNaN(dateObj.getTime())) {
                      formattedTime = format(dateObj, 'MMM d, yyyy HH:mm:ss');
                    }
                  }

                  return (
                    <tr key={run.run_id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Box className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-900">{run.project_name}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Bot className="w-4 h-4 text-gray-400" />
                          {agentName}
                        </div>
                      </td>
                      <td className="p-4 text-sm text-gray-500 font-mono">
                        {run.run_id.slice(0, 8)}...
                      </td>
                      <td className="p-4 text-sm text-gray-500">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          {formattedTime}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Layers className="w-4 h-4 text-gray-400" />
                          {eventCount} events
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <Link 
                          to={`/trace/${run.run_id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors text-sm font-medium"
                        >
                          View Trace
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {filteredRuns.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500 bg-gray-50">
                      No matching runs found for your search and filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}