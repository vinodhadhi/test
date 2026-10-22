"""One-time authorization for uploads to a personal Google Drive folder."""

from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

from app.core.config import settings
from app.services.drive_service import DRIVE_SCOPE


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    client_file = root / "secrets" / "google-drive-client.json"
    if not client_file.is_file():
        raise SystemExit(f"Download the Desktop app OAuth client JSON to {client_file}")
    if not settings.drive_shared_folder_id:
        raise SystemExit("Set DRIVE_SHARED_FOLDER_ID in the root .env file")

    flow = InstalledAppFlow.from_client_secrets_file(str(client_file), scopes=[DRIVE_SCOPE])
    credentials = flow.run_local_server(host="localhost", port=0, open_browser=True, access_type="offline", prompt="consent")
    token_file = Path(settings.google_drive_oauth_token_file)
    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(credentials.to_json(), encoding="utf-8")
    print(f"Google Drive authorized. Restart the backend to use {token_file}.")


if __name__ == "__main__":
    main()
