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


@router.get("/download")
async def download(id: str, acc: Account = Depends(owned_account), db: AsyncSession = Depends(get_db)):
    p: StorageProvider = open_provider(acc, db)
    try:
        meta = await p.stat(id)
    except ProviderError as e:
        await p.close()
        raise HTTPException(e.status, str(e))

    async def body():
        try:
            async for chunk in p.download(id):
                yield chunk
        finally:
            await p.close()

    headers = {"Content-Disposition": f"attachment; filename*=UTF-8''{quote(meta.name)}"}
    if meta.size is not None:
        headers["Content-Length"] = str(meta.size)
    return StreamingResponse(body(), media_type=meta.mime_type or "application/octet-stream", headers=headers)


@router.post("/upload")
async def upload(request: Request, parent_id: str, name: str = Query(min_length=1, max_length=255),
                 acc: Account = Depends(owned_account), db: AsyncSession = Depends(get_db)):
    """Raw-body streaming upload: the browser sends the file bytes as the request body."""
    if "/" in name or "\\" in name:
        raise HTTPException(400, "Invalid file name")
    async with provider(acc, db) as p:
        return asdict(await p.upload(parent_id, name, request.stream()))
