import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Clock, 
  Layers, 
  Box, 
  Activity, 
  CheckCircle, 
  AlertCircle, 
  Wrench, 
  MessageSquare,
  Search,
  Filter
} from 'lucide-react';
import { fetchRunById } from '../api';
import { AgentRun, AgentEvent, StateChangeData } from '../types';
import TimelineScrubber from '../components/TimelineScrubber';
import StateViewer from '../components/StateViewer';

// Hook logic implemented within the file to replace the missing import
export const useAgentState = (
  events: AgentEvent[] | undefined | null,
  currentIndex: number
): Record<string, any> => {
  return useMemo(() => {
    let currentState: Record<string, any> = {};

    if (!events || !Array.isArray(events) || currentIndex < 0) {
      return currentState;
    }

    const maxIndex = Math.min(currentIndex, events.length - 1);

    for (let i = 0; i <= maxIndex; i++) {
      const event = events[i];
      
      if (event?.event_type === 'state_change') {
        const data = event.data as StateChangeData;
        
        if (data?.after && typeof data.after === 'object') {
          currentState = {
            ...currentState,
            ...data.after,
          };
        }
      }
    }

    return currentState;
  }, [events, currentIndex]);
};

const formatTimestamp = (ts: string | number) => {
  const timeMs = typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts;
  return new Date(timeMs).toLocaleString();
};

