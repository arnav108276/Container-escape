"""Reports API routes"""

from datetime import datetime
from typing import Optional

import structlog
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Request

log = structlog.get_logger(__name__)
router = APIRouter()


def _to_json_serializable(doc):
    """Convert MongoDB document to JSON-serializable format."""
    if doc is None:
        return None
    if isinstance(doc, list):
        return [_to_json_serializable(item) for item in doc]
    if isinstance(doc, dict):
        return {
            k: str(v) if isinstance(v, ObjectId) else v.isoformat() if hasattr(v, "isoformat") else _to_json_serializable(v)
            for k, v in doc.items()
            if k != "_id"
        }
    return doc


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
        reports = list(db.db.forensic_reports.find(query).sort("generated_at", -1).limit(limit))
        return {"total": len(reports), "reports": [_to_json_serializable(r) for r in reports]}
    except Exception as exc:
        log.error("Failed to list reports", error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to list reports") from exc


@router.get("/reports/{report_id}")
async def get_report(report_id: str, request: Request):
    """Get detailed forensic report."""
    try:
        db = request.app.state.db
        report = db.db.forensic_reports.find_one({"report_id": report_id})
        if not report:
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


@router.post("/reports/generate")
async def generate_report(
    container_id: str = Query(...),
    hours: int = Query(24, ge=1, le=168),
    request: Request = None,
):
    """Generate a comprehensive forensic report for a container."""
    try:
        db = request.app.state.db
        events = db.get_events(container_id=container_id, hours=hours, limit=10000)
        open_alerts = list(
            db.db.alerts.find({"container_id": container_id, "acknowledged": False}).sort("timestamp", -1).limit(200)
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
            "container_id": container_id,
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
