from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project, ProjectAssignmentHistory, ProjectMember
from app.models.notification import Notification
from app.models.bug import Bug, BugStatus
from app.models.user import User, UserRole


def replace_project_members(db: Session, project: Project, users: list[User]) -> None:
    """Change membership and assignment history in the same transaction."""
    current = {member.user_id for member in project.members}
    requested = {user.id for user in users}
    removed_developers = set(db.scalars(select(User.id).where(User.id.in_(current - requested), User.role == UserRole.DEVELOPER)))
    if removed_developers and db.scalar(select(Bug.id).where(Bug.project_id == project.id, Bug.assigned_to.in_(removed_developers), Bug.status != BugStatus.VERIFIED).limit(1)) is not None:
        raise HTTPException(status_code=409, detail="Reassign or verify the developer's unresolved bugs before removing them from this project")
    now = datetime.now(UTC)
    for user_id in current - requested:
        db.add(Notification(user_id=user_id, kind="project_removed", title="Project assignment ended", message=f"Your assignment to {project.name} has ended.", link="/my-dashboard"))
        interval = db.scalar(
            select(ProjectAssignmentHistory)
            .where(ProjectAssignmentHistory.project_id == project.id, ProjectAssignmentHistory.user_id == user_id, ProjectAssignmentHistory.removed_at.is_(None))
            .order_by(ProjectAssignmentHistory.id.desc())
            .limit(1)
        )
        if interval:
            interval.removed_at = now
    for user_id in requested - current:
        db.add(ProjectAssignmentHistory(project_id=project.id, user_id=user_id, assigned_at=now))
        db.add(Notification(user_id=user_id, kind="project_assigned", title="Assigned to a project", message=f"You were assigned to {project.name}.", link="/my-dashboard"))
    project.members[:] = [member for member in project.members if member.user_id in requested]
    project.members.extend(ProjectMember(user=user) for user in users if user.id not in current)
