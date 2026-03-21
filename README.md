<div align="center">

# AgentTrace

**Universal local debugger and visualizer for multi-agent workflows.**

[Getting Started](#getting-started) · [Usage](#usage) · [Project Structure](#project-structure)

---

</div>

With the explosion of agent frameworks, developers struggle to debug where a swarm went wrong or why a specific tool was called. AgentTrace is a lightweight local server that ingests standardized logs from any agent framework and visualizes the reasoning chain, tool calls, and state transitions in a clean UI. Step through an agent's thought process retrospectively — across any library.

## Features

| | Feature | Description |
|---|---|---|
| **SDK** | Universal Integration | Drop-in Python SDK with async, non-blocking trace collection |
| **Agents** | Multi-Agent Support | Track complex swarms and inter-agent communication |
| **Tools** | Tool Call Tracing | Inspect inputs and outputs of every tool execution |
| **Debug** | Time-Travel Debugging | Step forward and backward through the reasoning chain with an interactive timeline scrubber |
| **Frameworks** | Framework Agnostic | Built-in integrations for LangChain, AutoGen, and CrewAI — or use the SDK directly |
| **Search** | Search & Filter | Full-text search across agent logs with event type filtering |
| **Export** | Export & Import | Share trace files as JSON for collaborative debugging |

## Project Structure

```
agent-trace/
├── sdk/python/            Python SDK & framework integrations
│   ├── agent_trace/       Core Tracer, models, and integration callbacks
│   └── tests/             SDK test suite
├── server/                TypeScript ingestion server & CLI (Express + SQLite)
│   ├── src/               API routes, DB, schema validation, CLI entry
│   └── tests/             Server test suite
└── frontend/              React + TypeScript dashboard (Vite + Tailwind)
    └── src/               UI components, pages, hooks, and API client
```

## Getting Started

AgentTrace provides a unified CLI that runs the ingestion server and serves the frontend dashboard from a single command.

### 1. Install the CLI and Server

Build and install the `agent-trace` CLI globally. Building the server automatically builds the React frontend dashboard as well.

```bash
cd server
npm install
npm run build
npm install -g .
```

### 2. Start AgentTrace

Once installed, simply start the local server via the CLI:

```bash
agent-trace start
```

The unified dashboard and ingestion API will be available at `http://localhost:3000`.

*(Optional: To run on a different port, use `agent-trace start -p 8080`)*

### 3. Install the Python SDK

In your Python project environment, install the SDK:

```bash
cd sdk/python
pip install -r requirements.txt
```

---

## Usage

### LangChain — Drop-In Integration

AgentTrace provides a native callback handler for LangChain. It automatically intercepts LLM prompts, reasoning, tool executions, and chain state transitions without requiring any manual instrumentation.

<details>
<summary><strong>Example: Tracing a LangChain Agent</strong></summary>

```python
from langchain_openai import ChatOpenAI
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool

from agent_trace import Tracer
from agent_trace.integrations.langchain import AgentTraceCallbackHandler

# 1. Initialize the Tracer and the callback handler
tracer = Tracer(project_name="weather-agent")
agent_trace_callback = AgentTraceCallbackHandler(tracer=tracer, agent_name="weather_assistant")

# 2. Define tools and the LangChain agent
@tool
def get_weather(location: str) -> str:
    """Get the current weather for a location."""
    return f"The weather in {location} is 72°F and sunny."

llm = ChatOpenAI(model="gpt-4-turbo")
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful weather assistant."),
    ("placeholder", "{chat_history}"),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_tool_calling_agent(llm, [get_weather], prompt)
agent_executor = AgentExecutor(agent=agent, tools=[get_weather])

# 3. Execute with the callback
agent_executor.invoke(
    {"input": "What is the weather in San Francisco?"},
    config={"callbacks": [agent_trace_callback]}
)

# 4. Flush the tracer before exiting
tracer.flush()
```
</details>

### AutoGen — Automatic Swarm Tracing

Instrument conversable agents to trace message flows, tool executions, and internal logic.

<details>
<summary><strong>Example: Tracing an AutoGen Swarm</strong></summary>

```python
import autogen
from agent_trace import Tracer
from agent_trace.integrations.autogen import AutoGenCallbackHandler

tracer = Tracer(project_name="autogen-swarm")
handler = AutoGenCallbackHandler(tracer)

# Create AutoGen agents
assistant = autogen.AssistantAgent(
    name="assistant",
    llm_config={"config_list": [{"model": "gpt-4", "api_key": "YOUR_API_KEY"}]}
)
user_proxy = autogen.UserProxyAgent(
    name="user_proxy",
    human_input_mode="NEVER",
    max_consecutive_auto_reply=2
)

# Instrument agents
handler.instrument_agent(assistant)
handler.instrument_agent(user_proxy)

# Initiate chat
user_proxy.initiate_chat(assistant, message="Write a python script to calculate the Fibonacci sequence.")

tracer.flush()
```
</details>

### CrewAI — Agent Step Tracking

Capture agent step telemetry, observations, and tool uses in multi-agent crews.

<details>
<summary><strong>Example: Tracing a CrewAI Workflow</strong></summary>

```python
from crewai import Agent, Task, Crew
from agent_trace import Tracer
from agent_trace.integrations.crewai import CrewAIStepCallbackHandler

tracer = Tracer(project_name="crewai-research")

# Create the callback handler
researcher_callback = CrewAIStepCallbackHandler(tracer, agent_name="Researcher")

researcher = Agent(
    role='Senior Researcher',
    goal='Uncover groundbreaking technologies',
    backstory='Driven by curiosity, you are at the forefront of innovation.',
    verbose=True,
    allow_delegation=False,
    step_callback=researcher_callback  # Attach callback
)

task = Task(
    description='Research the latest advancements in AI agents.',
    agent=researcher,
    expected_output='A summary of the latest AI agent frameworks.'
)

crew = Crew(
    agents=[researcher],
    tasks=[task],
    verbose=True
)

crew.kickoff()
tracer.flush()
```
</details>

### Raw Python SDK

If you are building a custom framework or raw LLM loop, use the Python SDK directly to emit standard events.

<details>
<summary><strong>Example: Manual Instrumentation</strong></summary>

```python
from agent_trace import Tracer
from agent_trace.models import ReasoningData, ToolCallData, ToolResultData, StateChangeData

tracer = Tracer(project_name="custom-agent")

# Log reasoning
tracer.log_event(
    agent="researcher",
    event_type="reasoning",
    data=ReasoningData(content="I need to search for the current stock price of AAPL.")
)

# Log tool call
tracer.log_event(
    agent="researcher",
    event_type="tool_call",
    data=ToolCallData(tool_name="web_search", tool_args={"query": "AAPL stock price"})
)

# Log tool result
tracer.log_event(
    agent="researcher",
    event_type="tool_result",
    data=ToolResultData(tool_name="web_search", result="AAPL is currently trading at $150.23", is_error=False)
)

tracer.flush()
```
</details>