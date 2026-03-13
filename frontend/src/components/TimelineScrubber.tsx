import React from 'react';
import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from 'lucide-react';

export interface TimelineScrubberProps {
  currentIndex: number;
  totalEvents: number;
  onIndexChange: (index: number) => void;
}

const TimelineScrubber: React.FC<TimelineScrubberProps> = ({
  currentIndex,
  totalEvents,
  onIndexChange,
}) => {
  const handlePrevious = () => {
    if (currentIndex > 0) {
      onIndexChange(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < totalEvents - 1) {
      onIndexChange(currentIndex + 1);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newIndex = parseInt(e.target.value, 10);
    if (!isNaN(newIndex) && newIndex >= 0 && newIndex < totalEvents) {
      onIndexChange(newIndex);
    }
  };

  const isFirst = currentIndex === 0 || totalEvents === 0;
  const isLast = currentIndex === totalEvents - 1 || totalEvents === 0;
  const hasMultipleEvents = totalEvents > 1;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 flex items-center gap-2 sm:gap-4 w-full">
      <button
        onClick={() => onIndexChange(0)}
        disabled={isFirst}
        className="p-1.5 sm:p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        aria-label="Skip to beginning"
        title="Skip to beginning"
      >
        <SkipBack className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>
      
      <button
        onClick={handlePrevious}
        disabled={isFirst}
        className="p-1.5 sm:p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        aria-label="Previous step"
        title="Previous step"
      >
        <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

      <div className="flex-1 flex flex-col justify-center px-2">
        <input
          type="range"
          min={0}
          max={Math.max(0, totalEvents - 1)}
          value={totalEvents === 0 ? 0 : currentIndex}
          onChange={handleSliderChange}
          disabled={!hasMultipleEvents}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label="Timeline scrubber"
        />
        <div className="flex justify-between mt-2 text-xs font-medium text-gray-500 font-mono select-none">
          <span>Step {totalEvents > 0 ? currentIndex + 1 : 0}</span>
          <span>of {totalEvents}</span>
        </div>
      </div>

      <button
        onClick={handleNext}
        disabled={isLast}
        className="p-1.5 sm:p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        aria-label="Next step"
        title="Next step"
      >
        <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>
      
      <button
        onClick={() => onIndexChange(totalEvents - 1)}
        disabled={isLast}
        className="p-1.5 sm:p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
        aria-label="Skip to end"
        title="Skip to end"
      >
        <SkipForward className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>
    </div>
  );
};

export default TimelineScrubber;