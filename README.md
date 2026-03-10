# AgentTrace

**Universal local debugger and visualizer for multi-agent workflows.**

With the explosion of agent frameworks, developers struggle to debug where a swarm went wrong or why a specific tool was called. AgentTrace is a lightweight local server that ingests standardized logs from any agent framework and visualizes the reasoning chain, tool calls, and state transitions in a clean UI. It allows developers to step through an agent's thought process retrospectively across different libraries.

## Features (Planned)
- 🔌 **Universal Integration**: Drop-in SDKs for Python and TypeScript.
- 🕸️ **Multi-Agent Support**: Track complex swarms and inter-agent communication.
- 🛠️ **Tool Call Tracing**: Inspect inputs and outputs of every tool execution.
- 🔄 **Time-Travel Debugging**: Step back and forth through the reasoning chain.
- 📊 **Framework Agnostic**: Works with LangChain, AutoGen, CrewAI, or custom loops.

## Setup Instructions

### 1. Start the Local Server
The AgentTrace server receives and stores your agent logs locally.
```bash
cd server
npm install
npm run dev
```
*The server will listen for traces on `http://localhost:3000`.*

### 2. Install the Python SDK
In your Python project environment, install the AgentTrace SDK and its dependencies:
```bash
cd sdk/python
pip install -r requirements.txt
# If using as a local package:
pip install -e .
```

## Usage

Use the Python SDK to instrument your custom agent loop or framework. The `Tracer` client handles API communication in a non-blocking background thread, ensuring it never slows down your agent's execution.

**Example: Tracing Reasoning and Tool Calls**

```python
import time
from agent_trace import Tracer, Reasoning, ToolCall, ToolResult

# Initialize the tracer (connects to http://localhost:3000/api/trace by default)
tracer = Tracer(project_name="weather_agent_swarm")

agent_name = "WeatherBot"

print("Running agent...")

# 1. Log the agent's internal reasoning or thought process
tracer.log_event(
    agent=agent_name,
    event_type="reasoning",
    data=Reasoning(content="I need to check the weather in Tokyo before answering the user.")
)

# 2. Log the agent's intent to call a tool
tracer.log_event(
    agent=agent_name,
    event_type="tool_call",
    data=ToolCall(
        tool_name="get_weather",
        arguments={"location": "Tokyo, Japan", "unit": "celsius"}
    )
)

# (Simulate the actual tool execution delay)
time.sleep(1)
weather_data = {"temperature": 22, "condition": "Sunny"}

# 3. Log the result of the tool execution
tracer.log_event(
    agent=agent_name,
    event_type="tool_result",
    data=ToolResult(
        tool_name="get_weather",
        result=weather_data,
        is_error=False
    )
)

# 4. Log subsequent reasoning based on the tool's output
tracer.log_event(
    agent=agent_name,
    event_type="reasoning",
    data=Reasoning(content="The weather in Tokyo is 22°C and sunny. I will formulate the final response.")
)

print("Agent finished. Traces are automatically flushed on exit.")