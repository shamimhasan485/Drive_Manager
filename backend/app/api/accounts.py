import hmac
import secrets

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..models import Account, User
from ..providers.base import ProviderError
from ..providers.registry import OAUTH_PROVIDERS, available_providers, open_provider
from ..security import encrypt_json
from .deps import current_user, owned_account

router = APIRouter(prefix="/api/accounts", tags=["accounts"])

PALETTE = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6"]
STATE_COOKIE = "dm_oauth_state"


class AccountOut(BaseModel):
    id: str
    provider: str
    label: str
    external_email: str | None
    color: str
    root_id: str


class AccountPatch(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=120)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")


def _out(a: Account) -> AccountOut:
    root = "" if a.provider == "local" else "root"
    return AccountOut(id=a.id, provider=a.provider, label=a.label, external_email=a.external_email,
                      color=a.color, root_id=root)


async def _next_color(db: AsyncSession, user: User) -> str:
    n = len((await db.execute(select(Account.id).where(Account.owner_id == user.id))).all())
    return PALETTE[n % len(PALETTE)]


@router.get("/providers")
async def providers(user: User = Depends(current_user)):
    return available_providers()


@router.get("", response_model=list[AccountOut])
async def list_accounts(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Account).where(Account.owner_id == user.id).order_by(Account.created_at))).scalars()
    return [_out(a) for a in rows]


@router.patch("/{account_id}", response_model=AccountOut)
async def update_account(body: AccountPatch, acc: Account = Depends(owned_account), db: AsyncSession = Depends(get_db)):
    if body.label:
        acc.label = body.label
    if body.color:
        acc.color = body.color
    await db.commit()
    return _out(acc)


@router.delete("/{account_id}")
async def disconnect(acc: Account = Depends(owned_account), db: AsyncSession = Depends(get_db)):
    await db.delete(acc)
    await db.commit()
    return {"ok": True}


@router.get("/{account_id}/quota")
async def quota(acc: Account = Depends(owned_account), db: AsyncSession = Depends(get_db)):
    p = open_provider(acc, db)
    try:
        q = await p.about()
    except ProviderError as e:
        raise HTTPException(e.status, str(e))
    finally:
        await p.close()
    return {"used": q.used, "total": q.total}


@router.post("/local", response_model=AccountOut)
async def connect_local(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if not get_settings().local_root:
        raise HTTPException(400, "Server folders are disabled")
    acc = Account(owner_id=user.id, provider="local", label="Server folder", color=await _next_color(db, user),
                  settings={"subdir": user.id})
    db.add(acc)
    await db.commit()
    return _out(acc)


def _redirect_uri(provider: str) -> str:
    return f"{get_settings().public_url.rstrip('/')}/api/accounts/oauth/{provider}/callback"


@router.get("/oauth/{provider}/start")
async def oauth_start(provider: str, user: User = Depends(current_user)):
    cls = OAUTH_PROVIDERS.get(provider)
    if not cls:
        raise HTTPException(404, "Unknown provider")
    state = secrets.token_urlsafe(24)
    resp = RedirectResponse(cls.authorize_url(_redirect_uri(provider), state))
    resp.set_cookie(STATE_COOKIE, state, httponly=True, secure=get_settings().cookie_secure,
                    samesite="lax", max_age=600, path="/api/accounts/oauth")
    return resp


@router.get("/oauth/{provider}/callback")
async def oauth_callback(provider: str, code: str | None = None, state: str | None = None, error: str | None = None,
                         user: User = Depends(current_user), db: AsyncSession = Depends(get_db),
                         dm_oauth_state: str | None = Cookie(default=None)):
    if error:
        return RedirectResponse(f"/?connect_error={error}")
    cls = OAUTH_PROVIDERS.get(provider)
    if not cls or not code or not state or not dm_oauth_state or not hmac.compare_digest(state, dm_oauth_state):
        raise HTTPException(400, "Invalid OAuth callback")
    try:
        creds, email = await cls.exchange_code(code, _redirect_uri(provider))
    except ProviderError as e:
        raise HTTPException(e.status, str(e))

    existing = (await db.execute(select(Account).where(
        Account.owner_id == user.id, Account.provider == provider, Account.external_email == email,
    ))).scalar_one_or_none() if email else None
    if existing:  # reconnect: refresh stored credentials
        existing.credentials = encrypt_json(creds)
    else:
        db.add(Account(owner_id=user.id, provider=provider, label=email or cls.display_name, external_email=email,
                       color=await _next_color(db, user), credentials=encrypt_json(creds)))
    await db.commit()
    resp = RedirectResponse("/?connected=1")
    resp.delete_cookie(STATE_COOKIE, path="/api/accounts/oauth")
    return resp
