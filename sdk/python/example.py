import time
from agent_trace import Tracer, Reasoning, ToolCall, ToolResult, StateChange

def main():
    # Initialize the tracer with your project name.
    # By default, this sends traces to http://localhost:3000/api/trace
    tracer = Tracer(project_name="weather_assistant_demo")

    agent_name = "WeatherBot"

    print("Starting agent trace demonstration...")

    # 1. Log a state change (e.g., agent waking up)
    print("Logging state change: idle -> processing_request")
    tracer.log_event(
        agent=agent_name,
        event_type="state_change",
        data=StateChange(
            before={"status": "idle"},
            after={"status": "processing_request"}
        )
    )
    time.sleep(0.5)

    # 2. Log reasoning (the agent thinking about what to do)
    print("Logging reasoning step...")
    tracer.log_event(
        agent=agent_name,
        event_type="reasoning",
        data=Reasoning(
            content="The user wants to know the weather in San Francisco. I should use the get_weather tool to fetch the latest data."
        )
    )
    time.sleep(0.5)

    # 3. Log a tool call (the agent intending to call a tool)
    print("Logging tool call intent...")
    tracer.log_event(
        agent=agent_name,
        event_type="tool_call",
        data=ToolCall(
            tool_name="get_weather",
            arguments={"location": "San Francisco, CA", "unit": "fahrenheit"}
        )
    )
    
    # Simulate tool execution time
    time.sleep(1.0)

    # 4. Log a tool result (the output of the executed tool)
    print("Logging tool result...")
    tracer.log_event(
        agent=agent_name,
        event_type="tool_result",
        data=ToolResult(
            tool_name="get_weather",
            result={"temperature": 65, "conditions": "Sunny", "forecast": "Clear skies"},
            is_error=False
        )
    )
    time.sleep(0.5)

    # 5. Log final reasoning (synthesizing the final answer)
    print("Logging final reasoning step...")
    tracer.log_event(
        agent=agent_name,
        event_type="reasoning",
        data=Reasoning(
            content="The weather is 65°F and sunny. I will format this into a friendly response for the user."
        )
    )
    time.sleep(0.5)

    # 6. Log final state change
    print("Logging state change: processing_request -> idle")
    tracer.log_event(
        agent=agent_name,
        event_type="state_change",
        data=StateChange(
            before={"status": "processing_request"},
            after={"status": "idle"}
        )
    )

    # The background thread will automatically flush on exit due to atexit
    print("Waiting for remaining traces to be sent to the AgentTrace server...")
    time.sleep(1.0)
    print("Done! If the AgentTrace server is running, check the UI to see the execution flow.")

if __name__ == "__main__":
    main()