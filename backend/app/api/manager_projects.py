from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from pydantic import BaseModel

from app.api.deps import current_user, get_db, require_csrf
from app.core.security import hash_password
from app.models.project import Module, Project, ProjectMember
from app.models.project import ProjectAssignmentHistory
from app.models.bug import Bug, BugStatus
from app.models.user import User, UserRole
from app.services.project_assignments import replace_project_members as update_project_membership
from app.schemas.admin import (
    ModuleCreate,
    ModuleOut,
    ProjectCreate,
    ProjectMembersUpdate,
    ProjectOut,
    ProjectUpdate,
    UserCreate,
    UserOut,
)

router = APIRouter(prefix="/manager", tags=["Manager project management"])


class WorkloadProject(BaseModel):
    id: int
    name: str


class TeamWorkload(BaseModel):
    user_id: int
    full_name: str
    role: UserRole
    current_projects: list[WorkloadProject]
    past_projects: list[WorkloadProject]
    other_project_work: list[WorkloadProject]
    active_issues: int
    to_retest: int
    total_issues: int


def _manager(user: User = Depends(current_user)) -> User:
    if user.role != UserRole.MANAGER:
        raise HTTPException(status_code=403, detail="Manager access required")
    return user


def _commit_or_conflict(db: Session, detail: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=detail) from exc


@router.get("/users", response_model=list[UserOut])
def assignable_users(_manager: User = Depends(_manager), db: Session = Depends(get_db)) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .where(
                User.is_active.is_(True),
                User.role.in_([UserRole.TESTER, UserRole.DEVELOPER]),
            )
            .order_by(User.role, User.full_name, User.id)
        )
    )


