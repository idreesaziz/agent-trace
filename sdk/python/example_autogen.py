"""
AgentTrace AutoGen Example
==========================

This script demonstrates a simple multi-agent workflow using AutoGen and AgentTrace.
It shows how to manually instrument AutoGen agents using the base `Tracer` methods
to automatically trace agent reasoning steps, tool calls, and tool results.

Usage Documentation for README.md:
----------------------------------
### Framework Integrations: AutoGen (Manual Instrumentation)

AgentTrace provides a flexible `Tracer` class that can be easily integrated with AutoGen.
By using AutoGen's `register_hook`, you can intercept messages before they are sent,
gracefully capturing reasoning, tool calls, and results.

**Example: Tracing an AutoGen Swarm**

```python
from autogen import ConversableAgent
from agent_trace import Tracer, Reasoning, ToolCall, ToolResult

# 1. Initialize the Tracer
tracer = Tracer(project_name="autogen_demo")

# 2. Create your AutoGen agents
assistant = ConversableAgent(name="assistant", llm_config={"config_list": [...]})
user_proxy = ConversableAgent(name="user_proxy", human_input_mode="NEVER")

# 3. Instrument the agents with AgentTrace
def instrument_agent(agent, tracer):
    def _hook(sender, message, recipient, silent):
        # Implementation to log Reasoning, ToolCall, ToolResult
        return message
    agent.register_hook("process_message_before_send", _hook)

instrument_agent(assistant, tracer)
instrument_agent(user_proxy, tracer)

# 4. Initiate chat
user_proxy.initiate_chat(assistant, message="Solve this math problem...")
tracer.flush()
```
"""

import os
import sys
import json
from typing import Annotated

try:
    from autogen import ConversableAgent, register_function
except ImportError:
    print("Please install required packages to run this example:")
    print("pip install pyautogen")
    sys.exit(1)

from agent_trace import Tracer, Reasoning, ToolCall, ToolResult


def instrument_agent(agent: ConversableAgent, tracer: Tracer) -> None:
    """
    Registers a hook on the given AutoGen agent to intercept messages
    before they are sent, logging reasoning, tool calls, and results.
    """
    if not hasattr(agent, "register_hook"):
        print(f"AgentTrace: {getattr(agent, 'name', 'Agent')} does not support register_hook. Update to pyautogen >= 0.2.2.")
        return

    def _hook(sender, message, recipient, silent):
        try:
            agent_name = sender.name
            
            if isinstance(message, str):
                if message.strip():
                    tracer.log_event(agent_name, "reasoning", Reasoning(content=message.strip()))
                return message

            if not isinstance(message, dict):
                return message

            content = message.get("content")
            role = message.get("role")
            tool_calls = message.get("tool_calls")
            function_call = message.get("function_call")

            # 1. Tool Results
            if role == "tool" or (content and "tool_responses" in message):
                tool_name = message.get("name", "unknown_tool")
                result_str = str(content) if content is not None else ""
                
                is_error = False
                if "error" in result_str.lower() or "exception" in result_str.lower():
                    is_error = True

                tracer.log_event(
                    agent=agent_name,
                    event_type="tool_result",
                    data=ToolResult(
                        tool_name=tool_name,
                        result=result_str,
                        is_error=is_error
                    )
                )
                return message

            # 2. Reasoning (Content)
            if content and isinstance(content, str) and content.strip():
                tracer.log_event(
                    agent=agent_name,
                    event_type="reasoning",
                    data=Reasoning(content=content.strip())
                )

            # 3. Tool Calls (OpenAI format)
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

                    tracer.log_event(
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

                tracer.log_event(
                    agent=agent_name,
                    event_type="tool_call",
                    data=ToolCall(
                        tool_name=f_name,
                        arguments=f_args
                    )
                )

        except Exception as e:
            print(f"AgentTrace AutoGen Hook Error: {e}")
            
        return message

    agent.register_hook("process_message_before_send", _hook)


def calculator(
    a: Annotated[int, "The first number"], 
    b: Annotated[int, "The second number"], 
    operator: Annotated[str, "The mathematical operator (+, -, *, /)"]
) -> str:
    """A simple calculator tool to perform basic arithmetic operations."""
    if operator == "+":
        return f"Result: {a + b}"
    elif operator == "-":
        return f"Result: {a - b}"
    elif operator == "*":
        return f"Result: {a * b}"
    elif operator == "/":
        if b == 0:
            return "Error: Division by zero"
        return f"Result: {a / b}"
    else:
        return "Error: Unknown operator"


def main():
    # Ensure API key is set
    if not os.environ.get("OPENAI_API_KEY"):
        print("WARNING: OPENAI_API_KEY environment variable is not set.")
        print("The LLM calls will likely fail. Please set it before running.")

    # 1. Initialize the Tracer
    # By default, this sends traces to http://localhost:3000/api/trace
    tracer = Tracer(project_name="autogen_demo_project")

    # 2. Configure the LLM
    llm_config = {
        "config_list": [
            {
                "model": "gpt-3.5-turbo",
                "api_key": os.environ.get("OPENAI_API_KEY", "dummy_key")
            }
        ]
    }

    # 3. Create Agents
    assistant = ConversableAgent(
        name="assistant",
        system_message="You are a helpful AI assistant. You can use the calculator tool to solve math problems. Reply TERMINATE when the task is done.",
        llm_config=llm_config,
    )

    user_proxy = ConversableAgent(
        name="user_proxy",
        llm_config=False,
        is_termination_msg=lambda msg: msg.get("content") is not None and "TERMINATE" in msg["content"],
        human_input_mode="NEVER",
    )

    # 4. Register the calculator tool
    register_function(
        calculator,
        caller=assistant,
        executor=user_proxy,
        name="calculator",
        description="A simple calculator to perform arithmetic.",
    )

    # 5. Instrument the agents with AgentTrace manually
    instrument_agent(assistant, tracer)
    instrument_agent(user_proxy, tracer)

    print("Kicking off the AutoGen swarm...")
    print("AgentTrace will capture reasoning steps, tool calls, and tool results.\n")

    # 6. Initiate chat
    try:
        user_proxy.initiate_chat(
            assistant,
            message="Please calculate (15 * 7) and then subtract 12 from the result. Provide the final answer."
        )
    except Exception as e:
        print(f"\nAn error occurred during AutoGen execution: {e}")

    # Explicitly flush traces before exiting
    tracer.flush()
    print("\nTraces have been sent to the local AgentTrace server!")
    print("Check http://localhost:3000 to visualize the execution flow.")


if __name__ == "__main__":
    main()