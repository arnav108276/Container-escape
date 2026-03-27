#!/usr/bin/env python3
"""
Enhanced Risk Scorer for Tetragon

Calculates risk scores for security events using multiple factors:
- Threat vector (what happened)
- Process ancestry (how we got here)
- Behavioral patterns (what's suspicious about this)
- Kubernetes context (what pod/namespace)

Scoring range: 0-100
- 0-20: Low risk (log only)
- 21-40: Medium risk (alert)
- 41-60: High risk (quarantine consideration)
- 61-100: Critical risk (auto-quarantine)
"""

from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
import logging

log = logging.getLogger(__name__)

# ============================================================================
# THREAT VECTORS
# ============================================================================

class EventType(Enum):
    """Supported event types"""
    FILE_OPEN = 1
    FILE_READ = 2
    FILE_WRITE = 3
    EXEC = 4
    SETUID = 5
    SETGID = 6
    CAPABILITY = 7
    NETWORK = 8
    MOUNT = 9
    PTRACE = 10
    MMAP = 11  # Memory mapping


# ============================================================================
# THREAT SCORING LOOKUP TABLES
# ============================================================================

THREAT_VECTOR_SCORES = {
    "privilege_escalation": 50,
    "file_access": 20,
    "execution": 15,
    "capability_change": 45,
    "network_connect": 10,
    "mount_attempt": 60,
    "ptrace_attempt": 40,
    "fileless_execution": 70,  # Memory-only execution is suspicious
}

SENSITIVE_PATHS = {
    "/etc/shadow": 80,        # Password file
    "/etc/passwd": 75,        # User database
    "/root/.ssh": 85,         # SSH keys
    "/.env": 90,              # Environment secrets
    "/var/lib/jenkins": 70,   # CI/CD secrets
    "/kubernetes": 85,        # K8s config
    "/proc/sys": 60,          # Kernel parameters
}

SUSPICIOUS_EXECUTABLES = {
    "nc": 70,         # Netcat (reverse shells)
    "ncat": 70,
    "socat": 70,      # Socket relay
    "bash": 5,        # Base risk, context matters
    "sh": 5,
    "curl": 10,       # Could be data exfiltration
    "wget": 10,
    "python": 15,     # Could be malicious script
    "perl": 15,
    "ruby": 15,
}

DANGEROUS_CAPABILITIES = {
    21: ("CAP_SYS_ADMIN", 80),          # Super-dangerous
    4: ("CAP_SYS_PTRACE", 70),          # Process debugging
    12: ("CAP_NET_ADMIN", 60),          # Network control
    22: ("CAP_SYS_CHROOT", 50),         # Chroot escape
    3: ("CAP_SYS_RAWIO", 75),           # Direct I/O
    13: ("CAP_SYS_MODULE", 85),         # Kernel modules
}

# ============================================================================
# SCORING MULTIPLIERS
# ============================================================================

class ProcessAncestryContext:
    """Track process execution chain"""
    
    def __init__(self):
        self.chain: List[Tuple[int, str, datetime]] = []  # (pid, comm, timestamp)
        self.ancestry_depth = 0
    
    def add_process(self, pid: int, comm: str) -> None:
        """Add process to chain"""
        self.chain.append((pid, comm, datetime.utcnow()))
        self.ancestry_depth = len(self.chain)
    
    def get_suspicious_lineage_multiplier(self) -> float:
        """
        Detect suspicious process ancestry patterns.
        
        Examples:
        - web server (nginx) → bash → chmod → high risk
        - init → normal app: low risk
        
        Returns: Multiplier 1.0-3.0
        """
        
        if len(self.chain) < 2:
            return 1.0  # Single process, no ancestry context
        
        parent, child = self.chain[-2], self.chain[-1]
        parent_comm = parent[1].lower()
        child_comm = child[1].lower()
        
        suspicious_patterns = [
            ("nginx", "bash"),      # Web server spawning shell
            ("apache2", "bash"),    # Web server spawning shell
            ("docker", "curl"),     # Container doing external requests
            ("python", "curl"),     # Python app exfiltrating data
            ("node", "nc"),         # Node.js using netcat
        ]
        
        # Check for suspicious parent -> child transitions
        for parent_pattern, child_pattern in suspicious_patterns:
            if parent_pattern in parent_comm and child_pattern in child_comm:
                return 2.5  # Very suspicious
        
        # Chain depth multiplier: deeper chains more suspicious
        if len(self.chain) > 5:
            return 1.5  # Deep execution tree
        
        return 1.0  # Normal lineage


