"""Filtering helpers for internal/system containers."""

import os

DEFAULT_IGNORED_PREFIXES = "container-escape-,container-security-,major2-daemon,major2-backend,major2-frontend,major2-mongodb"
IGNORED_CONTAINER_PREFIXES = [
    p.strip() for p in os.getenv("IGNORED_CONTAINER_PREFIXES", DEFAULT_IGNORED_PREFIXES).split(",") if p.strip()
]


def is_ignored_container(container_id: str = "", container_name: str = "") -> bool:
    """Return True when a container should be excluded from UI/alerts/reports."""
    cid = container_id or ""
    cname = container_name or ""
    return any(cname.startswith(prefix) or cid.startswith(prefix) for prefix in IGNORED_CONTAINER_PREFIXES)
