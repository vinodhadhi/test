from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, StringConstraints, TypeAdapter, field_validator

from app.models.bug import AttachmentKind, BugSeverity, BugStatus, BugType

BugText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


def validate_reference_url(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    normalized = str(TypeAdapter(HttpUrl).validate_python(value.strip()))
    if len(normalized) > 2048:
        raise ValueError("Reference URL must be 2048 characters or fewer")
    return normalized


class BugCreate(BaseModel):
    project_id: int
    module_id: int
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=300)]
    steps: BugText
    expected_result: BugText
    actual_result: BugText
    severity: BugSeverity
    priority: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)] = "Medium"
    type: BugType
    assigned_to: int
    environment: Annotated[str | None, StringConstraints(max_length=300)] = None
    build_version: Annotated[str | None, StringConstraints(max_length=100)] = None
    reference_url: str | None = None

    _reference_url = field_validator("reference_url")(validate_reference_url)


class BugPatch(BaseModel):
    module_id: int | None = None
    title: Annotated[str | None, StringConstraints(strip_whitespace=True, min_length=3, max_length=300)] = None
    steps: BugText | None = None
    expected_result: BugText | None = None
    actual_result: BugText | None = None
    severity: BugSeverity | None = None
    priority: Annotated[str | None, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)] = None
    type: BugType | None = None
    assigned_to: int | None = None
    environment: Annotated[str | None, StringConstraints(max_length=300)] = None
    build_version: Annotated[str | None, StringConstraints(max_length=100)] = None
    reference_url: str | None = None

    _reference_url = field_validator("reference_url")(validate_reference_url)


class TransitionRequest(BaseModel):
    to_status: BugStatus
    comment: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=10000)] = None


class CommentCreate(BaseModel):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=10000)]


class CommentOut(BaseModel):
    id: int
    bug_id: int
    user_id: int
    body: str
    created_at: datetime
    user_name: str


class HistoryOut(BaseModel):
    id: int
    user_id: int
    from_status: BugStatus
    to_status: BugStatus
    note: str | None
    created_at: datetime
    user_name: str


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: AttachmentKind
    file_name: str
    mime_type: str
    size_bytes: int
    duration_seconds: int | None
    created_at: datetime


class BugOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    bug_no: int
    project_id: int
    module_id: int
    title: str
    steps: str
    expected_result: str
    actual_result: str
    severity: BugSeverity
    priority: str
    type: BugType
    status: BugStatus
    reported_by: int
    assigned_to: int
    fixed_by: int | None
    verified_by: int | None
    environment: str | None
    build_version: str | None
    reference_url: str | None
    created_at: datetime
    updated_at: datetime
    reporter_name: str
    assignee_name: str
    project_name: str
    module_name: str
    comments: list[CommentOut] = Field(default_factory=list)
    history: list[HistoryOut] = Field(default_factory=list)
    attachments: list[AttachmentOut] = Field(default_factory=list)


class BugPage(BaseModel):
    items: list[BugOut]
    total: int
    page: int
    page_size: int
