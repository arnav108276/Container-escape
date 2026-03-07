"""Forensic logging module for detailed event recording"""

import structlog
from typing import Dict, Any, Optional
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
from datetime import datetime, timedelta

log = structlog.get_logger(__name__)


class ForensicLogger:
    """Logs all security events to MongoDB for forensic analysis"""
    
    def __init__(self, mongodb_uri: str, db_name: str = "container_security"):
        self.mongodb_uri = mongodb_uri
        self.db_name = db_name
        self.client: Optional[MongoClient] = None
        self.db = None
        self.collection = None
        
        self._connect()
    
    def _connect(self) -> bool:
        """Connect to MongoDB"""
        try:
            self.client = MongoClient(self.mongodb_uri, serverSelectionTimeoutMS=5000)
            # Verify connection
            self.client.admin.command('ping')
            
            self.db = self.client[self.db_name]
            self.collection = self.db['security_events']
            
            # Create indexes for efficient querying
            self.collection.create_index('timestamp')
            self.collection.create_index('container_id')
            self.collection.create_index('pid')
            self.collection.create_index([('timestamp', -1)])
            
            log.info("Connected to MongoDB", uri=self.mongodb_uri)
            return True
        except ConnectionFailure as e:
            log.error("Failed to connect to MongoDB", error=str(e))
            return False
    
    def log_event(self, event: Dict[str, Any]) -> bool:
        """Log security event to MongoDB"""
        try:
            if self.collection is None:
                log.warning("MongoDB collection not initialized")
                return False
            
            # Add metadata
            event_doc = {
                **event,
                'logged_at': datetime.utcnow(),
                'retention_until': datetime.utcnow() + timedelta(days=90)
            }
            
            # Insert document
            result = self.collection.insert_one(event_doc)
            log.debug("Event logged", event_id=str(result.inserted_id))
            return True
            
        except Exception as e:
            log.error("Failed to log event", error=str(e))
            return False
    
    def get_events_for_container(self, container_id: str, limit: int = 100) -> list:
        """Retrieve events for a specific container"""
        try:
            if self.collection is None:
                return []
            
            events = list(
                self.collection.find(
                    {'container_id': container_id}
                ).sort('timestamp', -1).limit(limit)
            )
            return events
        except Exception as e:
            log.error("Failed to retrieve events", error=str(e))
            return []
    
    def get_recent_events(self, hours: int = 24, limit: int = 500) -> list:
        """Get recent events for reporting"""
        try:
            if self.collection is None:
                return []
            
            cutoff_time = datetime.utcnow() - timedelta(hours=hours)
            events = list(
                self.collection.find(
                    {'timestamp': {'$gte': cutoff_time}}
                ).sort('timestamp', -1).limit(limit)
            )
            return events
        except Exception as e:
            log.error("Failed to retrieve recent events", error=str(e))
            return []
    
    def get_high_risk_events(self, risk_threshold: int = 70) -> list:
        """Get events above risk threshold"""
        try:
            if self.collection is None:
                return []
            
            events = list(
                self.collection.find(
                    {'risk_score': {'$gte': risk_threshold}}
                ).sort('risk_score', -1)
            )
            return events
        except Exception as e:
            log.error("Failed to retrieve high-risk events", error=str(e))
            return []
    
    def cleanup_old_events(self, days: int = 90) -> int:
        """Delete events older than retention period"""
        try:
            if self.collection is None:
                return 0
            
            cutoff_time = datetime.utcnow() - timedelta(days=days)
            result = self.collection.delete_many(
                {'retention_until': {'$lt': cutoff_time}}
            )
            log.info("Deleted old events", count=result.deleted_count)
            return result.deleted_count
        except Exception as e:
            log.error("Failed to cleanup old events", error=str(e))
            return 0
    
    def close(self):
        """Close MongoDB connection"""
        if self.client:
            self.client.close()
            log.info("MongoDB connection closed")
