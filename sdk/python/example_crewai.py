"""
AgentTrace CrewAI Example
=========================

This script demonstrates a simple multi-agent workflow using CrewAI and AgentTrace.
It shows how to integrate the `CrewAIStepCallbackHandler` to automatically trace 
agent reasoning steps, tool calls, and tool results.

Usage Documentation for README.md:
----------------------------------
### Framework Integrations: CrewAI (Drop-In)

AgentTrace provides a native step callback handler for CrewAI. This automatically 
intercepts agent reasoning, tool executions, and results without requiring complex instrumentation.

**Example: Tracing a CrewAI Swarm**

```python
from crewai import Agent, Task, Crew, Process
from agent_trace import Tracer
from agent_trace.integrations.crewai import CrewAIStepCallbackHandler

# 1. Initialize the Tracer
tracer = Tracer(project_name="crewai_demo")

# 2. Attach the callback to your CrewAI Agents
researcher = Agent(
    role="Researcher",
    goal="Search the web for the latest AI news",
    backstory="You are a veteran tech analyst.",
    verbose=True,
    step_callback=CrewAIStepCallbackHandler(tracer, agent_name="Researcher")
)

# 3. Create Tasks and Crew as normal
task = Task(
    description="Find 3 AI news articles", 
    expected_output="A list of articles", 
    agent=researcher
)
crew = Crew(agents=[researcher], tasks=[task], process=Process.sequential)

# 4. Run the Crew
crew.kickoff()
tracer.flush()
```
"""

import os
import sys

try:
    from crewai import Agent, Task, Crew, Process
except ImportError:
    print("Please install required packages to run this example:")
    print("pip install crewai langchain-openai")
    sys.exit(1)

from agent_trace import Tracer

try:
    from agent_trace.integrations.crewai import CrewAIStepCallbackHandler
except ImportError:
    print("Error: agent_trace.integrations.crewai module not found.")
    print("Please ensure the AgentTrace SDK is fully installed and up to date.")
    sys.exit(1)


def main():
    # Ensure API key is set
    if not os.environ.get("OPENAI_API_KEY"):
        print("WARNING: OPENAI_API_KEY environment variable is not set.")
        print("The LLM calls will likely fail. Please set it before running.")

    # 1. Initialize the Tracer
    # By default, this sends traces to http://localhost:3000/api/trace
    tracer = Tracer(project_name="crewai_demo_project")

    # 2. Define your Agents, injecting the CrewAIStepCallbackHandler into step_callback
    researcher = Agent(
        role="Senior Technology Researcher",
        goal="Discover the latest trends in Agentic AI Frameworks",
        backstory="You are a veteran tech analyst who loves exploring new AI capabilities.",
        verbose=True,
        allow_delegation=False,
        # Attach the AgentTrace callback handler here
        step_callback=CrewAIStepCallbackHandler(tracer, agent_name="Researcher")
    )

    writer = Agent(
        role="Technical Content Writer",
        goal="Draft a short, engaging summary based on research findings",
        backstory="You are a skilled technical writer that simplifies complex topics.",
        verbose=True,
        allow_delegation=False,
        step_callback=CrewAIStepCallbackHandler(tracer, agent_name="Writer")
    )

    # 3. Define your Tasks
    research_task = Task(
        description="Research the most recent advancements in agentic AI frameworks (e.g., CrewAI, LangChain, AutoGen).",
        expected_output="A bulleted list of the top 3 advancements in agentic AI frameworks.",
        agent=researcher
    )

    writing_task = Task(
        description="Take the research findings and write a short, 2-paragraph summary.",
        expected_output="A 2-paragraph summary of the latest AI framework trends.",
        agent=writer
    )

    # 4. Create the Crew
    crew = Crew(
        agents=[researcher, writer],
        tasks=[research_task, writing_task],
        process=Process.sequential
    )

    print("Kicking off the CrewAI swarm...")
    print("AgentTrace will automatically capture reasoning steps and tool calls for each agent.\n")

    # 5. Run the Crew
    try:
        result = crew.kickoff()
        print("\n=== Final Result ===")
        print(result)
        print("====================\n")
    except Exception as e:
        print(f"\nAn error occurred during CrewAI execution: {e}")

    # The background tracer thread will automatically flush on exit due to atexit,
    # but we can explicitly call it here.
    tracer.flush()
    print("Traces have been sent to the local AgentTrace server!")
    print("Check http://localhost:3000 to visualize the multi-agent execution flow.")


if __name__ == "__main__":
    main()