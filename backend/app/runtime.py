"""Settings an admin changes in the app.

Each option has a default (from DM_ environment variables, or a built-in value);
a value saved on the Settings page overrides it. Values are cached in memory and
reloaded whenever they are saved, so providers can read them synchronously.
"""
import json
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .models import AppSetting
from .security import decrypt_json, encrypt_json


@dataclass(frozen=True)
class Option:
    kind: type
    secret: bool = False


OPTIONS: dict[str, Option] = {
    "public_url": Option(str),
    "server_folder_enabled": Option(bool),
    "server_folder_path": Option(str),
    "google_client_id": Option(str),
    "google_client_secret": Option(str, secret=True),
    "dropbox_app_key": Option(str),
    "dropbox_app_secret": Option(str, secret=True),
    "box_client_id": Option(str),
    "box_client_secret": Option(str, secret=True),
}

_saved: dict[str, object] = {}


def default(key: str):
    s = get_settings()
    if key == "server_folder_enabled":
        return True
    if key == "server_folder_path":
        return str((s.local_root or s.data_dir / "storage").resolve())
    return getattr(s, key)


def get(key: str):
    return _saved[key] if key in _saved else default(key)


def server_folder_root() -> Path | None:
    return Path(get("server_folder_path")) if get("server_folder_enabled") else None


async def load(db: AsyncSession) -> None:
    rows = (await db.execute(select(AppSetting))).scalars()
    values = {}
    for row in rows:
        opt = OPTIONS.get(row.key)
        if not opt:
            continue
        values[row.key] = decrypt_json(row.value)["v"] if opt.secret else json.loads(row.value)
    _saved.clear()
    _saved.update(values)


async def save(db: AsyncSession, updates: dict[str, object]) -> None:
    """Save options. A value of None removes the saved value, restoring the default."""
    for key, value in updates.items():
        opt = OPTIONS[key]
        await db.execute(delete(AppSetting).where(AppSetting.key == key))
        if value is not None:
            stored = encrypt_json({"v": value}) if opt.secret else json.dumps(value)
            db.add(AppSetting(key=key, value=stored))
    await db.commit()
    await load(db)
