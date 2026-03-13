import json
import logging
from typing import Any, Dict, List, Optional, Union
from uuid import UUID

from langchain_core.callbacks.base import BaseCallbackHandler
from langchain_core.outputs import LLMResult

from agent_trace import Tracer
from agent_trace.models import (
    EventType,
    ReasoningData,
    ToolCallData,
    ToolResultData,
    StateChangeData
)

logger = logging.getLogger(__name__)

class AgentTraceCallbackHandler(BaseCallbackHandler):
    """
    A LangChain callback handler that intercepts LLM, tool, and chain events
    and maps them to AgentTrace standard payload models.
    """

    def __init__(self, tracer: Tracer, agent_name: str = "langchain_agent"):
        super().__init__()
        self.tracer = tracer
        self.agent_name = agent_name
        self._runs: Dict[UUID, Dict[str, Any]] = {}

    def on_llm_start(
        self,
        serialized: Dict[str, Any],
        prompts: List[str],
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """Capture the prompt to associate it with the LLM reasoning later."""
        self._runs[run_id] = {"prompts": prompts, "type": "llm"}

    def on_chat_model_start(
        self,
        serialized: Dict[str, Any],
        messages: List[List[Any]],
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """Capture chat messages as text prompts to associate with reasoning."""
        prompts = []
        for msg_list in messages:
            prompt_parts = []
            for m in msg_list:
                if hasattr(m, "content"):
                    if isinstance(m.content, str):
                        prompt_parts.append(m.content)
                    elif isinstance(m.content, list):
                        # Handle multimodal or structured content blocks
                        text_parts = [
                            part.get("text", "") for part in m.content 
                            if isinstance(part, dict) and "text" in part
                        ]
                        prompt_parts.extend(text_parts)
            prompts.append("\n".join(prompt_parts))
            
        self._runs[run_id] = {"prompts": prompts, "type": "chat_model"}

    def on_llm_end(
        self,
        response: LLMResult,
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> Any:
        """Extract generated text and emit it as an AgentTrace REASONING event."""
        run_info = self._runs.pop(run_id, {})
        prompts = run_info.get("prompts", [])
        
        for i, generations in enumerate(response.generations):
            prompt = prompts[i] if i < len(prompts) else None
            for generation in generations:
                content = generation.text
                reasoning_data = ReasoningData(
                    content=content,
                    prompt=prompt
                )
                self.tracer.log_event(
                    agent=self.agent_name,
                    event_type=EventType.REASONING.value,
                    data=reasoning_data.to_dict()
                )

    def on_llm_error(
        self,
        error: Union[Exception, KeyboardInterrupt],
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> Any:
        """Clean up run state on error."""
        self._runs.pop(run_id, {})

    def on_tool_start(
        self,
        serialized: Dict[str, Any],
        input_str: str,
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        inputs: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """Emit a TOOL_CALL event."""
        tool_name = serialized.get("name", "unknown_tool") if serialized else "unknown_tool"
        
        self._runs[run_id] = {
            "type": "tool",
            "name": tool_name
        }
        
        arguments = inputs if inputs is not None else {"input": input_str}
        
        tool_call_data = ToolCallData(
            tool_name=tool_name,
            arguments=arguments,
            tool_call_id=str(run_id)
        )
        self.tracer.log_event(
            agent=self.agent_name,
            event_type=EventType.TOOL_CALL.value,
            data=tool_call_data.to_dict()
        )

    def on_tool_end(
        self,
        output: Any,
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> Any:
        """Emit a TOOL_RESULT event."""
        run_info = self._runs.pop(run_id, {})
        tool_name = run_info.get("name", "unknown_tool")
        
        tool_result_data = ToolResultData(
            tool_name=tool_name,
            result=output,
            tool_call_id=str(run_id),
            is_error=False
        )
        self.tracer.log_event(
            agent=self.agent_name,
            event_type=EventType.TOOL_RESULT.value,
            data=tool_result_data.to_dict()
        )

    def on_tool_error(
        self,
        error: Union[Exception, KeyboardInterrupt],
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> Any:
        """Emit a TOOL_RESULT error event."""
        run_info = self._runs.pop(run_id, {})
        tool_name = run_info.get("name", "unknown_tool")
        
        tool_result_data = ToolResultData(
            tool_name=tool_name,
            result=str(error),
            tool_call_id=str(run_id),
            is_error=True
        )
        self.tracer.log_event(
            agent=self.agent_name,
            event_type=EventType.TOOL_RESULT.value,
            data=tool_result_data.to_dict()
        )

    def on_chain_start(
        self,
        serialized: Dict[str, Any],
        inputs: Dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> Any:
        """Track chain inputs for state change emission on end."""
        self._runs[run_id] = {
            "type": "chain",
            "inputs": inputs
        }

    def on_chain_end(
        self,
        outputs: Dict[str, Any],
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> Any:
        """Emit a STATE_CHANGE event representing chain execution."""
        run_info = self._runs.pop(run_id, {})
        inputs = run_info.get("inputs", {})
        
        keys_changed = list(outputs.keys())
        
        state_change_data = StateChangeData(
            keys_changed=keys_changed,
            old_state=inputs,
            new_state=outputs,
            reason="chain_execution"
        )
        self.tracer.log_event(
            agent=self.agent_name,
            event_type=EventType.STATE_CHANGE.value,
            data=state_change_data.to_dict()
        )

    def on_chain_error(
        self,
        error: Union[Exception, KeyboardInterrupt],
        *,
        run_id: UUID,
        parent_run_id: Optional[UUID] = None,
        **kwargs: Any,
    ) -> Any:
        """Clean up run state on error."""
        self._runs.pop(run_id, {})