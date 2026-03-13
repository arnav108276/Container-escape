"""Event enrichment and processing module"""

import os
import json
import structlog
from typing import Dict, Any, Optional
from datetime import datetime

log = structlog.get_logger(__name__)


class EventProcessor:
    """Processes and enriches security events"""
    
    def enrich(self, event: Any) -> Dict[str, Any]:
        """Enrich event with additional context"""
        enriched = {
            'timestamp_ns': event.timestamp_ns,
            'timestamp': datetime.fromtimestamp(event.timestamp_ns / 1e9).isoformat(),
            'pid': event.pid,
            'uid': event.uid,
            'gid': event.gid,
            'event_type': self._get_event_type_name(event.event_type),
            'risk_level': event.risk_level,
            'container_id': event.container_id,
            'filepath': event.filepath,
            'syscall_nr': event.syscall_nr,
            'syscall_name': self._get_syscall_name(event.syscall_nr),
            'syscall_args': [
                event.syscall_arg0,
                event.syscall_arg1,
                event.syscall_arg2,
                event.syscall_arg3
            ]
        }
        
        # Resolve container ID from PID if kernel program provided placeholder
        if not enriched['container_id'] or enriched['container_id'] == 'unknown':
            enriched['container_id'] = self._resolve_container_id_from_pid(event.pid)

        # Get process details
        enriched['process_info'] = self._get_process_info(event.pid)
        
        # Get container details
        enriched['container_info'] = self._get_container_info(enriched['container_id'])
        
        # Determine event description
        enriched['description'] = self._get_event_description(enriched)
        
        return enriched
    
    def _get_event_type_name(self, event_type: int) -> str:
        """Get human-readable event type"""
        event_types = {
            1: "PRIVILEGE_ESCALATION",
            2: "UNAUTHORIZED_FILE_ACCESS",
            3: "MOUNT_ATTEMPT",
            4: "EXEC",
            5: "CAPABILITY_CHANGE",
            6: "PROCESS_TRACING"
        }
        return event_types.get(event_type, "UNKNOWN")
    
    def _get_syscall_name(self, syscall_nr: int) -> str:
        """Get syscall name from number"""
        syscall_names = {
            41: "socket",
            56: "clone",
            59: "execve",
            101: "ptrace",
            105: "setuid",
            106: "setgid",
            165: "mount",
            257: "openat",
            326: "capset"
        }
        return syscall_names.get(syscall_nr, f"syscall_{syscall_nr}")
    
    def _get_process_info(self, pid: int) -> Dict[str, Any]:
        """Extract process information from /proc"""
        try:
            with open(f"/proc/{pid}/status", "r") as f:
                status_lines = f.readlines()
                process_info = {}
                for line in status_lines[:10]:  # Get first 10 lines
                    key, value = line.strip().split(":", 1)
                    process_info[key.strip()] = value.strip()
                return process_info
        except:
            return {"pid": pid, "status": "unavailable"}
    

    def _resolve_container_id_from_pid(self, pid: int) -> str:
        """Best-effort extraction of container ID from /proc/<pid>/cgroup."""
        try:
            with open(f"/proc/{pid}/cgroup", "r") as f:
                for line in f:
                    cgroup_path = line.strip().split(":", 2)[-1]
                    tokens = [token for token in cgroup_path.replace('.scope', '').split('/') if token]
                    for token in reversed(tokens):
                        if token.startswith('docker-') and len(token) > 20:
                            return token.replace('docker-', '')[:12]
                        if len(token) >= 12 and all(ch in '0123456789abcdef' for ch in token[:12].lower()):
                            return token[:12]
        except Exception:
            pass

        return "unknown"

    def _get_container_info(self, container_id: str) -> Dict[str, Any]:
        """Get container metadata from Docker/Kubernetes"""
        try:
            # Docker: /var/lib/docker/containers/{id}/config.v2.json
            docker_config_path = f"/var/lib/docker/containers/{container_id}/config.v2.json"
            if os.path.exists(docker_config_path):
                with open(docker_config_path, "r") as f:
                    return json.load(f)
        except:
            pass
        
        return {"container_id": container_id, "status": "unavailable"}
    
    def _get_event_description(self, enriched: Dict[str, Any]) -> str:
        """Generate human-readable event description with risk details"""
        event_type = enriched['event_type']
        filepath = enriched.get('filepath', 'unknown')
        pid = enriched.get('pid', 'unknown')
        syscall_name = enriched.get('syscall_name', 'syscall')
        uid = enriched.get('uid', 'unknown')
        
        descriptions = {
            "PRIVILEGE_ESCALATION": (
                f"Privilege escalation attempt via {syscall_name}: "
                f"PID {pid} (UID {uid}) attempting to change effective user/group ID. "
                f"Possible container escape via privilege escalation."
            ),
            "UNAUTHORIZED_FILE_ACCESS": (
                f"Unauthorized access to sensitive file: {filepath}. "
                f"PID {pid} is accessing restricted system files that should not be accessible from within a container."
            ),
            "MOUNT_ATTEMPT": (
                f"Mount system call detected: attempting to mount {filepath}. "
                f"CRITICAL: Container escape via filesystem manipulation. Mount operations can expose host filesystem."
            ),
            "CAPABILITY_CHANGE": (
                f"Linux capability modification via {syscall_name}: "
                f"PID {pid} attempting to add/modify capabilities. "
                f"Could enable privilege escalation or mount operations."
            ),
            "PROCESS_TRACING": (
                f"Process tracing attempt detected via {syscall_name}: "
                f"PID {pid} attempted to inspect/control another process. "
                f"This can be used to tamper with host or peer container processes."
            ),
            "EXEC": (
                f"Suspicious process execution: {filepath} spawned by PID {pid}. "
                f"Possible malicious process or escape attempt."
            ),
        }
        
        return descriptions.get(event_type, 
            f"{event_type} detected in container: {filepath} via {syscall_name}")
