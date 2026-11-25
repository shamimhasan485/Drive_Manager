from tests.conftest import H


async def test_google_enabled_from_settings_page(admin):
    providers = {p["kind"]: p for p in (await admin.get("/api/accounts/providers")).json()}
    assert not providers["gdrive"]["configured"]

    page = (await admin.get("/api/admin/settings")).json()
    assert page["redirect_uris"]["gdrive"] == "http://test/api/accounts/oauth/gdrive/callback"
    assert page["secrets_set"]["google_client_secret"] is False

    r = await admin.put("/api/admin/settings", json={"google_client_id": "id.apps", "google_client_secret": "s3cret"}, headers=H)
    assert r.status_code == 200, r.text
    assert "s3cret" not in r.text and r.json()["secrets_set"]["google_client_secret"] is True
    providers = {p["kind"]: p for p in (await admin.get("/api/accounts/providers")).json()}
    assert providers["gdrive"]["configured"]

    # An empty secret leaves the saved one alone; null resets it.
    await admin.put("/api/admin/settings", json={"google_client_secret": ""}, headers=H)
    assert (await admin.get("/api/admin/settings")).json()["secrets_set"]["google_client_secret"] is True
    await admin.put("/api/admin/settings", json={"google_client_secret": None}, headers=H)
    assert (await admin.get("/api/admin/settings")).json()["secrets_set"]["google_client_secret"] is False


async def test_secret_is_encrypted_at_rest(admin):
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import AppSetting

    await admin.put("/api/admin/settings", json={"google_client_secret": "s3cret"}, headers=H)
    async with SessionLocal() as db:
        row = (await db.execute(select(AppSetting).where(AppSetting.key == "google_client_secret"))).scalar_one()
    assert "s3cret" not in row.value


async def test_public_url_and_validation(admin):
    r = await admin.put("/api/admin/settings", json={"public_url": "files.example.com"}, headers=H)
    assert r.status_code == 400
    r = await admin.put("/api/admin/settings", json={"public_url": "https://files.example.com/"}, headers=H)
    assert r.json()["redirect_uris"]["gdrive"] == "https://files.example.com/api/accounts/oauth/gdrive/callback"
    assert (await admin.put("/api/admin/settings", json={"nope": "x"}, headers=H)).status_code == 400


async def test_server_folder_toggle(admin):
    await admin.put("/api/admin/settings", json={"server_folder_enabled": False}, headers=H)
    kinds = [p["kind"] for p in (await admin.get("/api/accounts/providers")).json()]
    assert "local" not in kinds
    assert (await admin.post("/api/accounts/local", headers=H)).status_code == 400


async def test_family_users_and_passwords(admin, client):
    r = await admin.post("/api/admin/users", json={"email": "Kid@Example.com", "name": "Kid", "password": "0123456789ab"}, headers=H)
    assert r.status_code == 200 and r.json()["email"] == "kid@example.com"
    kid_id = r.json()["id"]
    users = (await admin.get("/api/admin/users")).json()
    me_id = next(u["id"] for u in users if u["is_admin"])

    # The only admin can't be demoted or delete themselves.
    assert (await admin.patch(f"/api/admin/users/{me_id}", json={"is_admin": False}, headers=H)).status_code == 400
    assert (await admin.delete(f"/api/admin/users/{me_id}", headers=H)).status_code == 400

    # Own password change needs the current one.
    assert (await admin.post("/api/auth/password", json={"current_password": "wrong", "new_password": "a-new-password"}, headers=H)).status_code == 400
    assert (await admin.post("/api/auth/password", json={"current_password": "correct horse battery", "new_password": "a-new-password"}, headers=H)).status_code == 200

    # Reset the kid's password, then sign in as them: they can't reach admin pages.
    await admin.patch(f"/api/admin/users/{kid_id}", json={"password": "kids-new-password"}, headers=H)
    r = await client.post("/api/auth/login", json={"email": "kid@example.com", "password": "kids-new-password"})
    assert r.status_code == 200
    assert (await client.get("/api/admin/settings")).status_code == 403

    # Back as admin: delete the kid.
    await client.post("/api/auth/login", json={"email": "me@example.com", "password": "a-new-password"})
    assert (await client.delete(f"/api/admin/users/{kid_id}", headers=H)).status_code == 200
    assert len((await client.get("/api/admin/users")).json()) == 1
