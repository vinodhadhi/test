"""Create initial bug tracking schema.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-10-20
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.String(100), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("role", sa.Enum("Admin", "Manager", "Tester", "Developer", name="user_role"), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("failed_login_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", name="uq_users_user_id"),
    )
    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("name", name="uq_projects_name"),
    )
    op.create_table(
        "project_members",
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_table(
        "modules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.UniqueConstraint("project_id", "name", name="uq_modules_project_name"),
    )
    op.create_table(
        "bugs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bug_no", sa.Integer(), nullable=False),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("module_id", sa.Integer(), sa.ForeignKey("modules.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("steps", sa.Text(), nullable=False),
        sa.Column("expected_result", sa.Text(), nullable=False),
        sa.Column("actual_result", sa.Text(), nullable=False),
        sa.Column("severity", sa.Enum("Critical", "High", "Medium", "Low", name="bug_severity"), nullable=False),
        sa.Column("priority", sa.String(30), nullable=False, server_default="Medium"),
        sa.Column("type", sa.Enum("Frontend", "Backend", name="bug_type"), nullable=False),
        sa.Column("status", sa.Enum("Open", "In Progress", "Fixed", "Verified", "Reopened", name="bug_status"), nullable=False, server_default="Open"),
        sa.Column("reported_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("assigned_to", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("fixed_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("verified_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("environment", sa.String(300)),
        sa.Column("build_version", sa.String(100)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("project_id", "bug_no", name="uq_bugs_project_bug_no"),
    )
    op.create_index("ix_bugs_project_status", "bugs", ["project_id", "status"])
    op.create_index("ix_bugs_assigned_status", "bugs", ["assigned_to", "status"])
    op.create_index("ix_bugs_reported_status", "bugs", ["reported_by", "status"])
    op.create_table(
        "bug_comments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bug_id", sa.Integer(), sa.ForeignKey("bugs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "bug_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bug_id", sa.Integer(), sa.ForeignKey("bugs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("from_status", sa.Enum("Open", "In Progress", "Fixed", "Verified", "Reopened", name="history_from_status"), nullable=False),
        sa.Column("to_status", sa.Enum("Open", "In Progress", "Fixed", "Verified", "Reopened", name="history_to_status"), nullable=False),
        sa.Column("note", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "attachments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("bug_id", sa.Integer(), sa.ForeignKey("bugs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("uploaded_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("kind", sa.Enum("screenshot", "video", "voice", "file", name="attachment_kind"), nullable=False),
        sa.Column("drive_file_id", sa.String(255), nullable=False),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(150), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("duration_seconds", sa.Integer()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("attachments")
    op.drop_table("bug_history")
    op.drop_table("bug_comments")
    op.drop_index("ix_bugs_reported_status", table_name="bugs")
    op.drop_index("ix_bugs_assigned_status", table_name="bugs")
    op.drop_index("ix_bugs_project_status", table_name="bugs")
    op.drop_table("bugs")
    op.drop_table("modules")
    op.drop_table("project_members")
    op.drop_table("projects")
    op.drop_table("users")
