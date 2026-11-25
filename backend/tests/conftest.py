import os
import tempfile

import pytest
from httpx import ASGITransport, AsyncClient

# No DM_SECRET_KEY: the app must generate its own key in the data dir.
os.environ["DM_DATA_DIR"] = tempfile.mkdtemp()

H = {"x-requested-with": "drive-manager"}


@pytest.fixture
async def client(tmp_path, monkeypatch):
    from app import runtime
    from app.config import get_settings
    from app.db import Base, SessionLocal, engine
    from app.main import app

    monkeypatch.setattr(get_settings(), "local_root", tmp_path)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        await runtime.load(db)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def admin(client):
    r = await client.post("/api/auth/setup", json={"email": "me@example.com", "name": "Me", "password": "correct horse battery"})
    assert r.status_code == 200
    return client
