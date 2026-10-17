from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class CommitmentCreate(BaseModel):
    title: str = Field(..., min_length=3)
    description: Optional[str] = ""
    deadline: Optional[str] = None
    tags: Optional[List[str]] = []

class TaskUpdate(BaseModel):
    status: str  # proposed, approved, in_progress, blocked, done
    blocker_reason: Optional[str] = None

class ActionProposal(BaseModel):
    commitment_id: str
    action_type: str
    title: str
    reasoning: str

class ActionApproval(BaseModel):
    action_id: str
    approved: bool

class FocusSessionRequest(BaseModel):
    duration_minutes: Optional[int] = 25
