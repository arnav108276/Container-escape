"""
FastAPI backend for Container Escape Detection System
"""

from contextlib import asynccontextmanager
from datetime import datetime
import asyncio
import os

import structlog
from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from database import Database
from routes import admin, alerts, containers, events, reports, websocket

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage app lifecycle - startup and shutdown."""
    log.info("Backend starting up")

    db = Database(os.getenv("MONGODB_URI", "mongodb://localhost:27017"))
    connected = db.connect()
    if not connected:
        log.warning("Backend started without an active MongoDB connection")

    app.state.db = db
    app.state.started_at = datetime.utcnow()
    if connected:
        app.state.report_scheduler_task = asyncio.create_task(reports.run_report_scheduler(app))
    else:
        app.state.report_scheduler_task = None

    yield

    log.info("Backend shutting down")
    if app.state.report_scheduler_task:
        app.state.report_scheduler_task.cancel()
        try:
            await app.state.report_scheduler_task
        except asyncio.CancelledError:
            pass

    if hasattr(app.state, "db"):
        app.state.db.close()


app = FastAPI(
    title="Container Escape Detection API",
    description="Real-time container security monitoring",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS with restricted origins for production
allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    max_age=3600,
)

# Include protected routes
app.include_router(alerts.router, prefix="/api", tags=["alerts"])
app.include_router(events.router, prefix="/api", tags=["events"])
app.include_router(containers.router, prefix="/api", tags=["containers"])
app.include_router(reports.router, prefix="/api", tags=["reports"])
app.include_router(admin.router, prefix="/api", tags=["admin"])


def _get_database_status(db: Database) -> str:
    """Check if the DB client is connected and reachable."""
    try:
        if not db.client:
            return "disconnected"
        db.client.admin.command("ping")
        return "connected"
    except Exception:
        return "disconnected"


@app.get("/api/dashboard/metrics")
async def dashboard_metrics(request: Request):
    """Get dashboard metrics for the security dashboard."""
    db = request.app.state.db

    try:
        metrics = db.get_dashboard_metrics()
    except Exception as exc:
        log.error("Failed to query dashboard metrics", error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to query dashboard metrics") from exc

    if not metrics:
        raise HTTPException(status_code=503, detail="Unable to query dashboard metrics")

    return metrics


@app.get("/api/system/overview")
async def system_overview(request: Request):
    """Aggregated status endpoint for enterprise dashboard experiences."""
    db = request.app.state.db
    db_status = _get_database_status(db)

    metrics = db.get_dashboard_metrics() if db_status == "connected" else {}

    alert_docs = []
    event_docs = []
    if db_status == "connected":
        alert_docs = list(db.db.alerts.find({"acknowledged": False}).sort("timestamp", -1))
        event_docs = db.get_events(hours=1, limit=10)

    return {
        "timestamp": datetime.utcnow().isoformat(),
        "service_status": "healthy" if db_status == "connected" else "degraded",
        "database": db_status,
        "uptime_seconds": round((datetime.utcnow() - request.app.state.started_at).total_seconds(), 2),
        "metrics": metrics,
        "high_priority_open_alerts": [
            {
                "container_id": a.get("container_id"),
                "event_type": a.get("event_type"),
                "severity": a.get("severity"),
                "risk_score": a.get("risk_score"),
                "timestamp": a.get("timestamp").isoformat() if hasattr(a.get("timestamp"), "isoformat") else a.get("timestamp"),
            }
            for a in alert_docs
        ],
        "events_last_hour": len(event_docs),
    }


@app.websocket("/ws/events")
async def websocket_endpoint(ws: WebSocket):
    """WebSocket endpoint for real-time event streaming."""
    await websocket.manager.connect(ws)
    try:
        while True:
            payload = await ws.receive_json()
            await websocket.manager.broadcast(
                {
                    "type": "event",
                    "data": payload,
                    "received_at": datetime.utcnow().isoformat(),
                }
            )
    except Exception as exc:
        log.warning("WebSocket connection closed", error=str(exc))
    finally:
        try:
            websocket.manager.disconnect(ws)
        except ValueError:
            pass


@app.get("/api/metrics")
async def get_metrics(request: Request):
    """Get metrics - alias for dashboard/metrics endpoint."""
    db = request.app.state.db
    try:
        metrics = db.get_dashboard_metrics()
    except Exception as exc:
        log.error("Failed to query metrics", error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to query metrics") from exc
    
    if not metrics:
        return {
            "totalContainers": 0,
            "activeAlerts": 0,
            "blockedEvents": 0,
            "riskyProcesses": 0,
        }
    return metrics


@app.get("/api/health")
async def api_health_check(request: Request):
    """Health check endpoint for API - alias for /health."""
    db_status = _get_database_status(request.app.state.db)
    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "container-escape-detection-backend",
        "database": db_status,
    }


@app.get("/health")
async def health_check(request: Request):
    """Liveness endpoint."""
    db_status = _get_database_status(request.app.state.db)
    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "container-escape-detection-backend",
        "database": db_status,
    }


@app.get("/ready")
async def readiness_check(request: Request):
    """Readiness endpoint used by orchestrators before sending traffic."""
    db = request.app.state.db
    if _get_database_status(db) != "connected":
        raise HTTPException(status_code=503, detail="Database is not reachable")

    uptime_seconds = (datetime.utcnow() - request.app.state.started_at).total_seconds()
    return {
        "status": "ready",
        "uptime_seconds": round(uptime_seconds, 2),
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Container Escape Detection API",
        "version": "1.0.0",
        "endpoints": {
            "alerts": "/api/alerts",
            "events": "/api/events",
            "containers": "/api/containers",
            "reports": "/api/reports",
            "system_overview": "/api/system/overview",
            "websocket": "/ws/events",
            "health": "/health",
            "ready": "/ready",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
