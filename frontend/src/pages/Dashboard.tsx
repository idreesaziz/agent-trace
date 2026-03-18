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

      for (const ev of events) {
        // Strip out id so DB auto-increments and doesn't conflict
        const { id, ...eventData } = ev;
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

      // Reload runs after import
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
        if (!run.project_name?.toLowerCase().includes(term) &&
            !run.agent?.toLowerCase().includes(term) &&
            !run.run_id?.toLowerCase().includes(term)) {
          return false;
        }
      }
      if (eventTypeFilter) {
        const hasEvent = run.events?.some(e => e.event_type === eventTypeFilter);
        if (!hasEvent) return false;
      }
      return true;
    });
  }, [runs, searchTerm, eventTypeFilter]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">AgentTrace</h1>
            <p className="text-sm text-gray-500 font-medium">Local Debugger</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="application/json" 
            onChange={handleImport} 
          />
          <button 
            onClick={handleImportClick}
            disabled={isImporting}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors shadow-sm text-sm font-medium disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {isImporting ? 'Importing...' : 'Import Traces'}
          </button>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors shadow-sm text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export Traces
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        <div className="mb-8 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-800">Recent Runs</h2>
          
          <div className="flex gap-4 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search project or agent..." 
                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm transition-all"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select 
                className="pl-9 pr-8 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm appearance-none"
                value={eventTypeFilter}
                onChange={e => setEventTypeFilter(e.target.value)}
              >
                <option value="">All Events</option>
                <option value="reasoning">Reasoning</option>
                <option value="tool_call">Tool Calls</option>
                <option value="tool_result">Tool Results</option>
                <option value="state_change">State Changes</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Activity className="w-8 h-8 animate-spin text-blue-500 mb-4" />
            <p className="text-lg font-medium">Loading runs...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-red-500 bg-red-50 rounded-xl border border-red-100">
            <ServerCrash className="w-10 h-10 mb-4 text-red-400" />
            <p className="text-lg font-bold mb-2">Failed to load data</p>
            <p className="text-red-400">{error}</p>
          </div>
        ) : filteredRuns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white border border-gray-200 rounded-xl shadow-sm text-gray-500">
            <Box className="w-12 h-12 mb-4 text-gray-300" />
            <p className="text-lg font-medium text-gray-900 mb-1">No runs found</p>
            <p className="text-sm">We couldn't find any agent runs matching your criteria.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRuns.map((run) => (
              <Link 
                key={run.run_id} 
                to={`/run/${run.run_id}`}
                className="group bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md hover:border-blue-300 transition-all block relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-gray-100 p-2 rounded-lg group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      <Bot className="w-5 h-5 text-gray-600 group-hover:text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 group-hover:text-blue-700 transition-colors line-clamp-1" title={run.project_name}>
                        {run.project_name}
                      </h3>
                      <p className="text-sm text-gray-500 font-medium line-clamp-1" title={run.agent}>
                        {run.agent || 'Unknown Agent'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span className="font-mono">{new Date(run.start_time).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Layers className="w-4 h-4 text-gray-400" />
                    <span>{run.event_count || run.events?.length || 0} events recorded</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm font-semibold text-blue-600 group-hover:text-blue-700">
                  <span>View Trace</span>
                  <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}