@router.get("/team/workload", response_model=list[TeamWorkload])
def team_workload(_manager: User = Depends(_manager), db: Session = Depends(get_db)) -> list[TeamWorkload]:
    users = list(db.scalars(select(User).where(User.is_active.is_(True), User.role.in_([UserRole.TESTER, UserRole.DEVELOPER])).order_by(User.role, User.full_name, User.id)))
    users_by_id = {user.id: user for user in users}
    projects = {project.id: project.name for project in db.scalars(select(Project))}
    current: dict[int, set[int]] = {user.id: set() for user in users}
    past: dict[int, set[int]] = {user.id: set() for user in users}
    worked: dict[int, set[int]] = {user.id: set() for user in users}
    counts: dict[int, dict[str, int]] = {user.id: {"active": 0, "retest": 0, "total": 0} for user in users}
    for user_id, project_id in db.execute(select(ProjectMember.user_id, ProjectMember.project_id)):
        if user_id in current:
            current[user_id].add(project_id)
    for user_id, project_id in db.execute(select(ProjectAssignmentHistory.user_id, ProjectAssignmentHistory.project_id).where(ProjectAssignmentHistory.removed_at.is_not(None)).distinct()):
        if user_id in past:
            past[user_id].add(project_id)
    for assignee, reporter, project_id, status, count in db.execute(select(Bug.assigned_to, Bug.reported_by, Bug.project_id, Bug.status, func.count()).group_by(Bug.assigned_to, Bug.reported_by, Bug.project_id, Bug.status)):
        for user_id, role in ((assignee, UserRole.DEVELOPER), (reporter, UserRole.TESTER)):
            if user_id not in counts:
                continue
            user = users_by_id.get(user_id)
            if user is None or user.role != role:
                continue
            worked[user_id].add(project_id)
            counts[user_id]["total"] += count
            if role == UserRole.DEVELOPER and status not in {BugStatus.FIXED, BugStatus.VERIFIED}:
                counts[user_id]["active"] += count
            elif role == UserRole.TESTER:
                if status == BugStatus.FIXED:
                    counts[user_id]["retest"] += count
                elif status in {BugStatus.OPEN, BugStatus.REOPENED}:
                    counts[user_id]["active"] += count
    def project_list(ids: set[int]) -> list[WorkloadProject]:
        return [WorkloadProject(id=project_id, name=projects[project_id]) for project_id in sorted(ids, key=lambda item: projects.get(item, "")) if project_id in projects]
    return [TeamWorkload(
        user_id=user.id, full_name=user.full_name, role=user.role,
        current_projects=project_list(current[user.id]),
        past_projects=project_list(past[user.id] - current[user.id]),
        other_project_work=project_list(worked[user.id] - current[user.id] - past[user.id]),
        active_issues=counts[user.id]["active"], to_retest=counts[user.id]["retest"], total_issues=counts[user.id]["total"],
    ) for user in users]


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
def create_team_user(payload: UserCreate, _manager: User = Depends(_manager), db: Session = Depends(get_db)) -> User:
    if payload.role not in {UserRole.TESTER, UserRole.DEVELOPER}:
        raise HTTPException(status_code=422, detail="Managers can create Tester or Developer accounts only")
    user = User(
        user_id=payload.user_id,
        full_name=payload.full_name,
        role=payload.role,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    _commit_or_conflict(db, "A user with this user ID already exists")
    db.refresh(user)
    return user


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(_manager: User = Depends(_manager), db: Session = Depends(get_db)) -> list[Project]:
    return list(db.scalars(select(Project).order_by(Project.name, Project.id)))


@router.post("/projects", response_model=ProjectOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
def create_project(payload: ProjectCreate, manager: User = Depends(_manager), db: Session = Depends(get_db)) -> Project:
    project = Project(name=payload.name, description=payload.description, created_by=manager.id)
    db.add(project)
    _commit_or_conflict(db, "A project with this name already exists")
    db.refresh(project)
    return project


@router.patch("/projects/{project_id}", response_model=ProjectOut, dependencies=[Depends(require_csrf)])
def update_project(project_id: int, payload: ProjectUpdate, _manager: User = Depends(_manager), db: Session = Depends(get_db)) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if "name" in payload.model_fields_set and payload.name is None:
        raise HTTPException(status_code=422, detail="Project name cannot be cleared")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    _commit_or_conflict(db, "A project with this name already exists")
    db.refresh(project)
    return project


@router.get("/projects/{project_id}/modules", response_model=list[ModuleOut])
def list_modules(project_id: int, _manager: User = Depends(_manager), db: Session = Depends(get_db)) -> list[Module]:
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return list(db.scalars(select(Module).where(Module.project_id == project_id).order_by(Module.name, Module.id)))


@router.post("/projects/{project_id}/modules", response_model=ModuleOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
def create_module(project_id: int, payload: ModuleCreate, _manager: User = Depends(_manager), db: Session = Depends(get_db)) -> Module:
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    module = Module(project_id=project_id, name=payload.name)
    db.add(module)
    _commit_or_conflict(db, "A module with this name already exists in the project")
    db.refresh(module)
    return module


@router.delete("/projects/{project_id}/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)])
def delete_module(project_id: int, module_id: int, _manager: User = Depends(_manager), db: Session = Depends(get_db)) -> Response:
    module = db.scalar(select(Module).where(Module.id == module_id, Module.project_id == project_id))
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found")
    db.delete(module)
    _commit_or_conflict(db, "Module cannot be removed while bugs refer to it")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/projects/{project_id}/members", response_model=list[UserOut])
def list_members(project_id: int, _manager: User = Depends(_manager), db: Session = Depends(get_db)) -> list[User]:
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return list(
        db.scalars(
            select(User)
            .join(ProjectMember)
            .where(ProjectMember.project_id == project_id)
            .order_by(User.role, User.full_name)
        )
    )


@router.put("/projects/{project_id}/members", response_model=list[UserOut], dependencies=[Depends(require_csrf)])
def replace_members(project_id: int, payload: ProjectMembersUpdate, _manager: User = Depends(_manager), db: Session = Depends(get_db)) -> list[User]:
    project = db.scalar(select(Project).options(selectinload(Project.members)).where(Project.id == project_id).with_for_update())
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    user_ids = set(payload.user_ids)
    users = list(db.scalars(select(User).where(User.id.in_(user_ids)))) if user_ids else []
    if len(users) != len(user_ids):
        raise HTTPException(status_code=422, detail="One or more user IDs do not exist")
    if any(not user.is_active or user.role not in {UserRole.TESTER, UserRole.DEVELOPER} for user in users):
        raise HTTPException(status_code=422, detail="Only active testers and developers can be assigned to a project")
    update_project_membership(db, project, users)
    db.commit()
    return users
