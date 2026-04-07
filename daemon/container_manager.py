"""Container management and quarantine operations"""

import docker
import subprocess
import json
import platform
import os
import structlog
from typing import Optional, List, Dict

log = structlog.get_logger(__name__)


class ContainerManager:
    """Manages container lifecycle and quarantine operations"""
    
    def __init__(self):
        self.quarantined_containers = set()
        self.os_type = platform.system()  # Windows, Linux, Darwin
        default_ignored = "container-escape-,major2-daemon,major2-backend,major2-frontend,major2-mongodb"
        self.ignored_prefixes = [
            p.strip() for p in os.getenv("IGNORED_CONTAINER_PREFIXES", default_ignored).split(",") if p.strip()
        ]
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
                        if self._is_ignored_container_name(container.name):
                            continue

                        baseline_score, findings = self._assess_runtime_risk(container)
                        is_paused = bool((container.attrs or {}).get("State", {}).get("Paused", False))
                        container_list.append({
                            'container_id': container.short_id,
                            'full_id': container.id,
                            'name': container.name,
                            'image': container.image.tags[0] if container.image.tags else 'unknown',
                            'status': 'quarantined' if is_paused else container.status,
                            'quarantined': is_paused or container.id in self.quarantined_containers,
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
                        container_name = container_data.get('Names', '')
                        if self._is_ignored_container_name(container_name):
                            continue

                        full_id = container_data.get('ID', '')
                        baseline_score, findings = self._assess_runtime_risk_from_cli(full_id, inspect_cache)
                        inspect_data = inspect_cache.get(full_id, {})
                        is_paused = bool((inspect_data.get("State") or {}).get("Paused", False))
                        containers.append({
                            'container_id': full_id[:12],
                            'full_id': full_id,
                            'name': container_name,
                            'image': container_data.get('Image', ''),
                            'status': 'quarantined' if is_paused else 'running',
                            'quarantined': is_paused,
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

    def _is_ignored_container_name(self, name: str) -> bool:
        """Return True when container name should be excluded from processing."""
        return bool(name) and any(name.startswith(prefix) for prefix in self.ignored_prefixes)

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

        # Blend score to avoid collapsing most risky configurations to 100.
        # Keeps differentiation while preserving severe ranges.
        if score > 0:
            score = min(95, int(score * 0.8 + min(len(findings) * 3, 12)))
        return score, findings

    def _score_to_level(self, score: int) -> str:
        if score <= 0:
            return "SAFE"
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
            target_id = self._resolve_container_id(container_id)
            # Pause container (hard requirement for quarantine)
            paused = self._pause_container(target_id)
            if not paused:
                log.error("Quarantine failed: unable to pause container", container_id=target_id)
                return False

            # Disconnect network (best effort; pause already blocks execution)
            self._disconnect_network(target_id)
            
            # Add to quarantined set
            self.quarantined_containers.add(target_id[:12])
            self.quarantined_containers.add(target_id)
            
            log.warning(
                "Container quarantined",
                container_id=target_id,
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
            for _ in range(3):
                result = subprocess.run(
                    ["docker", "pause", container_id],
                    capture_output=True,
                    text=True,
                    timeout=20,
                )
                if result.returncode == 0:
                    log.info("Container paused", container_id=container_id, method="docker_cli")
                    return True
                if "already paused" in (result.stderr or "").lower():
                    log.info("Container already paused", container_id=container_id, method="docker_cli")
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
        target_id = self._resolve_container_id(container_id)
        try:
            if self.docker_client:
                container = self.docker_client.containers.get(target_id)
                container.unpause()
                self.quarantined_containers.discard(target_id)
                self.quarantined_containers.discard(target_id[:12])
                log.info("Container unquarantined", container_id=target_id)
                return True

            result = subprocess.run(
                ["docker", "unpause", target_id],
                capture_output=True,
                text=True,
                timeout=20,
            )
            if result.returncode == 0:
                self.quarantined_containers.discard(target_id)
                self.quarantined_containers.discard(target_id[:12])
                log.info("Container unquarantined", container_id=target_id, method="docker_cli")
                return True
            log.error("Failed to unpause container", container_id=target_id, stderr=result.stderr.strip())
            return False
        except Exception as e:
            log.error(
                "Failed to unquarantine container",
                container_id=container_id,
                error=str(e)
            )
            return False

    def _resolve_container_id(self, container_id: str) -> str:
        """Resolve a possibly-short container id to full id when possible."""
        if not container_id:
            return container_id
        if self.docker_client:
            try:
                return self.docker_client.containers.get(container_id).id
            except Exception:
                pass
        return container_id
    
    def get_quarantined_containers(self) -> list:
        """Get list of quarantined containers"""
        return list(self.quarantined_containers)
