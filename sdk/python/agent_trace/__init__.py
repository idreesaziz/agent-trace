import requests
import time
import logging

logger = logging.getLogger(__name__)

class Tracer:
    def __init__(self, project_name: str, endpoint: str = "http://localhost:3000/api/trace"):
        self.project_name = project_name
        self.endpoint = endpoint

    def log_event(self, agent: str, event_type: str, data: dict):
        """
        Logs an event to the local AgentTrace server.
        :param agent: Name or identifier of the agent.
        :param event_type: Type of the event (e.g., 'thought', 'tool_call', 'tool_result', 'message').
        :param data: Dictionary containing arbitrary contextual data.
        """
        payload = {
            "project_name": self.project_name,
            "agent": agent,
            "event_type": event_type,
            "data": data,
            "timestamp": time.time()
        }
        try:
            response = requests.post(self.endpoint, json=payload, timeout=2.0)
            response.raise_for_status()
        except requests.exceptions.RequestException as e:
            logger.warning(f"AgentTrace warning: Could not send trace to {self.endpoint}. {e}")
