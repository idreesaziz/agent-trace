export type EventType = 'reasoning' | 'tool_call' | 'tool_result' | 'state_change';

export interface ReasoningData {
  content: string;
  [key: string]: any;
}

export interface ToolCallData {
  tool_name: string;
  arguments: Record<string, any> | string;
  [key: string]: any;
}

export interface ToolResultData {
  tool_name: string;
  result: any;
  error?: string;
  [key: string]: any;
}

export interface StateChangeData {
  before: Record<string, any>;
  after: Record<string, any>;
  keys_changed?: string[];
  [key: string]: any;
}

export interface AgentEvent {
  id?: string | number;
  run_id: string;
  project_name: string;
  agent: string;
  event_type: EventType | string;
  timestamp: string;
  data: ReasoningData | ToolCallData | ToolResultData | StateChangeData | any;
}

export interface AgentRun {
  run_id: string;
  project_name: string;
  agent: string;
  start_time: string;
  end_time: string;
  event_count: number;
  events: AgentEvent[];
}