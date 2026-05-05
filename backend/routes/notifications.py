"""Email notification pipeline with retry queue."""

import os
import smtplib
from datetime import datetime, timedelta
from email.mime.text import MIMEText

from fastapi import APIRouter, HTTPException, Query, Request

router = APIRouter()


def _smtp_settings() -> dict[str, str | int]:
    return {
        "host": os.getenv("SMTP_SERVER", ""),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "username": os.getenv("SMTP_USERNAME", ""),
        "password": os.getenv("SMTP_PASSWORD", ""),
        "from_email": os.getenv("ALERT_EMAIL_FROM", "noreply@container-guardian.local"),
    }


def _send_email(to_email: str, subject: str, body: str) -> None:
    cfg = _smtp_settings()
    if not cfg["host"]:
        raise RuntimeError("SMTP host not configured")

    msg = MIMEText(body, "plain")
    msg["Subject"] = subject
    msg["From"] = str(cfg["from_email"])
    msg["To"] = to_email

    with smtplib.SMTP(str(cfg["host"]), int(cfg["port"])) as server:
        server.starttls()
        if cfg["username"]:
            server.login(str(cfg["username"]), str(cfg["password"]))
        server.sendmail(str(cfg["from_email"]), [to_email], msg.as_string())


@router.get("/notifications/config")
async def get_notification_config(request: Request):
    db = request.app.state.db
    doc = db.db.notification_config.find_one({"_id": "email"}) or {}
    return {
        "recipients": doc.get("recipients", []),
        "enabled": doc.get("enabled", False),
        "min_severity": doc.get("min_severity", "high"),
        "updated_at": doc.get("updated_at"),
    }


@router.post("/notifications/config")
async def update_notification_config(
    request: Request,
    enabled: bool = Query(True),
    min_severity: str = Query("high"),
    recipients_csv: str = Query("", alias="recipients"),
):
    db = request.app.state.db
    try:
        body = await request.json()
    except Exception:
        body = {}
    recipients = body.get("recipients", [])
    if not recipients and recipients_csv:
        recipients = [email.strip() for email in recipients_csv.split(",") if email.strip()]
    db.db.notification_config.update_one(
        {"_id": "email"},
        {
            "$set": {
                "enabled": enabled,
                "recipients": recipients,
                "min_severity": min_severity.lower(),
                "updated_at": datetime.utcnow(),
            }
        },
        upsert=True,
    )
    return {"status": "updated", "recipients": recipients, "enabled": enabled, "min_severity": min_severity.lower()}


@router.post("/notifications/queue/process")
async def process_email_queue(request: Request, batch_size: int = Query(50, ge=1, le=500)):
    """Process due queued email notifications."""
    db = request.app.state.db
    now = datetime.utcnow()
    jobs = list(
        db.db.notification_queue.find(
            {"status": "queued", "next_retry_at": {"$lte": now}}
        ).sort("created_at", 1).limit(batch_size)
    )
    sent = 0
    failed = 0
    for job in jobs:
        try:
            _send_email(job["to"], job["subject"], job["body"])
            db.db.notification_queue.update_one(
                {"_id": job["_id"]},
                {"$set": {"status": "sent", "sent_at": datetime.utcnow()}},
            )
            sent += 1
        except Exception as exc:
            retries = int(job.get("retries", 0)) + 1
            status = "failed" if retries >= 5 else "queued"
            next_retry = datetime.utcnow() + timedelta(minutes=min(60, 2 ** retries))
            db.db.notification_queue.update_one(
                {"_id": job["_id"]},
                {
                    "$set": {
                        "status": status,
                        "last_error": str(exc),
                        "retries": retries,
                        "next_retry_at": next_retry,
                    }
                },
            )
            failed += 1
    return {"status": "processed", "checked": len(jobs), "sent": sent, "failed": failed}
