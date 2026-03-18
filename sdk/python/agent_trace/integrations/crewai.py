import json
import logging
from typing import Any, Dict, List, Optional, Tuple, Union

from agent_trace import Tracer, Reasoning, ToolCall, ToolResult

logger = logging.getLogger(__name__)

class CrewAIStepCallbackHandler:
    """
    A callback handler for CrewAI that intercepts agent steps and maps them
    to AgentTrace telemetry payloads (Reasoning, ToolCall, ToolResult).

    Usage:
        from agent_trace import Tracer
        from agent_trace.integrations.crewai import CrewAIStepCallbackHandler
        from crewai import Agent

        tracer = Tracer(project_name="my_crewai_project")
        
        agent = Agent(
            role="Researcher",
            goal="Search the web",
            backstory="An expert researcher",
            step_callback=CrewAIStepCallbackHandler(tracer, agent_name="Researcher")
        )
    """

    def __init__(self, tracer: Tracer, agent_name: str = "crewai_agent"):
        self.tracer = tracer
        self.agent_name = agent_name

    def __call__(self, step: Any) -> None:
        """
        Callable interface to be used directly as the step_callback.
        """
        try:
            if isinstance(step, list):
                for s in step:
                    self._process_step(s)
            else:
                self._process_step(step)
        except Exception as e:
            logger.error(f"AgentTrace CrewAI Callback Error: {e}")

    def _process_step(self, step: Any) -> None:
        action = None
        observation = None

        # CrewAI / LangChain often passes a tuple of (AgentAction, observation)
        if isinstance(step, tuple) and len(step) == 2:
            action, observation = step
        else:
            action = step

        # Extract fields dynamically to support Pydantic models, LangChain AgentAction, and dicts
        log = self._extract_field(action, ["log", "thought", "text"])
        
        # If the step itself is just a string (e.g., agent final output), map it to reasoning
        if isinstance(action, str):
            log = action

        if log and isinstance(log, str) and log.strip():
            self.tracer.log_event(
                agent=self.agent_name,
                event_type="reasoning",
                data=Reasoning(content=log.strip())
            )

        tool_name = self._extract_field(action, ["tool", "tool_name"])
        tool_input = self._extract_field(action, ["tool_input", "tool_arguments"])

        if tool_name and isinstance(tool_name, str) and tool_name.strip():
            parsed_input = self._parse_tool_input(tool_input)
            self.tracer.log_event(
                agent=self.agent_name,
                event_type="tool_call",
                data=ToolCall(tool_name=tool_name, arguments=parsed_input)
            )

        result = self._extract_field(action, ["result", "observation"])
        if result is None:
            result = observation

        if tool_name and isinstance(tool_name, str) and tool_name.strip() and result is not None:
            # Naive heuristic: check if result string indicates an error
            is_error = False
            if isinstance(result, str) and ('error' in result.lower() or 'exception' in result.lower()):
                is_error = True

            self.tracer.log_event(
                agent=self.agent_name,
                event_type="tool_result",
                data=ToolResult(
                    tool_name=tool_name.strip(),
                    result=result,
                    is_error=is_error
                )
            )

    def _extract_field(self, obj: Any, fields: List[str]) -> Any:
        """
        Attempts to extract a value from an object using a list of possible field names.
        Supports dictionaries and objects with attributes.
        """
        if obj is None:
            return None

        if isinstance(obj, dict):
            for field in fields:
                if field in obj:
                    return obj[field]
        else:
            for field in fields:
                if hasattr(obj, field):
                    return getattr(obj, field)

        return None

    def _parse_tool_input(self, tool_input: Any) -> Dict[str, Any]:
        """
        Parses tool input into a dictionary. Handles strings that might be JSON.
        """
        if isinstance(tool_input, dict):
            return tool_input
        
        if isinstance(tool_input, str):
            try:
                parsed = json.loads(tool_input)
                return parsed if isinstance(parsed, dict) else {'input': parsed}
            except json.JSONDecodeError:
                return {"input": tool_input}
                
        return {"input": str(tool_input)}