"""Add project lifecycle planning fields.

Revision ID: 0007_project_lifecycle
Revises: 0006_auth_version
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_project_lifecycle"
down_revision = "0006_auth_version"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("lifecycle_stage", sa.String(30), nullable=False, server_default="Planning"))
    op.add_column("projects", sa.Column("start_date", sa.Date()))
    op.add_column("projects", sa.Column("target_date", sa.Date()))
    op.add_column("projects", sa.Column("health_note", sa.Text()))


def downgrade() -> None:
    op.drop_column("projects", "health_note")
    op.drop_column("projects", "target_date")
    op.drop_column("projects", "start_date")
    op.drop_column("projects", "lifecycle_stage")
