"""Admin-only: app settings and family user management."""
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import runtime
from ..db import get_db
from ..models import Account, Session, User
from ..security import hash_password
from .accounts import redirect_uri
from .auth import UserOut, _out
from .deps import admin_user, public_base_url

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(admin_user)])


# ---- Settings ----------------------------------------------------------------

@router.get("/settings")
async def get_settings_page(request: Request):
    values, secrets_set = {}, {}
    for key, opt in runtime.OPTIONS.items():
        if opt.secret:
            secrets_set[key] = bool(runtime.get(key))
        else:
            values[key] = runtime.get(key)
    return {
        "values": values,
        "secrets_set": secrets_set,
        "defaults": {"server_folder_path": runtime.default("server_folder_path")},
        "detected_url": str(request.base_url).rstrip("/"),
        "effective_url": public_base_url(request),
        "redirect_uris": {p: redirect_uri(request, p) for p in ("gdrive", "dropbox", "box")},
    }


@router.put("/settings")
async def update_settings(updates: dict[str, str | bool | None], request: Request, db: AsyncSession = Depends(get_db)):
    """Body: the options to change. A secret sent as "" is left unchanged; null resets an option to its default."""
    clean: dict[str, object] = {}
    for key, value in updates.items():
        opt = runtime.OPTIONS.get(key)
        if not opt:
            raise HTTPException(400, f"Unknown setting: {key}")
        if value is None:
            clean[key] = None
            continue
        if not isinstance(value, opt.kind):
            raise HTTPException(400, f"{key} must be a {opt.kind.__name__}")
        if isinstance(value, str):
            value = value.strip()
            if opt.secret and not value:
                continue
        if key == "public_url" and value and not str(value).startswith(("http://", "https://")):
            raise HTTPException(400, "The web address must start with http:// or https://")
        if key == "server_folder_path" and value:
            try:
                Path(str(value)).mkdir(parents=True, exist_ok=True)
            except OSError as e:
                raise HTTPException(400, f"Can't use that folder: {e}")
        clean[key] = value
    await runtime.save(db, clean)
    return await get_settings_page(request)


# ---- Users -------------------------------------------------------------------

class NewUser(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=10)
    is_admin: bool = False


class UserPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    is_admin: bool | None = None
    password: str | None = Field(default=None, min_length=10)


async def _admin_count(db: AsyncSession) -> int:
    return (await db.execute(select(func.count()).select_from(User).where(User.is_admin))).scalar_one()


@router.get("/users", response_model=list[UserOut])
async def list_users(db: AsyncSession = Depends(get_db)):
    return [_out(u) for u in (await db.execute(select(User).order_by(User.created_at))).scalars()]


@router.post("/users", response_model=UserOut)
async def create_user(body: NewUser, db: AsyncSession = Depends(get_db)):
    email = body.email.lower()
    if (await db.execute(select(User).where(User.email == email))).scalar_one_or_none():
        raise HTTPException(409, "Email already in use")
    user = User(email=email, name=body.name, password_hash=hash_password(body.password), is_admin=body.is_admin)
    db.add(user)
    await db.commit()
    return _out(user)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(user_id: str, body: UserPatch, db: AsyncSession = Depends(get_db),
                      me: User = Depends(admin_user)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if body.is_admin is False and user.is_admin and await _admin_count(db) <= 1:
        raise HTTPException(400, "There must be at least one admin")
    if body.name:
        user.name = body.name
    if body.is_admin is not None:
        user.is_admin = body.is_admin
    if body.password:
        user.password_hash = hash_password(body.password)
        if user.id != me.id:  # sign them out everywhere
            await db.execute(delete(Session).where(Session.user_id == user.id))
    await db.commit()
    return _out(user)


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, db: AsyncSession = Depends(get_db), me: User = Depends(admin_user)):
    if user_id == me.id:
        raise HTTPException(400, "You can't delete your own account")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    await db.execute(delete(Session).where(Session.user_id == user.id))
    await db.execute(delete(Account).where(Account.owner_id == user.id))
    await db.execute(delete(User).where(User.id == user.id))
    await db.commit()
    return {"ok": True}
