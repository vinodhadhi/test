# Backend

The API provides cookie-based authentication, administration APIs, the bug workflow, audit history, comments, and private Google Drive attachments.

## Local setup

1. Use Python 3.12 and create/activate a virtual environment.
2. Install dependencies with `pip install -e ".[dev]"`.
3. Create the root project `.env` from `../.env.example`, set a random `APP_SECRET_KEY` with at least 32 characters, and configure `DATABASE_URL` for MySQL 8 or PostgreSQL. For Supabase, use the connection details from its Connect panel with the `postgresql+psycopg://` SQLAlchemy scheme and SSL enabled. The backend reads that root file from any working directory.
4. Run `alembic upgrade head` from this directory.
5. Set `DRIVE_SHARED_FOLDER_ID` and `GOOGLE_APPLICATION_CREDENTIALS` for attachment uploads (details below).
6. Start the API with `uvicorn app.main:app --reload`.

Interactive OpenAPI documentation is available at `/docs`. To create a demo workspace, set a non-empty `SEED_PASSWORD` and run `python -m app.seed` after migrating. The demo user IDs are `admin`, `manager`, `tester1`, `tester2`, `dev1`, and `dev2`; all receive the seed password. The seed command is idempotent and never overwrites existing passwords.

## Authentication and authorization notes

Login accepts a user ID and password. Password hashes use Argon2id. Access and refresh tokens are signed JWTs stored in HttpOnly cookies, with a readable double-submit CSRF cookie required as `X-CSRF-Token` for state-changing requests. Set `COOKIE_SECURE=true` behind HTTPS in production. Login failures are rate limited and counted per account with a temporary lockout.

All bug reads and writes check the authenticated role and record ownership or project membership in the service layer. Each status transition and its associated history row are committed together. Managers can view dashboards and manage projects, modules, Tester/Developer accounts, and project assignments. Admins retain full user administration, including editing, deactivation, and password resets.

Testers retain access to bugs they reported after leaving a project, so they can complete retests. Unresolved bugs must be reassigned or verified before an assigned developer is removed from a project or deactivated. Production CORS accepts only `FRONTEND_ORIGIN`; development keeps wildcard origins for LAN use.

The manager's Team assignments view uses `GET /manager/team/workload` to show each active tester and developer's current projects, recorded former assignments, earlier project work inferred from bugs, and open issue counts. Assignment history starts with the migration that introduces it; older removed memberships cannot be reconstructed unless those users have issue records in that project.

## Google Drive Shared Drive

Create or choose a folder inside the team's Shared Drive and set its ID as `DRIVE_SHARED_FOLDER_ID`. Add the service account email from its JSON key as a Shared Drive member with permission to create and read files. Set `GOOGLE_APPLICATION_CREDENTIALS` to the key file path on the backend host; the key itself must not be added to the repository. Files remain private in Drive and are streamed through the API only after bug access is checked.

The API validates file signatures and MIME types, accepts files up to 25 MB, and creates `project-{id}/bug-{number}` folders on first upload. Every new upload requires Drive credentials; if they are missing, the API returns an error instead of silently storing the file locally. The database saves both the Drive file ID and its `drive://` folder/file path. Existing `local:` attachments can still be read and deleted. `RECORDING_RETENTION_DAYS` controls how long voice and video recordings are retained. Schedule `python -m app.services.cleanup_expired_attachments` at the desired interval to apply the retention policy.
