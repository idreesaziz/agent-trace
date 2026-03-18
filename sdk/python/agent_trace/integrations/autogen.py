import json
import logging
from typing import Any, Dict, Union

from agent_trace import Tracer, Reasoning, ToolCall, ToolResult

logger = logging.getLogger(__name__)

class AutoGenCallbackHandler:
    """
    Provides integration with AutoGen by instrumenting ConversableAgents.
    
    Usage:
        from agent_trace import Tracer
        from agent_trace.integrations.autogen import AutoGenCallbackHandler
        from autogen import ConversableAgent
        
        tracer = Tracer(project_name="autogen_project")
        
        agent = ConversableAgent(name="assistant", ...)
        user_proxy = ConversableAgent(name="user_proxy", ...)
        
        handler = AutoGenCallbackHandler(tracer)
        handler.instrument_agent(agent)
        handler.instrument_agent(user_proxy)
    """

    def __init__(self, tracer: Tracer):
        self.tracer = tracer

    def instrument_agent(self, agent: Any) -> None:
        """
        Registers a hook on the given AutoGen agent to intercept messages
        before they are sent, logging reasoning, tool calls, and results.
        """
        if not hasattr(agent, "register_hook"):
            logger.warning(
                f"AgentTrace: {getattr(agent, 'name', 'Agent')} does not "
                "support register_hook. Update to pyautogen >= 0.2.2."
            )
            return

        def _hook(sender: Any, message: Union[Dict[str, Any], str], recipient: Any, silent: bool) -> Union[Dict[str, Any], str]:
            try:
                self._process_message(sender.name, message)
            except Exception as e:
                logger.error(f"AgentTrace AutoGen Hook Error: {e}")
            return message

        # AutoGen hook into message sending intercept
        agent.register_hook("process_message_before_send", _hook)

    def _process_message(self, agent_name: str, message: Union[Dict[str, Any], str]) -> None:
        if isinstance(message, str):
            if message.strip():
                self.tracer.log_event(
                    agent=agent_name,
                    event_type="reasoning",
                    data=Reasoning(content=message.strip())
                )
            return

        if not isinstance(message, dict):
            return

        content = message.get("content")
        role = message.get("role")
        tool_calls = message.get("tool_calls")
        function_call = message.get("function_call")

        # 1. Tool Results
        # In AutoGen, tool execution replies typically have role="tool"
        if role == "tool" or (content and "tool_responses" in message):
            tool_name = message.get("name", "unknown_tool")
            result_str = str(content) if content is not None else ""
            
            # Simple error heuristic
            is_error = False
            if "error" in result_str.lower() or "exception" in result_str.lower():
                is_error = True

            self.tracer.log_event(
                agent=agent_name,
                event_type="tool_result",
                data=ToolResult(
                    tool_name=tool_name,
                    result=result_str,
                    is_error=is_error
                )
            )
            return

        # 2. Reasoning (Content)
        if content and isinstance(content, str) and content.strip():
            self.tracer.log_event(
                agent=agent_name,
                event_type="reasoning",
                data=Reasoning(content=content.strip())
            )

        # 3. Tool Calls (OpenAI format tool_calls)
        if tool_calls and isinstance(tool_calls, list):
            for tc in tool_calls:
                if not isinstance(tc, dict):
                    continue
                func = tc.get("function", {})
                t_name = func.get("name", "unknown_tool")
                t_args_str = func.get("arguments", "")
                
                t_args = {}
                if isinstance(t_args_str, dict):
                    t_args = t_args_str
                elif t_args_str:
                    try:
                        t_args = json.loads(t_args_str)
                    except (json.JSONDecodeError, TypeError):
                        t_args = {"raw_arguments": str(t_args_str)}

                self.tracer.log_event(
                    agent=agent_name,
                    event_type="tool_call",
                    data=ToolCall(
                        tool_name=t_name,
                        arguments=t_args
                    )
                )

        # 4. Function Call (Legacy OpenAI format)
        if function_call and isinstance(function_call, dict):
            f_name = function_call.get("name", "unknown_tool")
            f_args_str = function_call.get("arguments", "")
            
            f_args = {}
            if isinstance(f_args_str, dict):
                f_args = f_args_str
            elif f_args_str:
                try:
                    f_args = json.loads(f_args_str)
                except (json.JSONDecodeError, TypeError):
                    f_args = {"raw_arguments": str(f_args_str)}

            self.tracer.log_event(
                agent=agent_name,
                event_type="tool_call",
                data=ToolCall(
                    tool_name=f_name,
                    arguments=f_args
                )
            )