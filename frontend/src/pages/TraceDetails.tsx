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

const EventCard: React.FC<{ event: TraceEvent }> = ({ event }) => {
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
      case 'tool_result': return <Layers className="w-5 h-5 text-green-500" />;
      case 'state_change': return <Clock className="w-5 h-5 text-orange-500" />;
      default: return <Activity className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-4 transition-all hover:shadow-md">
      <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2">
          {getIcon()}
          <h3 className="text-lg font-medium text-gray-900 capitalize">
            {event_type.replace('_', ' ')}
          </h3>
        </div>
        <div className="text-sm text-gray-500 font-mono">
          {formatTimestamp(event.timestamp)}
        </div>
      </div>
      <div className="mt-2">
        {renderContent()}
      </div>
    </div>
  );
};

const TraceDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<AgentRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scrubberIndex, setScrubberIndex] = useState<number>(0);
  
  const eventsListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchTrace = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const data = await fetchRunById(id);
        setRun(data);
        if (data.events && data.events.length > 0) {
          setScrubberIndex(data.events.length - 1);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to fetch trace details');
      } finally {
        setLoading(false);
      }
    };
    fetchTrace();
  }, [id]);

  useEffect(() => {
    if (eventsListRef.current) {
      const activeEvent = eventsListRef.current.children[scrubberIndex] as HTMLElement;
      if (activeEvent) {
        activeEvent.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [scrubberIndex]);

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{error || 'Trace not found'}</p>
            </div>
          </div>
        </div>
        <Link to="/" className="text-blue-600 hover:text-blue-800 flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-gray-500 hover:text-gray-900 transition-colors p-2 -ml-2 rounded-full hover:bg-gray-100">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              {run.project_name}
              <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-md border border-gray-200">
                {run.agent}
              </span>
            </h1>
            <div className="text-sm text-gray-500 mt-1 flex items-center gap-4">
              <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {formatTimestamp(run.start_time)}</span>
              <span className="flex items-center gap-1"><Layers className="w-4 h-4" /> {run.events?.length || 0} events</span>
              <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{run.run_id}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 bg-gray-50 pt-2 pb-4 border-b border-gray-200 mb-6">
        <TimelineScrubber 
          currentIndex={scrubberIndex} 
          totalEvents={run.events?.length || 0} 
          onIndexChange={setScrubberIndex} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            Execution Trace
          </h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 min-h-[500px] max-h-[800px] overflow-y-auto" ref={eventsListRef}>
            {run.events?.length > 0 ? (
              run.events.map((event, index) => (
                <div 
                  key={event.id || index} 
                  className={`transition-all duration-300 cursor-pointer ${
                    index === scrubberIndex 
                      ? 'ring-2 ring-blue-400 ring-offset-2 rounded-lg scale-[1.01]' 
                      : index > scrubberIndex 
                        ? 'opacity-40 grayscale-[50%]' 
                        : 'opacity-100'
                  }`}
                  onClick={() => setScrubberIndex(index)}
                >
                  <EventCard event={event as TraceEvent} />
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 py-12">
                <Box className="w-12 h-12 mb-3 text-gray-300" />
                <p>No events recorded for this trace.</p>
              </div>
            )}
          </div>
        </div>
        
        <div className="lg:col-span-1">
          <div className="sticky top-32">
            <StateViewer events={run.events} currentIndex={scrubberIndex} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TraceDetails;