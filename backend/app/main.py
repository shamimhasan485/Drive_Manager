from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import runtime
from .api import accounts, admin, auth, files
from .config import get_settings
from .db import SessionLocal, init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    async with SessionLocal() as db:
        await runtime.load(db)
    yield


app = FastAPI(title="Drive Manager", version="0.1.0", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(accounts.router)
app.include_router(files.router)
app.include_router(admin.router)


@app.get("/api/health")
async def health():
    return {"ok": True}


dist = get_settings().frontend_dist
if dist.is_dir():
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        candidate = dist / path
        if path and candidate.is_file() and dist in candidate.resolve().parents:
            return FileResponse(candidate)
        return FileResponse(dist / "index.html")
