"""Events API routes"""

from fastapi import APIRouter, Request, HTTPException, Query
from bson import ObjectId
from typing import Optional
import structlog

from filtering import is_ignored_container

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


@router.get("/events")
async def get_events(
    container_id: Optional[str] = Query(None),
    hours: int = Query(24),
    limit: int = Query(1000),
    request: Request = None
):
    """Get security events"""
    try:
        db = request.app.state.db
        events = db.get_events(container_id=container_id, hours=hours, limit=limit)
        filtered_events = [
            e for e in events
            if not is_ignored_container(e.get('container_id', ''), e.get('container_name', ''))
        ]

        return {
            'total': len(filtered_events),
            'events': [_to_json_serializable(e) for e in filtered_events]
        }
    except Exception as e:
        log.error("Failed to get events", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events/statistics")
async def event_statistics(
    hours: int = Query(24),
    request: Request = None
):
    """Get event statistics"""
    try:
        db = request.app.state.db
        events = db.get_events(hours=hours, limit=10000)
        
        event_types = {}
        risk_scores = []
        
        for event in events:
            if is_ignored_container(event.get('container_id', ''), event.get('container_name', '')):
                continue
            event_type = event.get('event_type', 'UNKNOWN')
            event_types[event_type] = event_types.get(event_type, 0) + 1
            risk_scores.append(event.get('risk_score', 0))
        
        return {
            'event_counts': event_types,
            'average_risk_score': sum(risk_scores) / len(risk_scores) if risk_scores else 0,
            'max_risk_score': max(risk_scores) if risk_scores else 0,
            'total_events': len(risk_scores)
        }
    except Exception as e:
        log.error("Failed to get statistics", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events/{event_id}")
async def get_event(event_id: str, request: Request):
    """Get specific event details"""
    try:
        db = request.app.state.db
        event = db.db.security_events.find_one({'_id': ObjectId(event_id)})

        if not event or is_ignored_container(event.get('container_id', ''), event.get('container_name', '')):
            raise HTTPException(status_code=404, detail="Event not found")
        
        return _to_json_serializable(event)
    except Exception as e:
        log.error("Failed to get event", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
