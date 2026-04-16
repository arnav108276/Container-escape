"""Reports API routes"""

import asyncio
import csv
import json
import os
import smtplib
import uuid
from datetime import datetime, timedelta
from email.message import EmailMessage
from io import StringIO
from typing import List, Literal, Optional

import structlog
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field

from filtering import is_ignored_container

log = structlog.get_logger(__name__)
router = APIRouter()


class ReportScheduleCreate(BaseModel):
    container_id: str
    hours: int = Field(24, ge=1, le=168)
    frequency: Literal["daily", "weekly", "monthly"] = "daily"
    time_of_day: str = Field("08:00")
    recipients: List[EmailStr] = []
    enabled: bool = True


def _to_json_serializable(doc):
    """Convert MongoDB document to JSON-serializable format."""
    if doc is None:
        return None
    if isinstance(doc, list):
        return [_to_json_serializable(item) for item in doc]
    if isinstance(doc, dict):
        serialized = {
            k: str(v) if isinstance(v, ObjectId) else v.isoformat() if hasattr(v, "isoformat") else _to_json_serializable(v)
            for k, v in doc.items()
            if k != "_id"
        }
        if doc.get("_id") is not None:
            serialized["id"] = str(doc["_id"])
        return serialized
    return doc


def _resolve_container_ids(db, container_id: str) -> list[str]:
    """Resolve short/full container IDs so reports include all matching events."""
    ids = {container_id}

    container = db.db.containers.find_one({"container_id": container_id})
    if container:
        if container.get("container_id"):
            ids.add(container["container_id"])
        if container.get("full_id"):
            ids.add(container["full_id"])

    by_full = db.db.containers.find_one({"full_id": container_id})
    if by_full:
        if by_full.get("container_id"):
            ids.add(by_full["container_id"])
        if by_full.get("full_id"):
            ids.add(by_full["full_id"])

    if len(container_id) >= 12:
        by_prefix = db.db.containers.find_one({"full_id": {"$regex": f"^{container_id}"}})
        if by_prefix:
            if by_prefix.get("container_id"):
                ids.add(by_prefix["container_id"])
            if by_prefix.get("full_id"):
                ids.add(by_prefix["full_id"])

    return [cid for cid in ids if cid]


def _get_recommendations(events: list, alerts: list) -> list:
    """Generate recommendations based on events and alerts."""
    recommendations = []

    if not events and not alerts:
        return ["No suspicious events observed in the analysis window. Continue baseline monitoring."]

    priv_esc = sum(1 for e in events if "PRIVILEGE_ESCALATION" in str(e.get("event_type", "")))
    if priv_esc > 0:
        recommendations.append("Investigate privilege escalation attempts and remove unnecessary container capabilities.")

    mounts = sum(1 for e in events if "MOUNT_ATTEMPT" in str(e.get("event_type", "")))
    if mounts > 0:
        recommendations.append("Review mount operations and validate no host filesystem paths are exposed to untrusted containers.")

    critical_alerts = sum(1 for a in alerts if str(a.get("risk_category", "")).upper() == "CRITICAL")
    if critical_alerts > 0:
        recommendations.append("Perform incident response on CRITICAL alerts, including container isolation and credential rotation.")

    if not recommendations:
        recommendations.append("No immediate critical findings. Continue monitoring and enforce least-privilege policies.")

    return recommendations


def _generate_markdown_report(report: dict) -> str:
    """Render report as markdown for export/download use cases."""
    lines = [
        f"# Forensic Report - {report['container_id']}",
        "",
        f"- **Report ID:** `{report['report_id']}`",
        f"- **Generated At:** {report['generated_at']}",
        f"- **Analysis Window (hours):** {report['analysis_window_hours']}",
        f"- **Total Events:** {report['event_count']}",
        f"- **Critical Events:** {report['critical_events']}",
        f"- **High Risk Events:** {report['high_risk_events']}",
        f"- **Open Alerts:** {report['open_alert_count']}",
        "",
        "## Executive Summary",
        report["summary"],
        "",
        "## Top Event Types",
    ]

    for event_type, count in report.get("top_event_types", {}).items():
        lines.append(f"- {event_type}: {count}")

    lines.extend(["", "## Recommendations"])
    for rec in report.get("recommendations", []):
        lines.append(f"- {rec}")

    lines.extend(["", "## Recent Alerts"])
    for alert in report.get("recent_alerts", [])[:10]:
        lines.append(
            f"- {alert.get('timestamp')} | {alert.get('event_type', 'UNKNOWN')} | risk={alert.get('risk_score', 0)} | {alert.get('reason', '')}"
        )

    return "\n".join(lines)


