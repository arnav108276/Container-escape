#!/usr/bin/env python3
"""
eBPF-based Container Escape Detection & Prevention System
User-space daemon for processing kernel events

This daemon acts as the control plane for the container escape detection system:
1. Receives security events from eBPF programs via ring buffer
2. Enriches events with container context
3. Calculates risk scores
4. Logs forensic data
5. Sends alerts to backend
6. Executes response actions (quarantine, isolation)
"""

import os
import sys
import time
import logging
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime

import structlog
from pydantic import BaseModel
import httpx

from event_processor import EventProcessor
from risk_scorer import RiskScorer
from container_manager import ContainerManager
from logger import ForensicLogger

# Configure structured logging
log = structlog.get_logger(__name__)


class SecurityEvent(BaseModel):
    """
    Schema for security events from eBPF programs
    
    Attributes:
        timestamp_ns: Event timestamp in nanoseconds
        pid: Process ID that triggered the event
        uid: User ID of the process
        gid: Group ID of the process
        event_type: Type of security event (1=file access, 2=syscall, 3=network, etc.)
        risk_level: Initial risk level from eBPF heuristics (0-100)
        container_id: Target container ID
        filepath: Path of accessed file or resource
        syscall_nr: Syscall number if applicable
        syscall_arg0-3: Syscall arguments for forensic analysis
    """
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
    """
    Main daemon for processing security events from eBPF programs
    
    Responsibilities:
    - Receive events from kernel eBPF ring buffer
    - Enrich events with container metadata
    - Calculate risk scores using ML-based scoring
    - Store forensic logs in MongoDB
    - Alert backend API for high-risk events
    - Execute automated response actions
    """

    def __init__(self):
        """Initialize daemon with configuration and components"""
        self.backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
        self.mongodb_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        self.log_level = os.getenv("LOG_LEVEL", "INFO")
        self.alert_threshold = int(os.getenv("ALERT_THRESHOLD", "40"))
        self.quarantine_threshold = 75  # Risk score threshold for auto-quarantine
        self.ignored_container_prefix = os.getenv("IGNORED_CONTAINER_PREFIX", "container-escape-daemon")
        
        # Initialize components
        self.event_processor = EventProcessor()
        self.risk_scorer = RiskScorer()
        self.container_manager = ContainerManager()
        self.forensic_logger = ForensicLogger(self.mongodb_uri)
        
        self.http_client = httpx.Client(timeout=10.0)
        self.running = False
        self.bpf = None
        self.bpf_event_table = None
        self.runtime_baseline_alerted = set()

        log.info(
            "Daemon initialized",
            backend_url=self.backend_url,
            alert_threshold=self.alert_threshold,
            quarantine_threshold=self.quarantine_threshold,
        )

    def process_event(self, event: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Process a single security event from eBPF
        
        Processing pipeline:
        1. Validate and parse event
        2. Enrich event with container context (image, labels, networks)
        3. Calculate risk score using ML model
        4. Log forensic data to MongoDB
        5. Determine response action based on risk level
        6. Send alert to backend if high-risk
        7. Execute response actions (quarantine, isolation, kill process)
        
        Args:
            event: Raw event dict from eBPF ring buffer
            
        Returns:
            Enriched event dict with risk score, or None on error
        """
        try:
            # Step 1: Validate and parse event
            sec_event = SecurityEvent(**event)

            if sec_event.container_id.startswith(self.ignored_container_prefix):
                return None
            
            log.info(
                "Event received",
                pid=sec_event.pid,
                event_type=sec_event.event_type,
                container_id=sec_event.container_id,
                filepath=sec_event.filepath
            )
            
            # Step 2: Enrich event with additional context
            enriched = self.event_processor.enrich(sec_event)

            container_name = (enriched.get("container_info") or {}).get("Name", "").lstrip("/")
            if container_name.startswith(self.ignored_container_prefix):
                return None
            
            # Step 3: Calculate risk score
            enriched['risk_score'] = self.risk_scorer.calculate(enriched)
            enriched['risk_category'] = self._categorize_risk(enriched['risk_score'])
            
            # Step 4: Log forensic data
            self.forensic_logger.log_event(enriched)
            
            # Step 5-7: Determine response based on risk level
            # CRITICAL risk: >= 75 (Auto-quarantine)
            if enriched['risk_score'] >= 75:
                log.warning(
                    "CRITICAL EVENT DETECTED - AUTO-QUARANTINE INITIATED",
                    container_id=enriched['container_id'],
                    risk_score=enriched['risk_score'],
                    risk_category="CRITICAL",
                    event_type=sec_event.event_type,
                    reason=enriched.get('description', 'Critical container escape attempt')
                )
                
                # Quarantine container immediately
                self.container_manager.quarantine(enriched['container_id'])
                
                # Send alert to backend
                self._send_alert(enriched)
            
            # Alert-worthy risk (default: >=40)
            elif enriched['risk_score'] >= self.alert_threshold:
                log.warning(
                    "ALERT THRESHOLD EVENT DETECTED",
                    container_id=enriched['container_id'],
                    risk_score=enriched['risk_score'],
                    risk_category=enriched['risk_category'],
                    event_type=sec_event.event_type
                )
                # Send to backend for monitoring but don't auto-quarantine
                self._send_alert(enriched)

            # Below alert threshold: forensic log only
            elif enriched['risk_score'] >= 40:
                log.info(
                    "MEDIUM RISK EVENT (below alert threshold)",
                    container_id=enriched['container_id'],
                    risk_score=enriched['risk_score'],
                    risk_category="MEDIUM",
                    event_type=sec_event.event_type
                )
            
            # LOW risk: < 40 (Forensic log only)
            else:
                log.debug(
                    "LOW RISK EVENT",
                    container_id=enriched['container_id'],
                    risk_score=enriched['risk_score'],
                    risk_category="LOW",
                    event_type=sec_event.event_type
                )
            
            return enriched
            
        except Exception as e:
            log.error("Error processing event", error=str(e), exc_info=True)
            return None

    def _categorize_risk(self, score: int) -> str:
        """Categorize risk score into severity levels"""
        if score >= 75:
            return "CRITICAL"
        elif score >= 50:
            return "HIGH"
        elif score >= 40:
            return "MEDIUM"
        else:
            return "LOW"

    def _send_alert(self, event: Dict[str, Any]) -> bool:
        """
        Send security alert to backend API
        
        Args:
            event: Enriched event dict with risk score
            
        Returns:
            True if alert sent successfully, False otherwise
        """
        try:
            alert_payload = {
                "timestamp": datetime.fromtimestamp(
                    event['timestamp_ns'] / 1e9
                ).isoformat(),
                "container_id": event['container_id'],
                "container_name": event.get('container_name', 'unknown'),
                "reason": event.get('description', 'Container escape attempt detected'),
                "risk_score": event['risk_score'],
                "risk_category": event.get('risk_category', 'UNKNOWN'),
                "event_type": event.get('event_type', 'unknown'),
                "severity": "critical" if event['risk_score'] >= 75 else "high" if event['risk_score'] >= 50 else "medium",
                "metadata": {
                    "filepath": event.get('filepath'),
                    "pid": event.get('pid'),
                    "uid": event.get('uid'),
                    "gid": event.get('gid'),
                    "syscall_nr": event.get('syscall_nr'),
                    "syscall_name": event.get('syscall_name')
                }
            }
            
            response = self.http_client.post(
                f"{self.backend_url}/api/alerts",
                json=alert_payload,
                timeout=5.0
            )
            
            response.raise_for_status()
            
            log.info(
                "Alert sent to backend",
                status_code=response.status_code,
                container_id=event['container_id'],
                risk_category=event.get('risk_category')
            )
            return response.status_code in [200, 201]
            
        except Exception as e:
            log.error(
                "Failed to send alert",
                error=str(e),
                container_id=event.get('container_id')
            )
            return False

    def _sync_containers(self) -> bool:
        """
        Sync running containers with backend
        
        Periodically sync the list of monitored containers to keep
        backend inventory in sync with actual running containers.
        
        Returns:
            True if sync successful, False otherwise
        """
        try:
            containers = self.container_manager.get_running_containers()
            
            if containers:
                response = self.http_client.post(
                    f"{self.backend_url}/api/containers/sync",
                    json={"containers": containers},
                    timeout=5.0
                )
                
                response.raise_for_status()
                
                log.info(
                    "Containers synced",
                    count=len(containers),
                    status_code=response.status_code
                )
                self._emit_runtime_risk_alerts(containers)
                return response.status_code in [200, 201]
            
            return False
            
        except Exception as e:
            log.error("Failed to sync containers", error=str(e), exc_info=True)
            return False

    def _load_ebpf(self) -> bool:
        """Load and attach eBPF program using BCC."""
        ebpf_source = os.getenv("EBPF_SOURCE_FILE")
        if ebpf_source:
            ebpf_file = Path(ebpf_source).expanduser()
        else:
            ebpf_file = Path(__file__).resolve().parent.parent / "ebpf" / "monitor.c"
        if not ebpf_file.exists():
            candidates = [
                Path("/ebpf/monitor.c"),
                Path(__file__).resolve().parent / "../ebpf/monitor.c",
                Path.cwd() / "../ebpf/monitor.c",
            ]
            for candidate in candidates:
                candidate = candidate.resolve()
                if candidate.exists():
                    ebpf_file = candidate
                    break

        if not ebpf_file.exists():
            log.error("eBPF source file not found", path=str(ebpf_file))
            return False

        try:
            from bcc import BPF  # type: ignore

            self.bpf = BPF(src_file=str(ebpf_file), cflags=["-I", str(ebpf_file.parent)])
            self.bpf_event_table = self.bpf["events"]
            self.bpf_event_table.open_ring_buffer(self._on_ringbuf_event)
            log.info("eBPF monitor loaded", source=str(ebpf_file), map_name="events")
            return True
        except Exception as e:
            log.warning("Failed to load eBPF monitor; running without kernel events", error=str(e))
            self.bpf = None
            self.bpf_event_table = None
            return False

    def _on_ringbuf_event(self, _ctx, data, _size):
        """Ring buffer callback: decode kernel event and send to pipeline."""
        if not self.bpf_event_table:
            return

        try:
            event = self.bpf_event_table.event(data)
            event_dict = {
                "timestamp_ns": int(getattr(event, "timestamp_ns", 0)),
                "pid": int(getattr(event, "pid", 0)),
                "uid": int(getattr(event, "uid", 0)),
                "gid": int(getattr(event, "gid", 0)),
                "event_type": int(getattr(event, "event_type", 0)),
                "risk_level": int(getattr(event, "risk_level", 0)),
                "container_id": bytes(getattr(event, "container_id", b""))
                    .split(b"\x00", 1)[0]
                    .decode("utf-8", errors="ignore"),
                "filepath": bytes(getattr(event, "filepath", b""))
                    .split(b"\x00", 1)[0]
                    .decode("utf-8", errors="ignore"),
                "syscall_nr": int(getattr(event, "syscall_nr", 0)),
                "syscall_arg0": int(getattr(event, "syscall_arg0", 0)),
                "syscall_arg1": int(getattr(event, "syscall_arg1", 0)),
                "syscall_arg2": int(getattr(event, "syscall_arg2", 0)),
                "syscall_arg3": int(getattr(event, "syscall_arg3", 0)),
            }
            self.process_event(event_dict)
        except Exception as e:
            log.error("Failed to decode eBPF event", error=str(e), exc_info=True)

    def _emit_runtime_risk_alerts(self, containers: list[Dict[str, Any]]) -> None:
        """Emit alerts for high-risk container runtime configuration baseline."""
        try:
            current_ids = {c.get("container_id") for c in containers if c.get("container_id")}
            self.runtime_baseline_alerted.intersection_update(current_ids)

            for container in containers:
                container_id = container.get("container_id")
                container_name = container.get("name", "")
                risk_score = int(container.get("risk_score", 0) or 0)
                findings = container.get("runtime_findings", [])

                if container_name.startswith(self.ignored_container_prefix):
                    continue

                if not container_id or risk_score < 50:
                    continue

                if container_id in self.runtime_baseline_alerted:
                    continue

                event = {
                    "timestamp_ns": int(time.time() * 1e9),
                    "container_id": container_id,
                    "risk_score": risk_score,
                    "risk_category": self._categorize_risk(risk_score),
                    "event_type": "RUNTIME_MISCONFIG",
                    "description": (
                        "High-risk runtime configuration detected: "
                        + ("; ".join(findings) if findings else "dangerous container runtime flags")
                    ),
                }

                self._send_alert(event)
                self.runtime_baseline_alerted.add(container_id)

                if risk_score >= self.quarantine_threshold:
                    self.container_manager.quarantine(container_id)

        except Exception as e:
            log.error("Failed to emit runtime baseline alerts", error=str(e), exc_info=True)

    def run(self):
        """
        Main daemon loop

        Poll eBPF ring buffer when available and keep container inventory synced.
        """
        self.running = True
        log.info("Daemon started")

        last_sync = 0.0
        ebpf_loaded = self._load_ebpf()

        try:
            while self.running:
                if time.time() - last_sync > 10:
                    self._sync_containers()
                    last_sync = time.time()

                if ebpf_loaded and self.bpf:
                    self.bpf.ring_buffer_poll(timeout=100)
                else:
                    time.sleep(0.1)

        except KeyboardInterrupt:
            log.info("Daemon shutting down (KeyboardInterrupt)")
            self.running = False
        except Exception as e:
            log.error("Daemon error", error=str(e), exc_info=True)
            sys.exit(1)

    def shutdown(self):
        """Graceful shutdown of daemon components"""
        self.running = False
        self.http_client.close()
        self.forensic_logger.close()
        self.bpf = None
        self.bpf_event_table = None
        self.runtime_baseline_alerted = set()
        log.info("Daemon stopped")


if __name__ == "__main__":
    daemon = EventDaemon()
    try:
        daemon.run()
    except KeyboardInterrupt:
        daemon.shutdown()
