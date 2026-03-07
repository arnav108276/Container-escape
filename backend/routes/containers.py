"""Containers API routes"""

from fastapi import APIRouter, Request, HTTPException
from models import QuarantineRequest, Container
from bson import ObjectId
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
                'risk_level': container.get('risk_level', 'low'),
                'alert_count': container.get('alert_count', 0),
                'quarantined': container.get('quarantined', False)
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
    """List all containers and their status"""
    try:
        db = request.app.state.db
        containers = list(db.db.containers.find({}))
        
        return {
            'total': len(containers),
            'containers': [_to_json_serializable(c) for c in containers]
        }
    except Exception as e:
        log.error("Failed to list containers", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/containers/{container_id}")
async def get_container_status(container_id: str, request: Request):
    """Get container status and details"""
    try:
        db = request.app.state.db
        container = db.get_container_status(container_id)
        
        if not container:
            raise HTTPException(status_code=404, detail="Container not found")
        
        # Get recent events for this container
        events = db.get_events(container_id=container_id, hours=24, limit=20)
        
        return {
            **_to_json_serializable(container),
            'recent_events': [_to_json_serializable(e) for e in events]
        }
    except Exception as e:
        log.error("Failed to get container status", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/containers/{container_id}/quarantine")
async def quarantine_container(
    container_id: str,
    request: QuarantineRequest,
    req: Request
):
    """Quarantine a container"""
    try:
        db = req.app.state.db
        
        # Update container status
        db.update_container_status(container_id, "quarantined")
        
        # Log action
        log.warning(
            "Container quarantined",
            container_id=container_id,
            reason=request.reason,
            approved_by=request.approved_by
        )
        
        return {
            'status': 'quarantined',
            'container_id': container_id,
            'reason': request.reason
        }
    except Exception as e:
        log.error("Failed to quarantine container", error=str(e))
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
        db.update_container_status(container_id, "running")
        
        log.info(
            "Container unquarantined",
            container_id=container_id,
            approved_by=approved_by
        )
        
        return {
            'status': 'restored',
            'container_id': container_id
        }
    except Exception as e:
        log.error("Failed to unquarantine container", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/containers/{container_id}/risk")
async def get_container_risk(container_id: str, request: Request):
    """Get container risk assessment"""
    try:
        db = request.app.state.db
        
        # Get recent events
        events = db.get_events(container_id=container_id, hours=24, limit=100)
        
        if not events:
            return {'container_id': container_id, 'risk_level': 'LOW', 'risk_score': 0}
        
        # Calculate risk
        avg_risk = sum(e.get('risk_score', 0) for e in events) / len(events)
        risk_level = 'CRITICAL' if avg_risk >= 80 else 'HIGH' if avg_risk >= 60 else 'MEDIUM' if avg_risk >= 40 else 'LOW'
        
        return {
            'container_id': container_id,
            'risk_score': int(avg_risk),
            'risk_level': risk_level,
            'event_count': len(events),
            'critical_events': sum(1 for e in events if e.get('risk_score', 0) >= 80)
        }
    except Exception as e:
        log.error("Failed to get container risk", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
