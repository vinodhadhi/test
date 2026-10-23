from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import json
from pathlib import Path
import re
from threading import RLock
from uuid import uuid4
from typing import Any

from google.auth.exceptions import GoogleAuthError
from google.auth.transport.requests import Request
from google.oauth2 import service_account
from google.oauth2.credentials import Credentials
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


@dataclass(frozen=True)
class DriveUpload:
    file_id: str
    path: str


class DriveService:
    """Private Google Drive storage adapter; replaceable behind the attachment API."""

    def __init__(self, client: Any | None = None) -> None:
        self._client = client
        self._lock = RLock()

    @property
    def local_root(self) -> Path:
        return Path(__file__).resolve().parents[2] / "local_attachments"

    def _local_path(self, file_id: str) -> Path:
        opaque_id = file_id.removeprefix("local:")
        if not re.fullmatch(r"[0-9a-f]{32}", opaque_id):
            raise DriveStorageError("Invalid local attachment identifier")
        return self.local_root / opaque_id

    @property
    def client(self) -> Any:
        if self._client is None:
            token_path = Path(settings.google_drive_oauth_token_file)
            credentials_path = settings.google_application_credentials
            if not settings.drive_shared_folder_id:
                raise DriveStorageError("Set DRIVE_SHARED_FOLDER_ID to the Google Drive upload folder")
            try:
                if settings.google_drive_oauth_token_json:
                    credentials = Credentials.from_authorized_user_info(json.loads(settings.google_drive_oauth_token_json), scopes=[DRIVE_SCOPE])
                    if not credentials.valid:
                        if not credentials.refresh_token:
                            raise DriveStorageError("Google Drive authorization expired; authorize the account again")
                        credentials.refresh(Request())
                elif token_path.is_file():
                    credentials = Credentials.from_authorized_user_file(str(token_path), scopes=[DRIVE_SCOPE])
                    if not credentials.valid:
                        if not credentials.refresh_token:
                            raise DriveStorageError("Google Drive authorization expired; authorize the account again")
                        credentials.refresh(Request())
                elif settings.google_service_account_json:
                    credentials = service_account.Credentials.from_service_account_info(json.loads(settings.google_service_account_json), scopes=[DRIVE_SCOPE])
                elif credentials_path and Path(credentials_path).is_file():
                    credentials = service_account.Credentials.from_service_account_file(credentials_path, scopes=[DRIVE_SCOPE])
                else:
                    raise DriveStorageError("Google Drive credentials are not available on the backend host")
                self._client = build("drive", "v3", credentials=credentials, cache_discovery=False)
            except (OSError, ValueError, TypeError, GoogleAuthError) as exc:
                raise DriveStorageError("Could not load or refresh Google Drive credentials") from exc
        return self._client

    @retry(wait=wait_exponential(multiplier=0.3, min=0.5, max=4), stop=stop_after_attempt(3), retry=retry_if_exception(_retryable), reraise=True)
    def _find_folder(self, name: str, parent_id: str) -> str | None:
        escaped = name.replace("\\", "\\\\").replace("'", "\\'")
        result = self.client.files().list(
            q=f"name = '{escaped}' and mimeType = '{FOLDER_MIME}' and '{parent_id}' in parents and trashed = false",
            fields="files(id,name)", pageSize=10, corpora="user", includeItemsFromAllDrives=True, supportsAllDrives=True,
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
            with self._lock:
                project_folder = self._get_or_create_folder(f"project-{project_id}", settings.drive_shared_folder_id)
                return self._get_or_create_folder(f"bug-{bug_no}", project_folder)
        except (HttpError, OSError, GoogleAuthError) as exc:
            detail = f"HTTP {exc.resp.status}" if isinstance(exc, HttpError) else "connection or authentication error"
            raise DriveStorageError(f"Google Drive could not prepare the project/bug folder ({detail})") from exc

    @retry(wait=wait_exponential(multiplier=0.3, min=0.5, max=4), stop=stop_after_attempt(3), retry=retry_if_exception(_retryable), reraise=True)
    def _upload(self, folder_id: str, file_name: str, mime_type: str, content: bytes) -> str:
        media = MediaIoBaseUpload(BytesIO(content), mimetype=mime_type, resumable=True)
        result = self.client.files().create(
            body={"name": file_name, "parents": [folder_id]}, media_body=media,
            fields="id", supportsAllDrives=True,
        ).execute()
        return result["id"]

    def upload(self, *, project_id: int, bug_no: int, file_name: str, mime_type: str, content: bytes) -> DriveUpload:
        if settings.attachment_storage == "local":
            file_id = f"local:{uuid4().hex}"
            try:
                self.local_root.mkdir(parents=True, exist_ok=True)
                self._local_path(file_id).write_bytes(content)
            except OSError as exc:
                raise DriveStorageError("Local attachment could not be saved") from exc
            return DriveUpload(file_id=file_id, path=f"local://{project_id}/{bug_no}/{file_id.removeprefix('local:')}")
        if self._client is None and not (settings.google_drive_oauth_token_json or settings.google_service_account_json or Path(settings.google_drive_oauth_token_file).is_file() or (settings.google_application_credentials and Path(settings.google_application_credentials).is_file())):
            raise DriveStorageError("Google Drive credentials are not available on the backend host")
        if not settings.drive_shared_folder_id:
            raise DriveStorageError("DRIVE_SHARED_FOLDER_ID is not configured")
        try:
            with self._lock:
                project_folder = self._get_or_create_folder(f"project-{project_id}", settings.drive_shared_folder_id)
                bug_folder = self._get_or_create_folder(f"bug-{bug_no}", project_folder)
                file_id = self._upload(bug_folder, file_name, mime_type, content)
            return DriveUpload(file_id=file_id, path=f"drive://{settings.drive_shared_folder_id}/{project_folder}/{bug_folder}/{file_id}")
        except DriveStorageError:
            raise
        except (HttpError, OSError, GoogleAuthError) as exc:
            detail = f"HTTP {exc.resp.status}" if isinstance(exc, HttpError) else "connection or authentication error"
            raise DriveStorageError(f"Google Drive upload failed ({detail})") from exc

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
            with self._lock:
                return self._download(file_id)
        except (HttpError, OSError, GoogleAuthError) as exc:
            if isinstance(exc, HttpError) and exc.resp.status == 404:
                raise DriveStorageError("Attachment was not found in Google Drive") from exc
            detail = f"HTTP {exc.resp.status}" if isinstance(exc, HttpError) else "connection or authentication error"
            raise DriveStorageError(f"Google Drive download failed ({detail})") from exc

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
            with self._lock:
                self._delete(file_id)
        except (HttpError, OSError, GoogleAuthError) as exc:
            if isinstance(exc, HttpError) and exc.resp.status == 404:
                return
            detail = f"HTTP {exc.resp.status}" if isinstance(exc, HttpError) else "connection or authentication error"
            raise DriveStorageError(f"Google Drive delete failed ({detail})") from exc


drive_service = DriveService()
