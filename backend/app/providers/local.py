"""A provider backed by a folder on the server's disk.

Used for development and UI work without OAuth apps, and handy later for
"server storage" as one more drive. Item IDs are paths relative to the root.
"""
import mimetypes
import shutil
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from pathlib import Path

import anyio

from .base import Capabilities, Entry, Page, ProviderError, Quota, StorageProvider

CHUNK = 1024 * 1024


class LocalProvider(StorageProvider):
    kind = "local"
    display_name = "Server folder"
    capabilities = Capabilities(server_side_copy=True)
    root_id = ""

    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, item_id: str) -> Path:
        p = (self.root / item_id).resolve()
        if p != self.root and self.root not in p.parents:
            raise ProviderError("Path escapes the drive root", 400)
        return p

    def _entry(self, p: Path) -> Entry:
        st = p.stat()
        rel = p.relative_to(self.root).as_posix()
        rel = "" if rel == "." else rel
        parent = p.parent.relative_to(self.root).as_posix() if p != self.root else None
        return Entry(
            id=rel,
            name=p.name or "Root",
            is_folder=p.is_dir(),
            size=None if p.is_dir() else st.st_size,
            mime_type=None if p.is_dir() else mimetypes.guess_type(p.name)[0],
            modified_at=datetime.fromtimestamp(st.st_mtime, timezone.utc),
            parent_ids=[] if parent is None else ["" if parent == "." else parent],
        )

    async def about(self) -> Quota:
        usage = shutil.disk_usage(self.root)
        return Quota(used=usage.used, total=usage.total)

    async def list(self, folder_id: str, page_token: str | None = None) -> Page:
        p = self._path(folder_id)
        if not p.is_dir():
            raise ProviderError("Not a folder", 404)
        return Page([self._entry(c) for c in p.iterdir() if not c.name.startswith(".")])

    async def stat(self, item_id: str) -> Entry:
        p = self._path(item_id)
        if not p.exists():
            raise ProviderError("Not found", 404)
        return self._entry(p)

    async def mkdir(self, parent_id: str, name: str) -> Entry:
        p = self._path(parent_id) / name
        p.mkdir()
        return self._entry(p)

    async def rename(self, item_id: str, new_name: str) -> Entry:
        p = self._path(item_id)
        return self._entry(p.rename(p.with_name(new_name)))

    async def move(self, item_id: str, new_parent_id: str) -> Entry:
        p = self._path(item_id)
        target = self._path(new_parent_id) / p.name
        return self._entry(Path(shutil.move(p, target)))

    async def delete(self, item_id: str) -> None:
        p = self._path(item_id)
        if p == self.root:
            raise ProviderError("Cannot delete the root", 400)
        shutil.rmtree(p) if p.is_dir() else p.unlink()

    async def download(self, item_id: str) -> AsyncIterator[bytes]:
        async with await anyio.open_file(self._path(item_id), "rb") as f:
            while chunk := await f.read(CHUNK):
                yield chunk

    async def upload(self, parent_id: str, name: str, stream: AsyncIterator[bytes]) -> Entry:
        p = self._path(parent_id) / name
        async with await anyio.open_file(p, "wb") as f:
            async for chunk in stream:
                await f.write(chunk)
        return self._entry(p)

    async def search(self, query: str) -> Page:
        q = query.lower()
        hits = [self._entry(p) for p in self.root.rglob("*") if q in p.name.lower()]
        return Page(hits[:200])
