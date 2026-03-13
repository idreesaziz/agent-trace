import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, Layers, Box, Activity } from 'lucide-react';
import { fetchRunById, AgentRun, TraceEvent } from '../api';
import TimelineScrubber from '../components/TimelineScrubber';

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
      case 'tool_result': return <Box className="w-5 h-5 text-green-500" />;
      case 'state_change': return <Layers className="w-5 h-5 text-orange-500" />;
      default: return <Activity className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-4 overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          {getIcon()}
          <span className="font-semibold text-gray-800 capitalize">
            {event_type.replace('_', ' ')}
          </span>
        </div>
        <div className="flex items-center text-sm text-gray-500 space-x-2">
          <Clock className="w-4 h-4" />
          <span>{formatTimestamp(event.timestamp)}</span>
        </div>
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
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (runId) {
      fetchRunById(runId)
        .then((data) => {
          setRun(data);
          setCurrentIndex(data?.events && data.events.length > 0 ? data.events.length - 1 : 0);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Failed to fetch run", err);
          setLoading(false);
        });
    }
  }, [runId]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading trace details...</div>;
  }

  if (!run) {
    return <div className="p-8 text-center text-red-500">Trace not found.</div>;
  }

  const visibleEvents = run.events.slice(0, currentIndex + 1);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-6">
        <Link to="/" className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Link>
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Trace Details</h1>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="block text-gray-500 mb-1">Project</span>
              <span className="font-medium text-gray-900">{run.project_name}</span>
            </div>
            <div>
              <span className="block text-gray-500 mb-1">Agent</span>
              <span className="font-medium text-gray-900">{run.agent}</span>
            </div>
            <div>
              <span className="block text-gray-500 mb-1">Start Time</span>
              <span className="font-medium text-gray-900">{formatTimestamp(run.start_time)}</span>
            </div>
            <div>
              <span className="block text-gray-500 mb-1">Run ID</span>
              <span className="font-mono text-gray-600 text-xs">{run.run_id}</span>
            </div>
          </div>
        </div>
      </div>

      {run.events.length > 0 && (
        <div className="mb-6">
          <TimelineScrubber 
            currentIndex={currentIndex} 
            totalEvents={run.events.length} 
            onIndexChange={setCurrentIndex} 
          />
        </div>
      )}

      <div className="space-y-2">
        {visibleEvents.map((event, index) => (
          <EventCard key={event.id || index} event={event} />
        ))}
      </div>
    </div>
  );
};

export default TraceDetails;