from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.models.user import UserRole

UserId = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]
PersonName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
ProjectName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
ModuleName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class UserCreate(BaseModel):
    user_id: UserId
    full_name: PersonName
    role: UserRole
    password: Annotated[str, Field(min_length=4, max_length=128)]


class UserUpdate(BaseModel):
    user_id: UserId | None = None
    full_name: PersonName | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class PasswordReset(BaseModel):
    new_password: Annotated[str, Field(min_length=4, max_length=128)]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: str
    full_name: str
    role: UserRole
    is_active: bool


class ProjectCreate(BaseModel):
    name: ProjectName
    description: Annotated[str | None, Field(max_length=5000)] = None


class ProjectUpdate(BaseModel):
    name: ProjectName | None = None
    description: Annotated[str | None, Field(max_length=5000)] = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    created_by: int
    lifecycle_stage: str = "Planning"
    start_date: date | None = None
    target_date: date | None = None
    health_note: str | None = None


ProjectStage = Literal["Planning", "In progress", "Testing", "Ready for release", "Released", "On hold"]


class ProjectLifecycleUpdate(BaseModel):
    lifecycle_stage: ProjectStage
    start_date: date | None = None
    target_date: date | None = None
    health_note: Annotated[str | None, Field(max_length=2000)] = None


class ModuleCreate(BaseModel):
    name: ModuleName


class ModuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    name: str


class ProjectMembersUpdate(BaseModel):
    user_ids: list[int] = Field(max_length=500)

