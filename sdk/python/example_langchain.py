import os
import sys
import time

# NOTE: To run this example, you need to install standard langchain packages:
# pip install langchain langchain-openai
# You must also set the OPENAI_API_KEY environment variable.

try:
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.tools import tool
    from langchain_openai import ChatOpenAI
    from langchain.agents import AgentExecutor, create_tool_calling_agent
except ImportError:
    print("Please install required packages to run this example:")
    print("pip install langchain langchain-openai")
    sys.exit(1)

from agent_trace import Tracer

try:
    from agent_trace.integrations.langchain import AgentTraceCallbackHandler
except ImportError:
    print("Error: agent_trace.integrations.langchain module not found.")
    print("Please ensure the AgentTrace SDK is fully installed and up to date.")
    sys.exit(1)


@tool
def get_weather(location: str) -> str:
    """Get the current weather for a given location."""
    # Simulate an external API call
    time.sleep(1.0)
    if "tokyo" in location.lower():
        return "The weather in Tokyo is 22°C and Sunny."
    return f"The weather in {location} is 15°C and Cloudy."


def main():
    # Ensure API key is set
    if not os.environ.get("OPENAI_API_KEY"):
        print("WARNING: OPENAI_API_KEY environment variable is not set.")
        print("The LLM calls will likely fail. Please set it before running.")
        
    # 1. Initialize the Tracer
    # By default, this sends traces to http://localhost:3000/api/trace
    tracer = Tracer(project_name="langchain_weather_agent")

    # 2. Initialize the AgentTrace Callback Handler
    agent_trace_handler = AgentTraceCallbackHandler(
        tracer=tracer, 
        agent_name="LangChainWeatherBot"
    )

    # 3. Set up a standard LangChain Agent
    llm = ChatOpenAI(model="gpt-3.5-turbo", temperature=0)
    tools = [get_weather]
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a helpful assistant that can check the weather. Use the provided tools if needed."),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}"),
    ])
    
    agent = create_tool_calling_agent(llm, tools, prompt)
    agent_executor = AgentExecutor(agent=agent, tools=tools)

    print("Invoking LangChain agent...")
    print("AgentTrace will automatically capture prompts, tool executions, and state changes.\n")

    # 4. Invoke the agent, passing the handler in the config
    try:
        response = agent_executor.invoke(
            {"input": "Can you check the weather in Tokyo?"},
            config={"callbacks": [agent_trace_handler]}
        )
        
        print("\n=== Final Response ===")
        print(response["output"])
        print("======================\n")
    except Exception as e:
        print(f"\nAn error occurred during agent execution: {e}")
    
    # The background tracer thread will automatically flush on exit due to atexit.
    print("Traces have been sent to the local AgentTrace server!")
    print("Check http://localhost:3000 to visualize the LangChain execution flow.")


if __name__ == "__main__":
    main()