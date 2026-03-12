"""
FastAPI backend for Container Escape Detection System
"""

from fastapi import FastAPI, WebSocket, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import structlog
import os
from typing import List, Optional
from datetime import datetime

from database import Database
from models import Alert, SecurityEvent, Container, ForensicReport
from routes import alerts, events, containers, reports, websocket

log = structlog.get_logger(__name__)

# Store for WebSocket connections
active_connections = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage app lifecycle - startup and shutdown"""
    # Startup
    log.info("Backend starting up")
    db = Database(os.getenv("MONGODB_URI", "mongodb://localhost:27017"))
    db.connect()
    app.state.db = db
    
    yield
    
    # Shutdown
    log.info("Backend shutting down")
    if hasattr(app.state, 'db'):
        app.state.db.close()


app = FastAPI(
    title="Container Escape Detection API",
    description="Real-time container security monitoring",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(alerts.router, prefix="/api", tags=["alerts"])
app.include_router(events.router, prefix="/api", tags=["events"])
app.include_router(containers.router, prefix="/api", tags=["containers"])
app.include_router(reports.router, prefix="/api", tags=["reports"])


@app.get("/api/dashboard/metrics")
async def dashboard_metrics(request: Request):
    """Get dashboard metrics for the security dashboard"""
    try:
        db = request.app.state.db
        
        # Get container counts
        containers = list(db.db.containers.find({}))
        total_containers = len(containers)
        quarantined_containers = sum(1 for c in containers if c.get('quarantined', False))
        
        # Get event counts (24 hours)
        events = db.get_events(hours=24, limit=10000)
        events_24h = len(events)
        
        # Count critical alerts
        alerts = list(db.db.alerts.find({"severity": "critical"}))
        critical_alerts = len(alerts)
        
        return {
            'total_containers': total_containers,
            'quarantined_containers': quarantined_containers,
            'events_24h': events_24h,
            'critical_alerts': critical_alerts
        }
    except Exception as e:
        log.error("Failed to get dashboard metrics", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/alerts/test/generate")
async def generate_test_alerts(request: Request):
    """
    Generate test alerts for demonstration and testing
    This endpoint creates sample high-risk alerts for containers
    """
    try:
        db = request.app.state.db
        
        # Get containers
        containers = list(db.db.containers.find({}))
        if not containers:
            raise HTTPException(status_code=400, detail="No containers found. Please sync containers first.")
        
        test_alerts = []
        for i, container in enumerate(containers):
            # Create high-risk alert for first container
            risk_score = 85 + i * 5  # CRITICAL risk
            
            alert_doc = {
                'timestamp': datetime.utcnow(),
                'container_id': container.get('container_id'),
                'reason': f'Suspicious process execution detected in container',
                'risk_score': min(risk_score, 100),
                'severity': 'critical' if risk_score >= 80 else 'high',
                'metadata': {
                    'filepath': '/etc/shadow' if i % 2 == 0 else '/proc/sys/kernel/modules',
                    'pid': 1234 + i,
                    'uid': 0,
                    'syscall_nr': 105
                }
            }
            
            db.db.alerts.insert_one(alert_doc)
            test_alerts.append(alert_doc)
        
        log.info("Test alerts generated", count=len(test_alerts))
        
        return {
            'status': 'success',
            'message': f'Generated {len(test_alerts)} test alerts',
            'alerts_created': len(test_alerts)
        }
    except Exception as e:
        log.error("Failed to generate test alerts", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws/events")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time event streaming"""
    await websocket.accept()
    active_connections.append(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo events to all connected clients
            for connection in active_connections:
                try:
                    await connection.send_text(data)
                except:
                    pass
    except:
        active_connections.remove(websocket)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "container-escape-detection-backend"
    }


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "Container Escape Detection API",
        "version": "1.0.0",
        "endpoints": {
            "alerts": "/api/alerts",
            "events": "/api/events",
            "containers": "/api/containers",
            "reports": "/api/reports",
            "websocket": "/ws/events",
            "health": "/health"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
