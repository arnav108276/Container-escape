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
        
        # Get process details
        enriched['process_info'] = self._get_process_info(event.pid)
        
        # Get container details
        enriched['container_info'] = self._get_container_info(event.container_id)
        
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
            5: "CAPABILITY_CHANGE"
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
        """Generate human-readable event description"""
        event_type = enriched['event_type']
        
        if event_type == "PRIVILEGE_ESCALATION":
            return f"Process {enriched['pid']} attempted to escalate privileges via {enriched['syscall_name']}"
        elif event_type == "UNAUTHORIZED_FILE_ACCESS":
            return f"Unauthorized access to {enriched['filepath']} from container {enriched['container_id']}"
        elif event_type == "MOUNT_ATTEMPT":
            return f"Mount attempt on {enriched['filepath']} in container {enriched['container_id']}"
        elif event_type == "EXEC":
            return f"Process execution: {enriched['filepath']}"
        else:
            return f"{event_type} detected in container {enriched['container_id']}"
