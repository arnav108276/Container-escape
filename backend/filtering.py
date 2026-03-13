"""Filtering helpers for internal/system containers."""

import os

IGNORED_CONTAINER_PREFIX = os.getenv("IGNORED_CONTAINER_PREFIX", "container-escape-daemon")


def is_ignored_container(container_id: str = "", container_name: str = "") -> bool:
    """Return True when a container should be excluded from UI/alerts/reports."""
    return (container_name or "").startswith(IGNORED_CONTAINER_PREFIX) or (container_id or "").startswith(IGNORED_CONTAINER_PREFIX)
