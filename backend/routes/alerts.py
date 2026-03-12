"""Alerts API routes"""

from fastapi import APIRouter, Request, HTTPException
from models import Alert, SecurityEvent
from bson import ObjectId
from datetime import datetime
import structlog

log = structlog.get_logger(__name__)

router = APIRouter()


def _to_json_serializable(doc):
    """Convert MongoDB document to JSON-serializable format"""
    if doc is None:
        return None
    if isinstance(doc, list):
        return [_to_json_serializable(item) for item in doc]
    if isinstance(doc, dict):
        return {
            k: str(v) if isinstance(v, ObjectId) else 
               v.isoformat() if hasattr(v, 'isoformat') else 
               _to_json_serializable(v)
            for k, v in doc.items() if k != '_id'
        }
    return doc


@router.post("/alerts")
async def create_alert(alert: Alert, request: Request):
    """Receive security alert from daemon"""
    try:
        db = request.app.state.db
        
        log.info(
            "Alert received",
            container_id=alert.container_id,
            risk_score=alert.risk_score
        )
        
        # Lookup container name from containers collection
        container = db.db.containers.find_one({'container_id': alert.container_id})
        container_name = container.get('name') if container else 'Unknown'
        
        # Determine severity and category
        risk_score = alert.risk_score
        if risk_score >= 75:
            severity = 'critical'
            risk_category = 'CRITICAL'
        elif risk_score >= 50:
            severity = 'high'
            risk_category = 'HIGH'
        elif risk_score >= 40:
            severity = 'medium'
            risk_category = 'MEDIUM'
        else:
            severity = 'low'
            risk_category = 'LOW'
        
        # Insert into database
        db.insert_alert({
            'timestamp': alert.timestamp,
            'container_id': alert.container_id,
            'container_name': container_name,
            'reason': alert.reason,
            'risk_score': alert.risk_score,
            'risk_category': alert.risk_category or risk_category,
            'severity': alert.severity or severity,
            'metadata': alert.metadata
        })
        
        # TODO: Send to WebSocket connections
        
        return {
            'status': 'accepted',
            'container_id': alert.container_id,
            'timestamp': alert.timestamp.isoformat()
        }
    except Exception as e:
        log.error("Failed to create alert", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts")
async def get_alerts(
    container_id: str = None,
    limit: int = 100,
    request: Request = None
):
    """Get security alerts"""
    try:
        db = request.app.state.db
        alerts = db.get_alerts(container_id=container_id, limit=limit)
        
        return {
            'total': len(alerts),
            'alerts': [_to_json_serializable(a) for a in alerts]
        }
    except Exception as e:
        log.error("Failed to get alerts", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts/{alert_id}")
async def get_alert(alert_id: str, request: Request):
    """Get specific alert details"""
    try:
        db = request.app.state.db
        alert = db.db.alerts.find_one({'_id': ObjectId(alert_id)})
        
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")
        
        return _to_json_serializable(alert)
    except Exception as e:
        log.error("Failed to get alert", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
