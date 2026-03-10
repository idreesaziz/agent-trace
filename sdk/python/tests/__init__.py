import json
import pytest
import requests
from unittest.mock import patch, MagicMock

from agent_trace import Tracer, Reasoning, ToolCall, ToolResult, StateChange
from agent_trace.models import (
    EventType,
    ReasoningData,
    ToolCallData,
    ToolResultData,
    StateChangeData,
    AgentEvent,
)


def test_reasoning_data_serialization():
    data = ReasoningData(content="evaluating", model="gpt-4o")
    serialized = data.to_dict()
    assert serialized == {"content": "evaluating", "model": "gpt-4o"}
    assert "prompt" not in serialized
    
    # Verify it can be dumped to JSON
    json_output = json.dumps(serialized)
    assert "evaluating" in json_output


def test_tool_call_data_serialization():
    data = ToolCallData(tool_name="fetch_data", arguments={"query": "test"})
    serialized = data.to_dict()
    assert serialized == {"tool_name": "fetch_data", "arguments": {"query": "test"}}
    assert "tool_call_id" not in serialized

    json_output = json.dumps(serialized)
    assert "fetch_data" in json_output


def test_tool_result_data_serialization():
    data = ToolResultData(tool_name="fetch_data", result={"data": [1, 2, 3]})
    serialized = data.to_dict()
    assert serialized == {
        "tool_name": "fetch_data",
        "result": {"data": [1, 2, 3]},
        "tool_call_id": None,
        "is_error": False,
    }

    json_output = json.dumps(serialized)
    assert "[1, 2, 3]" in json_output


def test_state_change_data_serialization():
    data = StateChangeData(
        keys_changed=["memory"],
        old_state={"memory": "empty"},
        new_state={"memory": "full"}
    )
    serialized = data.to_dict()
    assert serialized == {
        "keys_changed": ["memory"],
        "old_state": {"memory": "empty"},
        "new_state": {"memory": "full"}
    }
    assert "reason" not in serialized

    json_output = json.dumps(serialized)
    assert "memory" in json_output


def test_agent_event_serialization():
    event = AgentEvent(
        project_name="my_project",
        agent="my_agent",
        event_type=EventType.STATE_CHANGE,
        data={"key": "value"},
        run_id="run_001"
    )
    serialized = event.to_dict()
    
    assert serialized["project_name"] == "my_project"
    assert serialized["agent"] == "my_agent"
    assert serialized["event_type"] == "state_change"
    assert serialized["data"] == {"key": "value"}
    assert serialized["run_id"] == "run_001"
    assert "timestamp" in serialized
    assert "event_id" in serialized
    assert serialized["parent_id"] is None

    # Verify complete object can be dumped to JSON
    json_output = json.dumps(serialized)
    assert "my_project" in json_output


@patch("agent_trace.requests.post")
def test_tracer_async_enqueueing(mock_post):
    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_post.return_value = mock_response

    tracer = Tracer(project_name="test_proj", endpoint="http://localhost:3000/api/trace")

    # Log events to test the queue processing
    tracer.log_event("agent_1", "reasoning", Reasoning(content="test reasoning step"))
    tracer.log_event("agent_1", "tool_call", ToolCall(tool_name="test_tool", arguments={}))
    
    # Flush ensures the background worker finishes processing the queue before exiting
    tracer.flush()

    # The worker thread should have picked up both events and sent HTTP requests
    assert mock_post.call_count == 2
    
    # Validate the first request payload
    call_args, call_kwargs = mock_post.call_args_list[0]
    assert call_args[0] == "http://localhost:3000/api/trace"
    
    payload1 = call_kwargs.get("json")
    assert payload1["project_name"] == "test_proj"
    assert payload1["agent"] == "agent_1"
    assert payload1["event_type"] == "reasoning"
    assert payload1["data"] == {"content": "test reasoning step"}
    assert "timestamp" in payload1

    # Validate the second request payload
    call_args2, call_kwargs2 = mock_post.call_args_list[1]
    payload2 = call_kwargs2.get("json")
    assert payload2["event_type"] == "tool_call"
    assert payload2["data"] == {"tool_name": "test_tool", "arguments": {}}


@patch("agent_trace.requests.post")
def test_tracer_error_handling(mock_post):
    # Simulate an HTTP request error to ensure the worker thread does not crash
    mock_post.side_effect = requests.exceptions.RequestException("Simulated Network Error")

    tracer = Tracer(project_name="test_proj")
    
    # This should be enqueued and attempted, failing gracefully inside the worker thread
    tracer.log_event("agent_2", "error_test", {"foo": "bar"})
    
    tracer.flush()
    
    # Ensure post was attempted despite the exception
    assert mock_post.call_count == 1