const EventCard: React.FC<{ 
  event: AgentEvent; 
  isFuture: boolean; 
  isActive: boolean; 
  eventIndex: number; 
  onClick: () => void;
}> = ({ event, isFuture, isActive, eventIndex, onClick }) => {
  const { event_type, data, timestamp } = event;
  
  const renderContent = () => {
    switch (event_type) {
      case 'reasoning':
        return (
          <div className="text-gray-800 whitespace-pre-wrap">
            {(data as any).text || (data as any).content || JSON.stringify(data)}
          </div>
        );
      case 'tool_call':
        return (
          <div>
            <div className="font-semibold text-blue-800 mb-2">
              Tool: {(data as any).tool_name}
            </div>
            <pre className="bg-gray-50 p-3 rounded text-sm border border-gray-100 overflow-x-auto text-gray-700">
              {JSON.stringify((data as any).tool_args || (data as any).arguments, null, 2)}
            </pre>
          </div>
        );
      case 'tool_result':
        return (
          <div>
            <div className="font-semibold text-green-800 mb-2">
              Result from: {(data as any).tool_name}
            </div>
            {(data as any).error ? (
              <div className="text-red-600 font-medium whitespace-pre-wrap">Error: {(data as any).error}</div>
            ) : (
              <pre className="bg-gray-50 p-3 rounded text-sm border border-gray-100 overflow-x-auto text-gray-700">
                {typeof (data as any).result === 'string' ? (data as any).result : JSON.stringify((data as any).result, null, 2)}
              </pre>
            )}
          </div>
        );
      case 'state_change':
        return (
          <div>
            <div className="font-semibold text-purple-800 mb-2">
              Keys changed: {((data as any).keys_changed || []).join(', ')}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold">Before</div>
                <pre className="bg-gray-50 p-3 rounded text-sm border border-gray-100 overflow-x-auto text-gray-700">
                  {JSON.stringify((data as any).before, null, 2)}
                </pre>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider font-semibold">After</div>
                <pre className="bg-gray-50 p-3 rounded text-sm border border-gray-100 overflow-x-auto text-gray-700">
                  {JSON.stringify((data as any).after, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        );
      default:
        return (
          <pre className="bg-gray-50 p-3 rounded text-sm border border-gray-100 overflow-x-auto text-gray-700">
            {JSON.stringify(data, null, 2)}
          </pre>
        );
    }
  };

  const getIcon = () => {
    switch (event_type) {
      case 'reasoning': return <MessageSquare className="w-5 h-5 text-gray-500" />;
      case 'tool_call': return <Wrench className="w-5 h-5 text-blue-500" />;
      case 'tool_result': return (data as any).error ? <AlertCircle className="w-5 h-5 text-red-500" /> : <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'state_change': return <Layers className="w-5 h-5 text-purple-500" />;
      default: return <Activity className="w-5 h-5 text-gray-500" />;
    }
  };

  const getBorderColor = () => {
    if (isActive) return 'border-blue-500 ring-2 ring-blue-200';
    switch (event_type) {
      case 'reasoning': return 'border-gray-200';
      case 'tool_call': return 'border-blue-200';
      case 'tool_result': return (data as any).error ? 'border-red-200' : 'border-green-200';
      case 'state_change': return 'border-purple-200';
      default: return 'border-gray-200';
    }
  };

  return (
    <div 
      className={`bg-white rounded-lg shadow-sm border ${getBorderColor()} p-5 cursor-pointer transition-all ${
        isFuture ? 'opacity-50 grayscale hover:grayscale-0' : 'opacity-100'
      } hover:shadow-md mb-4`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-3">
          {getIcon()}
          <h3 className="text-lg font-semibold text-gray-800 capitalize">
            {event_type.replace('_', ' ')}
          </h3>
          <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full font-mono">
            Step {eventIndex + 1}
          </span>
        </div>
        <div className="text-sm text-gray-500 font-mono">
          {formatTimestamp(timestamp)}
        </div>
      </div>
      <div className="mt-2">
        {renderContent()}
      </div>
    </div>
  );
};

export default function TraceDetails() {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<AgentRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');

  useEffect(() => {
    let isMounted = true;
    if (!runId) return;

    fetchRunById(runId)
      .then(data => {
        if (isMounted) {
          if (!data) {
            setError('Trace not found');
          } else {
            setRun(data as unknown as AgentRun);
            setCurrentIndex((data.events?.length || 0) - 1);
          }
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError(err.message || 'Failed to fetch trace details');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [runId]);

  // Handle Playback
  useEffect(() => {
    let interval: number;
    if (isPlaying && run && currentIndex < run.events.length - 1) {
      interval = window.setInterval(() => {
        setCurrentIndex(prev => {
          if (prev >= run.events.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } else if (isPlaying && run && currentIndex >= run.events.length - 1) {
      setIsPlaying(false);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, currentIndex, run]);

  const currentState = useAgentState(run?.events, currentIndex);

  const filteredEvents = useMemo(() => {
    if (!run?.events) return [];
    
    return run.events.filter((event) => {
      // Filter by Event Type
      if (eventTypeFilter !== 'all' && event.event_type !== eventTypeFilter) {
        return false;
      }
      
      // Filter by Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const eventTypeStr = String(event.event_type || '').toLowerCase();
        let dataStr = '';
        
        try {
          dataStr = JSON.stringify(event.data).toLowerCase();
        } catch (e) {
          // ignore stringify errors
        }
        
        if (!eventTypeStr.includes(query) && !dataStr.includes(query)) {
          return false;
        }
      }
      
      return true;
    });
  }, [run?.events, searchQuery, eventTypeFilter]);

  if (loading) {
    return (
      <div className="p-8 text-gray-500 flex items-center justify-center gap-2 h-screen">
        <Activity className="animate-spin w-5 h-5 text-blue-500" /> Loading trace details...
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="p-8 text-red-500 flex items-center justify-center gap-2 h-screen flex-col">
        <div className="flex items-center gap-2 text-xl font-bold mb-4">
          <AlertCircle className="w-8 h-8" /> Error
        </div>
        <p>{error || 'Trace not found'}</p>
        <Link to="/" className="mt-4 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Box className="w-5 h-5 text-blue-500" />
              {run.project_name} <span className="text-gray-400 font-normal">/</span> {run.agent || (run.events[0]?.agent)}
            </h1>
            <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
              <span className="flex items-center gap-1 font-mono">
                <Layers className="w-4 h-4" /> {run.run_id}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" /> Started: {formatTimestamp(run.start_time || (run.events[0]?.timestamp as any))}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Column: Timeline & Events */}
        <div className="w-2/3 flex flex-col border-r border-gray-200 bg-gray-50/50">
          
          {/* Search & Filter Bar */}
          <div className="p-4 bg-white border-b border-gray-200 flex items-center gap-4 shrink-0">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search logs, arguments, or results..."
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition duration-150 ease-in-out"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-gray-400" />
              <select
                className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md transition duration-150 ease-in-out"
                value={eventTypeFilter}
                onChange={(e) => setEventTypeFilter(e.target.value)}
              >
                <option value="all">All Events</option>
                <option value="reasoning">Reasoning</option>
                <option value="tool_call">Tool Calls</option>
                <option value="tool_result">Tool Results</option>
                <option value="state_change">State Changes</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
            <div className="max-w-3xl mx-auto pb-32">
              {filteredEvents.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200 shadow-sm">
                  <Search className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                  <h3 className="text-lg font-medium text-gray-900">No events found</h3>
                  <p className="mt-1">Try adjusting your search or filter criteria.</p>
                </div>
              ) : (
                filteredEvents.map((event) => {
                  const originalIndex = run.events.findIndex(e => e === event);
                  return (
                    <EventCard 
                      key={originalIndex} 
                      event={event}
                      eventIndex={originalIndex}
                      isFuture={originalIndex > currentIndex}
                      isActive={originalIndex === currentIndex}
                      onClick={() => setCurrentIndex(originalIndex)}
                    />
                  );
                })
              )}
            </div>
          </div>
          
          {/* Timeline Scrubber */}
          <div className="bg-white border-t border-gray-200 p-4 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative z-20">
            <TimelineScrubber 
              totalEvents={run.events.length}
              currentIndex={currentIndex}
              onChange={setCurrentIndex}
              isPlaying={isPlaying}
              onTogglePlay={() => setIsPlaying(!isPlaying)}
            />
          </div>
        </div>

        {/* Right Column: State Viewer */}
        <div className="w-1/3 bg-white overflow-y-auto z-10 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)]">
          <StateViewer 
            state={currentState} 
            stepIndex={currentIndex} 
            totalSteps={run.events.length} 
          />
        </div>

      </div>
    </div>
  );
}