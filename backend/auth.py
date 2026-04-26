"""Enterprise authentication and RBAC helpers."""

import hashlib
import hmac
import os
from datetime import datetime, timedelta
from typing import Literal, Optional

import jwt
from fastapi import Header, HTTPException

Role = Literal["viewer", "analyst", "admin"]
ROLE_ORDER = {"viewer": 1, "analyst": 2, "admin": 3}


def _jwt_secret() -> str:
    return os.getenv("JWT_SECRET", "change-me-in-production")


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    expected = hash_password(plain_password)
    return hmac.compare_digest(expected, hashed_password)


def create_access_token(subject: str, role: Role, minutes: Optional[int] = None) -> str:
    expire_minutes = minutes or int(os.getenv("ACCESS_TOKEN_EXPIRE", "60"))
    expires_at = datetime.utcnow() + timedelta(minutes=expire_minutes)
    payload = {"sub": subject, "role": role, "exp": expires_at}
    return jwt.encode(payload, _jwt_secret(), algorithm="HS256")


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Access token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid access token") from exc


def _configured_keys() -> dict[str, str]:
    return {
        "viewer": os.getenv("VIEWER_API_KEY", ""),
        "analyst": os.getenv("ANALYST_API_KEY", ""),
        "admin": os.getenv("ADMIN_API_KEY", ""),
    }


def _role_from_api_key(x_api_key: Optional[str]) -> Optional[Role]:
    if not x_api_key:
        return None
    for role, key in _configured_keys().items():
        if key and hmac.compare_digest(x_api_key, key):
            return role  # type: ignore[return-value]
    return None


def _role_from_bearer(auth_header: Optional[str]) -> Optional[Role]:
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None
    claims = decode_access_token(token)
    role = claims.get("role")
    if role not in ROLE_ORDER:
        raise HTTPException(status_code=401, detail="Token is missing a valid role")
    return role


def require_role(min_role: Role):
    def _guard(
        authorization: str | None = Header(default=None, alias="Authorization"),
        x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    ):
        role = _role_from_bearer(authorization) or _role_from_api_key(x_api_key)

        # Dev fallback only when no auth configured at all.
        keys = _configured_keys()
        if role is None and not any(bool(v) for v in keys.values()) and os.getenv("ALLOW_AUTH_BYPASS", "false").lower() == "true":
            role = "admin"

        if role is None:
            raise HTTPException(status_code=401, detail="Unauthorized")

        if ROLE_ORDER[role] < ROLE_ORDER[min_role]:
            raise HTTPException(status_code=403, detail=f"{min_role} role required")

        return {"role": role}

    return _guard
