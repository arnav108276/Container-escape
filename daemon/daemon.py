#!/usr/bin/env python3
"""
eBPF-based Container Escape Detection & Prevention System
User-space daemon for processing kernel events
"""

import os
import sys
import time
import logging
from typing import Optional, Dict, Any
from dataclasses import dataclass
from datetime import datetime

import structlog
from pydantic import BaseModel
import httpx

from event_processor import EventProcessor
from risk_scorer import RiskScorer
from container_manager import ContainerManager
from logger import ForensicLogger

# Configure logging
log = structlog.get_logger(__name__)


@dataclass
class SecurityEvent(BaseModel):
    timestamp_ns: int
    pid: int
    uid: int
    gid: int
    event_type: int
    risk_level: int
    container_id: str
    filepath: str
    syscall_nr: int
    syscall_arg0: int = 0
    syscall_arg1: int = 0
    syscall_arg2: int = 0
    syscall_arg3: int = 0


class EventDaemon:
    """Main daemon for processing security events from eBPF programs"""
    
    def __init__(self):
        self.backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
        self.mongodb_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        self.log_level = os.getenv("LOG_LEVEL", "INFO")
        
        self.event_processor = EventProcessor()
        self.risk_scorer = RiskScorer()
        self.container_manager = ContainerManager()
        self.forensic_logger = ForensicLogger(self.mongodb_uri)
        
        self.http_client = httpx.Client(timeout=10.0)
        self.running = False
        
        log.info("Daemon initialized", backend=self.backend_url)
    
    def process_event(self, event: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Process a single security event from eBPF
        
        Steps:
        1. Enrich event with additional context
        2. Calculate risk score
        3. Apply detection rules
        4. Log forensic data
        5. Send alert to backend if high-risk
        6. Execute response actions (quarantine, isolation)
        """
        try:
            # Parse event
            sec_event = SecurityEvent(**event)
            
            log.info(
                "Event received",
                pid=sec_event.pid,
                event_type=sec_event.event_type,
                container_id=sec_event.container_id
            )
            
            # Enrich event
            enriched = self.event_processor.enrich(sec_event)
            
            # Score risk
            enriched['risk_score'] = self.risk_scorer.calculate(enriched)
            
            # Log forensic data
            self.forensic_logger.log_event(enriched)
            
            # Determine if quarantine is needed
            if enriched['risk_score'] >= 75:  # Critical/High risk threshold
                log.warning(
                    "Critical event detected - initiating quarantine",
                    container_id=sec_event.container_id,
                    risk_score=enriched['risk_score']
                )
                
                # Quarantine container
                self.container_manager.quarantine(sec_event.container_id)
                
                # Send alert to backend
                self._send_alert(enriched)
            
            return enriched
            
        except Exception as e:
            log.error("Error processing event", error=str(e))
            return None
    
    def _send_alert(self, event: Dict[str, Any]) -> bool:
        """Send high-risk alert to backend"""
        try:
            response = self.http_client.post(
                f"{self.backend_url}/api/alerts",
                json={
                    "timestamp": datetime.fromtimestamp(
                        event['timestamp_ns'] / 1e9
                    ).isoformat(),
                    "container_id": event['container_id'],
                    "reason": event.get('description', 'Unknown threat'),
                    "risk_score": event['risk_score'],
                    "metadata": event
                }
            )
            log.info("Alert sent to backend", status=response.status_code)
            return response.status_code == 200
        except Exception as e:
            log.error("Failed to send alert", error=str(e))
            return False
    
    def _sync_containers(self) -> bool:
        """Sync running containers with backend"""
        try:
            containers = self.container_manager.get_running_containers()
            if containers:
                response = self.http_client.post(
                    f"{self.backend_url}/api/containers/sync",
                    json={"containers": containers}
                )
                log.info("Containers synced", count=len(containers), status=response.status_code)
                return response.status_code in [200, 201]
            return False
        except Exception as e:
            log.error("Failed to sync containers", error=str(e))
            return False
    
    def run(self):
        """Main daemon loop - simulated event receiver"""
        self.running = True
        log.info("Daemon started, waiting for events...")
        
        try:
            # Initial container sync
            self._sync_containers()
            
            last_sync = time.time()
            
            # In production, this would read from eBPF ring buffer
            # bpf_buffer = BPFRingBuffer(...)
            # bpf_buffer.open_ring_buffer(callback=self.process_event)
            
            while self.running:
                # Sync containers every 10 seconds
                if time.time() - last_sync > 10:
                    self._sync_containers()
                    last_sync = time.time()
                
                # Simulate event processing
                # In production, events would be received from syscall tracing
                time.sleep(0.1)
        
        except KeyboardInterrupt:
            log.info("Daemon shutting down")
            self.running = False
        except Exception as e:
            log.error("Daemon error", error=str(e))
            sys.exit(1)
    
    def shutdown(self):
        """Graceful shutdown"""
        self.running = False
        self.http_client.close()
        self.forensic_logger.close()
        log.info("Daemon stopped")


if __name__ == "__main__":
    daemon = EventDaemon()
    daemon.run()
