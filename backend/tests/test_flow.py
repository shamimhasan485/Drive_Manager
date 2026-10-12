import pytest
from httpx import ASGITransport, AsyncClient

from app.config import get_settings
from app.db import init_db
from app.main import app
from app.security import decrypt_json, encrypt_json

H = {"x-requested-with": "drive-manager"}


@pytest.fixture
async def client(tmp_path, monkeypatch):
    monkeypatch.setattr(get_settings(), "local_root", tmp_path)
    await init_db()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


def test_token_encryption_roundtrip():
    blob = encrypt_json({"refresh_token": "abc"})
    assert "abc" not in blob
    assert decrypt_json(blob) == {"refresh_token": "abc"}


async def test_setup_connect_and_file_ops(client):
    assert (await client.get("/api/auth/status")).json() == {"needs_setup": True}
    r = await client.post("/api/auth/setup", json={"email": "me@example.com", "name": "Me", "password": "correct horse battery"})
    assert r.status_code == 200 and r.json()["is_admin"]
    assert (await client.post("/api/auth/setup", json={"email": "x@example.com", "name": "X", "password": "0123456789"})).status_code == 409

    # Mutations without the CSRF header are refused.
    assert (await client.post("/api/accounts/local")).status_code == 403
    acc = (await client.post("/api/accounts/local", headers=H)).json()
    base = f"/api/accounts/{acc['id']}/files"

    folder = (await client.post(f"{base}/folders", json={"parent_id": "", "name": "Photos"}, headers=H)).json()
    up = await client.post(f"{base}/upload", params={"parent_id": folder["id"], "name": "a.txt"}, content=b"hello", headers=H)
    assert up.status_code == 200, up.text
    listing = (await client.get(base, params={"folder_id": folder["id"]})).json()["entries"]
    assert [e["name"] for e in listing] == ["a.txt"]
    dl = await client.get(f"{base}/download", params={"id": up.json()["id"]})
    assert dl.content == b"hello"

    renamed = (await client.post(f"{base}/rename", params={"id": up.json()["id"]}, json={"name": "b.txt"}, headers=H)).json()
    assert renamed["name"] == "b.txt"
    assert (await client.get(f"{base}/search", params={"q": "b.t"})).json()["entries"][0]["name"] == "b.txt"
    assert (await client.get(f"{base}/download", params={"id": "../../etc/passwd"})).status_code == 400
    assert (await client.delete(base, params={"id": renamed["id"]}, headers=H)).status_code == 200
