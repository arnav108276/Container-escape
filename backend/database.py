"""MongoDB database interactions"""

import structlog
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

log = structlog.get_logger(__name__)


class Database:
    """MongoDB connection and operations"""
    
    def __init__(self, mongodb_uri: str, db_name: str = "container_security"):
        self.mongodb_uri = mongodb_uri
        self.db_name = db_name
        self.client: Optional[MongoClient] = None
        self.db = None
    
    def connect(self) -> bool:
        """Connect to MongoDB and initialize collections"""
        try:
            self.client = MongoClient(self.mongodb_uri, serverSelectionTimeoutMS=5000)
            self.client.admin.command('ping')
            
            self.db = self.client[self.db_name]
            
            # Create collections with indexes
            self._create_indexes()
            
            log.info("Connected to MongoDB", uri=self.mongodb_uri)
            return True
        except ConnectionFailure as e:
            log.error("Failed to connect to MongoDB", error=str(e))
            return False
    
    def _create_indexes(self):
        """Create database indexes for optimal querying"""
        collections = {
            'security_events': ['timestamp', 'container_id', 'pid'],
            'alerts': ['timestamp', 'container_id'],
            'containers': ['container_id'],
            'forensic_reports': ['container_id', 'generated_at'],
            'forensic_report_schedules': ['schedule_id', 'next_run', 'enabled', 'container_id'],
            'rules': ['rule_id', 'enabled']
        }
        
        for collection_name, indexes in collections.items():
            collection = self.db[collection_name]
            for index in indexes:
                collection.create_index(index)
    
    def insert_alert(self, alert: Dict[str, Any]) -> bool:
        """Insert a security alert"""
        try:
            self.db.alerts.insert_one({**alert, 'created_at': datetime.utcnow()})
            return True
        except Exception as e:
            log.error("Failed to insert alert", error=str(e))
            return False
    
    def get_alerts(self, container_id: Optional[str] = None, limit: int = 100) -> List[Dict]:
        """Get alerts, optionally filtered by container"""
        try:
            query = {}
            if container_id:
                query['container_id'] = container_id
            
            alerts = list(
                self.db.alerts.find(query).sort('timestamp', -1).limit(limit)
            )
            return alerts
        except Exception as e:
            log.error("Failed to get alerts", error=str(e))
            return []
    
    def get_events(self, container_id: Optional[str] = None, hours: int = 24, limit: int = 1000) -> List[Dict]:
        """Get security events"""
        try:
            cutoff = datetime.utcnow() - timedelta(hours=hours)
            query = {'timestamp': {'$gte': cutoff}}
            
            if container_id:
                query['container_id'] = container_id
            
            events = list(
                self.db.security_events.find(query).sort('timestamp', -1).limit(limit)
            )
            return events
        except Exception as e:
            log.error("Failed to get events", error=str(e))
            return []
    
    def get_container_status(self, container_id: str) -> Optional[Dict]:
        """Get container status and metadata"""
        try:
            container = self.db.containers.find_one({'container_id': container_id})
            return container
        except Exception as e:
            log.error("Failed to get container status", error=str(e))
            return None
    
    def update_container_status(self, container_id: str, status: str) -> bool:
        """Update container status"""
        try:
            self.db.containers.update_one(
                {'container_id': container_id},
                {
                    '$set': {
                        'status': status,
                        'updated_at': datetime.utcnow()
                    }
                },
                upsert=True
            )
            return True
        except Exception as e:
            log.error("Failed to update container status", error=str(e))
            return False
    
    def get_dashboard_metrics(self) -> Dict[str, Any]:
        """Get dashboard summary metrics"""
        try:
            total_containers = self.db.containers.count_documents({})
            quarantined = self.db.containers.count_documents({'status': 'quarantined'})
            
            cutoff_24h = datetime.utcnow() - timedelta(hours=24)
            events_24h = self.db.security_events.count_documents(
                {'timestamp': {'$gte': cutoff_24h}}
            )
            critical_alerts = self.db.alerts.count_documents(
                {'risk_score': {'$gte': 80}}
            )
            
            return {
                'total_containers': total_containers,
                'quarantined_containers': quarantined,
                'events_24h': events_24h,
                'critical_alerts': critical_alerts
            }
        except Exception as e:
            log.error("Failed to get metrics", error=str(e))
            return {}
    
    def close(self):
        """Close database connection"""
        if self.client:
            self.client.close()
            log.info("MongoDB connection closed")
