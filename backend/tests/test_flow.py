from app.config import get_settings
from app.security import decrypt_json, encrypt_json
from tests.conftest import H


def test_secret_key_generated_in_data_dir():
    encrypt_json({})
    key = get_settings().data_dir / "secret.key"
    assert key.exists() and len(key.read_text().strip()) == 43


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


async def test_preview_streaming_and_ranges(client):
    await client.post("/api/auth/setup", json={"email": "me@example.com", "name": "Me", "password": "correct horse battery"})
    acc = (await client.post("/api/accounts/local", headers=H)).json()
    base = f"/api/accounts/{acc['id']}/files"
    data = bytes(range(256)) * 4  # 1024 bytes
    up = (await client.post(f"{base}/upload", params={"parent_id": "", "name": "clip.mp4"}, content=data, headers=H)).json()

    full = await client.get(f"{base}/download", params={"id": up["id"], "inline": 1})
    assert full.status_code == 200 and full.content == data
    assert full.headers["content-type"] == "video/mp4"
    assert full.headers["content-disposition"].startswith("inline")
    assert full.headers["accept-ranges"] == "bytes"
    assert "sandbox" in full.headers["content-security-policy"]

    part = await client.get(f"{base}/download", params={"id": up["id"], "inline": 1}, headers={"Range": "bytes=100-199"})
    assert part.status_code == 206 and part.content == data[100:200]
    assert part.headers["content-range"] == "bytes 100-199/1024"
    tail = await client.get(f"{base}/download", params={"id": up["id"]}, headers={"Range": "bytes=-24"})
    assert tail.status_code == 206 and tail.content == data[-24:]
    open_end = await client.get(f"{base}/download", params={"id": up["id"]}, headers={"Range": "bytes=1000-"})
    assert open_end.content == data[1000:]
    bad = await client.get(f"{base}/download", params={"id": up["id"]}, headers={"Range": "bytes=5000-"})
    assert bad.status_code == 416

    # Uploaded HTML is never rendered as a page on this site.
    html = (await client.post(f"{base}/upload", params={"parent_id": "", "name": "x.html"}, content=b"<script>alert(1)</script>", headers=H)).json()
    r = await client.get(f"{base}/download", params={"id": html["id"], "inline": 1})
    assert r.headers["content-type"].startswith("text/plain") and "sandbox" in r.headers["content-security-policy"]
    svg = (await client.post(f"{base}/upload", params={"parent_id": "", "name": "x.svg"}, content=b"<svg/>", headers=H)).json()
    r = await client.get(f"{base}/download", params={"id": svg["id"], "inline": 1})
    assert "sandbox" in r.headers["content-security-policy"]
    pdf = (await client.post(f"{base}/upload", params={"parent_id": "", "name": "a.pdf"}, content=b"%PDF-1.4", headers=H)).json()
    r = await client.get(f"{base}/download", params={"id": pdf["id"], "inline": 1})
    assert r.headers["content-type"] == "application/pdf" and "content-security-policy" not in r.headers
    zipf = (await client.post(f"{base}/upload", params={"parent_id": "", "name": "a.zip"}, content=b"PK", headers=H)).json()
    r = await client.get(f"{base}/download", params={"id": zipf["id"], "inline": 1})
    assert r.headers["content-disposition"].startswith("attachment")
