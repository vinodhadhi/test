from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.api.deps import current_user, get_db, require_csrf
from app.api.chat import hub
from app.models.bug import Bug, BugComment, BugHistory, BugSeverity, BugStatus
from app.models.project import Module, Project, ProjectMember
from app.models.notification import Notification
from app.models.user import User, UserRole
from app.schemas.bugs import (
    AttachmentOut,
    BugCreate,
    BugOut,
    BugPage,
    BugPatch,
    CommentCreate,
    CommentOut,
    HistoryOut,
    TransitionRequest,
)
from app.services.bug_access import require_bug_access
from app.services.bug_workflow import transition_bug

router = APIRouter(prefix="/bugs", tags=["Bugs"])
def _bug_or_404(db: Session, bug_id: int, *, lock: bool = False) -> Bug:
    if lock and db.scalar(select(Bug.id).where(Bug.id == bug_id).with_for_update()) is None:
        raise HTTPException(status_code=404, detail="Bug not found")
    stmt = select(Bug).where(Bug.id == bug_id).options(
        joinedload(Bug.reporter), joinedload(Bug.assignee), joinedload(Bug.project), joinedload(Bug.module), selectinload(Bug.attachments)
    )
    bug = db.scalars(stmt).unique().one_or_none()
    if bug is None:
        raise HTTPException(status_code=404, detail="Bug not found")
    return bug


def _bug_out(db: Session, bug: Bug, *, include_thread: bool = False) -> BugOut:
    data = {
        "id": bug.id, "bug_no": bug.bug_no, "project_id": bug.project_id, "module_id": bug.module_id,
        "title": bug.title, "steps": bug.steps, "expected_result": bug.expected_result,
        "actual_result": bug.actual_result, "severity": bug.severity, "priority": bug.priority,
        "type": bug.type, "status": bug.status, "reported_by": bug.reported_by,
        "assigned_to": bug.assigned_to, "fixed_by": bug.fixed_by, "verified_by": bug.verified_by,
        "environment": bug.environment, "build_version": bug.build_version, "reference_url": bug.reference_url,
        "created_at": bug.created_at, "updated_at": bug.updated_at,
        "reporter_name": bug.reporter.full_name, "assignee_name": bug.assignee.full_name,
        "project_name": bug.project.name, "module_name": bug.module.name,
        "attachments": [AttachmentOut.model_validate(a, from_attributes=True) for a in bug.attachments],
    }
    if include_thread:
        comments = db.execute(select(BugComment, User.full_name).join(User, User.id == BugComment.user_id).where(BugComment.bug_id == bug.id).order_by(BugComment.created_at, BugComment.id)).all()
        history = db.execute(select(BugHistory, User.full_name).join(User, User.id == BugHistory.user_id).where(BugHistory.bug_id == bug.id).order_by(BugHistory.created_at, BugHistory.id)).all()
        data["comments"] = [CommentOut(id=c.id, bug_id=c.bug_id, user_id=c.user_id, body=c.body, created_at=c.created_at, user_name=name) for c, name in comments]
        data["history"] = [HistoryOut(id=h.id, user_id=h.user_id, from_status=h.from_status, to_status=h.to_status, note=h.note, created_at=h.created_at, user_name=name) for h, name in history]
    return BugOut.model_validate(data)


def _validate_project_assignment(db: Session, project_id: int, module_id: int, developer_id: int) -> None:
    module = db.get(Module, module_id)
    if module is None or module.project_id != project_id:
        raise HTTPException(status_code=422, detail="The selected module does not belong to this project")
    developer = db.get(User, developer_id)
    is_member = db.scalar(select(ProjectMember.project_id).where(ProjectMember.project_id == project_id, ProjectMember.user_id == developer_id))
    if developer is None or not developer.is_active or developer.role != UserRole.DEVELOPER or is_member is None:
        raise HTTPException(status_code=422, detail="Choose an active developer assigned to this project")