def _generate_csv_report(report: dict) -> str:
    """Generate a CSV fallback export for report timeline data."""
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp", "container_id", "event_type", "risk_score", "description", "filepath"])

    for event in report.get("timeline", []):
        writer.writerow([
            event.get("timestamp", ""),
            event.get("container_id", ""),
            event.get("event_type", ""),
            event.get("risk_score", ""),
            event.get("description", ""),
            event.get("filepath", ""),
        ])

    return output.getvalue()


def _parse_time_of_day(time_of_day: str) -> tuple[int, int]:
    try:
        hours, minutes = [int(part) for part in time_of_day.split(":")]
    except ValueError as exc:
        raise ValueError("time_of_day must be in HH:MM format") from exc
    if not (0 <= hours < 24 and 0 <= minutes < 60):
        raise ValueError("time_of_day must be in HH:MM format")
    return hours, minutes


def _calculate_next_run(frequency: str, time_of_day: str, start_at: Optional[datetime] = None) -> datetime:
    now = start_at or datetime.utcnow()
    hour, minute = _parse_time_of_day(time_of_day)
    candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if candidate <= now:
        if frequency == "daily":
            candidate += timedelta(days=1)
        elif frequency == "weekly":
            candidate += timedelta(days=7)
        else:
            candidate += timedelta(days=30)
    return candidate


def _send_report_email(report: dict, recipients: List[str]) -> None:
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_from = os.getenv("REPORT_EMAIL_FROM", f"no-reply@{smtp_host or 'security.local'}")
    use_tls = os.getenv("SMTP_USE_TLS", "true").strip().lower() in {"1", "true", "yes"}

    if not smtp_host or not smtp_user or not smtp_password:
        log.warning("SMTP not configured - report email will not be sent")
        return

    body = (
        f"Automated forensic report for container {report['container_id']}\n"
        f"Report ID: {report['report_id']}\n"
        f"Generated At: {report['generated_at']}\n"
    )

    message = EmailMessage()
    message["Subject"] = f"Forensic Report {report['report_id']}"
    message["From"] = smtp_from
    message["To"] = ", ".join(recipients)
    message.set_content(body)
    message.add_attachment(json.dumps(report, indent=2), filename=f"{report['report_id']}.json", subtype="json")
    message.add_attachment(_generate_markdown_report(report), filename=f"{report['report_id']}.md", subtype="markdown")

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as client:
            if use_tls:
                client.starttls()
            client.login(smtp_user, smtp_password)
            client.send_message(message)
            log.info("Scheduled report email sent", report_id=report["report_id"], recipients=recipients)
    except Exception as exc:
        log.error("Failed to send scheduled report email", error=str(exc), report_id=report["report_id"], recipients=recipients)


