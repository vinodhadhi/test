from fastapi import HTTPException
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.models.bug import Bug
from app.models.project import ProjectMember
from app.models.user import User, UserRole


def can_view_bug(db: Session, user: User, bug: Bug) -> bool:
    if user.role in {UserRole.ADMIN, UserRole.MANAGER}:
        return True
    if user.role == UserRole.DEVELOPER:
        return bug.assigned_to == user.id
    if user.role == UserRole.TESTER and bug.reported_by == user.id:
        return True
    return db.scalar(select(exists().where(ProjectMember.project_id == bug.project_id, ProjectMember.user_id == user.id))) is True


def require_bug_access(db: Session, user: User, bug: Bug) -> None:
    if not can_view_bug(db, user, bug):
        raise HTTPException(status_code=404, detail="Bug not found")
