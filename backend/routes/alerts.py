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
            event_type=alert.event_type,
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
        
        # Check if similar alert already exists (deduplication)
        # Only create new alert if different event_type or container_id
        existing_unack = db.db.alerts.find_one({
            'container_id': alert.container_id,
            'event_type': alert.event_type,
            'acknowledged': False
        })
        
        if existing_unack:
            # Update existing alert instead of creating new one
            log.info(
                "Alert already exists for container+event_type, updating timestamp",
                container_id=alert.container_id,
                event_type=alert.event_type
            )
            db.db.alerts.update_one(
                {'_id': existing_unack['_id']},
                {
                    '$set': {
                        'timestamp': alert.timestamp,
                        'reason': alert.reason,
                        'risk_score': alert.risk_score,
                        'risk_category': alert.risk_category or risk_category,
                        'severity': alert.severity or severity,
                    }
                }
            )
            return {
                'status': 'updated',
                'container_id': alert.container_id,
                'timestamp': alert.timestamp.isoformat(),
                'message': 'Alert updated (duplicate event type)'
            }
        
        # Insert new alert (different event type or no existing unack alert)
        db.db.alerts.insert_one({
            'timestamp': alert.timestamp,
            'container_id': alert.container_id,
            'container_name': container_name,
            'event_type': alert.event_type,
            'reason': alert.reason,
            'risk_score': alert.risk_score,
            'risk_category': alert.risk_category or risk_category,
            'severity': alert.severity or severity,
            'acknowledged': False,
            'acknowledged_at': None,
            'acknowledged_by': None,
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
    """Get unacknowledged security alerts"""
    try:
        db = request.app.state.db
        
        # Query only unacknowledged alerts
        query = {'acknowledged': False}
        if container_id:
            query['container_id'] = container_id
        
        alerts = list(db.db.alerts.find(query).sort('timestamp', -1).limit(limit))
        
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


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, request: Request):
    """Mark a single alert as acknowledged"""
    try:
        db = request.app.state.db
        
        body = await request.json() if request.headers.get('content-length') else {}
        acknowledged_by = body.get('acknowledged_by', 'user') if isinstance(body, dict) else 'user'
        
        result = db.db.alerts.update_one(
            {'_id': ObjectId(alert_id)},
            {
                '$set': {
                    'acknowledged': True,
                    'acknowledged_at': datetime.utcnow(),
                    'acknowledged_by': acknowledged_by
                }
            }
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Alert not found")
        
        log.info(
            "Alert acknowledged",
            alert_id=alert_id,
            acknowledged_by=acknowledged_by
        )
        
        return {
            'status': 'acknowledged',
            'alert_id': alert_id,
            'timestamp': datetime.utcnow().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        log.error("Failed to acknowledge alert", error=str(e), alert_id=alert_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/alerts/acknowledge/multiple")
async def acknowledge_multiple_alerts(request: Request):
    """Mark multiple alerts as acknowledged"""
    try:
        db = request.app.state.db
        
        body = await request.json()
        alert_ids = body.get('alert_ids', [])
        acknowledged_by = body.get('acknowledged_by', 'user')
        
        # Convert string IDs to ObjectId
        object_ids = [ObjectId(aid) for aid in alert_ids]
        
        result = db.db.alerts.update_many(
            {'_id': {'$in': object_ids}},
            {
                '$set': {
                    'acknowledged': True,
                    'acknowledged_at': datetime.utcnow(),
                    'acknowledged_by': acknowledged_by
                }
            }
        )
        
        log.info(
            "Multiple alerts acknowledged",
            count=result.modified_count,
            acknowledged_by=acknowledged_by
        )
        
        return {
            'status': 'acknowledged',
            'count': result.modified_count,
            'timestamp': datetime.utcnow().isoformat()
        }
    except Exception as e:
        log.error("Failed to acknowledge multiple alerts", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/alerts/acknowledge/all")
async def acknowledge_all_alerts(request: Request):
    """Mark all unacknowledged alerts as acknowledged"""
    try:
        db = request.app.state.db
        
        body = await request.json() if request.headers.get('content-length') else {}
        acknowledged_by = body.get('acknowledged_by', 'user') if isinstance(body, dict) else 'user'
        
        result = db.db.alerts.update_many(
            {'acknowledged': False},
            {
                '$set': {
                    'acknowledged': True,
                    'acknowledged_at': datetime.utcnow(),
                    'acknowledged_by': acknowledged_by
                }
            }
        )
        
        log.info(
            "All alerts acknowledged",
            count=result.modified_count,
            acknowledged_by=acknowledged_by
        )
        
        return {
            'status': 'acknowledged',
            'message': f'All {result.modified_count} alerts acknowledged',
            'count': result.modified_count,
            'timestamp': datetime.utcnow().isoformat()
        }
    except Exception as e:
        log.error("Failed to acknowledge all alerts", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
