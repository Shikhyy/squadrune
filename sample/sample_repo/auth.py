"""
auth.py — User Authentication Module (BEFORE state)

This is the existing auth module before the PR diff is applied.
"""
import os
import hashlib
import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Standard application error with a machine-readable code."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(f"[{code}] {message}")


def hash_password(password: str) -> str:
    """Hash a password using bcrypt (via passlib)."""
    import bcrypt
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode(), salt).decode()


def verify_password(password: str, hashed: str) -> bool:
    """Verify a bcrypt-hashed password."""
    import bcrypt
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except Exception:
        return False


def create_token(user_id: str, secret: str, ttl: int = 3600) -> str:
    """Create a simple HMAC-signed token."""
    import hmac
    expiry = int((datetime.utcnow() + timedelta(seconds=ttl)).timestamp())
    payload = f"{user_id}:{expiry}"
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{signature}"
