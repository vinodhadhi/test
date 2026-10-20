from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.bug import Bug, BugHistory, BugStatus
from app.models.user import User, UserRole


def transition_bug(db: Session, bug: Bug, actor: User, target: BugStatus, comment: str | None) -> Bug:
    source = bug.status
    allowed_targets = {
        BugStatus.OPEN: {BugStatus.IN_PROGRESS},
        BugStatus.REOPENED: {BugStatus.IN_PROGRESS},
        BugStatus.IN_PROGRESS: {BugStatus.FIXED},
        BugStatus.FIXED: {BugStatus.VERIFIED, BugStatus.REOPENED},
    }
    if target not in allowed_targets.get(source, set()):
        raise HTTPException(status_code=409, detail=f"Cannot transition from {source.value} to {target.value}")

    is_admin = actor.role == UserRole.ADMIN
    if target in {BugStatus.IN_PROGRESS, BugStatus.FIXED}:
        if not is_admin and not (actor.role == UserRole.DEVELOPER and bug.assigned_to == actor.id):
            raise HTTPException(status_code=403, detail="Only the assigned developer or an administrator can move this bug")
    else:
        if not is_admin and not (actor.role == UserRole.TESTER and bug.reported_by == actor.id):
            raise HTTPException(status_code=403, detail="Only the reporting tester or an administrator can retest this bug")
        if not comment or not comment.strip():
            raise HTTPException(status_code=422, detail="A comment is required when verifying or reopening a bug")

    bug.status = target
    if target == BugStatus.FIXED:
        bug.fixed_by = actor.id
    if target == BugStatus.VERIFIED:
        bug.verified_by = actor.id
    elif target == BugStatus.REOPENED:
        bug.verified_by = None
    db.add(BugHistory(bug=bug, user_id=actor.id, from_status=source, to_status=target, note=comment.strip() if comment else None))
    if comment and target in {BugStatus.VERIFIED, BugStatus.REOPENED}:
        from app.models.bug import BugComment

        db.add(BugComment(bug=bug, user_id=actor.id, body=comment.strip()))
    return bug