@router.post("", response_model=BugOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
def create_bug(payload: BugCreate, actor: User = Depends(current_user), db: Session = Depends(get_db)) -> BugOut:
    if actor.role not in {UserRole.TESTER, UserRole.ADMIN}:
        raise HTTPException(status_code=403, detail="Only testers can report bugs")
    project = db.scalar(select(Project).where(Project.id == payload.project_id).with_for_update())
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if actor.role == UserRole.TESTER:
        member = db.scalar(select(ProjectMember.project_id).where(ProjectMember.project_id == project.id, ProjectMember.user_id == actor.id))
        if member is None:
            raise HTTPException(status_code=403, detail="You are not assigned to this project")
    _validate_project_assignment(db, project.id, payload.module_id, payload.assigned_to)
    next_no = (db.scalar(select(func.max(Bug.bug_no)).where(Bug.project_id == project.id)) or 0) + 1
    bug = Bug(**payload.model_dump(), bug_no=next_no, reported_by=actor.id, status=BugStatus.OPEN)
    db.add(bug)
    db.flush()
    db.add(Notification(user_id=payload.assigned_to, kind="bug_assigned", title="New bug assigned", message=f"{actor.full_name} reported {project.name} #{next_no}: {bug.title}"[:500], link=f"/bugs/{bug.id}"))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Could not allocate a bug number; please retry") from exc
    return _bug_out(db, _bug_or_404(db, bug.id))


@router.get("", response_model=BugPage)
def list_bugs(
    project: int | None = None,
    module: int | None = None,
    status_filter: Annotated[BugStatus | None, Query(alias="status")] = None,
    severity: BugSeverity | None = None,
    assignee: int | None = None,
    reporter: int | None = None,
    scope: Literal["mine", "project"] = "mine",
    search: Annotated[str | None, Query(max_length=200)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> BugPage:
    base = select(Bug)
    if actor.role == UserRole.DEVELOPER:
        base = base.where(Bug.assigned_to == actor.id)
    elif actor.role == UserRole.TESTER:
        member_projects = select(ProjectMember.project_id).where(ProjectMember.user_id == actor.id)
        if scope == "mine":
            base = base.where(Bug.reported_by == actor.id)
        else:
            base = base.where(or_(Bug.project_id.in_(member_projects), Bug.reported_by == actor.id))
    if project is not None:
        base = base.where(Bug.project_id == project)
    if module is not None:
        base = base.where(Bug.module_id == module)
    if status_filter is not None:
        base = base.where(Bug.status == status_filter)
    if severity is not None:
        base = base.where(Bug.severity == severity)
    if assignee is not None:
        base = base.where(Bug.assigned_to == assignee)
    if reporter is not None:
        base = base.where(Bug.reported_by == reporter)
    if search:
        pattern = f"%{search.strip()}%"
        base = base.where(or_(Bug.title.ilike(pattern), Bug.steps.ilike(pattern), cast(Bug.bug_no, String).ilike(pattern)))
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    items = list(db.scalars(base.options(joinedload(Bug.reporter), joinedload(Bug.assignee), joinedload(Bug.project), joinedload(Bug.module), selectinload(Bug.attachments)).order_by(Bug.created_at.desc(), Bug.id.desc()).offset((page - 1) * page_size).limit(page_size)).unique())
    return BugPage(items=[_bug_out(db, bug) for bug in items], total=total, page=page, page_size=page_size)


@router.get("/{bug_id}", response_model=BugOut)
def get_bug(bug_id: int, actor: User = Depends(current_user), db: Session = Depends(get_db)) -> BugOut:
    bug = _bug_or_404(db, bug_id)
    require_bug_access(db, actor, bug)
    return _bug_out(db, bug, include_thread=True)


@router.patch("/{bug_id}", response_model=BugOut, dependencies=[Depends(require_csrf)])
def patch_bug(bug_id: int, payload: BugPatch, actor: User = Depends(current_user), db: Session = Depends(get_db)) -> BugOut:
    bug = _bug_or_404(db, bug_id, lock=True)
    require_bug_access(db, actor, bug)
    if actor.role != UserRole.ADMIN and not (actor.role == UserRole.TESTER and bug.reported_by == actor.id and bug.status in {BugStatus.OPEN, BugStatus.REOPENED}):
        raise HTTPException(status_code=403, detail="You cannot edit this bug")
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return _bug_out(db, bug)
    required_values = {"module_id", "title", "steps", "expected_result", "actual_result", "severity", "priority", "type", "assigned_to"}
    if any(key in changes and changes[key] is None for key in required_values):
        raise HTTPException(status_code=422, detail="Required bug fields cannot be cleared")
    if "module_id" in changes or "assigned_to" in changes:
        module_id = changes.get("module_id", bug.module_id)
        assigned_to = changes.get("assigned_to", bug.assigned_to)
        _validate_project_assignment(db, bug.project_id, module_id, assigned_to)
    previous_assignee = bug.assigned_to
    for key, value in changes.items():
        setattr(bug, key, value)
    if bug.assigned_to != previous_assignee:
        db.add(Notification(user_id=bug.assigned_to, kind="bug_assigned", title="Bug assigned to you", message=f"{actor.full_name} assigned you {bug.project.name} #{bug.bug_no}: {bug.title}"[:500], link=f"/bugs/{bug.id}"))
    db.commit()
    result = _bug_out(db, _bug_or_404(db, bug.id))
    hub.publish_from_rest(bug.id, {"type": "bug_updated"})
    return result


@router.post("/{bug_id}/transition", response_model=BugOut, dependencies=[Depends(require_csrf)])
def change_bug_status(bug_id: int, payload: TransitionRequest, actor: User = Depends(current_user), db: Session = Depends(get_db)) -> BugOut:
    bug = _bug_or_404(db, bug_id, lock=True)
    require_bug_access(db, actor, bug)
    transition_bug(db, bug, actor, payload.to_status, payload.comment)
    recipient = bug.reported_by if payload.to_status in {BugStatus.IN_PROGRESS, BugStatus.FIXED} else bug.assigned_to
    if recipient != actor.id:
        db.add(Notification(user_id=recipient, kind="bug_status", title=f"Bug {payload.to_status.value.lower()}", message=f"{actor.full_name} moved {bug.project.name} #{bug.bug_no} to {payload.to_status.value}: {bug.title}"[:500], link=f"/bugs/{bug.id}"))
    db.commit()
    result = _bug_out(db, _bug_or_404(db, bug.id), include_thread=True)
    hub.publish_from_rest(bug.id, {"type": "bug_updated"})
    if payload.comment and payload.to_status in {BugStatus.VERIFIED, BugStatus.REOPENED}:
        for comment in reversed(result.comments):
            if comment.user_id == actor.id and comment.body == payload.comment.strip():
                hub.publish_from_rest(bug.id, {"type": "comment", "comment": comment.model_dump(mode="json")})
                break
    return result


@router.post("/{bug_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
def add_comment(bug_id: int, payload: CommentCreate, actor: User = Depends(current_user), db: Session = Depends(get_db)) -> CommentOut:
    bug = _bug_or_404(db, bug_id)
    require_bug_access(db, actor, bug)
    if actor.role == UserRole.MANAGER:
        raise HTTPException(status_code=403, detail="Managers have read-only access")
    comment = BugComment(bug_id=bug.id, user_id=actor.id, body=payload.body)
    db.add(comment)
    for recipient in {bug.reported_by, bug.assigned_to} - {actor.id}:
        db.add(Notification(user_id=recipient, kind="bug_comment", title="New issue comment", message=f"{actor.full_name} commented on {bug.project.name} #{bug.bug_no}: {bug.title}"[:500], link=f"/bugs/{bug.id}"))
    db.commit()
    db.refresh(comment)
    result = CommentOut(id=comment.id, bug_id=comment.bug_id, user_id=comment.user_id, body=comment.body, created_at=comment.created_at, user_name=actor.full_name)
    hub.publish_from_rest(bug.id, {"type": "comment", "comment": result.model_dump(mode="json")})
    return result

