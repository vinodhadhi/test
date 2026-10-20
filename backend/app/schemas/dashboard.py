from datetime import datetime

from pydantic import BaseModel

from app.models.bug import BugSeverity, BugStatus
from app.models.user import UserRole


class PersonalIssueOut(BaseModel):
    id: int
    bug_no: int
    project_id: int
    project_name: str
    title: str
    status: BugStatus
    severity: BugSeverity
    updated_at: datetime


class PersonalDashboardOut(BaseModel):
    role: UserRole
    assigned_projects: int
    total: int
    open: int
    reopened: int
    in_progress: int
    fixed: int
    verified: int
    recent: list[PersonalIssueOut]
