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
  Filter,
  Download
} from 'lucide-react';
import { fetchEvents } from '../api';
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
                {typeof (data as any).result === 'string' 
                  ? (data as any).result 
                  : JSON.stringify((data as any).result, null, 2)}
              </pre>
            )}
          </div>
        );
      case 'state_change':
        return (
          <div>
            <div className="font-semibold text-purple-800 mb-2">State Updated</div>
            <pre className="bg-gray-50 p-3 rounded text-sm border border-gray-100 overflow-x-auto text-gray-700">
              {JSON.stringify((data as any).keys_changed || Object.keys((data as any).after || {}), null, 2)}
            </pre>
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
      default: return <Activity className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div 
      onClick={onClick}
      className={`relative p-4 rounded-xl border transition-all cursor-pointer ${
        isActive 
          ? 'border-blue-500 bg-blue-50 shadow-md ring-1 ring-blue-500' 
          : isFuture 
            ? 'border-gray-200 bg-gray-50 opacity-60 hover:opacity-100 hover:border-gray-300' 
            : 'border-gray-200 bg-white shadow-sm hover:border-gray-300 hover:shadow'
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="mt-1 flex-shrink-0">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {event_type.replace('_', ' ')}
            </span>
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatTimestamp(timestamp)}
            </span>
          </div>
          <div className="text-sm">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function TraceDetails() {
  const { id } = useParams<{ id: string }>();
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const playIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!id) return;

    fetchEvents({ runId: id })
      .then(data => {
        setEvents(data);
        setLoading(false);
        if (data.length > 0) {
          setCurrentIndex(data.length - 1);
        }
      })
      .catch(err => {
        setError(err.message || 'Failed to load trace events');
        setLoading(false);
      });
  }, [id]);

  const currentState = useAgentState(events, currentIndex);

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    } else {
      if (currentIndex >= events.length - 1) {
        setCurrentIndex(0);
      }
      setIsPlaying(true);
      playIntervalRef.current = window.setInterval(() => {
        setCurrentIndex(prev => {
          if (prev >= events.length - 1) {
            setIsPlaying(false);
            if (playIntervalRef.current) clearInterval(playIntervalRef.current);
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    }
  };

  useEffect(() => {
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, []);

  const handleExport = () => {
    if (!events || events.length === 0) return;
    
    try {
      const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trace-${id}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Failed to export run events: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Activity className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !events.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">Error Loading Trace</h2>
        <p className="text-gray-600 mb-6">{error || 'No events found for this run.'}</p>
        <Link to="/" className="text-blue-600 hover:text-blue-800 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  const runInfo = events[0];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans h-screen overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 -ml-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Box className="w-5 h-5 text-blue-600" />
              {runInfo.project_name}
            </h1>
            <div className="text-sm text-gray-500 flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> {runInfo.agent}</span>
              <span className="text-gray-300">|</span>
              <span className="flex items-center gap-1 font-mono text-xs">{id}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors shadow-sm text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export Run
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left column: Timeline */}
        <div className="w-1/2 flex flex-col border-r border-gray-200 bg-white">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Event Timeline</h2>
            {events.length > 0 && (
              <TimelineScrubber 
                totalSteps={events.length} 
                currentStep={currentIndex} 
                onChange={setCurrentIndex}
                isPlaying={isPlaying}
                onTogglePlay={togglePlay}
              />
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {events.map((event, index) => (
              <EventCard 
                key={event.id || index}
                event={event}
                eventIndex={index}
                isActive={index === currentIndex}
                isFuture={index > currentIndex}
                onClick={() => setCurrentIndex(index)}
              />
            ))}
          </div>
        </div>

        {/* Right column: State details */}
        <div className="w-1/2 flex flex-col bg-white">
          <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600" />
              Agent State at Step {currentIndex + 1}
            </h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6">
            {Object.keys(currentState).length > 0 ? (
              <StateViewer state={currentState} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <Layers className="w-12 h-12 mb-3 text-gray-200" />
                <p>No state data available yet.</p>
                <p className="text-sm mt-1">State will populate as state_change events occur.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}