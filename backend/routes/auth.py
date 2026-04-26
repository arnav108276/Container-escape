"""Enterprise auth + RBAC bootstrap routes."""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from auth import create_access_token, decode_access_token, hash_password, verify_password

router = APIRouter()


class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=256)


def _ensure_admin_user(db) -> None:
    existing = db.db.users.find_one({"username": "admin"})
    if existing:
        return
    default_password = "admin1234"
    db.db.users.insert_one(
        {
            "username": "admin",
            "password_hash": hash_password(default_password),
            "role": "admin",
            "created_at": datetime.utcnow(),
            "must_rotate_password": True,
        }
    )


@router.post("/auth/login")
async def login(payload: LoginRequest, request: Request):
    db = request.app.state.db
    _ensure_admin_user(db)

    user = db.db.users.find_one({"username": payload.username})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    role: Literal["viewer", "analyst", "admin"] = user.get("role", "viewer")
    token = create_access_token(payload.username, role)
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": role,
        "username": payload.username,
        "must_rotate_password": bool(user.get("must_rotate_password", False)),
    }


@router.get("/auth/me")
async def me(request: Request):
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    claims = decode_access_token(header.split(" ", 1)[1])
    return {
        "username": claims.get("sub"),
        "role": claims.get("role"),
        "expires_at": claims.get("exp"),
    }
