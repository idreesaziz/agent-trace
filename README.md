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
├── server/                TypeScript ingestion server (Express + SQLite)
│   ├── src/               API routes, DB, schema validation
│   └── tests/             Server test suite
└── frontend/              React + TypeScript dashboard (Vite + Tailwind)
    └── src/               UI components, pages, hooks, and API client
```

## Getting Started

### 1. Start the Local Server

```bash
cd server
npm install
npm run dev
```

The server will listen on `http://localhost:3000`.

### 2. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

The dashboard will be available at `http://localhost:5173`.

### 3. Install the Python SDK

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

# 1. Initialize the Tracer and the LangChain Callback Handler
tracer = Tracer(project_name="langchain_demo")
trace_callback = AgentTraceCallbackHandler(tracer=tracer, agent_name="WeatherBot")

# 2. Define a simple tool
@tool
def get_weather(location: str) -> str:
    """Get the current weather for a location."""
    return f"The weather in {location} is 72°F and sunny."

tools = [get_weather]

# 3. Create the LangChain agent
llm = ChatOpenAI(model="gpt-4", temperature=0)
prompt = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant."),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

agent = create_tool_calling_agent(llm, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools)

# 4. Run the agent with the trace callback
response = agent_executor.invoke(
    {"input": "What's the weather like in Tokyo?"},
    config={"callbacks": [trace_callback]}
)

print(f"Agent response: {response['output']}")
```

</details>

### CrewAI — Drop-In Integration

AgentTrace provides a native step callback handler for CrewAI. It intercepts agent steps and automatically logs reasoning, tool execution, and tool results.

<details>
<summary><strong>Example: Tracing a CrewAI Multi-Agent Swarm</strong></summary>

```python
from crewai import Agent, Task, Crew, Process
from langchain_openai import ChatOpenAI
from langchain.tools import tool

from agent_trace import Tracer
from agent_trace.integrations.crewai import CrewAIStepCallbackHandler

# 1. Initialize the Tracer
tracer = Tracer(project_name="crewai_demo")

# 2. Define a simple tool
@tool
def get_weather(location: str) -> str:
    """Get the current weather for a location."""
    return f"The weather in {location} is 72°F and sunny."

# 3. Create Agents with the CrewAI step callback
researcher = Agent(
    role='Weather Researcher',
    goal='Find the current weather for given locations',
    backstory='An expert in gathering weather data from around the world.',
    verbose=True,
    allow_delegation=False,
    tools=[get_weather],
    llm=ChatOpenAI(model="gpt-4", temperature=0),
    step_callback=CrewAIStepCallbackHandler(tracer, agent_name="Researcher")
)

writer = Agent(
    role='Weather Reporter',
    goal='Write a short report about the weather',
    backstory='A skilled writer who crafts engaging weather reports.',
    verbose=True,
    allow_delegation=False,
    llm=ChatOpenAI(model="gpt-4", temperature=0),
    step_callback=CrewAIStepCallbackHandler(tracer, agent_name="Writer")
)

# 4. Create Tasks
task1 = Task(
    description='Find out what the weather is like in Tokyo.',
    expected_output='A brief statement of the weather in Tokyo.',
    agent=researcher
)

task2 = Task(
    description='Write a 2-sentence weather report.',
    expected_output='A 2-sentence weather report.',
    agent=writer
)

# 5. Form the Crew and kick off
crew = Crew(
    agents=[researcher, writer],
    tasks=[task1, task2],
    process=Process.sequential
)

result = crew.kickoff()
print("Final Result:", result)
```

</details>

---

## License

See [LICENSE](LICENSE) for details.