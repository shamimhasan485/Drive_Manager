"""Google Drive v3 adapter (REST via httpx)."""
import time
from collections.abc import AsyncIterator
from datetime import datetime
from urllib.parse import urlencode

import httpx

from ..config import get_settings
from .base import Capabilities, Entry, OAuthProvider, Page, ProviderError, Quota

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://www.googleapis.com/drive/v3"
UPLOAD_API = "https://www.googleapis.com/upload/drive/v3"
SCOPES = "https://www.googleapis.com/auth/drive openid email"
FOLDER_MIME = "application/vnd.google-apps.folder"
FIELDS = "id,name,mimeType,size,modifiedTime,parents,thumbnailLink,webViewLink"

# Native Google files have no bytes; download exports them instead.
EXPORTS = {
    "application/vnd.google-apps.document": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.google-apps.spreadsheet": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.google-apps.presentation": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.google-apps.drawing": "application/pdf",
}


class GoogleDriveProvider(OAuthProvider):
    kind = "gdrive"
    display_name = "Google Drive"
    capabilities = Capabilities(server_side_copy=True, thumbnails=True, share_links=True, trash=True)
    root_id = "root"

    def __init__(self, credentials: dict, on_refresh=None):
        self.creds = credentials
        self.on_refresh = on_refresh  # async callback to persist refreshed tokens
        self.http = httpx.AsyncClient(timeout=60)

    # ---- OAuth -------------------------------------------------------------
    @classmethod
    def authorize_url(cls, redirect_uri: str, state: str) -> str:
        s = get_settings()
        return AUTH_URL + "?" + urlencode({
            "client_id": s.google_client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": SCOPES,
            "access_type": "offline",
            "prompt": "consent select_account",
            "include_granted_scopes": "true",
            "state": state,
        })

    @classmethod
    async def exchange_code(cls, code: str, redirect_uri: str) -> tuple[dict, str | None]:
        s = get_settings()
        async with httpx.AsyncClient(timeout=30) as http:
            r = await http.post(TOKEN_URL, data={
                "code": code,
                "client_id": s.google_client_id,
                "client_secret": s.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            })
            if r.is_error:
                raise ProviderError(f"Google token exchange failed: {r.text}", 400)
            tok = r.json()
            info = await http.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {tok['access_token']}"},
            )
        creds = {
            "access_token": tok["access_token"],
            "refresh_token": tok.get("refresh_token"),
            "expires_at": time.time() + tok.get("expires_in", 3600),
        }
        return creds, info.json().get("email") if info.is_success else None

    async def _token(self) -> str:
        if self.creds.get("expires_at", 0) - 60 > time.time():
            return self.creds["access_token"]
        s = get_settings()
        r = await self.http.post(TOKEN_URL, data={
            "client_id": s.google_client_id,
            "client_secret": s.google_client_secret,
            "refresh_token": self.creds["refresh_token"],
            "grant_type": "refresh_token",
        })
        if r.is_error:
            raise ProviderError("Google session expired, reconnect this account", 401)
        tok = r.json()
        self.creds["access_token"] = tok["access_token"]
        self.creds["expires_at"] = time.time() + tok.get("expires_in", 3600)
        if self.on_refresh:
            await self.on_refresh(self.creds)
        return self.creds["access_token"]

    async def _req(self, method: str, url: str, **kw) -> httpx.Response:
        headers = kw.pop("headers", {}) | {"Authorization": f"Bearer {await self._token()}"}
        r = await self.http.request(method, url, headers=headers, **kw)
        if r.is_error:
            raise ProviderError(f"Google Drive: {r.status_code} {r.text[:300]}", r.status_code if r.status_code < 500 else 502)
        return r

    @staticmethod
    def _entry(f: dict) -> Entry:
        return Entry(
            id=f["id"],
            name=f["name"],
            is_folder=f["mimeType"] == FOLDER_MIME,
            size=int(f["size"]) if "size" in f else None,
            mime_type=f["mimeType"],
            modified_at=datetime.fromisoformat(f["modifiedTime"].replace("Z", "+00:00")) if "modifiedTime" in f else None,
            parent_ids=f.get("parents", []),
            thumbnail_url=f.get("thumbnailLink"),
            web_url=f.get("webViewLink"),
        )

    # ---- Operations --------------------------------------------------------
    async def about(self) -> Quota:
        q = (await self._req("GET", f"{API}/about", params={"fields": "storageQuota"})).json()["storageQuota"]
        return Quota(used=int(q.get("usage", 0)), total=int(q["limit"]) if "limit" in q else None)

    async def list(self, folder_id: str, page_token: str | None = None) -> Page:
        params = {
            "q": f"'{folder_id}' in parents and trashed = false",
            "fields": f"nextPageToken,files({FIELDS})",
            "pageSize": 1000,
            "orderBy": "folder,name_natural",
            "supportsAllDrives": "true",
            "includeItemsFromAllDrives": "true",
        }
        if page_token:
            params["pageToken"] = page_token
        data = (await self._req("GET", f"{API}/files", params=params)).json()
        return Page([self._entry(f) for f in data.get("files", [])], data.get("nextPageToken"))

    async def stat(self, item_id: str) -> Entry:
        r = await self._req("GET", f"{API}/files/{item_id}", params={"fields": FIELDS, "supportsAllDrives": "true"})
        return self._entry(r.json())

    async def mkdir(self, parent_id: str, name: str) -> Entry:
        r = await self._req("POST", f"{API}/files", params={"fields": FIELDS},
                            json={"name": name, "mimeType": FOLDER_MIME, "parents": [parent_id]})
        return self._entry(r.json())

    async def rename(self, item_id: str, new_name: str) -> Entry:
        r = await self._req("PATCH", f"{API}/files/{item_id}", params={"fields": FIELDS}, json={"name": new_name})
        return self._entry(r.json())

    async def move(self, item_id: str, new_parent_id: str) -> Entry:
        current = await self.stat(item_id)
        r = await self._req("PATCH", f"{API}/files/{item_id}", params={
            "fields": FIELDS, "addParents": new_parent_id, "removeParents": ",".join(current.parent_ids),
        })
        return self._entry(r.json())

    async def delete(self, item_id: str) -> None:
        # Move to trash rather than permanently deleting.
        await self._req("PATCH", f"{API}/files/{item_id}", json={"trashed": True})

    async def download(self, item_id: str) -> AsyncIterator[bytes]:
        meta = await self.stat(item_id)
        if meta.mime_type in EXPORTS:
            url, params = f"{API}/files/{item_id}/export", {"mimeType": EXPORTS[meta.mime_type]}
        else:
            url, params = f"{API}/files/{item_id}", {"alt": "media"}
        headers = {"Authorization": f"Bearer {await self._token()}"}
        async with self.http.stream("GET", url, params=params, headers=headers) as r:
            if r.is_error:
                raise ProviderError(f"Google Drive download failed: {r.status_code}")
            async for chunk in r.aiter_bytes():
                yield chunk

    async def upload(self, parent_id: str, name: str, stream: AsyncIterator[bytes]) -> Entry:
        # Resumable upload session; chunks must be multiples of 256 KiB except the last.
        init = await self._req("POST", f"{UPLOAD_API}/files", params={"uploadType": "resumable", "fields": FIELDS},
                               json={"name": name, "parents": [parent_id]})
        session_url = init.headers["Location"]
        chunk_size = 8 * 1024 * 1024
        buf, offset = bytearray(), 0

        async def send(data: bytes, final: bool) -> httpx.Response:
            end = offset + len(data) - 1
            total = str(offset + len(data)) if final else "*"
            rng = f"bytes {offset}-{end}/{total}" if data else f"bytes */{total}"
            return await self.http.put(session_url, content=bytes(data), headers={"Content-Range": rng})

        async for chunk in stream:
            buf.extend(chunk)
            while len(buf) >= chunk_size:
                r = await send(buf[:chunk_size], final=False)
                if r.status_code != 308:
                    raise ProviderError(f"Google Drive upload failed: {r.status_code} {r.text[:200]}")
                offset += chunk_size
                del buf[:chunk_size]
        r = await send(buf, final=True)
        if r.is_error:
            raise ProviderError(f"Google Drive upload failed: {r.status_code} {r.text[:200]}")
        return self._entry(r.json())

    async def search(self, query: str) -> Page:
        safe = query.replace("\\", "\\\\").replace("'", "\\'")
        data = (await self._req("GET", f"{API}/files", params={
            "q": f"name contains '{safe}' and trashed = false",
            "fields": f"nextPageToken,files({FIELDS})",
            "pageSize": 200,
        })).json()
        return Page([self._entry(f) for f in data.get("files", [])], data.get("nextPageToken"))

    async def close(self) -> None:
        await self.http.aclose()
