"""Containers API routes"""

from fastapi import APIRouter, Request, HTTPException, Body
from models import QuarantineRequest, Container
from bson import ObjectId
import structlog
from datetime import datetime, timedelta

log = structlog.get_logger(__name__)

router = APIRouter()


def _resolve_container(db, container_id: str) -> dict:
    """Resolve a container by short ID, full ID prefix, or exact full ID."""
    container = db.db.containers.find_one({'container_id': container_id})
    if container:
        return container

    container = db.db.containers.find_one({'full_id': container_id})
    if container:
        return container

    # Support callers passing short IDs against stored full IDs
    container = db.db.containers.find_one({'full_id': {'$regex': f'^{container_id}'}})
    return container or {}


def _get_container_manager(app_state):
    """Best-effort loader for runtime container manager."""
    if hasattr(app_state, 'container_manager'):
        return app_state.container_manager

    try:
        from daemon.container_manager import ContainerManager  # type: ignore

        app_state.container_manager = ContainerManager()
        return app_state.container_manager
    except Exception as e:
        log.warning("Runtime container manager unavailable; DB-only quarantine mode", error=str(e))
        app_state.container_manager = None
        return None


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
        
        container = _resolve_container(db, container_id)
        canonical_container_id = (container or {}).get('container_id', container_id)
        baseline_score = int((container or {}).get('risk_score', 0) or 0)

        # Get alerts for this container in last 24 hours
        alerts = list(db.db.alerts.find({
            'container_id': canonical_container_id,
            'timestamp': {'$gte': cutoff_24h}
        }))
        
        # Get events for this container in last 24 hours
        events = list(db.db.security_events.find({
            'container_id': canonical_container_id,
            'timestamp': {'$gte': cutoff_24h}
        }))
        
        if not alerts and not events:
            if baseline_score >= 75:
                return ('CRITICAL', baseline_score)
            if baseline_score >= 50:
                return ('HIGH', baseline_score)
            if baseline_score >= 40:
                return ('MEDIUM', baseline_score)
            return ('LOW', baseline_score)
        
        # Calculate average risk score from alerts and events
        scores = []
        for alert in alerts:
            scores.append(alert.get('risk_score', 0))
        for event in events:
            scores.append(event.get('risk_score', 0))
        
        if scores:
            avg_risk = sum(scores) / len(scores)
            final_score = max(int(avg_risk), baseline_score)
            
            # Determine risk level based on categorization
            # CRITICAL: >= 75 (Auto-quarantine threshold)
            # HIGH: 50-74 (Alert and monitor)
            # MEDIUM: 40-49 (Log and monitor)
            # LOW: < 40 (Forensic log only)
            if final_score >= 75:
                risk_level = 'CRITICAL'
            elif final_score >= 50:
                risk_level = 'HIGH'
            elif final_score >= 40:
                risk_level = 'MEDIUM'
            else:
                risk_level = 'LOW'
            
            return (risk_level, final_score)
        
        return ('LOW', baseline_score)
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
        
        container_ids = [c.get('container_id') for c in containers if c.get('container_id')]

        # Upsert containers while preserving manual quarantine state from DB
        for container in containers:
            container_id = container.get('container_id')
            if not container_id:
                continue

            existing = db.db.containers.find_one({'container_id': container_id}) or {}
            preserved_quarantine = bool(existing.get('quarantined', False))
            incoming_quarantine = bool(container.get('quarantined', False))
            quarantined = preserved_quarantine or incoming_quarantine

            status = 'quarantined' if quarantined else container.get('status', 'running')

            update_doc = {
                'full_id': container.get('full_id'),
                'name': container.get('name'),
                'image': container.get('image'),
                'status': status,
                'risk_level': container.get('risk_level', 'LOW'),
                'risk_score': int(container.get('risk_score', 0) or 0),
                'alert_count': 0,  # Calculated on retrieval
                'quarantined': quarantined,
                'runtime_findings': container.get('runtime_findings', []),
                'synced_at': datetime.utcnow()
            }

            # Keep historical quarantine metadata if already present
            for key in ['quarantine_reason', 'quarantined_by', 'quarantined_at']:
                if existing.get(key) is not None:
                    update_doc[key] = existing.get(key)

            db.db.containers.update_one(
                {'container_id': container_id},
                {'$set': update_doc, '$setOnInsert': {'container_id': container_id}},
                upsert=True
            )

        # Remove stale containers that are no longer running
        if container_ids:
            db.db.containers.delete_many({'container_id': {'$nin': container_ids}})
        else:
            db.db.containers.delete_many({})
        
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
        container = _resolve_container(db, container_id)
        
        if not container:
            raise HTTPException(status_code=404, detail="Container not found")
        
        # Calculate risk level
        risk_level, risk_score = _calculate_container_risk(db, container_id)
        
        canonical_container_id = container.get('container_id', container_id)

        # Get recent events for this container
        cutoff_24h = datetime.utcnow() - timedelta(hours=24)
        events = list(db.db.security_events.find({
            'container_id': canonical_container_id,
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
    req: Request
):
    """Quarantine a container - pause and isolate it"""
    try:
        # Parse request body
        try:
            body = await req.json()
            reason = body.get('reason', 'Manual quarantine')
            approved_by = body.get('approved_by', 'admin')
        except Exception:
            reason = 'Manual quarantine'
            approved_by = 'admin'
        
        db = req.app.state.db
        resolved = _resolve_container(db, container_id)
        canonical_container_id = resolved.get('container_id', container_id)

        container_manager = _get_container_manager(req.app.state)

        # Actually pause and isolate the container when runtime manager is available
        quarantine_success = container_manager.quarantine(canonical_container_id) if container_manager else False
        if not quarantine_success:
            log.error(
                "Container quarantine failed",
                container_id=canonical_container_id,
                reason=reason,
                approved_by=approved_by,
            )
            raise HTTPException(
                status_code=503,
                detail="Failed to pause container runtime. Quarantine was not applied.",
            )

        # Update database status only after successful runtime pause
        result = db.db.containers.update_one(
            {'container_id': canonical_container_id},
            {
                '$set': {
                    'status': 'quarantined',
                    'quarantined': True,
                    'updated_at': datetime.utcnow(),
                    'quarantine_reason': reason,
                    'quarantined_by': approved_by,
                    'quarantined_at': datetime.utcnow()
                }
            },
            upsert=True
        )

        log.warning(
            "Container quarantined",
            container_id=container_id,
            reason=reason,
            approved_by=approved_by,
            action_success=quarantine_success,
            matched_count=result.matched_count
        )

        return {
            'status': 'success',
            'container_id': canonical_container_id,
            'quarantine_status': 'quarantined',
            'paused': True,
            'reason': reason,
            'approved_by': approved_by,
            'message': 'Container paused and isolated successfully'
        }
    except HTTPException:
        raise
    except Exception as e:
        log.error("Failed to quarantine container", error=str(e), container_id=container_id, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to quarantine: {str(e)}")


@router.post("/containers/{container_id}/unquarantine")
async def unquarantine_container(
    container_id: str,
    approved_by: str,
    req: Request
):
    """Restore a quarantined container - unpause and reconnect"""
    try:
        db = req.app.state.db
        resolved = _resolve_container(db, container_id)
        canonical_container_id = resolved.get('container_id', container_id)

        container_manager = _get_container_manager(req.app.state)

        # Actually unpause the container when runtime manager is available
        unquarantine_success = container_manager.unquarantine(canonical_container_id) if container_manager else False
        
        # Update container status
        result = db.db.containers.update_one(
            {'container_id': canonical_container_id},
            {
                '$set': {
                    'status': 'running',
                    'quarantined': False,
                    'updated_at': datetime.utcnow(),
                    'unquarantined_by': approved_by,
                    'unquarantined_at': datetime.utcnow()
                }
            }
        )
        
        log.info(
            "Container unquarantined",
            container_id=container_id,
            approved_by=approved_by,
            action_success=unquarantine_success
        )
        
        return {
            'status': 'success',
            'container_id': canonical_container_id,
            'quarantine_status': 'unquarantined',
            'unpaused': unquarantine_success,
            'message': 'Container unpaused and restored successfully' if unquarantine_success else 'Container marked as active (runtime action unavailable or failed)'
        }
    except Exception as e:
        log.error("Failed to unquarantine container", error=str(e), exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to unquarantine: {str(e)}")


@router.get("/containers/{container_id}/risk")
@router.get("/containers/{container_id}/risks")
async def get_container_risk(container_id: str, request: Request):
    """Get container risk assessment"""
    try:
        db = request.app.state.db
        
        # Calculate risk
        risk_level, risk_score = _calculate_container_risk(db, container_id)

        resolved = _resolve_container(db, container_id)
        canonical_container_id = resolved.get('container_id', container_id)
        
        # Get event counts
        cutoff_24h = datetime.utcnow() - timedelta(hours=24)
        event_count = db.db.security_events.count_documents({
            'container_id': canonical_container_id,
            'timestamp': {'$gte': cutoff_24h}
        })
        
        critical_events = db.db.security_events.count_documents({
            'container_id': canonical_container_id,
            'risk_score': {'$gte': 80},
            'timestamp': {'$gte': cutoff_24h}
        })
        
        return {
            'container_id': canonical_container_id,
            'risk_score': risk_score,
            'risk_level': risk_level,
            'event_count': event_count,
            'critical_events': critical_events
        }
    except Exception as e:
        log.error("Failed to get container risk", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/containers/{container_id}/vulnerabilities")
async def get_container_vulnerabilities(container_id: str, limit: int = 10, request: Request = None):
    """
    Get detected vulnerabilities and threats for a container.
    Returns recent alerts and events showing what threats were detected.
    """
    try:
        db = request.app.state.db
        cutoff_24h = datetime.utcnow() - timedelta(hours=24)

        container = _resolve_container(db, container_id) or {}
        canonical_container_id = container.get('container_id', container_id)
        
        # Get recent alerts (vulnerabilities detected)
        alerts = list(db.db.alerts.find({
            'container_id': canonical_container_id,
            'timestamp': {'$gte': cutoff_24h}
        }).sort('timestamp', -1).limit(limit))
        
        # Get recent security events
        events = list(db.db.security_events.find({
            'container_id': canonical_container_id,
            'timestamp': {'$gte': cutoff_24h}
        }).sort('timestamp', -1).limit(limit))

        # Compile vulnerability summary
        vulnerability_summary = {
            'container_id': canonical_container_id,
            'detected_alerts': len(set(str(a['_id']) for a in alerts)),
            'recent_alerts': [],
            'threat_types': {},
            'runtime_findings': container.get('runtime_findings', []),
            'baseline_risk_score': int(container.get('risk_score', 0) or 0),
            'baseline_risk_level': container.get('risk_level', 'LOW')
        }
        
        # Add recent alerts with details
        for alert in alerts[:5]:  # Show top 5
            vulnerability_summary['recent_alerts'].append({
                'timestamp': alert.get('timestamp', '').isoformat() if hasattr(alert.get('timestamp', ''), 'isoformat') else str(alert.get('timestamp', '')),
                'reason': alert.get('reason', 'Unknown threat'),
                'risk_score': alert.get('risk_score', 0),
                'risk_category': alert.get('risk_category', 'UNKNOWN'),
                'severity': alert.get('severity', 'unknown')
            })
        
        # Count threat types from events
        for event in events:
            threat_type = event.get('event_type', 'unknown')
            vulnerability_summary['threat_types'][threat_type] = vulnerability_summary['threat_types'].get(threat_type, 0) + 1
        
        return vulnerability_summary
    except Exception as e:
        log.error("Failed to get container vulnerabilities", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
