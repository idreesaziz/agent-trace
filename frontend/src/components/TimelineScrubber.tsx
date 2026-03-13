import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, SkipBack, SkipForward, Play, Pause } from 'lucide-react';
import { AgentEvent } from '../types';

export interface TimelineScrubberProps {
  currentIndex: number;
  events: AgentEvent[];
  onIndexChange: (index: number) => void;
}

const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  currentIndex,
  events,
  onIndexChange,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const totalEvents = events?.length || 0;

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1);
    }
  }, [currentIndex, onIndexChange]);

  const handleNext = useCallback(() => {
    if (currentIndex < totalEvents - 1) {
      onIndexChange(currentIndex + 1);
    }
  }, [currentIndex, totalEvents, onIndexChange]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newIndex = parseInt(e.target.value, 10);
    if (!isNaN(newIndex) && newIndex >= 0 && newIndex < totalEvents) {
      onIndexChange(newIndex);
    }
  };

  const togglePlayback = () => {
    if (currentIndex === totalEvents - 1 && !isPlaying) {
      onIndexChange(0);
    }
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    let intervalId: number;
    
    if (isPlaying) {
      intervalId = window.setInterval(() => {
        if (currentIndex < totalEvents - 1) {
          onIndexChange(currentIndex + 1);
        } else {
          setIsPlaying(false);
        }
      }, 1000); // 1 second per step
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isPlaying, currentIndex, totalEvents, onIndexChange]);

  const isFirst = currentIndex === 0 || totalEvents === 0;
  const isLast = currentIndex === totalEvents - 1 || totalEvents === 0;
  const hasMultipleEvents = totalEvents > 1;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 flex items-center gap-2 sm:gap-3 w-full">
      <button
        onClick={() => {
          setIsPlaying(false);
          onIndexChange(0);
        }}
        disabled={isFirst}
        className="p-1.5 sm:p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 flex-shrink-0"
        aria-label="Skip to beginning"
        title="Skip to beginning"
      >
        <SkipBack className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>
      
      <button
        onClick={() => {
          setIsPlaying(false);
          handlePrevious();
        }}
        disabled={isFirst}
        className="p-1.5 sm:p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 flex-shrink-0"
        aria-label="Previous step"
        title="Previous step"
      >
        <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

      <button
        onClick={togglePlayback}
        disabled={!hasMultipleEvents}
        className="p-1.5 sm:p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 flex-shrink-0"
        aria-label={isPlaying ? "Pause" : "Play"}
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 sm:w-6 sm:h-6" />
        ) : (
          <Play className="w-5 h-5 sm:w-6 sm:h-6" />
        )}
      </button>

      <button
        onClick={() => {
          setIsPlaying(false);
          handleNext();
        }}
        disabled={isLast}
        className="p-1.5 sm:p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 flex-shrink-0"
        aria-label="Next step"
        title="Next step"
      >
        <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>
      
      <button
        onClick={() => {
          setIsPlaying(false);
          onIndexChange(totalEvents - 1);
        }}
        disabled={isLast}
        className="p-1.5 sm:p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 flex-shrink-0"
        aria-label="Skip to end"
        title="Skip to end"
      >
        <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>

      <div className="flex-1 flex flex-col justify-center px-2 min-w-0">
        <input
          type="range"
          min={0}
          max={Math.max(0, totalEvents - 1)}
          value={totalEvents === 0 ? 0 : currentIndex}
          onChange={(e) => {
             setIsPlaying(false);
             handleSliderChange(e);
          }}
          disabled={!hasMultipleEvents}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label="Timeline scrubber"
        />
        <div className="flex justify-between mt-2 text-xs font-medium text-gray-500 font-mono select-none">
          <span>Step {totalEvents > 0 ? currentIndex + 1 : 0}</span>
          <span>of {totalEvents}</span>
        </div>
      </div>
    </div>
  );
};

export default TimelineScrubber;