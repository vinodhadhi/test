"""Delete aged attachment objects/metadata; invoke from a scheduled job."""
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, or_, select

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.bug import Attachment, AttachmentKind
from app.services.drive_service import DriveStorageError, drive_service

logger = logging.getLogger("attachment-retention")


def cleanup_expired_attachments() -> int:
    cutoff = datetime.now(UTC) - timedelta(days=max(1, settings.recording_retention_days))
    removed = 0
    with SessionLocal() as db:
        expired = list(db.scalars(select(Attachment).where(
            or_(Attachment.kind == AttachmentKind.VOICE, and_(Attachment.kind == AttachmentKind.VIDEO, Attachment.duration_seconds.is_not(None))),
            Attachment.created_at < cutoff,
        ).order_by(Attachment.id)))
        for item in expired:
            try:
                drive_service.delete(item.drive_file_id)
            except DriveStorageError:
                logger.exception("Could not delete expired Drive attachment id=%s", item.id)
                continue
            db.delete(item)
            removed += 1
        db.commit()
    logger.info("Attachment retention cleanup removed %d expired attachments", removed)
    return removed


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    cleanup_expired_attachments()
