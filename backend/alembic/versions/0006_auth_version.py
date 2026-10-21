"""Invalidate sessions after account security changes.

Revision ID: 0006_auth_version
Revises: 0005_notifications
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_auth_version"
down_revision = "0005_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("auth_version", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("users", "auth_version")
