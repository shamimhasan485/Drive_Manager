from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DM_", env_file=".env", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./data/drive_manager.db"
    # 32-byte key, base64url encoded. Generate with: python -m app.security genkey
    secret_key: str = ""
    public_url: str = "http://localhost:8000"
    session_days: int = 30
    cookie_secure: bool = False

    # Dev-only provider that exposes a folder on the server as a "drive".
    local_root: Path | None = None

    google_client_id: str = ""
    google_client_secret: str = ""
    dropbox_app_key: str = ""
    dropbox_app_secret: str = ""
    box_client_id: str = ""
    box_client_secret: str = ""

    frontend_dist: Path = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@lru_cache
def get_settings() -> Settings:
    return Settings()
