from __future__ import annotations

from io import BytesIO
from pathlib import Path
import re
from typing import Any
from uuid import uuid4

from google.auth.exceptions import GoogleAuthError
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseUpload
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from app.core.config import settings

DRIVE_SCOPE = "https://www.googleapis.com/auth/drive"
FOLDER_MIME = "application/vnd.google-apps.folder"


def _retryable(error: BaseException) -> bool:
    return isinstance(error, OSError) or (isinstance(error, HttpError) and getattr(error.resp, "status", 0) in {429, 500, 502, 503, 504})


class DriveStorageError(RuntimeError):
    pass


class DriveService:
    """Private Google Drive storage adapter; replaceable behind the attachment API."""

    def __init__(self, client: Any | None = None) -> None:
        self._client = client

    @property
    def local_root(self) -> Path:
        return Path(__file__).resolve().parents[2] / "local_attachments"

    def _use_local_storage(self) -> bool:
        if self._client is not None:
            return False
        credentials_path = settings.google_application_credentials
        credentials_missing = not credentials_path or not Path(credentials_path).is_file()
        return settings.app_env.lower() in {"development", "dev", "test"} and (
            credentials_missing or not settings.drive_shared_folder_id
        )

    def _local_path(self, file_id: str) -> Path:
        opaque_id = file_id.removeprefix("local:")
        if not re.fullmatch(r"[0-9a-f]{32}", opaque_id):
            raise DriveStorageError("Invalid local attachment identifier")
        return self.local_root / opaque_id

    @property
    def client(self) -> Any:
        if self._client is None:
            credentials_path = settings.google_application_credentials
            if not credentials_path:
                raise DriveStorageError("Set GOOGLE_APPLICATION_CREDENTIALS to the service account JSON path")
            if not settings.drive_shared_folder_id:
                raise DriveStorageError("Set DRIVE_SHARED_FOLDER_ID to the Shared Drive upload folder")
            try:
                credentials = service_account.Credentials.from_service_account_file(credentials_path, scopes=[DRIVE_SCOPE])
                self._client = build("drive", "v3", credentials=credentials, cache_discovery=False)
            except (OSError, ValueError, GoogleAuthError) as exc:
                raise DriveStorageError("Could not load Google Drive service account credentials") from exc
        return self._client

    @retry(wait=wait_exponential(multiplier=0.3, min=0.5, max=4), stop=stop_after_attempt(3), retry=retry_if_exception(_retryable), reraise=True)
    def _find_folder(self, name: str, parent_id: str) -> str | None:
        escaped = name.replace("\\", "\\\\").replace("'", "\\'")
        result = self.client.files().list(
            q=f"name = '{escaped}' and mimeType = '{FOLDER_MIME}' and '{parent_id}' in parents and trashed = false",
            fields="files(id,name)", pageSize=10, corpora="allDrives", includeItemsFromAllDrives=True, supportsAllDrives=True,
        ).execute()
        files = result.get("files", [])
        return files[0]["id"] if files else None

    @retry(wait=wait_exponential(multiplier=0.3, min=0.5, max=4), stop=stop_after_attempt(3), retry=retry_if_exception(_retryable), reraise=True)
    def _create_folder(self, name: str, parent_id: str) -> str:
        result = self.client.files().create(
            body={"name": name, "mimeType": FOLDER_MIME, "parents": [parent_id]},
            fields="id", supportsAllDrives=True,
        ).execute()
        return result["id"]

    def _get_or_create_folder(self, name: str, parent_id: str) -> str:
        found = self._find_folder(name, parent_id)
        return found or self._create_folder(name, parent_id)

    def bug_folder(self, project_id: int, bug_no: int) -> str:
        try:
            project_folder = self._get_or_create_folder(f"project-{project_id}", settings.drive_shared_folder_id)
            return self._get_or_create_folder(f"bug-{bug_no}", project_folder)
        except HttpError as exc:
            raise DriveStorageError(f"Google Drive could not prepare the project/bug folder (HTTP {exc.resp.status})") from exc

    @retry(wait=wait_exponential(multiplier=0.3, min=0.5, max=4), stop=stop_after_attempt(3), retry=retry_if_exception(_retryable), reraise=True)
    def _upload(self, folder_id: str, file_name: str, mime_type: str, content: bytes) -> str:
        media = MediaIoBaseUpload(BytesIO(content), mimetype=mime_type, resumable=True)
        result = self.client.files().create(
            body={"name": file_name, "parents": [folder_id]}, media_body=media,
            fields="id", supportsAllDrives=True,
        ).execute()
        return result["id"]

    def upload(self, *, project_id: int, bug_no: int, file_name: str, mime_type: str, content: bytes) -> str:
        if self._use_local_storage():
            self.local_root.mkdir(mode=0o700, parents=True, exist_ok=True)
            file_id = f"local:{uuid4().hex}"
            try:
                self._local_path(file_id).write_bytes(content)
            except OSError as exc:
                raise DriveStorageError("Could not save the local development attachment") from exc
            return file_id
        try:
            folder_id = self.bug_folder(project_id, bug_no)
            return self._upload(folder_id, file_name, mime_type, content)
        except DriveStorageError:
            raise
        except HttpError as exc:
            raise DriveStorageError(f"Google Drive upload failed (HTTP {exc.resp.status})") from exc

    @retry(wait=wait_exponential(multiplier=0.3, min=0.5, max=4), stop=stop_after_attempt(3), retry=retry_if_exception(_retryable), reraise=True)
    def _download(self, file_id: str) -> bytes:
        return self.client.files().get_media(fileId=file_id, supportsAllDrives=True).execute()

    def download(self, file_id: str) -> bytes:
        if file_id.startswith("local:"):
            try:
                return self._local_path(file_id).read_bytes()
            except OSError as exc:
                raise DriveStorageError("Local attachment was not found") from exc
        try:
            return self._download(file_id)
        except HttpError as exc:
            if exc.resp.status == 404:
                raise DriveStorageError("Attachment was not found in Google Drive") from exc
            raise DriveStorageError(f"Google Drive download failed (HTTP {exc.resp.status})") from exc

    @retry(wait=wait_exponential(multiplier=0.3, min=0.5, max=4), stop=stop_after_attempt(3), retry=retry_if_exception(_retryable), reraise=True)
    def _delete(self, file_id: str) -> None:
        self.client.files().delete(fileId=file_id, supportsAllDrives=True).execute()

    def delete(self, file_id: str) -> None:
        if file_id.startswith("local:"):
            try:
                self._local_path(file_id).unlink(missing_ok=True)
            except OSError as exc:
                raise DriveStorageError("Could not delete the local development attachment") from exc
            return
        try:
            self._delete(file_id)
        except HttpError as exc:
            if exc.resp.status != 404:
                raise DriveStorageError(f"Google Drive delete failed (HTTP {exc.resp.status})") from exc


drive_service = DriveService()
