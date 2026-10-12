from pathlib import Path

from ..config import get_settings
from ..models import Account
from ..security import decrypt_json, encrypt_json
from .base import OAuthProvider, ProviderError, StorageProvider
from .gdrive import GoogleDriveProvider
from .local import LocalProvider

# Dropbox and Box adapters land in milestone M3.
OAUTH_PROVIDERS: dict[str, type[OAuthProvider]] = {
    GoogleDriveProvider.kind: GoogleDriveProvider,
}


def available_providers() -> list[dict]:
    s = get_settings()
    items = [
        {"kind": "gdrive", "name": "Google Drive", "configured": bool(s.google_client_id)},
        {"kind": "dropbox", "name": "Dropbox", "configured": False, "coming_soon": True},
        {"kind": "box", "name": "Box", "configured": False, "coming_soon": True},
    ]
    if s.local_root:
        items.append({"kind": "local", "name": "Server folder", "configured": True})
    return items


def open_provider(account: Account, db_session=None) -> StorageProvider:
    if account.provider == "local":
        root = get_settings().local_root
        if not root:
            raise ProviderError("Server folders are disabled (DM_LOCAL_ROOT unset)", 400)
        return LocalProvider(Path(root) / account.settings.get("subdir", ""))

    cls = OAUTH_PROVIDERS.get(account.provider)
    if not cls:
        raise ProviderError(f"Unknown provider {account.provider}", 400)

    async def persist(creds: dict) -> None:
        if db_session is not None:
            account.credentials = encrypt_json(creds)
            await db_session.commit()

    return cls(decrypt_json(account.credentials), on_refresh=persist)
