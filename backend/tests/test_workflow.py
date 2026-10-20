import pytest
from fastapi import HTTPException

from app.models.bug import Bug, BugStatus
from app.models.user import User, UserRole
from app.services.bug_workflow import transition_bug


def people() -> tuple[User, User, User]:
    tester = User(id=1, user_id="tester", full_name="Test Tester", role=UserRole.TESTER, password_hash="unused")
    developer = User(id=2, user_id="developer", full_name="Dev Person", role=UserRole.DEVELOPER, password_hash="unused")
    other = User(id=3, user_id="other", full_name="Other Tester", role=UserRole.TESTER, password_hash="unused")
    return tester, developer, other


def bug(tester: User, developer: User) -> Bug:
    return Bug(id=1, bug_no=1, project_id=1, module_id=1, title="Example bug", steps="Steps", expected_result="Expected", actual_result="Actual", severity="High", priority="High", type="Frontend", status=BugStatus.OPEN, reported_by=tester.id, assigned_to=developer.id)


class SessionRecorder:
    def __init__(self): self.rows = []
    def add(self, row): self.rows.append(row)


def test_assigned_developer_transitions_open_to_fixed_and_records_history():
    tester, developer, _ = people()
    item = bug(tester, developer)
    db = SessionRecorder()
    transition_bug(db, item, developer, BugStatus.IN_PROGRESS, None)
    transition_bug(db, item, developer, BugStatus.FIXED, None)
    assert item.status == BugStatus.FIXED
    assert item.fixed_by == developer.id
    assert [(row.from_status, row.to_status) for row in db.rows] == [(BugStatus.OPEN, BugStatus.IN_PROGRESS), (BugStatus.IN_PROGRESS, BugStatus.FIXED)]


def test_unassigned_developer_cannot_start_work():
    tester, developer, other = people()
    with pytest.raises(HTTPException) as error:
        transition_bug(SessionRecorder(), bug(tester, developer), other, BugStatus.IN_PROGRESS, None)
    assert error.value.status_code == 403


def test_reporting_tester_must_comment_when_reopening_fixed_bug():
    tester, developer, _ = people()
    item = bug(tester, developer)
    item.status = BugStatus.FIXED
    with pytest.raises(HTTPException) as error:
        transition_bug(SessionRecorder(), item, tester, BugStatus.REOPENED, "  ")
    assert error.value.status_code == 422
    assert item.status == BugStatus.FIXED


def test_invalid_status_transition_is_rejected():
    tester, developer, _ = people()
    with pytest.raises(HTTPException) as error:
        transition_bug(SessionRecorder(), bug(tester, developer), tester, BugStatus.VERIFIED, "Looks good")
    assert error.value.status_code == 409
