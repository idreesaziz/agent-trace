import time
from unittest.mock import patch, MagicMock

import pytest

from agent_trace import Tracer, Reasoning, ToolCall, ToolResult, StateChange
from agent_trace.models import (
    EventType,
    ReasoningData,
    ToolCallData,
    ToolResultData,
    StateChangeData,
    AgentEvent
)

def test_reasoning_data_serialization():
    data = ReasoningData(content="Thinking...", model="gpt-4")
    serialized = data.to_dict()
    assert serialized == {"content": "Thinking...", "model": "gpt-4"}
    assert "prompt" not in serialized

def test_tool_call_data_serialization():
    data = ToolCallData(tool_name="get_weather", arguments={"location": "NYC"})
    serialized = data.to_dict()
    assert serialized == {"tool_name": "get_weather", "arguments": {"location": "NYC"}}
    assert "tool_call_id" not in serialized

def test_tool_result_data_serialization():
    data = ToolResultData(tool_name="get_weather", result="Sunny", is_error=False)
    serialized = data.to_dict()
    assert serialized == {
        "tool_name": "get_weather",
        "result": "Sunny",
        "tool_call_id": None,
        "is_error": False
    }

def test_state_change_data_serialization():
    data = StateChangeData(
        keys_changed=["status"],
        old_state={"status": "idle"},
        new_state={"status": "active"}
    )
    serialized = data.to_dict()
    assert serialized == {
        "keys_changed": ["status"],
        "old_state": {"status": "idle"},
        "new_state": {"status": "active"}
    }
    assert "reason" not in serialized

def test_agent_event_serialization():
    data = AgentEvent(
        project_name="test_proj",
        agent="agent_1",
        event_type=EventType.REASONING,
        data={"content": "Thinking..."}
    )
    serialized = data.to_dict()
    assert serialized["project_name"] == "test_proj"
    assert serialized["agent"] == "agent_1"
    assert serialized["event_type"] == "reasoning"
    assert serialized["data"] == {"content": "Thinking..."}
    assert "timestamp" in serialized
    assert "event_id" in serialized
    assert serialized["run_id"] is None
    assert serialized["parent_id"] is None

def test_tracer_enqueue_and_flush():
    with patch("agent_trace.requests.post") as mock_post:
        mock_response = MagicMock()
        mock_post.return_value = mock_response
        
        tracer = Tracer(project_name="test_project", endpoint="http://test.com/api")
        
        tracer.log_event(
            agent="test_agent",
            event_type="reasoning",
            data=Reasoning(content="Hello world")
        )
        
        # Flush will block until the queue is processed or thread finishes
        tracer.flush()
        
        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args.kwargs
        payload = call_kwargs["json"]
        
        assert payload["project_name"] == "test_project"
        assert payload["agent"] == "test_agent"
        assert payload["event_type"] == "reasoning"
        assert payload["data"] == {"content": "Hello world"}
        assert "timestamp" in payload

def test_tracer_handles_post_error():
    with patch("agent_trace.requests.post") as mock_post:
        # Make the post request throw an error
        mock_post.side_effect = Exception("Network error")
        
        tracer = Tracer(project_name="test_project", endpoint="http://test.com/api")
        
        tracer.log_event(
            agent="test_agent",
            event_type="tool_call",
            data=ToolCall(tool_name="test_tool", arguments={"arg1": "val1"})
        )
        
        # The tracer should catch the exception and not crash
        tracer.flush()
        
        assert mock_post.called

def test_tracer_queue_state():
    with patch("agent_trace.requests.post") as mock_post:
        # Simulate a slow network request
        def slow_post(*args, **kwargs):
            time.sleep(0.1)
            mock_resp = MagicMock()
            mock_resp.raise_for_status.return_value = None
            return mock_resp
            
        mock_post.side_effect = slow_post
        
        tracer = Tracer(project_name="test_project", endpoint="http://test.com/api")
        
        for i in range(5):
            tracer.log_event(agent="test_agent", event_type="test", data={"index": i})
            
        # The queue should have items in it right after logging
        assert not tracer._queue.empty()
        
        tracer.flush()
        
        # After flush, the queue should be empty and all items processed
        assert tracer._queue.empty()
        assert mock_post.call_count == 5

def test_tracer_dict_data():
    with patch("agent_trace.requests.post") as mock_post:
        mock_response = MagicMock()
        mock_post.return_value = mock_response
        
        tracer = Tracer(project_name="test_project", endpoint="http://test.com/api")
        
        tracer.log_event(
            agent="test_agent",
            event_type="custom",
            data={"custom_key": "custom_value"}
        )
        
        tracer.flush()
        
        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args.kwargs
        payload = call_kwargs["json"]
        
        assert payload["data"] == {"custom_key": "custom_value"}