def _build_report(db, container_id: str, hours: int) -> dict:
    if is_ignored_container(container_id):
        raise ValueError("Container not found")

    container_ids = _resolve_container_ids(db, container_id)
    if any(is_ignored_container(cid) for cid in container_ids):
        raise ValueError("Container not found")

    event_query = {
        "timestamp": {"$gte": datetime.utcnow() - timedelta(hours=hours)},
        "container_id": {"$in": container_ids},
    }
    events = list(db.db.security_events.find(event_query).sort("timestamp", -1).limit(10000))
    open_alerts = list(
        db.db.alerts
        .find({"container_id": {"$in": container_ids}, "acknowledged": False})
        .sort("timestamp", -1)
        .limit(200)
    )

    top_event_types: dict[str, int] = {}
    risk_total = 0
    for event in events:
        event_type = event.get("event_type", "UNKNOWN")
        top_event_types[event_type] = top_event_types.get(event_type, 0) + 1
        risk_total += int(event.get("risk_score", 0) or 0)

    critical_events = sum(1 for e in events if int(e.get("risk_score", 0) or 0) >= 80)
    high_risk_events = sum(1 for e in events if int(e.get("risk_score", 0) or 0) >= 60)
    avg_risk = round(risk_total / len(events), 2) if events else 0

    return {
        "report_id": f"{container_id}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        "container_id": min(container_ids, key=len) if container_ids else container_id,
        "generated_at": datetime.utcnow(),
        "analysis_window_hours": hours,
        "event_count": len(events),
        "critical_events": critical_events,
        "high_risk_events": high_risk_events,
        "average_risk_score": avg_risk,
        "open_alert_count": len(open_alerts),
        "top_event_types": dict(sorted(top_event_types.items(), key=lambda item: item[1], reverse=True)[:8]),
        "recent_alerts": [_to_json_serializable(a) for a in open_alerts[:20]],
        "timeline": [_to_json_serializable(e) for e in events[:500]],
        "summary": (
            f"Comprehensive forensic analysis for container {container_id} over the last {hours} hours. "
            f"Detected {len(events)} runtime events with average risk score {avg_risk}. "
            f"Open alerts: {len(open_alerts)}."
        ),
        "recommendations": _get_recommendations(events, open_alerts),
    }


def _schedule_to_json_serializable(schedule: dict) -> dict:
    return _to_json_serializable(schedule)


def _process_schedule(schedule: dict, db) -> None:
    try:
        report = _build_report(db, schedule["container_id"], schedule["hours"])
        db.db.forensic_reports.insert_one(report)
        next_run = _calculate_next_run(schedule["frequency"], schedule.get("time_of_day", "08:00"))

        update_fields = {
            "last_run": datetime.utcnow(),
            "next_run": next_run,
            "last_report_id": report["report_id"],
        }
        db.db.forensic_report_schedules.update_one(
            {"schedule_id": schedule["schedule_id"]},
            {"$set": update_fields},
        )

        if schedule.get("recipients"):
            _send_report_email(report, schedule["recipients"])
    except Exception as exc:
        log.error(
            "Scheduled report execution failed",
            schedule_id=schedule.get("schedule_id"),
            error=str(exc),
        )


async def run_report_scheduler(app):
    while True:
        try:
            db = app.state.db
            now = datetime.utcnow()
            schedules = list(db.db.forensic_report_schedules.find({"enabled": True, "next_run": {"$lte": now}}))
            for schedule in schedules:
                _process_schedule(schedule, db)
        except Exception as exc:
            log.error("Report scheduler background task failed", error=str(exc))
        await asyncio.sleep(60)


@router.get("/reports")
async def list_reports(
    container_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    request: Request = None,
):
    """List forensic reports."""
    try:
        db = request.app.state.db
        query = {"container_id": container_id} if container_id else {}
        reports = list(db.db.forensic_reports.find(query).sort("generated_at", -1).limit(limit * 2))
        filtered_reports = [
            r for r in reports
            if not is_ignored_container(r.get("container_id", ""))
        ][:limit]
        return {"total": len(filtered_reports), "reports": [_to_json_serializable(r) for r in filtered_reports]}
    except Exception as exc:
        log.error("Failed to list reports", error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to list reports") from exc


@router.get("/reports/{report_id}")
async def get_report(report_id: str, request: Request):
    """Get detailed forensic report."""
    try:
        db = request.app.state.db
        report = db.db.forensic_reports.find_one({"report_id": report_id})
        if not report or is_ignored_container(report.get("container_id", "")):
            raise HTTPException(status_code=404, detail="Report not found")
        return _to_json_serializable(report)
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to get report", error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to get report") from exc


@router.get("/reports/{report_id}/markdown")
async def get_report_markdown(report_id: str, request: Request):
    """Get markdown-formatted forensic report content."""
    report = await get_report(report_id, request)
    return {
        "report_id": report_id,
        "markdown": _generate_markdown_report(report),
        "generated_at": datetime.utcnow().isoformat(),
    }


