# QA Desk

Internal bug tracking and QA progress workspace for testers, developers, managers, and administrators.

## Run locally (no Docker)

Requirements: Python 3.12+, Node.js 20+, and a Supabase project (or a local MySQL 8 server).

1. Copy `.env.example` to `.env` in this project folder. Set `APP_SECRET_KEY` to a random value of at least 32 characters. Set `DATABASE_URL` to your Supabase PostgreSQL connection string using `postgresql+psycopg://` and `sslmode=require`. Put the database password only in this local `.env`; URL-encode special characters. Set `SEED_PASSWORD` before running the optional demo seeder.
2. Open PowerShell in `backend`, create and activate a virtual environment, and install the API:

   ```powershell
   cd backend
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install -e ".[dev]"
   alembic upgrade head
   uvicorn app.main:app --reload --host 0.0.0.0
   ```

   Keep this terminal running. The backend reads the root `.env` from any working directory.

3. In a second PowerShell window, start the frontend:

   ```powershell
   cd frontend
   npm install
   npm run dev -- --host 0.0.0.0
   ```

4. Open `http://localhost:5173`. The Vite development proxy forwards `/api/*` requests to `http://localhost:8000`, removing the `/api` prefix. For a backend on another host, set `VITE_API_PROXY_TARGET` before starting Vite. Page routes such as `/bugs` remain frontend pages.

   Bug discussions use `/api/ws/bugs/{id}/chat` for live comments and typing indicators. The Vite proxy forwards WebSocket upgrades automatically. A production reverse proxy must forward `/api/*` to the backend after removing `/api`, support WebSocket upgrades, and rewrite the refresh cookie path from `/auth` to `/api/auth`. Alternatively, set `VITE_API_URL` to the backend origin at build time. The live event hub is in memory, so run one API worker until a shared pub/sub service is added; comments remain stored in PostgreSQL and clients refetch them on reconnect.

   Testers can attach screenshots, PDFs, and MP4 or WebM workflow videos (up to 25 MB per file) when reporting a bug. The selected video can be previewed before submission, and uploaded videos play on the issue page. Uploads require valid Google Drive credentials on the backend.
5. In a third PowerShell window, create demo users and data (optional):

   ```powershell
   cd backend
   .venv\Scripts\Activate.ps1
   $env:SEED_PASSWORD = "your-local-demo-password"
   python -m app.seed
   ```

   The demo user IDs are `admin`, `manager`, `tester1`, `tester2`, `dev1`, and `dev2`. The seed also inserts sample projects and bugs.

Supabase database connection details are in the project’s **Connect** panel. If the direct host does not resolve on your network, use the session pooler details. Do not share or commit `.env`.

## Checks

Backend tests (from `backend`):

```powershell
$env:APP_SECRET_KEY = "local-test-secret-with-at-least-32-characters"
$env:DATABASE_URL = "sqlite:///./test.db"
python -m pytest
```

Frontend check (from `frontend`): `npm run build`.

## Roles and security

- **Admin:** user and project administration, bug access, reporting, dashboards.
- **Manager:** dashboards, read-only issue tracking, project/module management, Tester/Developer account creation, and separate project team assignments.
- **Tester:** personal dashboard for reports and retests; report bugs in assigned projects, comment, and verify or reopen reported bugs. The issue list separates personal reports from project issues.
- **Developer:** personal dashboard and queue for assigned bugs and status changes.

The application currently authenticates its own user records; Supabase Auth keys are optional metadata and do not enable Supabase Auth login. The Supabase secret key is not needed. Never place it in the frontend. In production, use HTTPS, `APP_ENV=production`, `COOKIE_SECURE=true`, and an HTTPS `FRONTEND_ORIGIN`.

## Local backend fallback

Vite uses `https://test-seven-woad-nvkrw3zwum.vercel.app` first. It checks that backend's `/health` endpoint before forwarding `/api` requests (a 1.5 second timeout, cached for 3 seconds). When unavailable or unhealthy, it uses the local backend at `http://127.0.0.1:8000`. It returns to the deployed backend when health recovers. Override the URLs with `VITE_API_PROXY_TARGET` and `VITE_API_FALLBACK_TARGET` in the frontend launch environment. Clear any old local `VITE_API_PROXY_TARGET` override to use the deployed backend first. Keep browser requests on `/api`; a direct `VITE_API_URL` bypasses this routing.

Requests are routed before sending; failed writes are never replayed. Health reports availability only, not database readiness. Switching between servers may require signing in again if their authentication secrets differ. Secure cookies from the deployed backend require an HTTPS frontend. Live chat also depends on the fallback host supporting WebSockets. This routing runs in the local Vite server; production hosting needs an equivalent reverse proxy.

For a separate Vercel frontend deployment, set its Root Directory to `frontend`. The included `frontend/vercel.json` forwards `/api/*` to the deployed backend and serves the SPA for page routes such as `/login`. Leave `VITE_API_URL` unset (or `/api`) when using these rewrites. The backend deployment URL itself does not serve the frontend login page. Redeploy the frontend after configuration changes. These production rewrites use the deployed backend only; they cannot reach a developer PC's localhost.
