import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Layers, Box, Activity } from 'lucide-react';
import { fetchRunById, AgentRun, TraceEvent } from '../api';
import TimelineScrubber from '../components/TimelineScrubber';
import StateViewer from '../components/StateViewer';

const formatTimestamp = (ts: string | number) => {
  const timeMs = typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts;
  return new Date(timeMs).toLocaleString();
};

const EventCard: React.FC<{ event: TraceEvent; isFuture: boolean; eventIndex: number }> = ({ event, isFuture, eventIndex }) => {
  const { event_type, data } = event;
  
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
      case 'reasoning': return <Activity className="w-5 h-5 text-purple-500" />;
      case 'tool_call': return <Box className="w-5 h-5 text-blue-500" />;
      case 'tool_result': return <Box className="w-5 h-5 text-green-500" />;
      case 'state_change': return <Layers className="w-5 h-5 text-orange-500" />;
      default: return <Activity className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className={`bg-white border ${isFuture ? 'border-gray-200 opacity-40' : 'border-gray-300 shadow-sm'} rounded-lg p-5 transition-opacity duration-300`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gray-50 rounded-md border border-gray-100">
            {getIcon()}
          </div>
          <div>
            <span className="font-semibold text-gray-800 uppercase tracking-wider text-sm flex items-center gap-2">
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-mono">Step {eventIndex + 1}</span>
              {event_type.replace('_', ' ')}
            </span>
          </div>
        </div>
        <div className="flex items-center text-gray-400 text-sm">
          <Clock className="w-4 h-4 mr-1" />
          {formatTimestamp(event.timestamp)}
        </div>
      </div>
      <div className="ml-12">
        {renderContent()}
      </div>
    </div>
  );
};

const TraceDetails: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<AgentRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const eventRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const loadRun = async () => {
      try {
        if (runId) {
          const data = await fetchRunById(runId);
          setRun(data);
          setCurrentIndex(data.events.length > 0 ? data.events.length - 1 : 0);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch trace details');
      } finally {
        setLoading(false);
      }
    };
    loadRun();
  }, [runId]);

  useEffect(() => {
    if (run && run.events.length > 0) {
      eventRefs.current = eventRefs.current.slice(0, run.events.length);
      const currentElement = eventRefs.current[currentIndex];
      if (currentElement) {
        currentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentIndex, run]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="max-w-4xl mx-auto mt-8 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        <h2 className="text-lg font-semibold mb-2">Error Loading Trace</h2>
        <p>{error || 'Trace not found'}</p>
        <Link to="/" className="text-blue-600 hover:underline mt-4 inline-block">
          &larr; Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <Link to="/" className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Dashboard
      </Link>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{run.project_name}</h1>
            <div className="text-sm text-gray-500 mb-4">
              Agent: <span className="font-semibold text-gray-700">{run.agent}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Run ID</div>
            <div className="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-600 mt-1">
              {run.run_id}
            </div>
          </div>
        </div>
        
        <div className="flex gap-6 mt-4 pt-4 border-t border-gray-100">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Started</div>
            <div className="text-sm mt-1">{formatTimestamp(run.start_time)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Events</div>
            <div className="text-sm mt-1">{run.event_count}</div>
          </div>
        </div>
      </div>

      <div className="mb-6 sticky top-4 z-20">
        <TimelineScrubber 
          currentIndex={currentIndex} 
          totalEvents={run.events.length} 
          onIndexChange={setCurrentIndex} 
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-6 relative">
        <div className="w-full lg:w-2/3 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Event Timeline</h2>
          {run.events.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200 text-gray-500">
              No events recorded for this run.
            </div>
          ) : (
            run.events.map((event, index) => (
              <div 
                key={event.id || index} 
                ref={el => eventRefs.current[index] = el}
                className="scroll-mt-28"
              >
                <EventCard 
                  event={event} 
                  isFuture={index > currentIndex} 
                  eventIndex={index}
                />
              </div>
            ))
          )}
        </div>
        
        <div className="w-full lg:w-1/3">
          <div className="sticky top-28 h-[calc(100vh-8rem)]">
            <StateViewer 
              events={run.events} 
              currentIndex={currentIndex} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TraceDetails;