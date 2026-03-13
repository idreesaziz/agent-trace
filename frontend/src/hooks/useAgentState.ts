import { useMemo } from 'react';
import { AgentEvent, StateChangeData } from '../types';

/**
 * Custom hook to calculate the cumulative internal state of the agent
 * up to a specific event index by sequentially applying state change payloads.
 */
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
          // Sequentially merge the new state changes into the accumulated state
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