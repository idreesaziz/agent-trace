# AgentTrace

**Universal local debugger and visualizer for multi-agent workflows.**

With the explosion of agent frameworks, developers struggle to debug where a swarm went wrong or why a specific tool was called. AgentTrace is a lightweight local server that ingests standardized logs from any agent framework and visualizes the reasoning chain, tool calls, and state transitions in a clean UI. It allows developers to step through an agent's thought process retrospectively across different libraries.

## Features (Planned)
- 🔌 **Universal Integration**: Drop-in SDKs for Python and TypeScript.
- 🕸️ **Multi-Agent Support**: Track complex swarms and inter-agent communication.
- 🛠️ **Tool Call Tracing**: Inspect inputs and outputs of every tool execution.
- 🔄 **Time-Travel Debugging**: Step back and forth through the reasoning chain.
- 📊 **Framework Agnostic**: Works with LangChain, AutoGen, CrewAI, or custom loops.

## Installation

### 1. Start the Local Server
```bash
cd server
npm install
npm run dev
```

### 2. Install the Python SDK
```bash
cd sdk/python
pip install -r requirements.txt
```

## Usage

**Python SDK Example:**
```python
from agent_trace import Tracer

tracer = Tracer(project_name="my_agent_swarm")

# Log a tool call execution
tracer.log_event(
    agent="Researcher",
    event_type="tool_call",
    data={"tool": "search_web", "query": "latest AI news"}
)
```

## License
MIT License
