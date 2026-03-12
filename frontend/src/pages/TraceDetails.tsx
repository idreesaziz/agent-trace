import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Layers, Box, Activity } from 'lucide-react';
import { fetchRunById, AgentRun, TraceEvent } from '../api';

const formatTimestamp = (ts: string | number) => {
  const timeMs = typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts;
  return new Date(timeMs).toLocaleString();
};

const EventCard: React.FC<{ event: TraceEvent }> = ({ event }) => {
  const { event_type, data, agent, timestamp } = event;
  
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

  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'reasoning':
        return 'border-purple-200 bg-purple-50 text-purple-800';
      case 'tool_call':
        return 'border-blue-200 bg-blue-50 text-blue-800';
      case 'tool_result':
        return 'border-green-200 bg-green-50 text-green-800';
      case 'state_change':
        return 'border-orange-200 bg-orange-50 text-orange-800';
      default:
        return 'border-gray-200 bg-gray-50 text-gray-800';
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getTypeStyles(event_type)}`}>
            {event_type.replace('_', ' ').toUpperCase()}
          </span>
          <span className="text-sm font-medium text-gray-600">
            Agent: {agent}
          </span>
        </div>
        <span className="text-xs text-gray-500 font-mono">
          {formatTimestamp(timestamp)}
        </span>
      </div>
      <div className="p-4">
        {renderContent()}
      </div>
    </div>
  );
};

const TraceDetails: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();
  const [run, setRun] = useState<AgentRun | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    
    let isMounted = true;
    
    fetchRunById(runId)
      .then(data => {
        if (isMounted) {
          if (data) {
            setRun(data);
          } else {
            setError('Run not found');
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

  if (loading) {
    return (
      <div className="p-8 text-gray-500 flex items-center justify-center gap-2 h-64">
        <Activity className="animate-spin w-5 h-5 text-blue-500" /> Loading trace details...
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3 mb-6">
          <div className="font-medium">Error:</div>
          <div>{error || 'Trace not found'}</div>
        </div>
        <Link to="/" className="text-blue-600 hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <Link to="/" className="text-blue-600 hover:underline flex items-center gap-1 mb-4 text-sm font-medium inline-block w-max">
          <ArrowLeft className="w-4 h-4 inline" /> Back to Dashboard
        </Link>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-3">
            Trace Details
            <span className="text-sm font-normal text-gray-500 bg-gray-100 px-3 py-1 rounded-full border border-gray-200 font-mono">
              {run.run_id}
            </span>
          </h1>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Box className="w-4 h-4 text-gray-400" />
              <span className="font-medium text-gray-700">Project:</span>
              {run.project_name}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="font-medium text-gray-700">Started:</span>
              {formatTimestamp(run.start_time)}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Layers className="w-4 h-4 text-gray-400" />
              <span className="font-medium text-gray-700">Events:</span>
              {run.events.length}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-0">
        {run.events.map((event, index) => (
          <div key={event.id || index} className="flex gap-4">
            <div className="flex flex-col items-center min-h-[4rem]">
              <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-xs font-bold text-blue-600 shrink-0 z-10 mt-1">
                {index + 1}
              </div>
              {index !== run.events.length - 1 && (
                <div className="w-0.5 h-full bg-gray-200 my-1"></div>
              )}
            </div>
            <div className="flex-1 pb-6">
              <EventCard event={event} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TraceDetails;