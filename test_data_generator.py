#!/usr/bin/env python3
"""
Test Data Generator for Container Escape Detection System
Generates fake security events, alerts, and forensic data for demo/testing
"""

import os
import sys
import random
import json
from datetime import datetime, timedelta
from typing import List, Dict, Any
import argparse

import structlog
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

# Configure logging
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)
log = structlog.get_logger(__name__)


class TestDataGenerator:
    """Generate realistic test security events for demos"""
    
    # Event types that can trigger alerts
    EVENT_TYPES = [
        "PRIVILEGE_ESCALATION",
        "FILE_ACCESS_UNAUTHORIZED",
        "SYSCALL_BLOCKED",
        "PROCESS_SPAWN",
        "NETWORK_ABNORMAL",
        "CAPABILITY_ADD",
        "MOUNT_ATTEMPTED",
        "ESCAPE_ATTEMPT"
    ]
    
    # Severity levels
    SEVERITIES = ["low", "medium", "high", "critical"]
    
    # Risk levels
    RISK_LEVELS = ["low", "medium", "high", "critical"]
    
    # Sample container names
    CONTAINERS = [
        "web-server-prod",
        "api-gateway-prod",
        "database-primary",
        "cache-redis",
        "worker-queue",
        "monitoring-agent",
        "logging-service",
        "malicious-app"  # This one will have more events
    ]
    
    def __init__(self, mongodb_uri: str, db_name: str = "container_security"):
        self.mongodb_uri = mongodb_uri
        self.db_name = db_name
        self.client = None
        self.db = None
    
    def connect(self) -> bool:
        """Connect to MongoDB"""
        try:
            self.client = MongoClient(self.mongodb_uri, serverSelectionTimeoutMS=5000)
            self.client.admin.command('ping')
            self.db = self.client[self.db_name]
            log.info("Connected to MongoDB", uri=self.mongodb_uri)
            return True
        except ConnectionFailure as e:
            log.error("Failed to connect to MongoDB", error=str(e))
            return False
    
    def close(self):
        """Close MongoDB connection"""
        if self.client:
            self.client.close()
            log.info("MongoDB connection closed")
    
    def _generate_security_event(
        self,
        container_id: str,
        event_type: str,
        risk_score: int
    ) -> Dict[str, Any]:
        """Generate a realistic security event"""
        return {
            'timestamp': datetime.utcnow() - timedelta(hours=random.randint(0, 24)),
            'container_id': container_id,
            'event_type': event_type,
            'pid': random.randint(1, 32768),
            'uid': random.randint(0, 65534),
            'gid': random.randint(0, 65534),
            'syscall_nr': random.randint(0, 500),
            'filepath': random.choice([
                '/etc/passwd',
                '/etc/shadow',
                '/root/.ssh/id_rsa',
                '/proc/sys/kernel/yama/ptrace_scope',
                '/sys/firmware/efi',
                '/dev/kmem',
                '/proc/kcore'
            ]),
            'risk_score': risk_score,
            'metadata': {
                'process_name': random.choice(['sh', 'bash', 'curl', 'wget', 'nc', 'python']),
                'parent_process': random.choice(['init', 'systemd', 'docker']),
                'network_connection': f"{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}:8080" if random.random() > 0.5 else None,
                'file_operation': random.choice(['read', 'write', 'execute', 'open']) if random.random() > 0.5 else None,
            }
        }
    
    def _generate_alert(
        self,
        container_id: str,
        risk_score: int,
        event_type: str
    ) -> Dict[str, Any]:
        """Generate an alert from a security event"""
        if risk_score >= 80:
            severity = "critical"
        elif risk_score >= 60:
            severity = "high"
        elif risk_score >= 40:
            severity = "medium"
        else:
            severity = "low"
        
        reasons = {
            "PRIVILEGE_ESCALATION": "Unauthorized privilege escalation attempt detected",
            "FILE_ACCESS_UNAUTHORIZED": "Unauthorized file access attempt",
            "SYSCALL_BLOCKED": "Suspicious syscall intercepted",
            "PROCESS_SPAWN": "Unexpected process spawning detected",
            "NETWORK_ABNORMAL": "Abnormal network activity detected",
            "CAPABILITY_ADD": "Container capability escalation attempted",
            "MOUNT_ATTEMPTED": "Filesystem mount operation attempted",
            "ESCAPE_ATTEMPT": "Container escape attempt detected"
        }
        
        return {
            'timestamp': datetime.utcnow() - timedelta(hours=random.randint(0, 24)),
            'container_id': container_id,
            'reason': reasons.get(event_type, "Security event detected"),
            'risk_score': risk_score,
            'severity': severity,
            'metadata': {
                'event_type': event_type,
                'detected_by': 'ebpf_monitor',
                'action_taken': 'logged' if severity == "low" else 'quarantine_requested'
            }
        }
    
    def generate_events(self, count: int = 100) -> int:
        """Generate fake security events"""
        try:
            events = []
            
            for _ in range(count):
                container = random.choice(self.CONTAINERS)
                event_type = random.choice(self.EVENT_TYPES)
                
                # Malicious app gets higher risk scores
                if container == "malicious-app":
                    risk_score = random.randint(60, 95)
                elif event_type == "ESCAPE_ATTEMPT":
                    risk_score = random.randint(70, 99)
                elif event_type == "PRIVILEGE_ESCALATION":
                    risk_score = random.randint(50, 85)
                else:
                    risk_score = random.randint(10, 50)
                
                event = self._generate_security_event(container, event_type, risk_score)
                events.append(event)
            
            # Insert all events
            result = self.db.security_events.insert_many(events)
            log.info("Security events generated", count=len(result.inserted_ids))
            return len(result.inserted_ids)
        
        except Exception as e:
            log.error("Failed to generate events", error=str(e))
            return 0
    
    def generate_alerts(self, count: int = 50) -> int:
        """Generate fake security alerts"""
        try:
            alerts = []
            
            for _ in range(count):
                container = random.choice(self.CONTAINERS)
                event_type = random.choice(self.EVENT_TYPES)
                
                # Higher risk for certain containers
                if container == "malicious-app":
                    risk_score = random.randint(60, 98)
                else:
                    risk_score = random.randint(30, 85)
                
                alert = self._generate_alert(container, risk_score, event_type)
                alerts.append(alert)
            
            # Insert all alerts
            result = self.db.alerts.insert_many(alerts)
            log.info("Alerts generated", count=len(result.inserted_ids))
            return len(result.inserted_ids)
        
        except Exception as e:
            log.error("Failed to generate alerts", error=str(e))
            return 0
    
    def generate_reports(self) -> int:
        """Generate forensic reports for each container"""
        try:
            reports = []
            
            for container in self.CONTAINERS:
                # Get events for this container
                events = list(
                    self.db.security_events.find({'container_id': container}).limit(100)
                )
                
                if not events:
                    continue
                
                critical_count = sum(1 for e in events if e.get('risk_score', 0) >= 80)
                high_count = sum(1 for e in events if e.get('risk_score', 0) >= 60)
                
                report = {
                    'report_id': f"{container}_{datetime.utcnow().isoformat()}",
                    'container_id': container,
                    'generated_at': datetime.utcnow(),
                    'event_count': len(events),
                    'critical_events': critical_count,
                    'high_risk_events': high_count,
                    'summary': f"Forensic analysis for {container} with {len(events)} events",
                    'recommendations': self._get_recommendations(events),
                    'event_timeline': self._get_timeline_summary(events)
                }
                reports.append(report)
            
            if reports:
                result = self.db.forensic_reports.insert_many(reports)
                log.info("Forensic reports generated", count=len(result.inserted_ids))
                return len(result.inserted_ids)
            
            return 0
        
        except Exception as e:
            log.error("Failed to generate reports", error=str(e))
            return 0
    
    def _get_recommendations(self, events: List[Dict]) -> List[str]:
        """Generate recommendations based on events"""
        recommendations = []
        
        event_types = set(e.get('event_type') for e in events)
        
        if 'PRIVILEGE_ESCALATION' in event_types:
            recommendations.append("Implement stricter capability dropping on container startup")
        
        if 'FILE_ACCESS_UNAUTHORIZED' in event_types:
            recommendations.append("Enable read-only filesystem root to prevent unauthorized access")
        
        if 'ESCAPE_ATTEMPT' in event_types:
            recommendations.append("CRITICAL: Container attempted escape - isolate immediately and investigate")
        
        if 'PROCESS_SPAWN' in event_types:
            recommendations.append("Restrict process spawning using AppArmor or SELinux policies")
        
        if 'NETWORK_ABNORMAL' in event_types:
            recommendations.append("Implement network policies to restrict egress traffic")
        
        if not recommendations:
            recommendations.append("Continue monitoring for suspicious activity")
        
        return recommendations
    
    def _get_timeline_summary(self, events: List[Dict]) -> Dict[str, Any]:
        """Summarize event timeline"""
        if not events:
            return {}
        
        # Sort events by timestamp
        sorted_events = sorted(events, key=lambda x: x.get('timestamp', datetime.utcnow()))
        
        return {
            'first_event': sorted_events[0].get('timestamp').isoformat() if sorted_events else None,
            'last_event': sorted_events[-1].get('timestamp').isoformat() if sorted_events else None,
            'event_types': list(set(e.get('event_type') for e in events)),
            'peak_risk_score': max(e.get('risk_score', 0) for e in events) if events else 0
        }
    
    def clear_data(self):
        """Clear all test data"""
        try:
            self.db.security_events.delete_many({})
            self.db.alerts.delete_many({})
            self.db.forensic_reports.delete_many({})
            log.info("Test data cleared")
        except Exception as e:
            log.error("Failed to clear data", error=str(e))
    
    def generate_all(self, events: int = 100, alerts: int = 50):
        """Generate all test data"""
        log.info("Starting test data generation", events=events, alerts=alerts)
        
        # Generate events
        events_count = self.generate_events(events)
        
        # Generate alerts
        alerts_count = self.generate_alerts(alerts)
        
        # Generate reports
        reports_count = self.generate_reports()
        
        log.info(
            "Test data generation complete",
            events=events_count,
            alerts=alerts_count,
            reports=reports_count
        )
        
        return {
            'events': events_count,
            'alerts': alerts_count,
            'reports': reports_count
        }
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about generated data"""
        try:
            return {
                'total_events': self.db.security_events.count_documents({}),
                'total_alerts': self.db.alerts.count_documents({}),
                'total_reports': self.db.forensic_reports.count_documents({}),
                'containers': self.db.security_events.distinct('container_id'),
                'event_types': self.db.security_events.distinct('event_type')
            }
        except Exception as e:
            log.error("Failed to get stats", error=str(e))
            return {}


def main():
    parser = argparse.ArgumentParser(
        description="Generate test data for Container Escape Detection System"
    )
    parser.add_argument(
        '--mongodb-uri',
        default=os.getenv("MONGODB_URI", "mongodb://admin:password@localhost:27017"),
        help='MongoDB connection URI'
    )
    parser.add_argument(
        '--db-name',
        default='container_security',
        help='Database name'
    )
    parser.add_argument(
        '--events',
        type=int,
        default=100,
        help='Number of events to generate'
    )
    parser.add_argument(
        '--alerts',
        type=int,
        default=50,
        help='Number of alerts to generate'
    )
    parser.add_argument(
        '--clear',
        action='store_true',
        help='Clear existing test data before generating'
    )
    parser.add_argument(
        '--stats',
        action='store_true',
        help='Show statistics only'
    )
    
    args = parser.parse_args()
    
    generator = TestDataGenerator(args.mongodb_uri, args.db_name)
    
    if not generator.connect():
        sys.exit(1)
    
    try:
        if args.stats:
            stats = generator.get_stats()
            log.info("Current database statistics", **stats)
        else:
            if args.clear:
                generator.clear_data()
            
            result = generator.generate_all(args.events, args.alerts)
            
            log.info("Test data summary", **result)
            
            # Show final stats
            stats = generator.get_stats()
            log.info("Database statistics", **stats)
    finally:
        generator.close()


if __name__ == '__main__':
    main()