# ============================================================================
# ENHANCED RISK SCORER
# ============================================================================

@dataclass
class SecurityEvent:
    """Unified security event"""
    timestamp: datetime
    pid: int
    uid: int
    gid: int
    event_type: EventType
    context: str  # What triggered this (e.g., filename, cap number)
    pod_name: Optional[str] = None
    namespace: Optional[str] = None
    labels: Optional[Dict[str, str]] = None
    was_blocked: bool = False


class EnhancedRiskScorer:
    """Advanced risk scoring with multiple dimensions"""
    
    def __init__(self):
        self.process_ancestry: Dict[int, ProcessAncestryContext] = {}
        self.event_history: List[SecurityEvent] = []
        self.anomaly_detector = AnomalyDetector()
    
    def score_event(self, event: SecurityEvent) -> Tuple[int, str]:
        """
        Calculate risk score for an event.
        
        Returns: (score: 0-100, risk_level: "low"/"medium"/"high"/"critical")
        """
        
        # Step 1: Base threat vector score
        base_score = self._calculate_threat_vector_score(event)
        
        # Step 2: Apply multipliers
        multiplier = 1.0
        
        # Process ancestry multiplier
        if event.pid in self.process_ancestry:
            ancestry_ctx = self.process_ancestry[event.pid]
            multiplier *= ancestry_ctx.get_suspicious_lineage_multiplier()
        
        # Behavioral multiplier (patterns)
        multiplier *= self._calculate_behavioral_multiplier(event)
        
        # Context multiplier (K8s labels)
        if event.labels:
            multiplier *= self._calculate_context_multiplier(event.labels)
        
        # Anomaly multiplier
        multiplier *= self.anomaly_detector.get_anomaly_multiplier(event)
        
        # Final score (clamped to 0-100)
        final_score = int(min(100, base_score * multiplier))
        
        # Determine risk level
        if final_score >= 75:
            risk_level = "critical"
        elif final_score >= 50:
            risk_level = "high"
        elif final_score >= 30:
            risk_level = "medium"
        else:
            risk_level = "low"
        
        # Record in history for anomaly detection
        self.event_history.append(event)
        if len(self.event_history) > 10000:  # Keep last 10k events
            self.event_history.pop(0)
        
        return final_score, risk_level
    
    def _calculate_threat_vector_score(self, event: SecurityEvent) -> float:
        """Score based on what action is being attempted"""
        
        base_score = 5  # Default low baseline
        
        if event.event_type == EventType.CAPABILITY:
            # Capability changes are dangerous
            cap_num = int(event.context) if event.context.isdigit() else -1
            if cap_num in DANGEROUS_CAPABILITIES:
                cap_name, score = DANGEROUS_CAPABILITIES[cap_num]
                base_score = score
        
        elif event.event_type in (EventType.FILE_OPEN, EventType.FILE_READ):
            # Check sensitive file access
            path = event.context
            for sensitive_path, score in SENSITIVE_PATHS.items():
                if sensitive_path in path:
                    base_score = score
                    break
        
        elif event.event_type == EventType.EXEC:
            # Check executable name
            exec_name = event.context.split('/')[-1].lower()
            for susexec, score in SUSPICIOUS_EXECUTABLES.items():
                if susexec in exec_name:
                    base_score = score
                    break
        
        elif event.event_type == EventType.MOUNT:
            # Mount attempts are dangerous (container escape)
            base_score = 85
        
        elif event.event_type == EventType.PTRACE:
            # Process tracing/debugging
            base_score = 70
        
        elif event.event_type == EventType.MMAP:
            # Memory mapping - could be in-memory execution
            base_score = 60
        
        return base_score
    
    def _calculate_behavioral_multiplier(self, event: SecurityEvent) -> float:
        """Score based on unusual behavior patterns"""
        
        multiplier = 1.0
        
        # If event was blocked, it was already unusual
        if event.was_blocked:
            multiplier *= 1.5
        
        # Check for rapid event patterns (burst attacks)
        recent_events = [e for e in self.event_history[-100:]  # Last 100 events
                        if (datetime.utcnow() - e.timestamp) < timedelta(seconds=10)]
        
        if len(recent_events) > 20:  # Many events in 10 seconds
            multiplier *= 2.0  # Suspicious burst
        
        # Check for attempted privilege escalation followed by sensitive file access
        recent_types = [e.event_type for e in recent_events[-10:]]
        if EventType.SETUID in recent_types and EventType.FILE_READ in recent_types:
            multiplier *= 2.0  # Classic attack pattern
        
        return multiplier
    
    def _calculate_context_multiplier(self, labels: Dict[str, str]) -> float:
        """Context-specific multiplier based on K8s labels"""
        
        multiplier = 1.0
        
        # Production environments: stricter scoring
        if labels.get("environment") == "production":
            multiplier *= 1.5
        
        # Critical services: stricter
        if labels.get("tier") == "critical":
            multiplier *= 1.3
        
        # Services that handle sensitive data: stricter
        if "payment" in labels.get("app", "").lower():
            multiplier *= 1.5
        
        if "auth" in labels.get("app", "").lower():
            multiplier *= 1.5
        
        if "secret" in str(labels).lower():
            multiplier *= 1.5
        
        return multiplier
    
    def update_process_ancestry(self, pid: int, parent_pid: int, comm: str) -> None:
        """Update process family tree"""
        
        if parent_pid not in self.process_ancestry:
            self.process_ancestry[parent_pid] = ProcessAncestryContext()
        
        ancestry = self.process_ancestry[parent_pid]
        ancestry.add_process(pid, comm)
        
        # Copy ancestry to child
        if parent_pid in self.process_ancestry:
            self.process_ancestry[pid] = self.process_ancestry[parent_pid]
        else:
            self.process_ancestry[pid] = ProcessAncestryContext()


