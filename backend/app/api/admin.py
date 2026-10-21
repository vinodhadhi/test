from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_db, require_admin, require_csrf
from app.core.security import hash_password
from app.models.project import Module, Project, ProjectMember
from app.models.bug import Bug, BugStatus
from app.models.user import User, UserRole
from app.services.project_assignments import replace_project_members as update_project_membership
from app.schemas.admin import (
    ModuleCreate,
    ModuleOut,
    PasswordReset,
    ProjectCreate,
    ProjectMembersUpdate,
    ProjectOut,
    ProjectUpdate,
    UserCreate,
    UserOut,
    UserUpdate,
)

router = APIRouter(tags=["Administration"], dependencies=[Depends(require_admin), Depends(require_csrf)])
AdminUser = Annotated[User, Depends(require_admin)]


def _save_or_conflict(db: Session, detail: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=detail) from exc


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)) -> list[User]:
    return list(db.scalars(select(User).order_by(User.full_name, User.id)))


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    user = User(user_id=payload.user_id, full_name=payload.full_name, role=payload.role, password_hash=hash_password(payload.password))
    db.add(user)
    _save_or_conflict(db, "A user with this user ID already exists")
    db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, actor: AdminUser, db: Session = Depends(get_db)) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    changes = payload.model_dump(exclude_unset=True)
    if user.id == actor.id and (changes.get("role", user.role) != UserRole.ADMIN or changes.get("is_active", user.is_active) is False):
        raise HTTPException(status_code=400, detail="You cannot remove your own administrator access")
    removes_admin = user.role == UserRole.ADMIN and user.is_active and (
        changes.get("role", user.role) != UserRole.ADMIN or changes.get("is_active", user.is_active) is False
    )
    if removes_admin:
        other_admins = db.scalar(select(User.id).where(User.role == UserRole.ADMIN, User.is_active.is_(True), User.id != user.id).limit(1))
        if other_admins is None:
            raise HTTPException(status_code=400, detail="At least one active administrator must remain")
    if user.role == UserRole.DEVELOPER and (changes.get("role", user.role) != UserRole.DEVELOPER or changes.get("is_active", user.is_active) is False):
        active_bug = db.scalar(select(Bug.id).where(Bug.assigned_to == user.id, Bug.status != BugStatus.VERIFIED).limit(1))
        if active_bug is not None:
            raise HTTPException(status_code=409, detail="Reassign or verify this developer's unresolved bugs before changing their role or deactivating the account")
    for key, value in changes.items():
        setattr(user, key, value)
    _save_or_conflict(db, "A user with this user ID already exists")
    db.refresh(user)
    return user


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(user_id: int, payload: PasswordReset, db: Session = Depends(get_db)) -> Response:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(payload.new_password)
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)) -> list[Project]:
    return list(db.scalars(select(Project).order_by(Project.name, Project.id)))


@router.post("/projects", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, actor: AdminUser, db: Session = Depends(get_db)) -> Project:
    project = Project(name=payload.name, description=payload.description, created_by=actor.id)
    db.add(project)
    _save_or_conflict(db, "A project with this name already exists")
    db.refresh(project)
    return project


@router.patch("/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, payload: ProjectUpdate, db: Session = Depends(get_db)) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    _save_or_conflict(db, "A project with this name already exists")
    db.refresh(project)
    return project


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: int, db: Session = Depends(get_db)) -> Response:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    db.delete(project)
    _save_or_conflict(db, "Project cannot be deleted while it contains bugs")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/projects/{project_id}/modules", response_model=list[ModuleOut])
def list_modules(project_id: int, db: Session = Depends(get_db)) -> list[Module]:
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return list(db.scalars(select(Module).where(Module.project_id == project_id).order_by(Module.name, Module.id)))


@router.post("/projects/{project_id}/modules", response_model=ModuleOut, status_code=status.HTTP_201_CREATED)
def create_module(project_id: int, payload: ModuleCreate, db: Session = Depends(get_db)) -> Module:
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    module = Module(project_id=project_id, name=payload.name)
    db.add(module)
    _save_or_conflict(db, "A module with this name already exists in the project")
    db.refresh(module)
    return module


@router.delete("/projects/{project_id}/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_module(project_id: int, module_id: int, db: Session = Depends(get_db)) -> Response:
    module = db.scalar(select(Module).where(Module.id == module_id, Module.project_id == project_id))
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found")
    db.delete(module)
    _save_or_conflict(db, "Module cannot be removed while bugs refer to it")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/projects/{project_id}/members", response_model=list[UserOut])
def replace_project_members(project_id: int, payload: ProjectMembersUpdate, db: Session = Depends(get_db)) -> list[User]:
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


@router.get("/projects/{project_id}/members", response_model=list[UserOut])
def list_project_members(project_id: int, db: Session = Depends(get_db)) -> list[User]:
    if db.get(Project, project_id) is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return list(db.scalars(select(User).join(ProjectMember).where(ProjectMember.project_id == project_id).order_by(User.full_name)))