@router.get("/reports/{report_id}/export")
async def export_report(report_id: str, format: str = Query("json", regex="^(json|csv|markdown)$"), request: Request = None):
    """Export forensic report in JSON, CSV, or markdown."""
    report = await get_report(report_id, request)
    if format == "json":
        content = json.dumps(report, indent=2)
        media_type = "application/json"
        extension = "json"
    elif format == "csv":
        content = _generate_csv_report(report)
        media_type = "text/csv"
        extension = "csv"
    else:
        content = _generate_markdown_report(report)
        media_type = "text/markdown"
        extension = "md"

    headers = {
        "Content-Disposition": f"attachment; filename=forensic_report_{report_id}.{extension}"
    }
    return Response(content, media_type=media_type, headers=headers)


@router.post("/reports/generate")
async def generate_report(
    container_id: str = Query(...),
    hours: int = Query(24, ge=1, le=168),
    request: Request = None,
):
    """Generate a comprehensive forensic report for a container."""
    try:
        db = request.app.state.db
        report = _build_report(db, container_id, hours)
        db.db.forensic_reports.insert_one(report)
        log.info("Report generated", container_id=container_id, report_id=report["report_id"])
        return _to_json_serializable(report)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        log.error("Failed to generate report", error=str(exc), container_id=container_id)
        raise HTTPException(status_code=500, detail="Failed to generate report") from exc


@router.post("/reports/schedules")
async def create_report_schedule(request: Request, schedule: ReportScheduleCreate):
    """Create a scheduled report."""
    try:
        db = request.app.state.db
        if is_ignored_container(schedule.container_id):
            raise HTTPException(status_code=404, detail="Container not found")

        schedule_id = f"{schedule.container_id}_{uuid.uuid4().hex[:8]}"
        schedule_doc = {
            **schedule.dict(),
            "schedule_id": schedule_id,
            "created_at": datetime.utcnow(),
            "last_run": None,
            "next_run": _calculate_next_run(schedule.frequency, schedule.time_of_day),
            "last_report_id": None,
        }
        db.db.forensic_report_schedules.insert_one(schedule_doc)
        return _to_json_serializable(schedule_doc)
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to create report schedule", error=str(exc), container_id=schedule.container_id)
        raise HTTPException(status_code=500, detail="Failed to create report schedule") from exc


@router.get("/reports/schedules")
async def list_report_schedules(
    container_id: Optional[str] = Query(None),
    request: Request = None,
):
    """List scheduled reports."""
    try:
        db = request.app.state.db
        query = {"container_id": container_id} if container_id else {}
        schedules = list(db.db.forensic_report_schedules.find(query).sort("next_run", 1))
        return {"total": len(schedules), "schedules": [_schedule_to_json_serializable(s) for s in schedules]}
    except Exception as exc:
        log.error("Failed to list report schedules", error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to list report schedules") from exc


@router.delete("/reports/schedules/{schedule_id}")
async def delete_report_schedule(schedule_id: str, request: Request):
    """Delete a scheduled report."""
    try:
        db = request.app.state.db
        result = db.db.forensic_report_schedules.delete_one({"schedule_id": schedule_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Scheduled report not found")
        return {"deleted": True, "schedule_id": schedule_id}
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to delete report schedule", error=str(exc), schedule_id=schedule_id)
        raise HTTPException(status_code=500, detail="Failed to delete report schedule") from exc


@router.post("/reports/schedules/{schedule_id}/run")
async def run_report_schedule(schedule_id: str, request: Request):
    """Run a scheduled report immediately."""
    try:
        db = request.app.state.db
        schedule = db.db.forensic_report_schedules.find_one({"schedule_id": schedule_id})
        if not schedule:
            raise HTTPException(status_code=404, detail="Scheduled report not found")

        report = _build_report(db, schedule["container_id"], schedule["hours"])
        db.db.forensic_reports.insert_one(report)
        next_run = _calculate_next_run(schedule["frequency"], schedule.get("time_of_day", "08:00"))
        db.db.forensic_report_schedules.update_one(
            {"schedule_id": schedule_id},
            {
                "$set": {
                    "last_run": datetime.utcnow(),
                    "next_run": next_run,
                    "last_report_id": report["report_id"],
                }
            },
        )

        if schedule.get("recipients"):
            _send_report_email(report, schedule["recipients"])

        return _to_json_serializable(report)
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to run scheduled report", error=str(exc), schedule_id=schedule_id)
        raise HTTPException(status_code=500, detail="Failed to run scheduled report") from exc
