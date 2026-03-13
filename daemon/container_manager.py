"""Container management and quarantine operations"""

import docker
import subprocess
import json
import platform
import structlog
from typing import Optional, List, Dict

log = structlog.get_logger(__name__)


class ContainerManager:
    """Manages container lifecycle and quarantine operations"""
    
    def __init__(self):
        self.quarantined_containers = set()
        self.os_type = platform.system()  # Windows, Linux, Darwin
        try:
            self.docker_client = docker.from_env()
        except Exception as e:
            log.warning("Failed to connect to Docker SDK", error=str(e))
            self.docker_client = None
    
    def get_running_containers(self) -> List[Dict]:
        """
        Get list of all running containers from Docker
        Returns container info including ID, name, status
        
        Tries multiple methods depending on OS:
        - Docker Python SDK (all platforms)
        - Docker CLI (all platforms if docker is in PATH)
        - Empty list as fallback (data populated via API or script)
        """
        # Try Docker Python SDK first
        if self.docker_client:
            try:
                containers = self.docker_client.containers.list()
                container_list = []
                
                for container in containers:
                    try:
                        baseline_score, findings = self._assess_runtime_risk(container)
                        container_list.append({
                            'container_id': container.short_id,
                            'full_id': container.id,
                            'name': container.name,
                            'image': container.image.tags[0] if container.image.tags else 'unknown',
                            'status': container.status,
                            'quarantined': container.id in self.quarantined_containers,
                            'risk_level': self._score_to_level(baseline_score),
                            'risk_score': baseline_score,
                            'alert_count': 0,
                            'runtime_findings': findings,
                        })
                    except Exception as e:
                        log.warning("Failed to process container", error=str(e))
                        continue
                
                if container_list:
                    log.info("Found containers via SDK", count=len(container_list), os=self.os_type)
                    return container_list
            except Exception as e:
                log.warning("Error querying Docker SDK", error=str(e))
        
        # Try Docker CLI as fallback
        try:
            command = ["docker", "ps", "--no-trunc", "--format", "json"]
            
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                containers = []
                inspect_cache: Dict[str, Dict] = {}
                for line in result.stdout.strip().split('\n'):
                    if not line:
                        continue
                    try:
                        container_data = json.loads(line)
                        full_id = container_data.get('ID', '')
                        baseline_score, findings = self._assess_runtime_risk_from_cli(full_id, inspect_cache)
                        containers.append({
                            'container_id': full_id[:12],
                            'full_id': full_id,
                            'name': container_data.get('Names', ''),
                            'image': container_data.get('Image', ''),
                            'status': 'running',
                            'quarantined': False,
                            'risk_level': self._score_to_level(baseline_score),
                            'risk_score': baseline_score,
                            'alert_count': 0,
                            'runtime_findings': findings,
                        })
                    except json.JSONDecodeError:
                        continue
                
                if containers:
                    log.info("Found containers via CLI", count=len(containers), os=self.os_type)
                    return containers
        except FileNotFoundError:
            log.warning("Docker CLI not found in PATH", os=self.os_type)
        except Exception as e:
            log.warning("Error querying Docker CLI", error=str(e), os=self.os_type)
        
        # Fallback: Return empty list (containers can be populated via API)
        log.info("No containers discovered - use API endpoint or script to populate", os=self.os_type)
        return []

    def _assess_runtime_risk_from_cli(self, container_id: str, inspect_cache: Dict[str, Dict]) -> tuple[int, List[str]]:
        """Compute runtime risk score when Docker SDK is unavailable using `docker inspect`."""
        if not container_id:
            return (0, [])

        inspect_data = inspect_cache.get(container_id)
        if inspect_data is None:
            inspect_data = self._inspect_container(container_id)
            inspect_cache[container_id] = inspect_data

        if not inspect_data:
            return (0, [])

        host_config = inspect_data.get("HostConfig", {})
        return self._score_host_config(host_config)

    def _inspect_container(self, container_id: str) -> Dict:
        """Return parsed docker inspect payload for one container."""
        try:
            result = subprocess.run(
                ["docker", "inspect", container_id],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode != 0:
                return {}

            payload = json.loads(result.stdout)
            if isinstance(payload, list) and payload:
                return payload[0]
            return {}
        except Exception:
            return {}

    def _assess_runtime_risk(self, container) -> tuple[int, List[str]]:
        """Compute a baseline runtime risk score from container configuration."""
        attrs = container.attrs or {}
        host_config = attrs.get("HostConfig", {})

        return self._score_host_config(host_config)

    def _score_host_config(self, host_config: Dict) -> tuple[int, List[str]]:
        """Score risky runtime options from Docker HostConfig."""
        score = 0
        findings: List[str] = []

        if host_config.get("Privileged"):
            score += 55
            findings.append("Container is running in privileged mode")

        if host_config.get("PidMode") == "host":
            score += 25
            findings.append("Container shares host PID namespace")

        if host_config.get("NetworkMode") == "host":
            score += 20
            findings.append("Container shares host network namespace")

        binds = host_config.get("Binds") or []
        if any(str(bind).startswith("/:") or str(bind).startswith("/:/") for bind in binds):
            score += 30
            findings.append("Host root filesystem is bind-mounted into the container")

        cap_add = host_config.get("CapAdd") or []
        if any(cap in {"SYS_ADMIN", "ALL", "SYS_PTRACE"} for cap in cap_add):
            score += 20
            findings.append("Dangerous Linux capabilities are added (SYS_ADMIN/ALL/SYS_PTRACE)")

        security_opt = host_config.get("SecurityOpt") or []
        if any(opt in {"seccomp=unconfined", "apparmor=unconfined", "label=disable"} for opt in security_opt):
            score += 15
            findings.append("Container security profile is unconfined")

        if host_config.get("IpcMode") == "host":
            score += 10
            findings.append("Container shares host IPC namespace")

        return min(score, 100), findings

    def _score_to_level(self, score: int) -> str:
        if score >= 75:
            return "CRITICAL"
        if score >= 50:
            return "HIGH"
        if score >= 40:
            return "MEDIUM"
        return "LOW"
    
    
    def quarantine(self, container_id: str) -> bool:
        """
        Quarantine an affected container
        
        Steps:
        1. Pause the container
        2. Disconnect its network
        3. Log the action
        """
        if container_id in self.quarantined_containers:
            log.info("Container already quarantined", container_id=container_id)
            return True
        
        try:
            # Pause container (hard requirement for quarantine)
            paused = self._pause_container(container_id)
            if not paused:
                log.error("Quarantine failed: unable to pause container", container_id=container_id)
                return False

            # Disconnect network (best effort; pause already blocks execution)
            self._disconnect_network(container_id)
            
            # Add to quarantined set
            self.quarantined_containers.add(container_id)
            
            log.warning(
                "Container quarantined",
                container_id=container_id,
                action="paused and isolated"
            )
            return True
            
        except Exception as e:
            log.error(
                "Failed to quarantine container",
                container_id=container_id,
                error=str(e)
            )
            return False
    
    def _pause_container(self, container_id: str) -> bool:
        """Pause a Docker container"""
        if self.docker_client:
            try:
                container = self.docker_client.containers.get(container_id)
                container.pause()
                log.info("Container paused", container_id=container_id, method="docker_sdk")
                return True
            except Exception as e:
                log.warning("Could not pause container via SDK", error=str(e), container_id=container_id)

        # CLI fallback for environments where SDK is unavailable
        try:
            result = subprocess.run(
                ["docker", "pause", container_id],
                capture_output=True,
                text=True,
                timeout=8,
            )
            if result.returncode == 0:
                log.info("Container paused", container_id=container_id, method="docker_cli")
                return True
            log.error("Could not pause container via CLI", container_id=container_id, stderr=result.stderr.strip())
            return False
        except Exception as e:
            log.error("Could not pause container", error=str(e), container_id=container_id)
            return False
    
    def _disconnect_network(self, container_id: str) -> bool:
        """Disconnect container from network"""
        if not self.docker_client:
            return False
        
        try:
            container = self.docker_client.containers.get(container_id)
            
            # Get all connected networks
            networks = list(container.attrs['NetworkSettings']['Networks'].keys())
            
            # Disconnect from all networks
            for network_name in networks:
                try:
                    self.docker_client.networks.get(network_name).disconnect(container_id)
                    log.info("Disconnected from network", container_id=container_id, network=network_name)
                except Exception as e:
                    log.warning("Could not disconnect from network", error=str(e))
            
            return True
        except Exception as e:
            log.error("Could not disconnect network", error=str(e))
            return False
    
    def unquarantine(self, container_id: str) -> bool:
        """Restore a quarantined container (manual approval required)"""
        if not self.docker_client:
            return False
        
        try:
            container = self.docker_client.containers.get(container_id)
            container.unpause()
            self.quarantined_containers.discard(container_id)
            log.info("Container unquarantined", container_id=container_id)
            return True
        except Exception as e:
            log.error(
                "Failed to unquarantine container",
                container_id=container_id,
                error=str(e)
            )
            return False
    
    def get_quarantined_containers(self) -> list:
        """Get list of quarantined containers"""
        return list(self.quarantined_containers)
