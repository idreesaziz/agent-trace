import atexit
import logging
import queue
import threading
import time
import requests
from dataclasses import dataclass, asdict
from typing import Any, Dict, Union

logger = logging.getLogger(__name__)

@dataclass
class Reasoning:
    content: str

@dataclass
class ToolCall:
    tool_name: str
    arguments: Dict[str, Any]

@dataclass
class ToolResult:
    tool_name: str
    result: Any
    is_error: bool = False

@dataclass
class StateChange:
    before: Dict[str, Any]
    after: Dict[str, Any]

EventData = Union[Reasoning, ToolCall, ToolResult, StateChange, Dict[str, Any]]

class Tracer:
    def __init__(self, project_name: str, endpoint: str = "http://localhost:3000/api/trace"):
        self.project_name = project_name
        self.endpoint = endpoint
        
        self._queue = queue.Queue()
        self._stop_event = threading.Event()
        self._thread = threading.Thread(target=self._worker, daemon=True)
        self._thread.start()
        
        atexit.register(self.flush)

    def _worker(self):
        while not self._stop_event.is_set() or not self._queue.empty():
            try:
                payload = self._queue.get(timeout=0.1)
                try:
                    response = requests.post(self.endpoint, json=payload, timeout=2.0)
                    response.raise_for_status()
                except requests.exceptions.RequestException as e:
                    logger.warning(f"AgentTrace warning: Could not send trace to {self.endpoint}. {e}")
                except Exception as e:
                    logger.warning(f"AgentTrace warning: Unexpected error while sending trace. {e}")
                finally:
                    self._queue.task_done()
            except queue.Empty:
                continue

    def log_event(self, agent: str, event_type: str, data: EventData):
        """
        Logs an event to the local AgentTrace server.
        :param agent: Name or identifier of the agent.
        :param event_type: Type of the event (e.g., 'thought', 'tool_call', 'tool_result', 'state_change').
        :param data: Dataclass or dictionary containing contextual data.
        """
        if hasattr(data, "__dataclass_fields__"):
            parsed_data = asdict(data)
        else:
            parsed_data = data

        payload = {
            "project_name": self.project_name,
            "agent": agent,
            "event_type": event_type,
            "data": parsed_data,
            "timestamp": time.time()
        }
        self._queue.put(payload)

    def flush(self):
        """
        Signals the background worker to stop and waits for all pending traces to be sent.
        """
        self._stop_event.set()
        if self._thread.is_alive():
            self._thread.join(timeout=2.0)