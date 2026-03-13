import React from 'react';
import { Layers } from 'lucide-react';

export interface StateViewerProps {
  events: any[];
  currentIndex: number;
}

const renderValue = (value: any): React.ReactNode => {
  if (value === null) return <span className="text-gray-500">null</span>;
  if (typeof value === 'boolean') return <span className="text-purple-600">{value.toString()}</span>;
  if (typeof value === 'number') return <span className="text-blue-600">{value}</span>;
  if (typeof value === 'string') return <span className="text-green-600 break-words">"{value}"</span>;
  
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-500">[]</span>;
    return (
      <div className="mt-1">
        <span className="text-gray-500">[</span>
        <div className="pl-4 border-l border-gray-200 ml-1 space-y-1">
          {value.map((v, i) => (
            <div key={i}>
              {renderValue(v)}
              {i < value.length - 1 && <span className="text-gray-500">,</span>}
            </div>
          ))}
        </div>
        <span className="text-gray-500">]</span>
      </div>
    );
  }
  
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return <span className="text-gray-500">{'{ }'}</span>;
    return (
      <div className="mt-1">
        <span className="text-gray-500">{'{'}</span>
        <div className="pl-4 border-l border-gray-200 ml-1 space-y-1">
          {keys.map((k, i) => (
            <div key={k}>
              <span className="text-gray-700 font-medium">"{k}"</span>
              <span className="text-gray-500">: </span>
              {renderValue(value[k])}
              {i < keys.length - 1 && <span className="text-gray-500">,</span>}
            </div>
          ))}
        </div>
        <span className="text-gray-500">{'}'}</span>
      </div>
    );
  }
  
  return <span>{String(value)}</span>;
};

const StateViewer: React.FC<StateViewerProps> = ({ events, currentIndex }) => {
  let currentState: Record<string, any> = {};
  let changedKeys: string[] = [];
  let isCurrentStepStateChange = false;

  for (let i = 0; i <= currentIndex; i++) {
    const event = events[i];
    if (event?.event_type === 'state_change') {
      const data = event.data;
      currentState = { ...currentState, ...(data?.after || {}) };
      
      changedKeys = data?.keys_changed || Object.keys(data?.after || {});
      isCurrentStepStateChange = (i === currentIndex);
    } else if (i === currentIndex) {
      isCurrentStepStateChange = false;
    }
  }

  if (Object.keys(currentState).length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 h-full flex flex-col">
        <div className="flex items-center space-x-2 mb-4 border-b border-gray-100 pb-2">
          <Layers className="w-5 h-5 text-gray-500" />
          <h2 className="font-semibold text-gray-800">Agent State</h2>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm italic">
          No state available yet.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-2">
        <div className="flex items-center space-x-2">
          <Layers className="w-5 h-5 text-orange-500" />
          <h2 className="font-semibold text-gray-800">Agent State</h2>
        </div>
        {changedKeys.length > 0 && isCurrentStepStateChange && (
          <span className="text-xs font-medium bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
            State Updated
          </span>
        )}
      </div>
      <div className="flex-1 overflow-x-auto overflow-y-auto font-mono text-sm bg-gray-50 p-4 rounded border border-gray-100">
        <div className="text-gray-500 mb-1">{'{'}</div>
        <div className="space-y-1">
          {Object.entries(currentState).map(([key, value], index, array) => {
            const isChanged = changedKeys.includes(key);
            return (
              <div 
                key={key} 
                className={`pl-4 py-1 -mx-4 px-4 border-l-4 transition-colors ${
                  isChanged 
                    ? 'bg-orange-50 border-orange-400' 
                    : 'border-transparent hover:bg-gray-100'
                }`}
              >
                <span className="text-gray-800 font-semibold">"{key}"</span>
                <span className="text-gray-500">: </span>
                {renderValue(value)}
                {index < array.length - 1 && <span className="text-gray-500">,</span>}
              </div>
            );
          })}
        </div>
        <div className="text-gray-500 mt-1">{'}'}</div>
      </div>
    </div>
  );
};

export default StateViewer;