from functools import lru_cache
from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    app_secret_key: str
    database_url: str
    supabase_url: str = ""
    supabase_publishable_key: str = ""
    supabase_jwks_url: str = ""
    frontend_origin: str = "http://localhost:5173"
    cookie_secure: bool = False
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    login_max_failures: int = 5
    login_lockout_minutes: int = 15
    drive_shared_folder_id: str = ""
    google_application_credentials: str = ""
    recording_retention_days: int = 90

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[3] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("app_secret_key")
    @classmethod
    def validate_secret(cls, value: str) -> str:
        if len(value) < 32:
            raise ValueError("APP_SECRET_KEY must contain at least 32 characters")
        return value

    @model_validator(mode="after")
    def validate_production_cookies(self) -> "Settings":
        if self.app_env.lower() == "production" and (not self.cookie_secure or not self.frontend_origin.startswith("https://")):
            raise ValueError("Production requires Secure cookies and an HTTPS frontend origin")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
