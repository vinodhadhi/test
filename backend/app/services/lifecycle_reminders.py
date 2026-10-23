from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.notification import Notification
from app.models.project import Project, ProjectMember
from app.models.user import User

PROJECT_TIMEZONE = ZoneInfo("Asia/Kolkata")
REMINDER_KIND = "project_deadline"


def deliver_daily_deadline_reminders(now: datetime | None = None) -> int:
    """Create one in-app deadline reminder per project recipient and local day."""
    local_now = (now or datetime.now(UTC)).astimezone(PROJECT_TIMEZONE)
    if local_now.time().replace(tzinfo=None) < time(9, 0):
        return 0
    today = local_now.date()
    day_start = datetime.combine(today, time.min, tzinfo=PROJECT_TIMEZONE).astimezone(UTC)
    day_end = datetime.combine(date.fromordinal(today.toordinal() + 1), time.min, tzinfo=PROJECT_TIMEZONE).astimezone(UTC)
    created = 0
    with SessionLocal() as db:
        projects = list(db.scalars(select(Project).where(Project.target_date.is_not(None), Project.lifecycle_stage != "Released")))
        for project in projects:
            recipients = set(db.scalars(select(ProjectMember.user_id).where(ProjectMember.project_id == project.id)))
            recipients.add(project.created_by)
            due_text = f"{project.target_date.strftime('%B')} {project.target_date.day}, {project.target_date.year}"
            days = (project.target_date - today).days
            if days < 0:
                status = f"The deadline passed {abs(days)} day{'s' if abs(days) != 1 else ''} ago."
            elif days == 0:
                status = "The deadline is today."
            else:
                status = f"The deadline is in {days} day{'s' if days != 1 else ''}."
            for user_id in recipients:
                recipient = db.get(User, user_id)
                if recipient is None or not recipient.is_active:
                    continue
                link = {
                    "Manager": "/project-management",
                    "Admin": "/admin/projects",
                    "Tester": "/my-dashboard",
                    "Developer": "/my-dashboard",
                }.get(recipient.role.value, "/")
                already_sent = db.scalar(select(Notification.id).where(
                    Notification.user_id == user_id,
                    Notification.kind == REMINDER_KIND,
                    Notification.link == link,
                    Notification.created_at >= day_start,
                    Notification.created_at < day_end,
                ).limit(1))
                if already_sent:
                    continue
                db.add(Notification(
                    user_id=user_id,
                    kind=REMINDER_KIND,
                    title=f"{project.name} deadline reminder",
                    message=f"Target date: {due_text}. {status}",
                    link=link,
                ))
                created += 1
        if created:
            db.commit()
    return created
