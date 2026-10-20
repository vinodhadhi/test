"""Track project assignment intervals.

Revision ID: 0004_project_assignment_history
Revises: 0003_bug_reference_url
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_project_assignment_history"
down_revision = "0003_bug_reference_url"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_assignment_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("removed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_assignment_history_user", "project_assignment_history", ["user_id", "removed_at"])
    op.execute("INSERT INTO project_assignment_history (project_id, user_id) SELECT project_id, user_id FROM project_members")


def downgrade() -> None:
    op.drop_index("ix_assignment_history_user", table_name="project_assignment_history")
    op.drop_table("project_assignment_history")
