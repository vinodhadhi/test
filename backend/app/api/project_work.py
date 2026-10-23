from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import current_user, get_db
from app.models.project import Module, Project, ProjectMember
from app.models.user import User, UserRole
from app.schemas.admin import ModuleOut, ProjectOut, UserOut

router = APIRouter(prefix="/my/projects", tags=["Projects"])


def _require_project_membership(db: Session, user: User, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if user.role == UserRole.ADMIN:
        return project
    membership = db.scalar(select(ProjectMember.project_id).where(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id))
    if membership is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("", response_model=list[ProjectOut])
def list_my_projects(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[Project]:
    if user.role == UserRole.ADMIN:
        return list(db.scalars(select(Project).order_by(Project.name)))
    if user.role not in {UserRole.TESTER, UserRole.DEVELOPER}:
        return []
    return list(db.scalars(select(Project).join(ProjectMember).where(ProjectMember.user_id == user.id).order_by(Project.name)))


@router.get("/{project_id}/modules", response_model=list[ModuleOut])
def list_project_modules(project_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[Module]:
    project = _require_project_membership(db, user, project_id)
    return list(db.scalars(select(Module).where(Module.project_id == project.id).order_by(Module.name)))


@router.get("/{project_id}/developers", response_model=list[UserOut])
def list_project_developers(project_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[User]:
    project = _require_project_membership(db, user, project_id)
    return list(db.scalars(select(User).join(ProjectMember).where(ProjectMember.project_id == project.id, User.role == UserRole.DEVELOPER, User.is_active.is_(True)).order_by(User.full_name)))


@router.get("/{project_id}/testers", response_model=list[UserOut])
def list_project_testers(project_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[User]:
    project = _require_project_membership(db, user, project_id)
    return list(db.scalars(select(User).join(ProjectMember).where(ProjectMember.project_id == project.id, User.role == UserRole.TESTER, User.is_active.is_(True)).order_by(User.full_name)))
