"""Containers API routes"""

from fastapi import APIRouter, Request, HTTPException, Body
from models import QuarantineRequest, Container
from bson import ObjectId
import structlog
from datetime import datetime, timedelta

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


def _calculate_container_risk(db, container_id: str) -> tuple[str, int]:
    """
    Calculate risk level for a container based on associated alerts and events
    
    Returns:
        Tuple of (risk_level_string, risk_score_int)
    """
    try:
        cutoff_24h = datetime.utcnow() - timedelta(hours=24)
        
        # Get alerts for this container in last 24 hours
        alerts = list(db.db.alerts.find({
            'container_id': container_id,
            'timestamp': {'$gte': cutoff_24h}
        }))
        
        # Get events for this container in last 24 hours
        events = list(db.db.security_events.find({
            'container_id': container_id,
            'timestamp': {'$gte': cutoff_24h}
        }))
        
        if not alerts and not events:
            return ('LOW', 0)
        
        # Calculate average risk score from alerts and events
        scores = []
        for alert in alerts:
            scores.append(alert.get('risk_score', 0))
        for event in events:
            scores.append(event.get('risk_score', 0))
        
        if scores:
            avg_risk = sum(scores) / len(scores)
            
            # Determine risk level
            if avg_risk >= 80:
                risk_level = 'CRITICAL'
            elif avg_risk >= 60:
                risk_level = 'HIGH'
            elif avg_risk >= 40:
                risk_level = 'MEDIUM'
            else:
                risk_level = 'LOW'
            
            return (risk_level, int(avg_risk))
        
        return ('LOW', 0)
    except Exception as e:
        log.error("Error calculating container risk", error=str(e))
        return ('LOW', 0)


@router.post("/containers/sync")
async def sync_containers(request: Request):
    """Receive container list from daemon and save to database"""
    try:
        body = await request.json()
        containers = body.get('containers', [])
        
        db = request.app.state.db
        
        # Clear old containers and insert new ones
        db.db.containers.delete_many({})
        
        for container in containers:
            db.db.containers.insert_one({
                'container_id': container.get('container_id'),
                'full_id': container.get('full_id'),
                'name': container.get('name'),
                'image': container.get('image'),
                'status': container.get('status', 'running'),
                'risk_level': 'LOW',  # Will be calculated on retrieval
                'alert_count': 0,  # Will be calculated on retrieval
                'quarantined': container.get('quarantined', False),
                'synced_at': datetime.utcnow()
            })
        
        log.info("Containers synchronized", count=len(containers))
        
        return {
            'status': 'synced',
            'count': len(containers)
        }
    except Exception as e:
        log.error("Failed to sync containers", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/containers")
async def list_containers(request: Request):
    """List all containers and their status with calculated risk levels"""
    try:
        db = request.app.state.db
        containers = list(db.db.containers.find({}))
        
        # Enrich containers with calculated risk levels and alert counts
        enriched_containers = []
        for container in containers:
            container_id = container.get('container_id')
            
            # Calculate risk level
            risk_level, risk_score = _calculate_container_risk(db, container_id)
            
            # Count alerts
            cutoff_24h = datetime.utcnow() - timedelta(hours=24)
            alert_count = db.db.alerts.count_documents({
                'container_id': container_id,
                'timestamp': {'$gte': cutoff_24h}
            })
            
            # Enrich container data
            enriched = _to_json_serializable(container)
            enriched['risk_level'] = risk_level
            enriched['risk_score'] = risk_score
            enriched['alert_count'] = alert_count
            enriched['status'] = 'quarantined' if container.get('quarantined') else container.get('status', 'running')
            
            enriched_containers.append(enriched)
        
        return {
            'total': len(enriched_containers),
            'containers': enriched_containers
        }
    except Exception as e:
        log.error("Failed to list containers", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/containers/{container_id}")
async def get_container_status(container_id: str, request: Request):
    """Get container status and details"""
    try:
        db = request.app.state.db
        container = db.db.containers.find_one({'container_id': container_id})
        
        if not container:
            raise HTTPException(status_code=404, detail="Container not found")
        
        # Calculate risk level
        risk_level, risk_score = _calculate_container_risk(db, container_id)
        
        # Get recent events for this container
        cutoff_24h = datetime.utcnow() - timedelta(hours=24)
        events = list(db.db.security_events.find({
            'container_id': container_id,
            'timestamp': {'$gte': cutoff_24h}
        }).sort('timestamp', -1).limit(20))
        
        # Enrich response
        enriched = _to_json_serializable(container)
        enriched['risk_level'] = risk_level
        enriched['risk_score'] = risk_score
        enriched['recent_events'] = [_to_json_serializable(e) for e in events]
        
        return enriched
    except Exception as e:
        log.error("Failed to get container status", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/containers/{container_id}/quarantine")
async def quarantine_container(
    container_id: str,
    req: Request,
    body: QuarantineRequest = Body(...)
):
    """Quarantine a container"""
    try:
        db = req.app.state.db
        
        # Update container status to quarantined
        db.db.containers.update_one(
            {'container_id': container_id},
            {
                '$set': {
                    'status': 'quarantined',
                    'quarantined': True,
                    'updated_at': datetime.utcnow()
                }
            },
            upsert=True
        )
        
        # Log action
        log.warning(
            "Container quarantined",
            container_id=container_id,
            reason=body.reason,
            approved_by=body.approved_by
        )
        
        return {
            'status': 'success',
            'container_id': container_id,
            'quarantine_status': 'quarantined',
            'reason': body.reason,
            'approved_by': body.approved_by
        }
    except Exception as e:
        log.error("Failed to quarantine container", error=str(e), container_id=container_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/containers/{container_id}/unquarantine")
async def unquarantine_container(
    container_id: str,
    approved_by: str,
    req: Request
):
    """Restore a quarantined container"""
    try:
        db = req.app.state.db
        
        # Update container status
        db.db.containers.update_one(
            {'container_id': container_id},
            {
                '$set': {
                    'status': 'running',
                    'quarantined': False,
                    'updated_at': datetime.utcnow()
                }
            }
        )
        
        log.info(
            "Container unquarantined",
            container_id=container_id,
            approved_by=approved_by
        )
        
        return {
            'status': 'success',
            'container_id': container_id,
            'quarantine_status': 'unquarantined'
        }
    except Exception as e:
        log.error("Failed to unquarantine container", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/containers/{container_id}/risk")
async def get_container_risk(container_id: str, request: Request):
    """Get container risk assessment"""
    try:
        db = request.app.state.db
        
        # Calculate risk
        risk_level, risk_score = _calculate_container_risk(db, container_id)
        
        # Get event counts
        cutoff_24h = datetime.utcnow() - timedelta(hours=24)
        event_count = db.db.security_events.count_documents({
            'container_id': container_id,
            'timestamp': {'$gte': cutoff_24h}
        })
        
        critical_events = db.db.security_events.count_documents({
            'container_id': container_id,
            'risk_score': {'$gte': 80},
            'timestamp': {'$gte': cutoff_24h}
        })
        
        return {
            'container_id': container_id,
            'risk_score': risk_score,
            'risk_level': risk_level,
            'event_count': event_count,
            'critical_events': critical_events
        }
    except Exception as e:
        log.error("Failed to get container risk", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
