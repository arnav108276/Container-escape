"""Admin utility routes for database management"""

from fastapi import APIRouter, Request, HTTPException, Depends
from datetime import datetime, timedelta
import structlog
from auth import require_role

log = structlog.get_logger(__name__)

router = APIRouter()


@router.post("/admin/cleanup/all")
async def cleanup_all_data(request: Request, _auth=Depends(require_role("admin"))):
    """
    DANGER: Delete all alerts, events, and reports.
    Use this to completely reset the database.
    """
    try:
        db = request.app.state.db
        
        # Delete all documents from collections
        alerts_deleted = db.db.alerts.delete_many({})
        events_deleted = db.db.security_events.delete_many({})
        reports_deleted = db.db.forensic_reports.delete_many({})
        
        log.warning(
            "Database cleanup - ALL DATA DELETED",
            alerts_count=alerts_deleted.deleted_count,
            events_count=events_deleted.deleted_count,
            reports_count=reports_deleted.deleted_count,
            timestamp=datetime.utcnow().isoformat()
        )
        
        return {
            'status': 'success',
            'message': 'All data cleared',
            'alerts_deleted': alerts_deleted.deleted_count,
            'events_deleted': events_deleted.deleted_count,
            'reports_deleted': reports_deleted.deleted_count,
            'timestamp': datetime.utcnow().isoformat()
        }
    except Exception as e:
        log.error("Failed to cleanup database", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/cleanup/container/{container_id}")
async def cleanup_container_alerts(container_id: str, request: Request, _auth=Depends(require_role("admin"))):
    """Delete all alerts and events for a specific container"""
    try:
        db = request.app.state.db
        
        # Delete alerts and events for this container
        alerts_deleted = db.db.alerts.delete_many({'container_id': container_id})
        events_deleted = db.db.security_events.delete_many({'container_id': container_id})
        
        log.info(
            "Container data cleanup",
            container_id=container_id,
            alerts_count=alerts_deleted.deleted_count,
            events_count=events_deleted.deleted_count
        )
        
        return {
            'status': 'success',
            'message': f'Cleaned up data for container {container_id}',
            'alerts_deleted': alerts_deleted.deleted_count,
            'events_deleted': events_deleted.deleted_count,
            'timestamp': datetime.utcnow().isoformat()
        }
    except Exception as e:
        log.error("Failed to cleanup container alerts", error=str(e), container_id=container_id)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/cleanup/old-data")
async def cleanup_old_alerts(hours: int = 24, request: Request = None, _auth=Depends(require_role("admin"))):
    """Delete alerts and events older than specified hours"""
    try:
        db = request.app.state.db
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)
        
        # Delete old alerts and events
        alerts_deleted = db.db.alerts.delete_many({'timestamp': {'$lt': cutoff_time}})
        events_deleted = db.db.security_events.delete_many({'timestamp': {'$lt': cutoff_time}})
        
        log.info(
            "Old data cleanup completed",
            hours=hours,
            cutoff_time=cutoff_time.isoformat(),
            alerts_deleted=alerts_deleted.deleted_count,
            events_deleted=events_deleted.deleted_count
        )
        
        return {
            'status': 'success',
            'message': f'Cleaned up data older than {hours} hours',
            'alerts_deleted': alerts_deleted.deleted_count,
            'events_deleted': events_deleted.deleted_count,
            'cutoff_time': cutoff_time.isoformat(),
            'timestamp': datetime.utcnow().isoformat()
        }
    except Exception as e:
        log.error("Failed to cleanup old data", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/stats")
async def get_stats(request: Request, _auth=Depends(require_role("admin"))):
    """Get database statistics"""
    try:
        db = request.app.state.db
        
        alerts_count = db.db.alerts.count_documents({})
        events_count = db.db.security_events.count_documents({})
        containers_count = db.db.containers.count_documents({})
        reports_count = db.db.forensic_reports.count_documents({})
        
        # Get breakdown by container
        container_stats = list(db.db.alerts.aggregate([
            {'$group': {
                '_id': '$container_id',
                'container_name': {'$first': '$container_name'},
                'alert_count': {'$sum': 1},
                'latest_timestamp': {'$max': '$timestamp'}
            }},
            {'$sort': {'alert_count': -1}}
        ]))
        
        return {
            'total_alerts': alerts_count,
            'total_events': events_count,
            'total_containers': containers_count,
            'total_reports': reports_count,
            'alerts_by_container': container_stats,
            'timestamp': datetime.utcnow().isoformat()
        }
    except Exception as e:
        log.error("Failed to get stats", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
