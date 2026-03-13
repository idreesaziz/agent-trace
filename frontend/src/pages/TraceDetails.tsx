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
  MessageSquare 
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
            {((data as any).keys_changed && (data as any).keys_changed.length > 0) && (
              <div className="text-sm font-medium text-gray-700 mb-3">
                Changed Keys: {((data as any).keys_changed).join(', ')}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Before</span>
                <pre className="bg-red-50 p-3 rounded text-sm border border-red-100 overflow-x-auto mt-2 text-red-900">
                  {JSON.stringify((data as any).before, null, 2)}
                </pre>
              </div>
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">After</span>
                <pre className="bg-green-50 p-3 rounded text-sm border border-green-100 overflow-x-auto mt-2 text-green-900">
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
      case 'reasoning': return <MessageSquare className="w-5 h-5 text-purple-500" />;
      case 'tool_call': return <Wrench className="w-5 h-5 text-blue-500" />;
      case 'tool_result': return (data as any).error ? <AlertCircle className="w-5 h-5 text-red-500" /> : <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'state_change': return <Layers className="w-5 h-5 text-orange-500" />;
      default: return <Activity className="w-5 h-5 text-gray-500" />;
    }
  };

  const getTitle = () => {
    switch (event_type) {
      case 'reasoning': return 'Reasoning';
      case 'tool_call': return 'Tool Call';
      case 'tool_result': return 'Tool Result';
      case 'state_change': return 'State Change';
      default: return 'Unknown Event';
    }
  };

  return (
    <div 
      className={`relative flex gap-4 p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
        isActive ? 'bg-blue-50 border-blue-200 shadow-sm ring-1 ring-blue-500' :
        isFuture ? 'bg-white border-gray-100 opacity-50 hover:opacity-75' :
        'bg-white border-gray-200 hover:border-gray-300'
      }`}
      onClick={onClick}
    >
      <div className="flex flex-col items-center">
        <div className={`p-2 rounded-full ${isActive ? 'bg-white' : 'bg-gray-50'}`}>
          {getIcon()}
        </div>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            {getTitle()}
            <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              Step {eventIndex + 1}
            </span>
          </h3>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTimestamp(timestamp)}
          </span>
        </div>
        {renderContent()}
      </div>
    </div>
  );
};

const TraceDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<AgentRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  const eventRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Utilize the hook to process state sequentially 
  const agentState = useAgentState(run?.events, currentIndex);

  useEffect(() => {
    if (id) {
      fetchRunById(id)
        .then(data => {
          setRun(data);
          setCurrentIndex(0);
          setLoading(false);
        })
        .catch(err => {
          setError('Failed to load trace details.');
          setLoading(false);
        });
    }
  }, [id]);

  useEffect(() => {
    if (eventRefs.current[currentIndex]) {
      eventRefs.current[currentIndex]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentIndex]);

  if (loading) return <div className="p-8 text-center text-gray-600">Loading trace...</div>;
  if (error || !run) return <div className="p-8 text-center text-red-600">{error || 'Trace not found'}</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex-none sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Box className="w-5 h-5 text-blue-600" />
                {run.project_name}
              </h1>
              <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                <span className="font-medium text-gray-700">{run.agent}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {formatTimestamp(run.start_time)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col md:flex-row gap-6 min-h-0">
        {/* Timeline Event View */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="mb-4 sticky top-0 z-10 bg-gray-50 pt-2 pb-4">
            <TimelineScrubber 
              events={run.events} 
              currentIndex={currentIndex} 
              onIndexChange={setCurrentIndex} 
            />
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 pb-20 space-y-4">
            {run.events.map((event, index) => (
              <div key={event.id || index} ref={el => eventRefs.current[index] = el}>
                <EventCard
                  event={event}
                  eventIndex={index}
                  isActive={index === currentIndex}
                  isFuture={index > currentIndex}
                  onClick={() => setCurrentIndex(index)}
                />
              </div>
            ))}
            {run.events.length === 0 && (
              <div className="text-center text-gray-500 py-10 bg-white border border-gray-200 rounded-lg">
                No events recorded for this run.
              </div>
            )}
          </div>
        </div>

        {/* State Viewer Sidebar */}
        <div className="w-full md:w-96 flex-none">
          <div className="sticky top-24 h-[calc(100vh-8rem)]">
            <StateViewer events={run.events} currentIndex={currentIndex} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default TraceDetails;