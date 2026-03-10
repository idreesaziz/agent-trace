import time
import uuid
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Any, Dict, List, Optional, Union

class EventType(str, Enum):
    REASONING = "reasoning"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    STATE_CHANGE = "state_change"
    MESSAGE = "message"
    ERROR = "error"

@dataclass
class ReasoningData:
    """Schema for reasoning or thought steps taken by the agent."""
    content: str
    prompt: Optional[str] = None
    model: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}

@dataclass
class ToolCallData:
    """Schema for a tool call execution intent."""
    tool_name: str
    arguments: Dict[str, Any]
    tool_call_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}

@dataclass
class ToolResultData:
    """Schema for the result of a tool execution."""
    tool_name: str
    result: Any
    tool_call_id: Optional[str] = None
    is_error: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

@dataclass
class StateChangeData:
    """Schema for internal agent state transitions."""
    keys_changed: List[str]
    old_state: Dict[str, Any]
    new_state: Dict[str, Any]
    reason: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}

@dataclass
class AgentEvent:
    """Standardized event envelope to be ingested by the AgentTrace server."""
    project_name: str
    agent: str
    event_type: Union[EventType, str]
    data: Dict[str, Any]
    timestamp: float = field(default_factory=time.time)
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    run_id: Optional[str] = None
    parent_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "project_name": self.project_name,
            "agent": self.agent,
            "event_type": self.event_type.value if isinstance(self.event_type, EventType) else self.event_type,
            "data": self.data,
            "timestamp": self.timestamp,
            "event_id": self.event_id,
            "run_id": self.run_id,
            "parent_id": self.parent_id
        }