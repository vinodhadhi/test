from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.api.admin import router as admin_router
from app.api.attachments import router as attachments_router
from app.api.auth import limiter
from app.api.auth import router as auth_router
from app.api.bugs import router as bugs_router
from app.api.chat import router as chat_router
from app.api.dashboard import router as dashboard_router
from app.api.manager_projects import router as manager_projects_router
from app.api.project_work import router as project_work_router
from app.core.config import settings

app = FastAPI(title="Bug Tracking & QA Progress API", version="0.1.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(
    CORSMiddleware,
    # Development may use LAN origins; production accepts only the configured web app.
    allow_origins=[settings.frontend_origin] if settings.app_env.lower() == "production" else ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(bugs_router)
app.include_router(chat_router)
app.include_router(project_work_router)
app.include_router(attachments_router)
app.include_router(dashboard_router)
app.include_router(manager_projects_router)


@app.get("/health", tags=["Health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