# ============================================================================
# ANOMALY DETECTION
# ============================================================================

class AnomalyDetector:
    """Detect unusual patterns in events"""
    
    def __init__(self):
        self.baseline_events: Dict[str, int] = {}  # event signature -> count
        self.learning_phase = True
        self.learning_events = 1000  # Learn from first 1000 events
        self.events_seen = 0
    
    def get_anomaly_multiplier(self, event: SecurityEvent) -> float:
        """
        Return multiplier if event is anomalous.
        
        Returns: 1.0 (normal) to 2.0+ (anomalous)
        """
        
        if self.learning_phase:
            # Build baseline
            signature = f"{event.event_type.name}:{event.context}"
            self.baseline_events[signature] = self.baseline_events.get(signature, 0) + 1
            self.events_seen += 1
            
            if self.events_seen >= self.learning_events:
                self.learning_phase = False
                log.info("Anomaly detection learning phase complete")
            
            return 1.0
        
        # Check if event is anomalous
        signature = f"{event.event_type.name}:{event.context}"
        
        if signature not in self.baseline_events:
            # New type of event we haven't seen before
            return 2.0  # Anomaly!
        
        return 1.0  # Normal event type


# ============================================================================
# EXAMPLE USAGE & TESTING
# ============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    scorer = EnhancedRiskScorer()
    
    # Test 1: Normal file access
    event1 = SecurityEvent(
        timestamp=datetime.utcnow(),
        pid=1234,
        uid=1000,
        gid=1000,
        event_type=EventType.FILE_OPEN,
        context="/var/log/app.log",
        pod_name="app-pod",
        namespace="default",
        labels={"app": "webapp", "environment": "staging"},
    )
    
    score1, level1 = scorer.score_event(event1)
    print(f"Test 1 - Normal file access: Score={score1}, Level={level1}")
    assert level1 == "low", f"Expected low, got {level1}"
    
    # Test 2: Reading /etc/shadow (very dangerous)
    event2 = SecurityEvent(
        timestamp=datetime.utcnow(),
        pid=1234,
        uid=1000,
        gid=1000,
        event_type=EventType.FILE_OPEN,
        context="/etc/shadow",
        pod_name="app-pod",
        namespace="production",
        labels={"app": "payment", "environment": "production", "tier": "critical"},
        was_blocked=True,
    )
    
    score2, level2 = scorer.score_event(event2)
    print(f"Test 2 - Reading /etc/shadow: Score={score2}, Level={level2}")
    assert level2 in ["high", "critical"], f"Expected high/critical, got {level2}"
    
    # Test 3: Process ancestry (nginx spawning shell)
    scorer.update_process_ancestry(5678, 1234, "bash")
    event3 = SecurityEvent(
        timestamp=datetime.utcnow(),
        pid=5678,
        uid=33,  # www-data user
        gid=33,
        event_type=EventType.EXEC,
        context="/bin/bash",
        pod_name="web-pod",
        namespace="production",
        labels={"app": "web", "environment": "production"},
    )
    
    score3, level3 = scorer.score_event(event3)
    print(f"Test 3 - Web server spawning shell: Score={score3}, Level={level3}")
    assert level3 in ["medium", "high", "critical"], f"Expected medium+, got {level3}"
    
    print("\n✓ All tests passed!")
