import { z } from 'zod';

export const EventTypeSchema = z.enum([
  'reasoning',
  'tool_call',
  'tool_result',
  'state_change',
  'message',
  'error'
]);

export const ReasoningDataSchema = z.object({
  content: z.string(),
  prompt: z.string().nullable().optional(),
  model: z.string().nullable().optional()
});

export const ToolCallDataSchema = z.object({
  tool_name: z.string(),
  arguments: z.record(z.string(), z.any()),
  tool_call_id: z.string().nullable().optional()
});

export const ToolResultDataSchema = z.object({
  tool_name: z.string(),
  result: z.any(),
  tool_call_id: z.string().nullable().optional(),
  is_error: z.boolean().default(false)
});

export const StateChangeDataSchema = z.object({
  keys_changed: z.array(z.string()),
  old_state: z.record(z.string(), z.any()),
  new_state: z.record(z.string(), z.any()),
  reason: z.string().nullable().optional()
});

export const AgentEventSchema = z.object({
  project_name: z.string(),
  agent: z.string(),
  // Supports both standard EventType enum values and custom strings
  event_type: z.string(), 
  data: z.record(z.string(), z.any()),
  timestamp: z.number(),
  event_id: z.string(),
  run_id: z.string().nullable().optional(),
  parent_id: z.string().nullable().optional()
});

// Infer TypeScript types from the Zod schemas
export type EventType = z.infer<typeof EventTypeSchema>;
export type ReasoningData = z.infer<typeof ReasoningDataSchema>;
export type ToolCallData = z.infer<typeof ToolCallDataSchema>;
export type ToolResultData = z.infer<typeof ToolResultDataSchema>;
export type StateChangeData = z.infer<typeof StateChangeDataSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;