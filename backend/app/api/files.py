import mimetypes
import re
from contextlib import asynccontextmanager
from dataclasses import asdict
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import Account
from ..providers.base import ProviderError, StorageProvider
from ..providers.registry import open_provider
from .deps import owned_account

router = APIRouter(prefix="/api/accounts/{account_id}/files", tags=["files"])

NAME = Field(min_length=1, max_length=255, pattern=r"^[^/\\\x00]+$")


class MkdirBody(BaseModel):
    parent_id: str
    name: str = NAME


class RenameBody(BaseModel):
    name: str = NAME


class MoveBody(BaseModel):
    new_parent_id: str


@asynccontextmanager
async def provider(acc: Account, db: AsyncSession):
    p = open_provider(acc, db)
    try:
        yield p
    except ProviderError as e:
        raise HTTPException(e.status, str(e))
    except (FileNotFoundError, FileExistsError, PermissionError) as e:
        raise HTTPException(400, str(e))
    finally:
        await p.close()


@router.get("")
async def list_folder(folder_id: str = "", page_token: str | None = None,
                      acc: Account = Depends(owned_account), db: AsyncSession = Depends(get_db)):
    async with provider(acc, db) as p:
        page = await p.list(folder_id or p.root_id, page_token)
    return {"entries": [asdict(e) for e in page.entries], "next_page_token": page.next_page_token}


@router.get("/search")
async def search(q: str = Query(min_length=1), acc: Account = Depends(owned_account), db: AsyncSession = Depends(get_db)):
    async with provider(acc, db) as p:
        page = await p.search(q)
    return {"entries": [asdict(e) for e in page.entries], "next_page_token": page.next_page_token}


@router.get("/item")
async def stat(id: str, acc: Account = Depends(owned_account), db: AsyncSession = Depends(get_db)):
    async with provider(acc, db) as p:
        return asdict(await p.stat(id))


@router.post("/folders")
async def mkdir(body: MkdirBody, acc: Account = Depends(owned_account), db: AsyncSession = Depends(get_db)):
    async with provider(acc, db) as p:
        return asdict(await p.mkdir(body.parent_id, body.name))


@router.post("/rename")
async def rename(id: str, body: RenameBody, acc: Account = Depends(owned_account), db: AsyncSession = Depends(get_db)):
    async with provider(acc, db) as p:
        return asdict(await p.rename(id, body.name))


@router.post("/move")
async def move(id: str, body: MoveBody, acc: Account = Depends(owned_account), db: AsyncSession = Depends(get_db)):
    async with provider(acc, db) as p:
        return asdict(await p.move(id, body.new_parent_id))


@router.delete("")
async def delete(id: str, acc: Account = Depends(owned_account), db: AsyncSession = Depends(get_db)):
    async with provider(acc, db) as p:
        await p.delete(id)
    return {"ok": True}


# Types the browser may render inline. Everything else is sent as a download, and anything
# inline except PDF is sandboxed, so a file someone uploads can never run script on this site.
INLINE_SAFE = ("image/", "video/", "audio/", "application/pdf", "text/plain")
TEXTLIKE = ("text/", "application/json", "application/xml", "application/javascript", "application/x-sh",
            "application/x-yaml", "application/toml")
RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")


def _media_type(name: str, mime: str | None) -> str:
    if not mime or mime == "application/octet-stream":
        mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
    return mime


def _parse_range(header: str | None, size: int) -> tuple[int, int] | None:
    """Single byte range -> (start, end inclusive). None = whole file. Raises 416 if unsatisfiable."""
    m = RANGE_RE.match((header or "").strip())
    if not m or not (m.group(1) or m.group(2)):
        return None
    if m.group(1):
        start, end = int(m.group(1)), int(m.group(2)) if m.group(2) else size - 1
    else:  # suffix range: last N bytes
        start, end = max(0, size - int(m.group(2))), size - 1
    end = min(end, size - 1)
    if start > end or start >= size:
        raise HTTPException(416, "Range not satisfiable", headers={"Content-Range": f"bytes */{size}"})
    return start, end


@router.get("/download")
async def download(request: Request, id: str, inline: bool = False, preview: bool = False,
                   acc: Account = Depends(owned_account), db: AsyncSession = Depends(get_db)):
    """Stream a file. inline=1 shows it in the browser (with byte ranges for seeking in video/audio);
    preview=1 converts files that need it (e.g. Google Docs to PDF)."""
    p: StorageProvider = open_provider(acc, db)
    try:
        meta = await p.stat(id)
    except ProviderError as e:
        await p.close()
        raise HTTPException(e.status, str(e))
    if meta.is_folder:
        await p.close()
        raise HTTPException(400, "Folders can't be downloaded")

    name, export_mime = meta.name, None
    if preview and (pm := p.preview_format(meta)):
        export_mime = media = pm
    elif fmt := p.export_formats(meta):
        export_mime, ext = fmt
        media = export_mime
        if not name.lower().endswith("." + ext):
            name = f"{name}.{ext}"
    else:
        media = _media_type(meta.name, meta.mime_type)

    headers: dict[str, str] = {"X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300"}
    if inline:
        if media.startswith(TEXTLIKE):
            media = "text/plain; charset=utf-8"
        if media.startswith(INLINE_SAFE):
            if not media.startswith("application/pdf"):
                headers["Content-Security-Policy"] = "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'"
            disposition = "inline"
        else:
            disposition = "attachment"
    else:
        disposition = "attachment"
    headers["Content-Disposition"] = f"{disposition}; filename*=UTF-8''{quote(name)}"

    start, end, status = 0, None, 200
    if export_mime is None and meta.size is not None:
        headers["Accept-Ranges"] = "bytes"
        try:
            rng = _parse_range(request.headers.get("range"), meta.size)
        except HTTPException:
            await p.close()
            raise
        if rng:
            start, end = rng
            status = 206
            headers["Content-Range"] = f"bytes {start}-{end}/{meta.size}"
            headers["Content-Length"] = str(end - start + 1)
        else:
            headers["Content-Length"] = str(meta.size)

    async def body():
        try:
            async for chunk in p.download(id, start, end, export_mime):
                yield chunk
        finally:
            await p.close()

    return StreamingResponse(body(), status_code=status, media_type=media, headers=headers)


@router.post("/upload")
async def upload(request: Request, parent_id: str, name: str = Query(min_length=1, max_length=255),
                 acc: Account = Depends(owned_account), db: AsyncSession = Depends(get_db)):
    """Raw-body streaming upload: the browser sends the file bytes as the request body."""
    if "/" in name or "\\" in name:
        raise HTTPException(400, "Invalid file name")
    async with provider(acc, db) as p:
        return asdict(await p.upload(parent_id, name, request.stream()))
