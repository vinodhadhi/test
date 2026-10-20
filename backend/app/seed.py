"""Create a deterministic demo workspace. Run with SEED_PASSWORD set."""
import os

from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.bug import Bug, BugHistory, BugSeverity, BugStatus, BugType
from app.models.project import Module, Project, ProjectMember
from app.models.user import User, UserRole

PEOPLE = [
    ("admin", "Alex Morgan", UserRole.ADMIN),
    ("manager", "Jordan Lee", UserRole.MANAGER),
    ("tester1", "Priya Shah", UserRole.TESTER),
    ("tester2", "Sam Rivera", UserRole.TESTER),
    ("dev1", "Taylor Kim", UserRole.DEVELOPER),
    ("dev2", "Morgan Chen", UserRole.DEVELOPER),
]
SAMPLES = [
    ("Dashboard cards show stale values", "Dashboard", BugSeverity.HIGH, BugStatus.OPEN, BugType.FRONTEND),
    ("Export truncates long project names", "Reports", BugSeverity.MEDIUM, BugStatus.IN_PROGRESS, BugType.FRONTEND),
    ("Login accepts expired session cookie", "Authentication", BugSeverity.CRITICAL, BugStatus.FIXED, BugType.BACKEND),
    ("Module filter returns unrelated records", "Bug Tracker", BugSeverity.HIGH, BugStatus.VERIFIED, BugType.BACKEND),
    ("Attachment preview is clipped on mobile", "Bug Tracker", BugSeverity.LOW, BugStatus.REOPENED, BugType.FRONTEND),
    ("Search misses bug numbers with leading zeros", "Bug Tracker", BugSeverity.MEDIUM, BugStatus.OPEN, BugType.BACKEND),
    ("Status history has inconsistent timestamps", "Reports", BugSeverity.MEDIUM, BugStatus.IN_PROGRESS, BugType.BACKEND),
    ("Recorder control remains active after upload", "Bug Tracker", BugSeverity.LOW, BugStatus.FIXED, BugType.FRONTEND),
    ("Dashboard shows zero for empty projects", "Dashboard", BugSeverity.LOW, BugStatus.VERIFIED, BugType.BACKEND),
    ("Keyboard focus is lost in user editor", "Authentication", BugSeverity.MEDIUM, BugStatus.OPEN, BugType.FRONTEND),
]


def main() -> None:
    password = os.environ.get("SEED_PASSWORD", "")
    if not password:
        raise SystemExit("Set SEED_PASSWORD before seeding.")
    with SessionLocal() as db:
        people: dict[str, User] = {}
        for user_id, full_name, role in PEOPLE:
            person = db.scalar(select(User).where(User.user_id == user_id))
            if person is None:
                person = User(user_id=user_id, full_name=full_name, role=role, password_hash=hash_password(password))
                db.add(person)
                db.flush()
            people[user_id] = person
        project = db.scalar(select(Project).where(Project.name == "Admin Portal"))
        if project is None:
            project = Project(name="Admin Portal", description="Sample project for exploring QA Desk workflows.", created_by=people["admin"].id)
            db.add(project)
            db.flush()
        modules = {}
        for name in ("Dashboard", "Bug Tracker", "Authentication", "Reports"):
            module = db.scalar(select(Module).where(Module.project_id == project.id, Module.name == name))
            if module is None:
                module = Module(project_id=project.id, name=name)
                db.add(module)
                db.flush()
            modules[name] = module
        for user_id in ("tester1", "tester2", "dev1", "dev2"):
            if db.get(ProjectMember, (project.id, people[user_id].id)) is None:
                db.add(ProjectMember(project_id=project.id, user_id=people[user_id].id))
        existing = {bug.title for bug in db.scalars(select(Bug).where(Bug.project_id == project.id))}
        for index, (title, module_name, severity, final_status, bug_type) in enumerate(SAMPLES):
            if title in existing:
                continue
            reporter = people["tester1" if index % 2 == 0 else "tester2"]
            developer = people["dev1" if index % 2 == 0 else "dev2"]
            bug = Bug(bug_no=(db.scalar(select(Bug.bug_no).where(Bug.project_id == project.id).order_by(Bug.bug_no.desc()).limit(1)) or 0) + 1, project_id=project.id, module_id=modules[module_name].id, title=title, steps="Open the relevant screen and repeat the documented workflow.", expected_result="The feature should behave consistently and preserve the saved data.", actual_result="The observed result differs from the expected behavior.", severity=severity, priority="High" if severity == BugSeverity.CRITICAL else "Medium", type=bug_type, status=final_status, reported_by=reporter.id, assigned_to=developer.id, fixed_by=developer.id if final_status in {BugStatus.FIXED, BugStatus.VERIFIED} else None, verified_by=reporter.id if final_status == BugStatus.VERIFIED else None, environment="Demo · Chrome", build_version="1.0.0")
            db.add(bug)
            db.flush()
            transitions = {
                BugStatus.OPEN: [],
                BugStatus.REOPENED: [
                    (BugStatus.IN_PROGRESS, developer, "Investigation started."),
                    (BugStatus.FIXED, developer, "Fix submitted for retest."),
                    (BugStatus.REOPENED, reporter, "Issue still reproduces."),
                ],
                BugStatus.IN_PROGRESS: [(BugStatus.IN_PROGRESS, developer, "Investigation started.")],
                BugStatus.FIXED: [(BugStatus.IN_PROGRESS, developer, "Investigation started."), (BugStatus.FIXED, developer, "Fix is ready for QA.")],
                BugStatus.VERIFIED: [(BugStatus.IN_PROGRESS, developer, "Investigation started."), (BugStatus.FIXED, developer, "Fix is ready for QA."), (BugStatus.VERIFIED, reporter, "Verified in the latest build.")],
            }
            source = BugStatus.OPEN
            for target, actor, note in transitions[final_status]:
                db.add(BugHistory(bug_id=bug.id, user_id=actor.id, from_status=source, to_status=target, note=note))
                source = target
        db.commit()
    print("Demo workspace is ready. Sample accounts are admin, manager, tester1, tester2, dev1, and dev2.")


if __name__ == "__main__":
    main()
