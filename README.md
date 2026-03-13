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

### Framework Integrations: LangChain (Drop-In)

AgentTrace provides a native callback handler for LangChain. This automatically intercepts LLM prompts, reasoning, tool executions, and chain state transitions without requiring any manual instrumentation.

**Example: Tracing a LangChain Agent**

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

# 4. Run the agent, passing the AgentTraceCallbackHandler in the config!
print("Running agent...")
response = agent_executor.invoke(
    {"input": "What's the weather like in Tokyo?"},
    config={"callbacks": [trace_callback]}
)

print(f"Agent response: {response['output']}")

# The tracer will flush automatically on exit, or you can call flush explicitly
tracer.flush()