"""Simple API-key auth + role guard for enterprise hardening."""

import os
from typing import Literal

from fastapi import Header, HTTPException

Role = Literal["viewer", "analyst", "admin"]


def _configured_keys() -> dict[str, str]:
    return {
        "viewer": os.getenv("VIEWER_API_KEY", ""),
        "analyst": os.getenv("ANALYST_API_KEY", ""),
        "admin": os.getenv("ADMIN_API_KEY", ""),
    }


def require_role(min_role: Role):
    order = {"viewer": 1, "analyst": 2, "admin": 3}

    def _guard(x_api_key: str | None = Header(default=None, alias="X-API-Key")):
        keys = _configured_keys()
        enabled = any(bool(v) for v in keys.values())
        if not enabled:
            return {"role": "admin"}

        role = None
        for r, key in keys.items():
            if key and x_api_key == key:
                role = r
                break

        if role is None:
            raise HTTPException(status_code=401, detail="Missing or invalid API key")

        if order[role] < order[min_role]:
            raise HTTPException(status_code=403, detail=f"{min_role} role required")

        return {"role": role}

    return _guard
