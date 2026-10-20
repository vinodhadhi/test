from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.api.deps import current_user, get_db
from app.models.bug import Bug, BugStatus
from app.models.project import Module, Project
from app.models.user import User, UserRole

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _require_dashboard_role(user: User) -> None:
    from fastapi import HTTPException

    if user.role not in {UserRole.ADMIN, UserRole.MANAGER}:
        raise HTTPException(status_code=403, detail="Dashboard access required")


@router.get("/summary")
def summary(user: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    _require_dashboard_role(user)
    counts = dict(db.execute(select(Bug.status, func.count(Bug.id)).group_by(Bug.status)).all())
    total = sum(counts.values())
    fixed = counts.get(BugStatus.FIXED, 0)
    verified = counts.get(BugStatus.VERIFIED, 0)
    return {
        "total": total,
        "open": counts.get(BugStatus.OPEN, 0) + counts.get(BugStatus.REOPENED, 0),
        "in_progress": counts.get(BugStatus.IN_PROGRESS, 0),
        "fixed": fixed,
        "verified": verified,
        "fix_rate_percent": round((fixed + verified) / total * 100, 1) if total else 0,
        "fix_target_percent": 95,
        "by_status": [{"status": status.value, "count": count} for status, count in counts.items()],
    }


@router.get("/by-project")
def by_project(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    _require_dashboard_role(user)
    rows = db.execute(select(Project.id, Project.name, func.count(Bug.id).label("total"), func.sum(case((Bug.status == BugStatus.VERIFIED, 1), else_=0)).label("verified"), func.sum(case((Bug.status == BugStatus.FIXED, 1), else_=0)).label("fixed")).outerjoin(Bug, Bug.project_id == Project.id).group_by(Project.id, Project.name).order_by(Project.name)).all()
    return [{"project_id": row.id, "project_name": row.name, "total": row.total, "verified": row.verified or 0, "fixed": row.fixed or 0} for row in rows]


@router.get("/by-module")
def by_module(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    _require_dashboard_role(user)
    rows = db.execute(select(Module.id, Module.name, Project.name.label("project_name"), func.count(Bug.id).label("total"), func.sum(case((Bug.status == BugStatus.VERIFIED, 1), else_=0)).label("verified")).join(Project, Project.id == Module.project_id).outerjoin(Bug, Bug.module_id == Module.id).group_by(Module.id, Module.name, Project.name).order_by(Project.name, Module.name)).all()
    return [{"module_id": row.id, "module_name": row.name, "project_name": row.project_name, "total": row.total, "verified": row.verified or 0} for row in rows]


def _people(user: User, db: Session, role: UserRole, assigned: bool) -> list[dict]:
    _require_dashboard_role(user)
    person_id = Bug.assigned_to if assigned else Bug.reported_by
    rows = db.execute(
        select(
            User.id,
            User.full_name,
            func.count(Bug.id).label("total"),
            func.sum(case((Bug.status == BugStatus.OPEN, 1), else_=0)).label("open"),
            func.sum(case((Bug.status == BugStatus.REOPENED, 1), else_=0)).label("reopened"),
            func.sum(case((Bug.status == BugStatus.IN_PROGRESS, 1), else_=0)).label("in_progress"),
            func.sum(case((Bug.status == BugStatus.FIXED, 1), else_=0)).label("fixed"),
            func.sum(case((Bug.status == BugStatus.VERIFIED, 1), else_=0)).label("verified"),
        )
        .outerjoin(Bug, person_id == User.id)
        .where(User.role == role)
        .group_by(User.id, User.full_name)
        .order_by(User.full_name)
    ).all()
    if assigned:
        return [
            {
                "user_id": row.id,
                "full_name": row.full_name,
                "assigned": row.total,
                "to_do": (row.open or 0) + (row.reopened or 0),
                "in_progress": row.in_progress or 0,
                "done": (row.fixed or 0) + (row.verified or 0),
            }
            for row in rows
        ]
    return [
        {
            "user_id": row.id,
            "full_name": row.full_name,
            "raised": row.total,
            "to_retest": row.fixed or 0,
            "verified": row.verified or 0,
            "reopened": row.reopened or 0,
        }
        for row in rows
    ]


@router.get("/testers")
def testers(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    return _people(user, db, UserRole.TESTER, False)


@router.get("/developers")
def developers(user: User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    return _people(user, db, UserRole.DEVELOPER, True)
