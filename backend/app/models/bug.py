from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class BugSeverity(StrEnum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"


class BugType(StrEnum):
    FRONTEND = "Frontend"
    BACKEND = "Backend"


class BugStatus(StrEnum):
    OPEN = "Open"
    IN_PROGRESS = "In Progress"
    FIXED = "Fixed"
    VERIFIED = "Verified"
    REOPENED = "Reopened"


class AttachmentKind(StrEnum):
    SCREENSHOT = "screenshot"
    VIDEO = "video"
    VOICE = "voice"
    FILE = "file"


class Bug(Base):
    __tablename__ = "bugs"
    __table_args__ = (
        UniqueConstraint("project_id", "bug_no", name="uq_bugs_project_bug_no"),
        Index("ix_bugs_project_status", "project_id", "status"),
        Index("ix_bugs_assigned_status", "assigned_to", "status"),
        Index("ix_bugs_reported_status", "reported_by", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bug_no: Mapped[int] = mapped_column(Integer, nullable=False)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False)
    module_id: Mapped[int] = mapped_column(ForeignKey("modules.id", ondelete="RESTRICT"), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    steps: Mapped[str] = mapped_column(Text, nullable=False)
    expected_result: Mapped[str] = mapped_column(Text, nullable=False)
    actual_result: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[BugSeverity] = mapped_column(Enum(BugSeverity, name="bug_severity", values_callable=lambda enum: [item.value for item in enum]), nullable=False)
    priority: Mapped[str] = mapped_column(String(30), nullable=False, default="Medium")
    type: Mapped[BugType] = mapped_column(Enum(BugType, name="bug_type", values_callable=lambda enum: [item.value for item in enum]), nullable=False)
    status: Mapped[BugStatus] = mapped_column(Enum(BugStatus, name="bug_status", values_callable=lambda enum: [item.value for item in enum]), nullable=False, default=BugStatus.OPEN)
    reported_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    assigned_to: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    fixed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    verified_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    environment: Mapped[str | None] = mapped_column(String(300))
    build_version: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    reporter: Mapped["User"] = relationship(foreign_keys=[reported_by], back_populates="reported_bugs")
    assignee: Mapped["User"] = relationship(foreign_keys=[assigned_to], back_populates="assigned_bugs")
    project: Mapped["Project"] = relationship()
    module: Mapped["Module"] = relationship()
    comments: Mapped[list["BugComment"]] = relationship(back_populates="bug", cascade="all, delete-orphan")
    history: Mapped[list["BugHistory"]] = relationship(back_populates="bug", cascade="all, delete-orphan")
    attachments: Mapped[list["Attachment"]] = relationship(back_populates="bug", cascade="all, delete-orphan")


class BugComment(Base):
    __tablename__ = "bug_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bug_id: Mapped[int] = mapped_column(ForeignKey("bugs.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    bug: Mapped[Bug] = relationship(back_populates="comments")


class BugHistory(Base):
    __tablename__ = "bug_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bug_id: Mapped[int] = mapped_column(ForeignKey("bugs.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    from_status: Mapped[BugStatus] = mapped_column(Enum(BugStatus, name="history_from_status", values_callable=lambda enum: [item.value for item in enum]), nullable=False)
    to_status: Mapped[BugStatus] = mapped_column(Enum(BugStatus, name="history_to_status", values_callable=lambda enum: [item.value for item in enum]), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    bug: Mapped[Bug] = relationship(back_populates="history")


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bug_id: Mapped[int] = mapped_column(ForeignKey("bugs.id", ondelete="CASCADE"), nullable=False)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    kind: Mapped[AttachmentKind] = mapped_column(Enum(AttachmentKind, name="attachment_kind", values_callable=lambda enum: [item.value for item in enum]), nullable=False)
    drive_file_id: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(150), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    bug: Mapped[Bug] = relationship(back_populates="attachments")
