"""Pydantic models for API validation"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class SecurityEvent(BaseModel):
    """Security event from eBPF daemon"""
    timestamp: datetime
    container_id: str
    pid: int
    uid: int
    event_type: str
    syscall_name: str
    filepath: Optional[str] = None
    risk_score: int = 0
    description: str


class Alert(BaseModel):
    """Security alert for high-risk events"""
    timestamp: datetime
    container_id: str
    container_name: Optional[str] = None
    event_type: Optional[str] = None  # PRIVILEGE_ESCALATION, MOUNT_ATTEMPT, etc.
    reason: str
    risk_score: int
    risk_category: Optional[str] = "UNKNOWN"  # CRITICAL, HIGH, MEDIUM, LOW
    severity: str = "HIGH"
    acknowledged: bool = False  # Whether alert has been acknowledged/dismissed
    acknowledged_at: Optional[datetime] = None
    acknowledged_by: Optional[str] = None
    metadata: Dict[str, Any] = {}


class Container(BaseModel):
    """Container status and metadata"""
    container_id: str
    status: str  # "running", "quarantined", "stopped"
    risk_level: str = "LOW"
    alert_count: int = 0
    last_event_timestamp: Optional[datetime] = None
    metadata: Dict[str, Any] = {}


class QuarantineRequest(BaseModel):
    """Request to quarantine a container"""
    container_id: str
    reason: str
    approved_by: str


class ForensicReport(BaseModel):
    """Forensic analysis report"""
    report_id: str
    container_id: str
    generated_at: datetime
    event_count: int
    critical_events: int
    high_risk_events: int
    timeline: List[SecurityEvent]
    summary: str
    recommendations: List[str]


class DetectionRule(BaseModel):
    """Detection rule configuration"""
    rule_id: str
    name: str
    event_type: str
    condition: str
    risk_score_delta: int = 0
    enabled: bool = True


class DashboardMetrics(BaseModel):
    """Dashboard summary metrics"""
    total_containers: int
    quarantined_containers: int
    events_24h: int
    critical_alerts: int
    average_response_time: float
    top_threat_types: List[str]
