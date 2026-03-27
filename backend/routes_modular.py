"""
Modularized API route handlers using services
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
import structlog

from services import MetricsService, ContainerService, EventService, AlertService, ReportService

log = structlog.get_logger(__name__)

# Create routers
metrics_router = APIRouter(prefix="/api/metrics", tags=["metrics"])
containers_router = APIRouter(prefix="/api/containers", tags=["containers"])
events_router = APIRouter(prefix="/api/events", tags=["events"])
alerts_router = APIRouter(prefix="/api/alerts", tags=["alerts"])
reports_router = APIRouter(prefix="/api/reports", tags=["reports"])
health_router = APIRouter(prefix="/api/health", tags=["health"])


# ============== METRICS ROUTES ==============

@metrics_router.get("")
async def get_metrics(db=None):
    """Get current system metrics"""
    try:
        service = MetricsService(db)
        metrics = await service.get_metrics()
        return metrics
    except Exception as e:
        log.error('Error getting metrics', error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ============== CONTAINERS ROUTES ==============

@containers_router.get("")
async def list_containers(limit: int = Query(100, le=500), db=None):
    """List all containers"""
    try:
        service = ContainerService(db)
        containers = await service.list_containers(limit)
        return containers
    except Exception as e:
        log.error('Error listing containers', error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@containers_router.get("/{container_id}")
async def get_container(container_id: str, db=None):
    """Get details for a specific container"""
    try:
        service = ContainerService(db)
        container = await service.get_container(container_id)
        if not container:
            raise HTTPException(status_code=404, detail="Container not found")
        return container
    except HTTPException:
        raise
    except Exception as e:
        log.error('Error getting container', container_id=container_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@containers_router.post("/{container_id}/risk-score")
async def update_container_risk(container_id: str, risk_score: float, db=None):
    """Update risk score for a container"""
    try:
        service = ContainerService(db)
        success = await service.update_container_risk(container_id, risk_score)
        if not success:
            raise HTTPException(status_code=404, detail="Container not found")
        return {"status": "updated", "container_id": container_id, "risk_score": risk_score}
    except HTTPException:
        raise
    except Exception as e:
        log.error('Error updating container risk', container_id=container_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ============== EVENTS ROUTES ==============

@events_router.get("")
async def list_events(
    limit: int = Query(100, le=1000),
    skip: int = Query(0, ge=0),
    db=None
):
    """List security events"""
    try:
        service = EventService(db)
        events = await service.list_events(limit, skip)
        return events
    except Exception as e:
        log.error('Error listing events', error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@events_router.post("")
async def create_event(event_data: dict, db=None):
    """Create a new security event"""
    try:
        service = EventService(db)
        event_id = await service.create_event(event_data)
        return {"id": event_id, "status": "created"}
    except Exception as e:
        log.error('Error creating event', error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@events_router.get("/container/{container_id}")
async def get_container_events(
    container_id: str,
    hours: int = Query(24, ge=1, le=720),
    db=None
):
    """Get events for a specific container"""
    try:
        service = EventService(db)
        events = await service.get_events_by_container(container_id, hours)
        return events
    except Exception as e:
        log.error('Error getting container events', container_id=container_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ============== ALERTS ROUTES ==============

@alerts_router.get("")
async def list_alerts(
    status: Optional[str] = Query(None, regex="^(new|acknowledged|resolved)$"),
    limit: int = Query(100, le=500),
    db=None
):
    """List alerts with optional status filter"""
    try:
        service = AlertService(db)
        alerts = await service.list_alerts(status, limit)
        return alerts
    except Exception as e:
        log.error('Error listing alerts', error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@alerts_router.post("")
async def create_alert(alert_data: dict, db=None):
    """Create a new alert"""
    try:
        service = AlertService(db)
        alert_id = await service.create_alert(alert_data)
        return {"id": alert_id, "status": "created"}
    except Exception as e:
        log.error('Error creating alert', error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@alerts_router.post("/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, db=None):
    """Acknowledge an alert"""
    try:
        service = AlertService(db)
        success = await service.acknowledge_alert(alert_id)
        if not success:
            raise HTTPException(status_code=404, detail="Alert not found")
        return {"id": alert_id, "status": "acknowledged"}
    except HTTPException:
        raise
    except Exception as e:
        log.error('Error acknowledging alert', alert_id=alert_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@alerts_router.post("/{alert_id}/resolve")
async def resolve_alert(alert_id: str, db=None):
    """Resolve an alert"""
    try:
        service = AlertService(db)
        success = await service.resolve_alert(alert_id)
        if not success:
            raise HTTPException(status_code=404, detail="Alert not found")
        return {"id": alert_id, "status": "resolved"}
    except HTTPException:
        raise
    except Exception as e:
        log.error('Error resolving alert', alert_id=alert_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ============== REPORTS ROUTES ==============

@reports_router.get("/summary")
async def get_summary_report(
    days: int = Query(7, ge=1, le=90),
    db=None
):
    """Get a summary report for the last N days"""
    try:
        service = ReportService(db)
        report = await service.get_summary_report(days)
        return report
    except Exception as e:
        log.error('Error generating summary report', error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@reports_router.get("/container/{container_id}")
async def get_container_report(
    container_id: str,
    db=None
):
    """Get a detailed report for a container"""
    try:
        service = ReportService(db)
        report = await service.get_container_report(container_id)
        if not report:
            raise HTTPException(status_code=404, detail="Container not found")
        return report
    except HTTPException:
        raise
    except Exception as e:
        log.error('Error generating container report', container_id=container_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ============== HEALTH ROUTES ==============

@health_router.get("")
async def health_check(db=None):
    """Health check endpoint"""
    try:
        db_status = "connected" if db and db.connected else "disconnected"
        return {
            "status": "healthy",
            "database": db_status,
            "timestamp": __import__('datetime').datetime.utcnow().isoformat()
        }
    except Exception as e:
        log.error('Error in health check', error=str(e))
        raise HTTPException(status_code=500, detail="Unhealthy")
