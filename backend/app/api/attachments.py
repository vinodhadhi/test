from io import BytesIO
from urllib.parse import quote

import filetype
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.bugs import _bug_or_404
from app.api.deps import current_user, get_db, require_csrf
from app.models.bug import Attachment, AttachmentKind
from app.models.user import User, UserRole
from app.schemas.bugs import AttachmentOut
from app.services.bug_access import require_bug_access
from app.services.drive_service import DriveStorageError, drive_service

router = APIRouter(tags=["Attachments"])
MAX_BYTES = 25 * 1024 * 1024
ALLOWED_EXACT = {"video/webm", "video/mp4", "audio/webm", "audio/mp4", "audio/mpeg", "application/pdf"}


def _kind_for(mime: str) -> AttachmentKind:
    if mime.startswith("image/"):
        return AttachmentKind.SCREENSHOT
    if mime.startswith("video/"):
        return AttachmentKind.VIDEO
    if mime.startswith("audio/"):
        return AttachmentKind.VOICE
    return AttachmentKind.FILE


def _content_matches(mime: str, content: bytes) -> bool:
    detected = filetype.guess_mime(content)
    if mime.startswith("image/"):
        return bool(detected and detected.startswith("image/"))
    if mime == "application/pdf":
        return content.startswith(b"%PDF-")
    if mime in {"video/mp4", "audio/mp4"}:
        return len(content) >= 12 and content[4:8] == b"ftyp"
    if mime in {"video/webm", "audio/webm"}:
        return content.startswith(b"\x1a\x45\xdf\xa3")
    if mime == "audio/mpeg":
        return content.startswith(b"ID3") or (len(content) > 1 and content[0] == 0xFF and content[1] & 0xE0 == 0xE0)
    return False


@router.post("/bugs/{bug_id}/attachments", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_csrf)])
async def upload_attachment(
    bug_id: int,
    file: UploadFile = File(...),
    duration_seconds: int | None = Form(default=None, ge=0, le=120),
    actor: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Attachment:
    bug = _bug_or_404(db, bug_id)
    require_bug_access(db, actor, bug)
    if actor.role not in {UserRole.ADMIN, UserRole.TESTER, UserRole.DEVELOPER}:
        raise HTTPException(status_code=403, detail="Managers have read-only access")
    mime = (file.content_type or "application/octet-stream").split(";", 1)[0].strip().lower()
    if not (mime.startswith("image/") or mime in ALLOWED_EXACT):
        raise HTTPException(status_code=415, detail="Allowed files are images, WebM/MP4 video or audio, MP3 audio, and PDF")
    if duration_seconds is not None and duration_seconds > 120:
        raise HTTPException(status_code=422, detail="Recording duration cannot exceed two minutes")
    if duration_seconds is not None and not (mime.startswith("audio/") or mime.startswith("video/")):
        raise HTTPException(status_code=422, detail="Duration is only valid for audio or video recordings")
    chunks: list[bytes] = []
    total = 0
    while chunk := await file.read(1024 * 1024):
        total += len(chunk)
        if total > MAX_BYTES:
            raise HTTPException(status_code=413, detail="Files are limited to 25 MB")
        chunks.append(chunk)
    await file.close()
    if total == 0:
        raise HTTPException(status_code=422, detail="The uploaded file is empty")
    raw_name = (file.filename or "attachment").replace("\\", "/").split("/")[-1]
    safe_name = "".join(ch for ch in raw_name if ch.isprintable() and ch not in "\r\n")[:255] or "attachment"
    content = b"".join(chunks)
    if not _content_matches(mime, content):
        raise HTTPException(status_code=415, detail="The file content does not match its declared MIME type")
    if mime.startswith("image/"):
        mime = filetype.guess_mime(content) or mime
    try:
        drive_id = drive_service.upload(project_id=bug.project_id, bug_no=bug.bug_no, file_name=safe_name, mime_type=mime, content=content)
    except DriveStorageError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    attachment = Attachment(
        bug_id=bug.id, uploaded_by=actor.id, kind=_kind_for(mime), drive_file_id=drive_id,
        file_name=safe_name, mime_type=mime, size_bytes=total, duration_seconds=duration_seconds,
    )
    db.add(attachment)
    try:
        db.commit()
        db.refresh(attachment)
    except SQLAlchemyError as exc:
        db.rollback()
        try:
            drive_service.delete(drive_id)
        except DriveStorageError:
            pass
        raise HTTPException(status_code=500, detail="Attachment metadata could not be saved") from exc
    return attachment


@router.get("/attachments/{attachment_id}/download")
def download_attachment(attachment_id: int, actor: User = Depends(current_user), db: Session = Depends(get_db)) -> StreamingResponse:
    attachment = db.get(Attachment, attachment_id)
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    bug = _bug_or_404(db, attachment.bug_id)
    require_bug_access(db, actor, bug)
    try:
        content = drive_service.download(attachment.drive_file_id)
    except DriveStorageError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    headers = {
        "Content-Disposition": f"inline; filename*=UTF-8''{quote(attachment.file_name)}",
        "Content-Length": str(len(content)),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
    }
    return StreamingResponse(BytesIO(content), media_type=attachment.mime_type, headers=headers)
