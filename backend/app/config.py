from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DM_", env_file=".env", extra="ignore")

    # Everything below is optional. Out of the box the app needs no configuration:
    # the database, encryption key and server-folder storage live in data_dir, and
    # provider keys and other options are set by an admin on the in-app Settings page.
    # Environment variables (DM_...) only provide defaults for those settings.
    data_dir: Path = Path("./data")
    database_url: str = ""
    # 32-byte key, base64url encoded. When unset, one is generated in data_dir/secret.key.
    secret_key: str = ""
    # Address people use to reach the app. When unset it is taken from each request.
    public_url: str = ""
    session_days: int = 30
    cookie_secure: bool = False

    # Default folder for "Server folder" drives (data_dir/storage when unset).
    local_root: Path | None = None

    google_client_id: str = ""
    google_client_secret: str = ""
    dropbox_app_key: str = ""
    dropbox_app_secret: str = ""
    box_client_id: str = ""
    box_client_secret: str = ""

    frontend_dist: Path = Path(__file__).resolve().parents[2] / "frontend" / "dist"


    @property
    def db_url(self) -> str:
        return self.database_url or f"sqlite+aiosqlite:///{(self.data_dir / 'drive_manager.db').as_posix()}"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.data_dir.mkdir(parents=True, exist_ok=True)
    return s
