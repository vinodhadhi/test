from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project, ProjectAssignmentHistory, ProjectMember
from app.models.user import User


def replace_project_members(db: Session, project: Project, users: list[User]) -> None:
    """Change membership and assignment history in the same transaction."""
    current = {member.user_id for member in project.members}
    requested = {user.id for user in users}
    now = datetime.now(UTC)
    for user_id in current - requested:
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
    project.members[:] = [member for member in project.members if member.user_id in requested]
    project.members.extend(ProjectMember(user=user) for user in users if user.id not in current)
