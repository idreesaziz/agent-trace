import json
from unittest.mock import MagicMock

import pytest

from agent_trace import Reasoning, ToolCall, ToolResult

try:
    from agent_trace.integrations.crewai import CrewAIStepCallbackHandler
except ImportError:
    CrewAIStepCallbackHandler = MagicMock()
    pytestmark = pytest.mark.skip(reason="agent_trace.integrations.crewai is not built yet")


class MockAgentAction:
    """Mock class simulating an AgentAction from frameworks like CrewAI or LangChain."""
    def __init__(self, log=None, tool=None, tool_input=None, text=None, result=None):
        self.log = log
        self.tool = tool
        self.tool_input = tool_input
        self.text = text
        self.result = result


def test_string_step_logged_as_reasoning():
    """Verify that a plain string step is correctly interpreted as a Reasoning event."""
    tracer = MagicMock()
    handler = CrewAIStepCallbackHandler(tracer=tracer, agent_name="test_agent")
    
    handler("This is a final summary or thought.")
    
    tracer.log_event.assert_called_once()
    kwargs = tracer.log_event.call_args.kwargs
    assert kwargs["agent"] == "test_agent"
    assert kwargs["event_type"] == "reasoning"
    assert isinstance(kwargs["data"], Reasoning)
    assert kwargs["data"].content == "This is a final summary or thought."


def test_tuple_step_success():
    """Verify that a standard (Action, Observation) tuple logs reasoning, tool call, and tool result."""
    tracer = MagicMock()
    handler = CrewAIStepCallbackHandler(tracer=tracer, agent_name="test_agent")
    
    action = MockAgentAction(
        log="I need to calculate something.",
        tool="Calculator",
        tool_input='{"expression": "2 + 2"}'
    )
    observation = "4"
    
    handler((action, observation))
    
    assert tracer.log_event.call_count == 3
    calls = tracer.log_event.mock_calls
    
    # Call 1: Reasoning
    assert calls[0].kwargs["event_type"] == "reasoning"
    assert isinstance(calls[0].kwargs["data"], Reasoning)
    assert calls[0].kwargs["data"].content == "I need to calculate something."
    
    # Call 2: Tool Call (verifying JSON parsing of input)
    assert calls[1].kwargs["event_type"] == "tool_call"
    assert isinstance(calls[1].kwargs["data"], ToolCall)
    assert calls[1].kwargs["data"].tool_name == "Calculator"
    assert calls[1].kwargs["data"].arguments == {"expression": "2 + 2"}
    
    # Call 3: Tool Result
    assert calls[2].kwargs["event_type"] == "tool_result"
    assert isinstance(calls[2].kwargs["data"], ToolResult)
    assert calls[2].kwargs["data"].tool_name == "Calculator"
    assert calls[2].kwargs["data"].result == "4"
    assert calls[2].kwargs["data"].is_error is False


def test_tuple_step_error_heuristic():
    """Verify that the callback correctly flags tool results containing 'error' or 'exception'."""
    tracer = MagicMock()
    handler = CrewAIStepCallbackHandler(tracer=tracer, agent_name="test_agent")
    
    action = MockAgentAction(
        log="I need to search the database.",
        tool="SearchDB",
        tool_input='{"query": "SELECT * FROM users"}'
    )
    observation = "Error: database connection failed."
    
    handler((action, observation))
    
    assert tracer.log_event.call_count == 3
    calls = tracer.log_event.mock_calls
    
    # Call 3: Tool Result
    assert calls[2].kwargs["event_type"] == "tool_result"
    assert isinstance(calls[2].kwargs["data"], ToolResult)
    assert calls[2].kwargs["data"].tool_name == "SearchDB"
    assert calls[2].kwargs["data"].result == "Error: database connection failed."
    assert calls[2].kwargs["data"].is_error is True


def test_dict_step():
    """Verify that dictionary formatted steps are handled properly."""
    tracer = MagicMock()
    handler = CrewAIStepCallbackHandler(tracer=tracer, agent_name="test_agent")
    
    step_dict = {
        "log": "Using a tool via dict format",
        "tool": "DictTool",
        "tool_input": {"key": "value"},
        "result": "Success"
    }
    
    handler(step_dict)
    
    assert tracer.log_event.call_count == 3
    calls = tracer.log_event.mock_calls
    
    assert calls[0].kwargs["event_type"] == "reasoning"
    assert calls[1].kwargs["event_type"] == "tool_call"
    assert calls[1].kwargs["data"].arguments == {"key": "value"}
    assert calls[2].kwargs["event_type"] == "tool_result"
    assert calls[2].kwargs["data"].result == "Success"


def test_list_of_steps():
    """Verify that processing a list of steps correctly unpacks and delegates them."""
    tracer = MagicMock()
    handler = CrewAIStepCallbackHandler(tracer=tracer, agent_name="test_agent")
    
    handler(["First step string", "Second step string"])
    
    assert tracer.log_event.call_count == 2
    calls = tracer.log_event.mock_calls
    assert calls[0].kwargs["data"].content == "First step string"
    assert calls[1].kwargs["data"].content == "Second step string"