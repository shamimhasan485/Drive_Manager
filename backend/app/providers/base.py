"""The one interface every cloud provider implements.

The API layer and the UI only ever talk to `StorageProvider`, so adding a cloud
means writing one adapter, nothing else.
"""
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Entry:
    id: str
    name: str
    is_folder: bool
    size: int | None = None
    mime_type: str | None = None
    modified_at: datetime | None = None
    parent_ids: list[str] = field(default_factory=list)
    thumbnail_url: str | None = None
    web_url: str | None = None


@dataclass
class Page:
    entries: list[Entry]
    next_page_token: str | None = None


@dataclass
class Quota:
    used: int | None
    total: int | None


@dataclass
class Capabilities:
    server_side_copy: bool = False
    thumbnails: bool = False
    share_links: bool = False
    trash: bool = False


class ProviderError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


class StorageProvider(ABC):
    kind: str
    display_name: str
    capabilities = Capabilities()
    root_id: str = "root"

    @abstractmethod
    async def about(self) -> Quota: ...

    @abstractmethod
    async def list(self, folder_id: str, page_token: str | None = None) -> Page: ...

    @abstractmethod
    async def stat(self, item_id: str) -> Entry: ...

    @abstractmethod
    async def mkdir(self, parent_id: str, name: str) -> Entry: ...

    @abstractmethod
    async def rename(self, item_id: str, new_name: str) -> Entry: ...

    @abstractmethod
    async def move(self, item_id: str, new_parent_id: str) -> Entry: ...

    @abstractmethod
    async def delete(self, item_id: str) -> None: ...

    @abstractmethod
    def download(self, item_id: str) -> AsyncIterator[bytes]: ...

    @abstractmethod
    async def upload(self, parent_id: str, name: str, stream: AsyncIterator[bytes]) -> Entry: ...

    async def search(self, query: str) -> Page:
        raise ProviderError(f"Search is not supported by {self.display_name} yet", 501)

    async def close(self) -> None:
        pass


class OAuthProvider(StorageProvider):
    """Providers that connect through an OAuth2 authorization-code flow."""

    @classmethod
    @abstractmethod
    def authorize_url(cls, redirect_uri: str, state: str) -> str: ...

    @classmethod
    @abstractmethod
    async def exchange_code(cls, code: str, redirect_uri: str) -> tuple[dict, str | None]:
        """Return (credentials to store encrypted, external account email)."""
