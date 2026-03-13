"""Risk scoring engine for security events"""

import structlog
from typing import Dict, Any

log = structlog.get_logger(__name__)


class RiskScorer:
    """Calculates risk scores for security events"""
    
    def __init__(self):
        # Risk weights for different event types
        self.event_weights = {
            "PRIVILEGE_ESCALATION": 40,
            "MOUNT_ATTEMPT": 65,
            "CAPABILITY_CHANGE": 30,
            "PROCESS_TRACING": 30,
            "UNAUTHORIZED_FILE_ACCESS": 20,
            "EXEC": 5
        }
        
        # Risk multipliers based on target
        self.target_multipliers = {
            "/proc/sys": 2.0,
            "/sys": 2.0,
            "/etc/shadow": 3.0,
            "/etc/passwd": 2.5,
            "/dev": 1.5,
            "/etc": 1.3
        }
        
        # UID-based escalation risk
        self.uid_escalation_risk = 25
    
    def calculate(self, event: Dict[str, Any]) -> int:
        """
        Calculate risk score (0-100) for an event
        
        Factors:
        - Event type base weight
        - Target file/resource risk
        - UID/GID changes
        - Number of escalations
        """
        base_score = self.event_weights.get(
            event.get('event_type', 'UNKNOWN'),
            10
        )
        
        # Apply target multiplier
        filepath = event.get('filepath', '')
        multiplier = 1.0
        for dangerous_path, mult in self.target_multipliers.items():
            if filepath.startswith(dangerous_path):
                multiplier = max(multiplier, mult)
        
        risk_score = int(base_score * multiplier)
        
        # Escalation bonus
        if event.get('event_type') == "PRIVILEGE_ESCALATION":
            # Check if attempting to become root
            syscall_arg = event.get('syscall_args', [0])[0]
            if syscall_arg == 0:  # UID 0 is root
                risk_score += self.uid_escalation_risk
        
        # Cap at 100
        return min(risk_score, 100)
    
    def get_risk_level(self, score: int) -> str:
        """Get risk level description"""
        if score >= 80:
            return "CRITICAL"
        elif score >= 60:
            return "HIGH"
        elif score >= 40:
            return "MEDIUM"
        else:
            return "LOW"
