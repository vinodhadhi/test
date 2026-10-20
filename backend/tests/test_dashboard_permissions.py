from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import current_user, get_db
from app.core.database import Base
from app.main import app
from app.models.bug import Bug, BugSeverity, BugStatus, BugType
from app.models.project import Module, Project
from app.models.user import User, UserRole


class EmptySession:
    def execute(self, statement):
        class Result:
            def all(self): return []
        return Result()


def test_dashboard_summary_denies_regular_users():
    tester = User(id=1, user_id="tester", full_name="QA", role=UserRole.TESTER, password_hash="unused")
    app.dependency_overrides[current_user] = lambda: tester
    app.dependency_overrides[get_db] = lambda: EmptySession()
    try:
        with TestClient(app) as client:
            response = client.get("/dashboard/summary")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_dashboard_summary_allows_manager():
    manager = User(id=1, user_id="manager", full_name="Manager", role=UserRole.MANAGER, password_hash="unused")
    app.dependency_overrides[current_user] = lambda: manager
    app.dependency_overrides[get_db] = lambda: EmptySession()
    try:
        with TestClient(app) as client:
            response = client.get("/dashboard/summary")
        assert response.status_code == 200
        assert response.json()["total"] == 0
    finally:
        app.dependency_overrides.clear()


def test_dashboard_aggregates_project_module_and_team_progress():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    with session_factory() as db:
        admin = User(user_id="admin", full_name="Admin", role=UserRole.ADMIN, password_hash="unused")
        tester = User(user_id="tester", full_name="QA Tester", role=UserRole.TESTER, password_hash="unused")
        developer = User(user_id="developer", full_name="QA Developer", role=UserRole.DEVELOPER, password_hash="unused")
        db.add_all([admin, tester, developer])
        db.flush()
        project = Project(name="Sample", description=None, created_by=admin.id)
        db.add(project)
        db.flush()
        module = Module(project_id=project.id, name="Web")
        db.add(module)
        db.flush()
        db.add_all([
            Bug(bug_no=1, project_id=project.id, module_id=module.id, title="Verified bug", steps="Step", expected_result="Expected", actual_result="Actual", severity=BugSeverity.HIGH, priority="High", type=BugType.FRONTEND, status=BugStatus.VERIFIED, reported_by=tester.id, assigned_to=developer.id, fixed_by=developer.id, verified_by=tester.id),
            Bug(bug_no=2, project_id=project.id, module_id=module.id, title="Active bug", steps="Step", expected_result="Expected", actual_result="Actual", severity=BugSeverity.LOW, priority="Low", type=BugType.BACKEND, status=BugStatus.IN_PROGRESS, reported_by=tester.id, assigned_to=developer.id),
        ])
        db.commit()
        manager = User(id=admin.id, user_id="manager", full_name="Manager", role=UserRole.MANAGER, password_hash="unused")
        app.dependency_overrides[current_user] = lambda: manager
        app.dependency_overrides[get_db] = lambda: db
        try:
            with TestClient(app) as client:
                summary = client.get("/dashboard/summary")
                projects = client.get("/dashboard/by-project")
                modules = client.get("/dashboard/by-module")
                testers = client.get("/dashboard/testers")
                developers = client.get("/dashboard/developers")
            assert summary.json()["total"] == 2
            assert summary.json()["verified"] == 1
            assert projects.json()[0]["verified"] == 1
            assert modules.json()[0]["total"] == 2
            assert testers.json()[0]["total"] == 2
            assert developers.json()[0]["in_progress"] == 1
        finally:
            app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()
