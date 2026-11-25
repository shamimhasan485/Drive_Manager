import base64
import hashlib
import json
import os
import secrets
import sys
from functools import lru_cache

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import get_settings

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def new_session_token() -> tuple[str, str]:
    """Return (token for the cookie, sha256 hash to store)."""
    token = secrets.token_urlsafe(32)
    return token, hash_token(token)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_key() -> str:
    return base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")


@lru_cache
def _key() -> bytes:
    """The encryption key: DM_SECRET_KEY if set, else data_dir/secret.key (created on first use)."""
    s = get_settings()
    raw = s.secret_key
    if not raw:
        path = s.data_dir / "secret.key"
        if not path.exists():
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as f:
                f.write(new_key())
        raw = path.read_text().strip()
    key = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
    if len(key) != 32:
        raise RuntimeError("The secret key must decode to 32 bytes")
    return key


def encrypt_json(data: dict) -> str:
    nonce = os.urandom(12)
    ct = AESGCM(_key()).encrypt(nonce, json.dumps(data).encode(), None)
    return base64.urlsafe_b64encode(nonce + ct).decode()


def decrypt_json(blob: str) -> dict:
    if not blob:
        return {}
    raw = base64.urlsafe_b64decode(blob)
    return json.loads(AESGCM(_key()).decrypt(raw[:12], raw[12:], None))


if __name__ == "__main__" and sys.argv[1:] == ["genkey"]:
    print(new_key())
