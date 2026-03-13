import uuid
from unittest.mock import MagicMock

import pytest

try:
    from agent_trace.integrations.langchain import AgentTraceCallbackHandler
except ImportError:
    AgentTraceCallbackHandler = MagicMock()
    pytestmark = pytest.mark.skip(reason="agent_trace.integrations.langchain is not built yet")

from agent_trace.models import EventType


def test_llm_reasoning_standard():
    tracer = MagicMock()
    handler = AgentTraceCallbackHandler(tracer=tracer, agent_name="test_agent")
    run_id = uuid.uuid4()

    handler.on_llm_start(
        serialized={},
        prompts=["Translate this:"],
        run_id=run_id
    )

    response = MagicMock()
    gen = MagicMock()
    gen.text = "Bonjour"
    response.generations = [[gen]]

    handler.on_llm_end(response, run_id=run_id)

    tracer.log_event.assert_called_once()
    call_kwargs = tracer.log_event.call_args.kwargs
    assert call_kwargs["agent"] == "test_agent"
    assert call_kwargs["event_type"] == EventType.REASONING.value
    assert call_kwargs["data"]["content"] == "Bonjour"
    assert call_kwargs["data"]["prompt"] == "Translate this:"


def test_chat_model_reasoning():
    tracer = MagicMock()
    handler = AgentTraceCallbackHandler(tracer=tracer)
    run_id = uuid.uuid4()

    msg1 = MagicMock()
    msg1.content = "System instruction"
    
    msg2 = MagicMock()
    msg2.content = [{"text": "Multimodal block 1"}, {"text": "Multimodal block 2"}]

    handler.on_chat_model_start(
        serialized={},
        messages=[[msg1, msg2]],
        run_id=run_id
    )

    response = MagicMock()
    gen = MagicMock()
    gen.text = "Understood"
    response.generations = [[gen]]

    handler.on_llm_end(response, run_id=run_id)

    tracer.log_event.assert_called_once()
    call_kwargs = tracer.log_event.call_args.kwargs
    assert call_kwargs["data"]["content"] == "Understood"
    assert call_kwargs["data"]["prompt"] == "System instruction\nMultimodal block 1\nMultimodal block 2"


def test_llm_error_cleans_up():
    tracer = MagicMock()
    handler = AgentTraceCallbackHandler(tracer=tracer)
    run_id = uuid.uuid4()

    handler.on_llm_start(serialized={}, prompts=["Test"], run_id=run_id)
    handler.on_llm_error(error=Exception("Token limit exceeded"), run_id=run_id)
    
    assert run_id not in handler._runs
    tracer.log_event.assert_not_called()


def test_tool_execution():
    tracer = MagicMock()
    handler = AgentTraceCallbackHandler(tracer=tracer)
    run_id = uuid.uuid4()

    handler.on_tool_start(
        serialized={"name": "calculator"},
        input_str="2+2",
        run_id=run_id,
        inputs={"expression": "2+2"}
    )
    
    tracer.log_event.assert_called_once()
    call_kwargs = tracer.log_event.call_args.kwargs
    assert call_kwargs["event_type"] == EventType.TOOL_CALL.value
    assert call_kwargs["data"]["tool_name"] == "calculator"
    assert call_kwargs["data"]["arguments"] == {"expression": "2+2"}
    assert call_kwargs["data"]["tool_call_id"] == str(run_id)

    tracer.reset_mock()

    handler.on_tool_end(output="4", run_id=run_id)
    
    tracer.log_event.assert_called_once()
    call_kwargs = tracer.log_event.call_args.kwargs
    assert call_kwargs["event_type"] == EventType.TOOL_RESULT.value
    assert call_kwargs["data"]["tool_name"] == "calculator"
    assert call_kwargs["data"]["result"] == "4"
    assert call_kwargs["data"]["tool_call_id"] == str(run_id)
    assert call_kwargs["data"]["is_error"] is False


def test_tool_error():
    tracer = MagicMock()
    handler = AgentTraceCallbackHandler(tracer=tracer)
    run_id = uuid.uuid4()

    handler.on_tool_start(
        serialized={"name": "calculator"},
        input_str="1/0",
        run_id=run_id,
        inputs={"expression": "1/0"}
    )
    tracer.reset_mock()

    handler.on_tool_error(error=Exception("Division by zero"), run_id=run_id)

    tracer.log_event.assert_called_once()
    call_kwargs = tracer.log_event.call_args.kwargs
    assert call_kwargs["event_type"] == EventType.TOOL_RESULT.value
    assert call_kwargs["data"]["tool_name"] == "calculator"
    assert call_kwargs["data"]["result"] == "Division by zero"
    assert call_kwargs["data"]["tool_call_id"] == str(run_id)
    assert call_kwargs["data"]["is_error"] is True


def test_chain_execution():
    tracer = MagicMock()
    handler = AgentTraceCallbackHandler(tracer=tracer)
    run_id = uuid.uuid4()

    handler.on_chain_start(
        serialized={},
        inputs={"input1": "test"},
        run_id=run_id
    )

    handler.on_chain_end(
        outputs={"output1": "result"},
        run_id=run_id
    )

    tracer.log_event.assert_called_once()
    call_kwargs = tracer.log_event.call_args.kwargs
    assert call_kwargs["event_type"] == EventType.STATE_CHANGE.value
    assert call_kwargs["data"]["keys_changed"] == ["output1"]
    assert call_kwargs["data"]["old_state"] == {"input1": "test"}
    assert call_kwargs["data"]["new_state"] == {"output1": "result"}
    assert call_kwargs["data"]["reason"] == "chain_execution"


def test_chain_error_cleans_up():
    tracer = MagicMock()
    handler = AgentTraceCallbackHandler(tracer=tracer)
    run_id = uuid.uuid4()

    handler.on_chain_start(serialized={}, inputs={"test": "data"}, run_id=run_id)
    handler.on_chain_error(error=Exception("Chain failed"), run_id=run_id)
    
    assert run_id not in handler._runs
    tracer.log_event.assert_not_called()