from datetime import datetime, timezone

from fastapi import Cookie, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import Account, Session, User
from ..security import hash_token

SESSION_COOKIE = "dm_session"


async def current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
    dm_session: str | None = Cookie(default=None),
) -> User:
    if not dm_session:
        raise HTTPException(401, "Not signed in")
    # Cheap CSRF defence: mutations must come from our own JS (custom header).
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get("x-requested-with") != "drive-manager":
        raise HTTPException(403, "Missing CSRF header")
    sess = await db.get(Session, hash_token(dm_session))
    if not sess or sess.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(401, "Session expired")
    user = await db.get(User, sess.user_id)
    if not user:
        raise HTTPException(401, "Not signed in")
    return user


async def owned_account(account_id: str, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> Account:
    acc = (await db.execute(select(Account).where(Account.id == account_id, Account.owner_id == user.id))).scalar_one_or_none()
    if not acc:
        raise HTTPException(404, "Account not found")
    return acc
