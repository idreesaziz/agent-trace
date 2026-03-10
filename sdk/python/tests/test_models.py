import pytest
from unittest.mock import patch
from agent_trace.models import (
    ReasoningData,
    ToolCallData,
    ToolResultData,
    StateChangeData,
    AgentEvent,
    EventType
)
from agent_trace import Tracer, Reasoning

def test_reasoning_data_serialization():
    data = ReasoningData(content="Testing reasoning", prompt="You are a helpful assistant")
    serialized = data.to_dict()
    assert serialized == {
        "content": "Testing reasoning",
        "prompt": "You are a helpful assistant"
    }
    assert "model" not in serialized

def test_tool_call_data_serialization():
    data = ToolCallData(tool_name="get_weather", arguments={"location": "NYC"})
    serialized = data.to_dict()
    assert serialized == {
        "tool_name": "get_weather",
        "arguments": {"location": "NYC"}
    }
    assert "tool_call_id" not in serialized

def test_tool_result_data_serialization():
    data = ToolResultData(tool_name="get_weather", result={"temp": 72}, is_error=False)
    serialized = data.to_dict()
    assert serialized == {
        "tool_name": "get_weather",
        "result": {"temp": 72},
        "tool_call_id": None,
        "is_error": False
    }

def test_state_change_data_serialization():
    data = StateChangeData(
        keys_changed=["status"],
        old_state={"status": "idle"},
        new_state={"status": "running"}
    )
    serialized = data.to_dict()
    assert serialized == {
        "keys_changed": ["status"],
        "old_state": {"status": "idle"},
        "new_state": {"status": "running"}
    }
    assert "reason" not in serialized

def test_agent_event_serialization():
    event = AgentEvent(
        project_name="test_proj",
        agent="agent_1",
        event_type=EventType.TOOL_CALL,
        data={"tool_name": "search"},
        run_id="run_1"
    )
    serialized = event.to_dict()
    assert serialized["project_name"] == "test_proj"
    assert serialized["agent"] == "agent_1"
    assert serialized["event_type"] == "tool_call"
    assert serialized["data"] == {"tool_name": "search"}
    assert "timestamp" in serialized
    assert "event_id" in serialized
    assert serialized["run_id"] == "run_1"
    assert serialized["parent_id"] is None

@patch("requests.post")
def test_tracer_async_enqueueing(mock_post):
    tracer = Tracer(project_name="async_project", endpoint="http://localhost:3000/api/trace")
    
    # Send a dictionary payload
    tracer.log_event(agent="agent_A", event_type="message", data={"msg": "Hello"})
    
    # Send a dataclass payload
    reasoning = Reasoning(content="Thinking...")
    tracer.log_event(agent="agent_A", event_type="thought", data=reasoning)
    
    # Force flush to ensure the worker thread processes the queue before we check
    tracer.flush()
    
    assert mock_post.call_count == 2
    
    call_args_list = mock_post.call_args_list
    
    payload_1 = call_args_list[0][1]["json"]
    assert payload_1["project_name"] == "async_project"
    assert payload_1["agent"] == "agent_A"
    assert payload_1["event_type"] == "message"
    assert payload_1["data"] == {"msg": "Hello"}
    assert "timestamp" in payload_1
    
    payload_2 = call_args_list[1][1]["json"]
    assert payload_2["project_name"] == "async_project"
    assert payload_2["agent"] == "agent_A"
    assert payload_2["event_type"] == "thought"
    assert payload_2["data"] == {"content": "Thinking..."}
    assert "timestamp" in payload_2