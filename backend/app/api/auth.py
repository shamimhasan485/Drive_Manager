from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_db
from ..models import Session, User
from ..security import hash_password, hash_token, new_session_token, verify_password
from .deps import SESSION_COOKIE, current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class SetupBody(Credentials):
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=10)


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    is_admin: bool


def _out(u: User) -> UserOut:
    return UserOut(id=u.id, email=u.email, name=u.name, is_admin=u.is_admin)


async def _start_session(db: AsyncSession, user: User, response: Response) -> None:
    s = get_settings()
    token, token_hash = new_session_token()
    expires = datetime.now(timezone.utc) + timedelta(days=s.session_days)
    db.add(Session(token_hash=token_hash, user_id=user.id, expires_at=expires))
    await db.commit()
    response.set_cookie(SESSION_COOKIE, token, httponly=True, secure=s.cookie_secure, samesite="lax",
                        max_age=s.session_days * 86400, path="/")


@router.get("/status")
async def status(db: AsyncSession = Depends(get_db)):
    """Tells the UI whether first-run setup is needed."""
    count = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    return {"needs_setup": count == 0}


@router.post("/setup", response_model=UserOut)
async def setup(body: SetupBody, response: Response, db: AsyncSession = Depends(get_db)):
    """Create the first (admin) user. Only works while there are no users."""
    if (await db.execute(select(func.count()).select_from(User))).scalar_one():
        raise HTTPException(409, "Already set up")
    user = User(email=body.email.lower(), name=body.name, password_hash=hash_password(body.password), is_admin=True)
    db.add(user)
    await db.flush()
    await _start_session(db, user, response)
    return _out(user)


@router.post("/login", response_model=UserOut)
async def login(body: Credentials, response: Response, db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == body.email.lower()))).scalar_one_or_none()
    if not user or not verify_password(user.password_hash, body.password):
        raise HTTPException(401, "Wrong email or password")
    await _start_session(db, user, response)
    return _out(user)


@router.post("/logout")
async def logout(response: Response, db: AsyncSession = Depends(get_db), user: User = Depends(current_user),
                 dm_session: str | None = Cookie(default=None)):
    response.delete_cookie(SESSION_COOKIE, path="/")
    if dm_session:
        await db.execute(delete(Session).where(Session.token_hash == hash_token(dm_session)))
        await db.commit()
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(current_user)):
    return _out(user)


@router.post("/users", response_model=UserOut)
async def create_user(body: SetupBody, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Admins add family members."""
    if not user.is_admin:
        raise HTTPException(403, "Admins only")
    if (await db.execute(select(User).where(User.email == body.email.lower()))).scalar_one_or_none():
        raise HTTPException(409, "Email already in use")
    new = User(email=body.email.lower(), name=body.name, password_hash=hash_password(body.password))
    db.add(new)
    await db.commit()
    return _out(new)
