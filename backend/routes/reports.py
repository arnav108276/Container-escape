"""Reports API routes"""

from fastapi import APIRouter, Request, HTTPException, Query
from bson import ObjectId
from typing import Optional
from datetime import datetime, timedelta
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


@router.get("/reports")
async def list_reports(
    container_id: Optional[str] = Query(None),
    limit: int = Query(100),
    request: Request = None
):
    """List forensic reports"""
    try:
        db = request.app.state.db
        
        query = {}
        if container_id:
            query['container_id'] = container_id
        
        reports = list(
            db.db.forensic_reports.find(query).sort('generated_at', -1).limit(limit)
        )
        
        return {
            'total': len(reports),
            'reports': [_to_json_serializable(r) for r in reports]
        }
    except Exception as e:
        log.error("Failed to list reports", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/reports/{report_id}")
async def get_report(report_id: str, request: Request):
    """Get detailed forensic report"""
    try:
        db = request.app.state.db
        report = db.db.forensic_reports.find_one({'report_id': report_id})
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        return _to_json_serializable(report)
    except Exception as e:
        log.error("Failed to get report", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reports/generate")
async def generate_report(
    container_id: str = Query(...),
    hours: int = Query(24),
    request: Request = None
):
    """Generate forensic report for container"""
    try:
        db = request.app.state.db
        
        # Get events for container
        events = db.get_events(container_id=container_id, hours=hours, limit=10000)
        
        # Generate report
        report = {
            'report_id': f"{container_id}_{datetime.utcnow().isoformat()}",
            'container_id': container_id,
            'generated_at': datetime.utcnow(),
            'event_count': len(events),
            'critical_events': sum(1 for e in events if e.get('risk_score', 0) >= 80),
            'high_risk_events': sum(1 for e in events if e.get('risk_score', 0) >= 60),
            'timeline': [_to_json_serializable(e) for e in events],
            'summary': f"Forensic analysis for {container_id} covering {hours} hours with {len(events)} events",
            'recommendations': _get_recommendations(events)
        }
        
        # Save report
        db.db.forensic_reports.insert_one(report)
        
        log.info("Report generated", container_id=container_id)
        
        return _to_json_serializable(report)
    except Exception as e:
        log.error("Failed to generate report", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dashboard")
async def get_dashboard_metrics(request: Request):
    """Get dashboard summary metrics"""
    try:
        db = request.app.state.db
        metrics = db.get_dashboard_metrics()
        
        return {
            'timestamp': datetime.utcnow().isoformat(),
            **metrics
        }
    except Exception as e:
        log.error("Failed to get metrics", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


def _get_recommendations(events: list) -> list:
    """Generate recommendations based on events"""
    recommendations = []
    
    if not events:
        return ["No events to analyze"]
    
    # Check for privilege escalation
    priv_esc = sum(1 for e in events if 'PRIVILEGE_ESCALATION' in str(e.get('event_type', '')))
    if priv_esc > 2:
        recommendations.append("Multiple privilege escalation attempts detected. Review container permissions and capabilities.")
    
    # Check for unauthorized access
    unauth = sum(1 for e in events if 'UNAUTHORIZED_FILE_ACCESS' in str(e.get('event_type', '')))
    if unauth > 5:
        recommendations.append("Frequent unauthorized file access attempts. Review filesystem permissions and mount points.")
    
    # Check for mount attempts
    mounts = sum(1 for e in events if 'MOUNT_ATTEMPT' in str(e.get('event_type', '')))
    if mounts > 0:
        recommendations.append("CRITICAL: Mount operations detected. Container should be quarantined immediately.")
    
    if not recommendations:
        recommendations.append("No critical issues detected. Monitor for further suspicious activity.")
    
    return recommendations
