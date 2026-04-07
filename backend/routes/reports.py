"""Reports API routes"""

from datetime import datetime, timedelta
from typing import Optional

import structlog
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response
import csv
import io

from filtering import is_ignored_container

log = structlog.get_logger(__name__)
router = APIRouter()


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


def _simple_pdf_bytes(lines: list[str]) -> bytes:
    """
    Build a minimal single-page PDF without third-party dependencies.
    This keeps container image lean while still producing a downloadable PDF.
    """
    safe_lines = [line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") for line in lines]
    stream_parts = ["BT", "/F1 11 Tf", "50 790 Td", "14 TL"]
    for idx, line in enumerate(safe_lines):
        op = "Tj" if idx == 0 else "T* Tj"
        stream_parts.append(f"({line[:150]}) {op}")
    stream_parts.append("ET")
    stream = "\n".join(stream_parts).encode("latin-1", errors="ignore")

    objects = []
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    objects.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    objects.append(f"<< /Length {len(stream)} >>\nstream\n".encode("latin-1") + stream + b"\nendstream")

    content = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(content))
        content.extend(f"{i} 0 obj\n".encode("latin-1"))
        content.extend(obj)
        content.extend(b"\nendobj\n")

    xref_offset = len(content)
    content.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    content.extend(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        content.extend(f"{off:010} 00000 n \n".encode("latin-1"))
    content.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF".encode("latin-1")
    )
    return bytes(content)


@router.get("/reports/{report_id}/csv")
async def get_report_csv(report_id: str, request: Request):
    """Download report timeline as CSV."""
    report = await get_report(report_id, request)
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["timestamp", "event_type", "risk_score", "description", "container_id"])
    for event in report.get("timeline", []):
        writer.writerow(
            [
                event.get("timestamp", ""),
                event.get("event_type", ""),
                event.get("risk_score", 0),
                event.get("description", ""),
                event.get("container_id", report.get("container_id")),
            ]
        )

    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{report_id}.csv"'},
    )


@router.get("/reports/{report_id}/pdf")
async def get_report_pdf(report_id: str, request: Request):
    """Download report as a PDF executive summary."""
    report = await get_report(report_id, request)
    lines = [
        f"Forensic Report: {report.get('report_id')}",
        f"Container: {report.get('container_id')}",
        f"Generated: {report.get('generated_at')}",
        f"Window: {report.get('analysis_window_hours')} hours",
        f"Events: {report.get('event_count')}",
        f"Critical Events: {report.get('critical_events')}",
        f"High-risk Events: {report.get('high_risk_events')}",
        f"Open Alerts: {report.get('open_alert_count')}",
        "",
        "Summary:",
        report.get("summary", ""),
        "",
        "Recommendations:",
    ] + [f"- {rec}" for rec in report.get("recommendations", [])]
    pdf_bytes = _simple_pdf_bytes([str(line) for line in lines])
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{report_id}.pdf"'},
    )


@router.post("/reports/generate")
async def generate_report(
    container_id: str = Query(...),
    hours: int = Query(24, ge=1, le=168),
    request: Request = None,
):
    """Generate a comprehensive forensic report for a container."""
    try:
        db = request.app.state.db
        if is_ignored_container(container_id):
            raise HTTPException(status_code=404, detail="Container not found")

        container_ids = _resolve_container_ids(db, container_id)
        if any(is_ignored_container(cid) for cid in container_ids):
            raise HTTPException(status_code=404, detail="Container not found")
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

        report = {
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

        db.db.forensic_reports.insert_one(report)
        log.info("Report generated", container_id=container_id, report_id=report["report_id"])
        return _to_json_serializable(report)
    except Exception as exc:
        log.error("Failed to generate report", error=str(exc), container_id=container_id)
        raise HTTPException(status_code=500, detail="Failed to generate report") from exc


@router.post("/reports/schedule")
async def schedule_report(
    container_id: str = Query(...),
    hours: int = Query(24, ge=1, le=168),
    cadence_minutes: int = Query(60, ge=5, le=10080),
    request: Request = None,
):
    """Create/update scheduled report generation config."""
    db = request.app.state.db
    schedule = {
        "container_id": container_id,
        "hours": hours,
        "cadence_minutes": cadence_minutes,
        "enabled": True,
        "updated_at": datetime.utcnow(),
        "next_run_at": datetime.utcnow() + timedelta(minutes=cadence_minutes),
    }
    db.db.report_schedules.update_one({"container_id": container_id}, {"$set": schedule}, upsert=True)
    return {"status": "scheduled", **_to_json_serializable(schedule)}


@router.post("/reports/schedule/run")
async def run_due_schedules(request: Request):
    """Run due scheduled reports (manual trigger for now)."""
    db = request.app.state.db
    now = datetime.utcnow()
    due = list(db.db.report_schedules.find({"enabled": True, "next_run_at": {"$lte": now}}))
    generated = 0
    for schedule in due:
        await generate_report(
            container_id=schedule["container_id"],
            hours=int(schedule.get("hours", 24)),
            request=request,
        )
        db.db.report_schedules.update_one(
            {"_id": schedule["_id"]},
            {"$set": {"next_run_at": now + timedelta(minutes=int(schedule.get("cadence_minutes", 60)))}},
        )
        generated += 1
    return {"status": "ok", "generated": generated, "checked": len(due)}
