"""
Modularized backend services for Container Escape Detection System
This module provides the application layer for business logic
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import structlog

log = structlog.get_logger(__name__)


class MetricsService:
    """Service for calculating and retrieving system metrics"""

    def __init__(self, db):
        self.db = db

    async def get_metrics(self) -> Dict[str, Any]:
        """Get current system metrics"""
        try:
            containers_col = self.db.db['containers']
            events_col = self.db.db['security_events']
            alerts_col = self.db.db['alerts']

            total_containers = await containers_col.count_documents({})
            
            blocked_events = await events_col.count_documents({'action': 'blocked'})
            
            active_alerts = await alerts_col.count_documents({'status': 'new'})
            
            # Calculate risky processes (risk_score > 50)
            risky_processes = await containers_col.count_documents({'risk_score': {'$gt': 50}})

            return {
                'total_containers': total_containers,
                'active_alerts': active_alerts,
                'blocked_events': blocked_events,
                'risky_processes': risky_processes,
                'timestamp': datetime.utcnow().isoformat(),
            }
        except Exception as e:
            log.error('Failed to get metrics', error=str(e))
            raise


class ContainerService:
    """Service for managing containers"""

    def __init__(self, db):
        self.db = db

    async def list_containers(self, limit: int = 100) -> List[Dict[str, Any]]:
        """List all containers with current status"""
        try:
            containers_col = self.db.db['containers']
            containers = await containers_col.find({}).limit(limit).to_list(length=limit)
            return containers
        except Exception as e:
            log.error('Failed to list containers', error=str(e))
            raise

    async def get_container(self, container_id: str) -> Optional[Dict[str, Any]]:
        """Get details for a specific container"""
        try:
            containers_col = self.db.db['containers']
            return await containers_col.find_one({'_id': container_id})
        except Exception as e:
            log.error('Failed to get container', container_id=container_id, error=str(e))
            raise

    async def update_container_risk(self, container_id: str, risk_score: float) -> bool:
        """Update risk score for a container"""
        try:
            containers_col = self.db.db['containers']
            result = await containers_col.update_one(
                {'_id': container_id},
                {'$set': {'risk_score': risk_score, 'last_updated': datetime.utcnow()}}
            )
            return result.modified_count > 0
        except Exception as e:
            log.error('Failed to update container risk', container_id=container_id, error=str(e))
            raise


class EventService:
    """Service for managing security events"""

    def __init__(self, db):
        self.db = db

    async def list_events(self, limit: int = 100, skip: int = 0) -> List[Dict[str, Any]]:
        """List security events with pagination"""
        try:
            events_col = self.db.db['security_events']
            events = await events_col.find({}).sort('timestamp', -1).skip(skip).limit(limit).to_list(length=limit)
            return events
        except Exception as e:
            log.error('Failed to list events', error=str(e))
            raise

    async def create_event(self, event_data: Dict[str, Any]) -> str:
        """Create a new security event"""
        try:
            events_col = self.db.db['security_events']
            event = {
                **event_data,
                'timestamp': datetime.utcnow(),
                'status': 'open',
            }
            result = await events_col.insert_one(event)
            return str(result.inserted_id)
        except Exception as e:
            log.error('Failed to create event', error=str(e))
            raise

    async def get_events_by_container(self, container_id: str, hours: int = 24) -> List[Dict[str, Any]]:
        """Get events for a specific container in the last N hours"""
        try:
            events_col = self.db.db['security_events']
            cutoff = datetime.utcnow() - timedelta(hours=hours)
            events = await events_col.find({
                'container_id': container_id,
                'timestamp': {'$gte': cutoff}
            }).sort('timestamp', -1).to_list(length=1000)
            return events
        except Exception as e:
            log.error('Failed to get events by container', container_id=container_id, error=str(e))
            raise


class AlertService:
    """Service for managing security alerts"""

    def __init__(self, db):
        self.db = db

    async def list_alerts(self, status: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        """List alerts with optional status filter"""
        try:
            alerts_col = self.db.db['alerts']
            query = {'status': status} if status else {}
            alerts = await alerts_col.find(query).sort('timestamp', -1).limit(limit).to_list(length=limit)
            return alerts
        except Exception as e:
            log.error('Failed to list alerts', error=str(e))
            raise

    async def create_alert(self, alert_data: Dict[str, Any]) -> str:
        """Create a new alert"""
        try:
            alerts_col = self.db.db['alerts']
            alert = {
                **alert_data,
                'timestamp': datetime.utcnow(),
                'status': 'new',
            }
            result = await alerts_col.insert_one(alert)
            return str(result.inserted_id)
        except Exception as e:
            log.error('Failed to create alert', error=str(e))
            raise

    async def acknowledge_alert(self, alert_id: str) -> bool:
        """Mark an alert as acknowledged"""
        try:
            alerts_col = self.db.db['alerts']
            result = await alerts_col.update_one(
                {'_id': alert_id},
                {'$set': {'status': 'acknowledged', 'acknowledged_at': datetime.utcnow()}}
            )
            return result.modified_count > 0
        except Exception as e:
            log.error('Failed to acknowledge alert', alert_id=alert_id, error=str(e))
            raise

    async def resolve_alert(self, alert_id: str) -> bool:
        """Mark an alert as resolved"""
        try:
            alerts_col = self.db.db['alerts']
            result = await alerts_col.update_one(
                {'_id': alert_id},
                {'$set': {'status': 'resolved', 'resolved_at': datetime.utcnow()}}
            )
            return result.modified_count > 0
        except Exception as e:
            log.error('Failed to resolve alert', alert_id=alert_id, error=str(e))
            raise


class ReportService:
    """Service for generating reports"""

    def __init__(self, db):
        self.db = db

    async def get_summary_report(self, days: int = 7) -> Dict[str, Any]:
        """Generate a summary report for the last N days"""
        try:
            events_col = self.db.db['security_events']
            alerts_col = self.db.db['alerts']
            containers_col = self.db.db['containers']

            cutoff = datetime.utcnow() - timedelta(days=days)

            total_events = await events_col.count_documents({'timestamp': {'$gte': cutoff}})
            blocked_events = await events_col.count_documents({
                'timestamp': {'$gte': cutoff},
                'action': 'blocked'
            })
            total_alerts = await alerts_col.count_documents({'timestamp': {'$gte': cutoff}})
            critical_alerts = await alerts_col.count_documents({
                'timestamp': {'$gte': cutoff},
                'severity': 'critical'
            })
            high_risk_containers = await containers_col.count_documents({'risk_score': {'$gt': 75}})

            return {
                'period_days': days,
                'total_events': total_events,
                'blocked_events': blocked_events,
                'total_alerts': total_alerts,
                'critical_alerts': critical_alerts,
                'high_risk_containers': high_risk_containers,
                'block_rate': (blocked_events / total_events * 100) if total_events > 0 else 0,
                'generated_at': datetime.utcnow().isoformat(),
            }
        except Exception as e:
            log.error('Failed to generate summary report', error=str(e))
            raise

    async def get_container_report(self, container_id: str) -> Dict[str, Any]:
        """Generate a detailed report for a specific container"""
        try:
            events_col = self.db.db['security_events']
            containers_col = self.db.db['containers']

            container = await containers_col.find_one({'_id': container_id})
            if not container:
                return {}

            event_types = await events_col.aggregate([
                {'$match': {'container_id': container_id}},
                {'$group': {
                    '_id': '$event_type',
                    'count': {'$sum': 1},
                    'blocked': {'$sum': {'$cond': [{'$eq': ['$action', 'blocked']}, 1, 0]}}
                }},
                {'$sort': {'count': -1}}
            ]).to_list(length=100)

            return {
                'container_id': container_id,
                'container_name': container.get('name'),
                'risk_score': container.get('risk_score'),
                'total_events': sum(e['count'] for e in event_types),
                'event_types': event_types,
                'generated_at': datetime.utcnow().isoformat(),
            }
        except Exception as e:
            log.error('Failed to generate container report', container_id=container_id, error=str(e))
            raise
