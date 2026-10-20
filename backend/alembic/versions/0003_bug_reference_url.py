"""Add optional reference URL for linked API or external issues.

Revision ID: 0003_bug_reference_url
Revises: 0002_attachment_drive_path
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_bug_reference_url"
down_revision = "0002_attachment_drive_path"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bugs", sa.Column("reference_url", sa.String(2048), nullable=True))


def downgrade() -> None:
    op.drop_column("bugs", "reference_url")
