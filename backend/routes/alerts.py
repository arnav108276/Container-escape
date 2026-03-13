"""Alerts API routes"""

from datetime import datetime, timedelta
from typing import Optional

import structlog
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Request

from filtering import is_ignored_container
from models import Alert

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
            serialized["alert_id"] = str(doc["_id"])
        return serialized
    return doc


def _severity_from_risk(risk_score: int) -> tuple[str, str]:
    """Map risk score to severity and risk category."""
    if risk_score >= 75:
        return "critical", "CRITICAL"
    if risk_score >= 50:
        return "high", "HIGH"
    if risk_score >= 40:
        return "medium", "MEDIUM"
    return "low", "LOW"


@router.post("/alerts")
async def create_alert(alert: Alert, request: Request):
    """Receive security alert from daemon."""
    try:
        db = request.app.state.db

        container = db.db.containers.find_one({"container_id": alert.container_id})
        container_name = container.get("name") if container else (alert.container_name or "Unknown")

        if is_ignored_container(alert.container_id, container_name):
            return {
                "status": "ignored",
                "container_id": alert.container_id,
                "timestamp": alert.timestamp.isoformat(),
            }

        severity, risk_category = _severity_from_risk(alert.risk_score)

        existing_unack = db.db.alerts.find_one(
            {
                "container_id": alert.container_id,
                "event_type": alert.event_type,
                "acknowledged": False,
            }
        )

        if existing_unack:
            db.db.alerts.update_one(
                {"_id": existing_unack["_id"]},
                {
                    "$set": {
                        "timestamp": alert.timestamp,
                        "reason": alert.reason,
                        "risk_score": alert.risk_score,
                        "risk_category": alert.risk_category or risk_category,
                        "severity": alert.severity or severity,
                        "metadata": alert.metadata,
                    }
                },
            )
            return {
                "status": "updated",
                "container_id": alert.container_id,
                "timestamp": alert.timestamp.isoformat(),
                "message": "Alert updated (duplicate event type)",
            }

        db.db.alerts.insert_one(
            {
                "timestamp": alert.timestamp,
                "container_id": alert.container_id,
                "container_name": container_name,
                "event_type": alert.event_type,
                "reason": alert.reason,
                "risk_score": alert.risk_score,
                "risk_category": alert.risk_category or risk_category,
                "severity": alert.severity or severity,
                "acknowledged": False,
                "acknowledged_at": None,
                "acknowledged_by": None,
                "metadata": alert.metadata,
            }
        )

        return {
            "status": "accepted",
            "container_id": alert.container_id,
            "timestamp": alert.timestamp.isoformat(),
        }
    except Exception as exc:
        log.error("Failed to create alert", error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to create alert") from exc


@router.get("/alerts")
async def get_alerts(
    container_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    include_acknowledged: bool = Query(False),
    request: Request = None,
):
    """Get security alerts with optional filters."""
    try:
        db = request.app.state.db
        query = {} if include_acknowledged else {"acknowledged": False}
        if container_id:
            query["container_id"] = container_id

        alerts = list(db.db.alerts.find(query).sort("timestamp", -1).limit(limit * 2))
        filtered_alerts = [
            a for a in alerts
            if not is_ignored_container(a.get("container_id", ""), a.get("container_name", ""))
        ][:limit]
        return {"total": len(filtered_alerts), "alerts": [_to_json_serializable(a) for a in filtered_alerts]}
    except Exception as exc:
        log.error("Failed to get alerts", error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to fetch alerts") from exc


@router.get("/alerts/summary")
async def get_alert_summary(request: Request):
    """Get operational alert summary for dashboards."""
    try:
        db = request.app.state.db
        cutoff = datetime.utcnow() - timedelta(hours=24)

        open_query = {"acknowledged": False}
        open_alerts = [
            a for a in db.db.alerts.find(open_query).sort("timestamp", -1).limit(2000)
            if not is_ignored_container(a.get("container_id", ""), a.get("container_name", ""))
        ]
        recent_alerts = [
            a for a in db.db.alerts.find({"timestamp": {"$gte": cutoff}}).limit(5000)
            if not is_ignored_container(a.get("container_id", ""), a.get("container_name", ""))
        ]

        by_severity: dict[str, int] = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        for alert in open_alerts:
            sev = str(alert.get("severity", "low")).lower()
            by_severity[sev] = by_severity.get(sev, 0) + 1

        top_containers: dict[str, int] = {}
        for alert in recent_alerts:
            cid = alert.get("container_id", "unknown")
            top_containers[cid] = top_containers.get(cid, 0) + 1

        return {
            "open_alerts": len(open_alerts),
            "alerts_last_24h": len(recent_alerts),
            "by_severity": by_severity,
            "top_containers": sorted(
                [{"container_id": k, "count": v} for k, v in top_containers.items()],
                key=lambda x: x["count"],
                reverse=True,
            ),
        }
    except Exception as exc:
        log.error("Failed to get alert summary", error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to fetch alert summary") from exc


@router.get("/alerts/{alert_id}")
async def get_alert(alert_id: str, request: Request):
    """Get specific alert details."""
    db = request.app.state.db
    try:
        alert = db.db.alerts.find_one({"_id": ObjectId(alert_id)})
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid alert id") from exc

    if not alert or is_ignored_container(alert.get("container_id", ""), alert.get("container_name", "")):
        raise HTTPException(status_code=404, detail="Alert not found")

    return _to_json_serializable(alert)


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, request: Request):
    """Mark a single alert as acknowledged."""
    try:
        db = request.app.state.db
        body = await request.json() if request.headers.get("content-length") else {}
        acknowledged_by = body.get("acknowledged_by", "user") if isinstance(body, dict) else "user"

        result = db.db.alerts.update_one(
            {"_id": ObjectId(alert_id)},
            {
                "$set": {
                    "acknowledged": True,
                    "acknowledged_at": datetime.utcnow(),
                    "acknowledged_by": acknowledged_by,
                }
            },
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Alert not found")

        return {"status": "acknowledged", "alert_id": alert_id, "timestamp": datetime.utcnow().isoformat()}
    except HTTPException:
        raise
    except Exception as exc:
        log.error("Failed to acknowledge alert", error=str(exc), alert_id=alert_id)
        raise HTTPException(status_code=500, detail="Failed to acknowledge alert") from exc


@router.post("/alerts/acknowledge/multiple")
async def acknowledge_multiple_alerts(request: Request):
    """Mark multiple alerts as acknowledged."""
    try:
        db = request.app.state.db
        body = await request.json()
        alert_ids = body.get("alert_ids", [])
        acknowledged_by = body.get("acknowledged_by", "user")
        object_ids = [ObjectId(aid) for aid in alert_ids]

        result = db.db.alerts.update_many(
            {"_id": {"$in": object_ids}},
            {
                "$set": {
                    "acknowledged": True,
                    "acknowledged_at": datetime.utcnow(),
                    "acknowledged_by": acknowledged_by,
                }
            },
        )

        return {"status": "acknowledged", "count": result.modified_count, "timestamp": datetime.utcnow().isoformat()}
    except Exception as exc:
        log.error("Failed to acknowledge multiple alerts", error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to acknowledge multiple alerts") from exc


@router.post("/alerts/acknowledge/all")
async def acknowledge_all_alerts(request: Request):
    """Mark all unacknowledged alerts as acknowledged."""
    try:
        db = request.app.state.db
        body = await request.json() if request.headers.get("content-length") else {}
        acknowledged_by = body.get("acknowledged_by", "user") if isinstance(body, dict) else "user"

        result = db.db.alerts.update_many(
            {"acknowledged": False},
            {
                "$set": {
                    "acknowledged": True,
                    "acknowledged_at": datetime.utcnow(),
                    "acknowledged_by": acknowledged_by,
                }
            },
        )

        return {
            "status": "acknowledged",
            "message": f"All {result.modified_count} alerts acknowledged",
            "count": result.modified_count,
            "timestamp": datetime.utcnow().isoformat(),
        }
    except Exception as exc:
        log.error("Failed to acknowledge all alerts", error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to acknowledge all alerts") from exc
