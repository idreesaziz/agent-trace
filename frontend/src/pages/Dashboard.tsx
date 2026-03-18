import React, { useEffect, useState, useRef } from 'react';
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

  const loadRuns = async () => {
    try {
      setLoading(true);
      const data = await apiClient.fetchAgentRuns({
        search: searchTerm,
        eventType: eventTypeFilter
      });
      setRuns(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch agent runs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadRuns();
    }, 300); // Debounce search

    return () => clearTimeout(timeoutId);
  }, [searchTerm, eventTypeFilter]);

  const handleExport = async () => {
    try {
      const events = await apiClient.exportEvents();
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

      await apiClient.importEvents(events);
      await loadRuns(); // Refresh the dashboard after successful import
    } catch (err: any) {
      alert(`Failed to import traces: ${err.message}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const formatTime = (ts: string | number) => {
    if (!ts) return 'Unknown time';
    const date = new Date(apiClient.getTimestampMs(ts));
    return date.toLocaleString();
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
          <Activity className="w-7 h-7 text-blue-600" />
          AgentTrace Dashboard
        </h1>
        
        <div className="flex items-center gap-3">
          <input
            type="file"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImport}
            accept=".json"
          />
          <button
            onClick={handleImportClick}
            disabled={isImporting}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {isImporting ? 'Importing...' : 'Import'}
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export All
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by project, agent, or event content..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
          />
        </div>
        <div className="relative w-full sm:w-64">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white transition-shadow"
          >
            <option value="">All Event Types</option>
            <option value="reasoning">Reasoning</option>
            <option value="tool_call">Tool Calls</option>
            <option value="tool_result">Tool Results</option>
            <option value="state_change">State Changes</option>
          </select>
        </div>
      </div>

      {/* Main Content */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
          <div className="flex">
            <ServerCrash className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm text-red-700">
                <strong>Error:</strong> {error}
              </p>
            </div>
          </div>
        </div>
      )}

      {loading && runs.length === 0 ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      ) : runs.length === 0 && !error ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200 shadow-sm">
          <ServerCrash className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No agent runs found</h3>
          <p className="mt-2 text-sm text-gray-500">
            {searchTerm || eventTypeFilter
              ? 'Try adjusting your search terms or filters.'
              : 'Get started by running an integrated agent script using the Python SDK.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <ul className="divide-y divide-gray-200">
            {runs.map((run) => (
              <li key={run.run_id} className="hover:bg-gray-50 transition-colors group">
                <Link to={`/trace/${run.run_id}`} className="block p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                          <Box className="w-5 h-5 text-gray-500" />
                          {run.project_name}
                        </h2>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          <Bot className="w-3 h-3 mr-1" />
                          {run.agent}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4" />
                          {formatTime(run.start_time)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Layers className="w-4 h-4" />
                          {run.event_count} Events
                        </span>
                        <span className="font-mono text-xs text-gray-400 hidden sm:inline-block">
                          id: {run.run_id}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex-shrink-0 ml-4 text-gray-400 group-hover:text-blue-600 transition-colors">
                      <ArrowRight className="w-6 h-6" />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}