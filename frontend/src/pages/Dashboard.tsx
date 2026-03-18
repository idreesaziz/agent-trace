import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Clock, Box, Layers, ArrowRight, ServerCrash, Bot, Search, Filter, Download, Upload } from 'lucide-react';
import * as apiClient from '../api';
import { AgentRun } from '../types';

export default function Dashboard() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadRuns = () => {
    apiClient.fetchAgentRuns()
      .then(data => {
        setRuns(data as AgentRun[]);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Failed to fetch agent runs');
        setLoading(false);
      });
  };

  useEffect(() => {
    let isMounted = true;
    
    apiClient.fetchAgentRuns()
      .then(data => {
        if (isMounted) {
          setRuns(data as AgentRun[]);
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

  const handleExport = async () => {
    try {
      const events = await apiClient.fetchEvents();
      const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `agent-traces-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Failed to export traces: ${err.message}`);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      const text = await file.text();
      const events = JSON.parse(text);
      
      if (!Array.isArray(events)) {
        throw new Error("Invalid trace file format. Expected an array of events.");
      }

      const eventsToImport = events.map(ev => {
        const { id, created_at, ...eventData } = ev;
        return eventData;
      });

      const res = await fetch('/api/trace/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventsToImport)
      });
      
      if (!res.ok) {
        for (const ev of eventsToImport) {
          const fallbackRes = await fetch('/api/trace', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(ev)
          });
          if (!fallbackRes.ok) {
            throw new Error(`Failed to import event: ${fallbackRes.statusText}`);
          }
        }
      }
      
      loadRuns();
    } catch (err: any) {
      alert(`Failed to import traces: ${err.message}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const filteredRuns = useMemo(() => {
    return runs.filter(run => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (
          !run.project_name.toLowerCase().includes(term) &&
          !run.run_id.toLowerCase().includes(term) &&
          !(run.agent && run.agent.toLowerCase().includes(term))
        ) {
          return false;
        }
      }
      if (eventTypeFilter && eventTypeFilter !== 'all') {
        // Event type filtering primarily handled on backend, but leaving hook active
      }
      return true;
    });
  }, [runs, searchTerm, eventTypeFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[50vh]">
        <div className="flex flex-col items-center gap-4">
          <Activity className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-gray-500 font-medium">Loading agent runs...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[50vh] text-center max-w-md mx-auto">
        <ServerCrash className="w-16 h-16 text-red-400 mb-6" />
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Connection Error</h2>
        <p className="text-gray-600 mb-6">{error}</p>
        <button 
          onClick={loadRuns}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Activity className="w-8 h-8 text-blue-600" />
            Agent Runs
          </h1>
          <p className="text-gray-500 mt-2">Monitor and debug your agent executions across frameworks.</p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            className="hidden"
            accept=".json"
          />
          <button
            onClick={handleImportClick}
            disabled={isImporting}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors shadow-sm disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {isImporting ? 'Importing...' : 'Import'}
          </button>
          
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export All
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search by project, run ID, or agent..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            />
          </div>
          <div className="relative w-full sm:w-64">
            <Filter className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <select 
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none appearance-none bg-white"
            >
              <option value="all">All Event Types</option>
              <option value="reasoning">Reasoning</option>
              <option value="tool_call">Tool Calls</option>
              <option value="tool_result">Tool Results</option>
              <option value="state_change">State Changes</option>
            </select>
          </div>
        </div>

        {filteredRuns.length === 0 ? (
          <div className="p-12 text-center">
            <Bot className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">No runs found</h3>
            <p className="text-gray-500">
              {searchTerm || eventTypeFilter !== 'all' 
                ? 'Try adjusting your search or filters.' 
                : 'Connect your agent framework using the SDK to see traces here.'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filteredRuns.map((run) => (
              <li key={run.run_id} className="hover:bg-blue-50/30 transition-colors">
                <Link to={`/trace/${run.run_id}`} className="block p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-lg font-semibold text-gray-900">
                          {run.project_name}
                        </h2>
                        <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-0.5 rounded-full font-medium">
                          {run.agent || 'Agent'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        <div className="flex items-center gap-1.5 font-mono text-xs">
                          <Box className="w-4 h-4" />
                          {run.run_id.substring(0, 8)}...
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4" />
                          {new Date(
                            typeof run.start_time === 'number' && Number(run.start_time) < 1e12 
                              ? Number(run.start_time) * 1000 
                              : Number(run.start_time)
                          ).toLocaleString()}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Layers className="w-4 h-4" />
                          {run.event_count} events
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-blue-600 font-medium group">
                      View Trace
                      <ArrowRight className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}