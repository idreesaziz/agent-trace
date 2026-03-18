import json
from unittest.mock import MagicMock

import pytest

from agent_trace import Reasoning, ToolCall, ToolResult

try:
    from agent_trace.integrations.autogen import AutoGenCallbackHandler
except ImportError:
    AutoGenCallbackHandler = MagicMock()
    pytestmark = pytest.mark.skip(reason="agent_trace.integrations.autogen is not built yet")


def extract_log_args(call):
    """Helper to safely extract agent, event_type, and data from a mock call."""
    args, kwargs = call
    agent = kwargs.get("agent") if "agent" in kwargs else (args[0] if len(args) > 0 else None)
    event_type = kwargs.get("event_type") if "event_type" in kwargs else (args[1] if len(args) > 1 else None)
    data = kwargs.get("data") if "data" in kwargs else (args[2] if len(args) > 2 else None)
    return agent, event_type, data


def test_string_message_logs_reasoning():
    """Verify that a plain string message is logged as a Reasoning event."""
    tracer = MagicMock()
    handler = AutoGenCallbackHandler(tracer)
    
    handler._process_message("assistant_agent", "Thinking about the user's request...")
    
    tracer.log_event.assert_called_once()
    agent, event_type, data = extract_log_args(tracer.log_event.call_args)
    assert agent == "assistant_agent"
    assert event_type == "reasoning"
    assert isinstance(data, Reasoning)
    assert data.content == "Thinking about the user's request..."


def test_dict_message_with_content():
    """Verify that a dictionary message with a content field logs a Reasoning event."""
    tracer = MagicMock()
    handler = AutoGenCallbackHandler(tracer)
    
    msg = {"role": "assistant", "content": "I should call a tool next."}
    handler._process_message("assistant_agent", msg)
    
    tracer.log_event.assert_called_once()
    agent, event_type, data = extract_log_args(tracer.log_event.call_args)
    assert agent == "assistant_agent"
    assert event_type == "reasoning"
    assert isinstance(data, Reasoning)
    assert data.content == "I should call a tool next."


def test_tool_result_message():
    """Verify that a dictionary with role='tool' is logged as a ToolResult event."""
    tracer = MagicMock()
    handler = AutoGenCallbackHandler(tracer)
    
    msg = {"role": "tool", "name": "calculator_tool", "content": "42"}
    handler._process_message("tool_executor", msg)
    
    tracer.log_event.assert_called_once()
    agent, event_type, data = extract_log_args(tracer.log_event.call_args)
    assert agent == "tool_executor"
    assert event_type == "tool_result"
    assert isinstance(data, ToolResult)
    assert data.tool_name == "calculator_tool"
    assert data.result == "42"
    assert data.is_error is False


def test_tool_result_error_heuristic():
    """Verify that tool results containing 'error' or 'exception' set the is_error flag."""
    tracer = MagicMock()
    handler = AutoGenCallbackHandler(tracer)
    
    msg = {"role": "tool", "name": "database_query", "content": "Exception: connection timed out"}
    handler._process_message("tool_executor", msg)

    tracer.log_event.assert_called_once()
    agent, event_type, data = extract_log_args(tracer.log_event.call_args)
    assert agent == "tool_executor"
    assert event_type == "tool_result"
    assert isinstance(data, ToolResult)
    assert data.tool_name == "database_query"
    assert data.result == "Exception: connection timed out"
    assert data.is_error is True


def test_message_with_tool_calls():
    """Verify that tool_calls list is parsed into ToolCall events."""
    tracer = MagicMock()
    handler = AutoGenCallbackHandler(tracer)
    
    msg = {
        "role": "assistant",
        "tool_calls": [
            {
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "arguments": '{"location": "Seattle"}'
                }
            }
        ]
    }
    
    handler._process_message("assistant_agent", msg)
    
    tracer.log_event.assert_called_once()
    agent, event_type, data = extract_log_args(tracer.log_event.call_args)
    assert agent == "assistant_agent"
    assert event_type == "tool_call"
    assert isinstance(data, ToolCall)
    assert data.tool_name == "get_weather"
    assert data.arguments == {"location": "Seattle"}


def test_message_with_function_call():
    """Verify that legacy function_call dict is parsed into ToolCall events."""
    tracer = MagicMock()
    handler = AutoGenCallbackHandler(tracer)
    
    msg = {
        "role": "assistant",
        "function_call": {
            "name": "calculator",
            "arguments": '{"expr": "2+2"}'
        }
    }
    
    handler._process_message("assistant_agent", msg)
    
    tracer.log_event.assert_called_once()
    agent, event_type, data = extract_log_args(tracer.log_event.call_args)
    assert agent == "assistant_agent"
    assert event_type == "tool_call"
    assert isinstance(data, ToolCall)
    assert data.tool_name == "calculator"
    assert data.arguments == {"expr": "2+2"}


def test_message_with_content_and_tool_call():
    """Verify that a message with both content and tool calls logs both events."""
    tracer = MagicMock()
    handler = AutoGenCallbackHandler(tracer)
    
    msg = {
        "role": "assistant",
        "content": "Let me check the weather.",
        "tool_calls": [
            {
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "arguments": '{"location": "Boston"}'
                }
            }
        ]
    }
    
    handler._process_message("assistant_agent", msg)
    
    assert tracer.log_event.call_count == 2
    
    calls = tracer.log_event.mock_calls
    agent1, event_type1, data1 = extract_log_args(calls[0])
    assert agent1 == "assistant_agent"
    assert event_type1 == "reasoning"
    assert isinstance(data1, Reasoning)
    assert data1.content == "Let me check the weather."
    
    agent2, event_type2, data2 = extract_log_args(calls[1])
    assert agent2 == "assistant_agent"
    assert event_type2 == "tool_call"
    assert isinstance(data2, ToolCall)
    assert data2.tool_name == "get_weather"
    assert data2.arguments == {"location": "Boston"}