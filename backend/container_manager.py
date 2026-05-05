"""Container management and quarantine operations"""

import docker
import subprocess
import json
import platform
import os
import structlog
from typing import Optional, List, Dict, Any
from urllib.parse import quote

# Optional faster unix-socket HTTP fallback using requests_unixsocket. We
# import lazily to avoid hard-failing when that dependency is not installed.
try:
    import requests_unixsocket
except Exception:
    requests_unixsocket = None

log = structlog.get_logger(__name__)

class ContainerManager:
    """Manages container lifecycle and quarantine operations"""
    
    def __init__(self):
        self.quarantined_containers = set()
        # Cache for container metadata fetched from the Docker daemon to avoid
        # repeated SDK/CLI lookups during short-lived operations.
        self.container_info_cache: Dict[str, Dict[str, Any]] = {}
        self.os_type = platform.system()
        # Add back the ignored prefixes so your own daemon doesn't flag itself
        default_ignored = "container-escape-,major2-daemon,major2-backend,major2-frontend,major2-mongodb"
        self.ignored_prefixes = [
            p.strip() for p in os.getenv("IGNORED_CONTAINER_PREFIXES", default_ignored).split(",") if p.strip()
        ]
        
        # Try connecting to the Docker daemon. Prefer the host unix socket
        # when it exists to avoid unsupported schemes like "http+docker://"
        # that can appear in some Docker Desktop/contexts setups.
        sock = "/var/run/docker.sock"
        self.sock_path = sock
        tried = []

        if os.path.exists(sock):
            # Temporarily clear Docker-related env vars to force a unix-socket connection.
            saved_env = {
                'DOCKER_HOST': os.environ.pop('DOCKER_HOST', None),
                'DOCKER_TLS_VERIFY': os.environ.pop('DOCKER_TLS_VERIFY', None),
                'DOCKER_CERT_PATH': os.environ.pop('DOCKER_CERT_PATH', None),
            }
            try:
                # Prioritize explicit unix socket to bypass problematic environment vars
                self.docker_client = docker.DockerClient(base_url=f"unix://{sock}")
                self.docker_client.ping()
                log.info("✓ Connected to Docker SDK via unix socket")
            except Exception as e:
                tried.append(f"unix_socket_error: {e}")
                self.docker_client = None
            finally:
                # Restore environment
                for k, v in saved_env.items():
                    if v is not None:
                        os.environ[k] = v

        # If unix socket path didn't work, fall back to docker.from_env()
        if not getattr(self, 'docker_client', None):
            try:
                self.docker_client = docker.from_env()
                self.docker_client.ping()
                log.info("✓ Connected to Docker SDK (from_env)")
            except Exception as e:
                tried.append(f"from_env_error: {e}")
                log.warning("Failed to connect to Docker SDK", error="; ".join(tried))
                self.docker_client = None

        # If SDK failed but requests_unixsocket is available, prepare a
        # session that can talk to the engine via the host socket. This is
        # used as a lightweight HTTP fallback (pause/unpause/inspect).
        self.rs_session = None
        if not getattr(self, 'docker_client', None) and requests_unixsocket and os.path.exists(sock):
            try:
                session = requests_unixsocket.Session()
                sock_url = quote(sock, safe='')
                # _ping returns OK when the engine is reachable
                resp = session.get(f"http+unix://{sock_url}/_ping", timeout=2)
                if resp.status_code == 200 and resp.text.strip().upper().startswith("OK"):
                    self.rs_session = session
                    log.info("✓ Connected to Docker via requests_unixsocket")
                else:
                    log.debug("requests_unixsocket ping failed", status_code=getattr(resp, 'status_code', None))
            except Exception as e:
                log.debug("requests_unixsocket unavailable", error=str(e))

    # ADD THIS METHOD so the loop in get_running_containers doesn't fail
    def _is_ignored_container_name(self, name: str) -> bool:
        """Return True when container name should be excluded."""
        return bool(name) and any(name.startswith(prefix) for prefix in self.ignored_prefixes)

    def _rs_url(self, path: str) -> str:
        """Build a requests_unixsocket URL for the given engine path."""
        # path must start with '/'
        if not path.startswith('/'):
            path = '/' + path
        return f"http+unix://{quote(self.sock_path, safe='')}{path}"

    # ... keep the rest of the code you provided ...

    def get_running_containers(self) -> List[Dict]:
        """Original logic for fetching containers"""
        container_list: List[Dict[str, Any]] = []

        # Prefer SDK when available
        if self.docker_client:
            try:
                sdk_containers = self.docker_client.containers.list()
                for container in sdk_containers:
                    if self._is_ignored_container_name(container.name):
                        continue

                    baseline_score, findings = self._assess_runtime_risk(container)
                    is_paused = bool((container.attrs or {}).get("State", {}).get("Paused", False))

                    container_list.append({
                        'container_id': container.short_id,
                        'full_id': container.id,
                        'name': container.name,
                        'image': container.image.tags if container.image.tags else 'unknown',
                        'status': 'quarantined' if is_paused else container.status,
                        'quarantined': is_paused or container.id in self.quarantined_containers,
                        'risk_level': self._score_to_level(baseline_score),
                        'risk_score': baseline_score,
                        'alert_count': 0,
                        'runtime_findings': findings,
                    })
                return container_list
            except Exception as e:
                log.warning("Error querying containers via SDK, falling back to CLI", error=str(e))

        # If a requests_unixsocket session is available, use the Engine API
        # to list containers without requiring the docker binary or SDK.
        if getattr(self, 'rs_session', None):
            try:
                # Default containers/json (without all=1) returns only running
                # containers which matches the behavior we want for runtime
                # inspection. Using all=1 includes stopped/exited containers and
                # inflates the running-count.
                url = self._rs_url('/containers/json')
                resp = self.rs_session.get(url, timeout=5)
                if resp.status_code != 200:
                    log.warning("containers/json returned non-200", status=resp.status_code)
                    return []

                inspect_list = resp.json()
                for c in inspect_list:
                    name = ''
                    # Docker API returns Names as a list
                    names = c.get('Names') or []
                    if isinstance(names, list) and names:
                        name = names[0].lstrip('/')
                    short_id = (c.get('Id') or '')[:12]
                    image = c.get('Image') or 'unknown'
                    status = c.get('Status') or c.get('State', '')

                    if self._is_ignored_container_name(name):
                        continue

                    baseline_score, findings = self._assess_runtime_risk_from_cli(short_id, {})
                    is_paused = (c.get('State') or '').lower() == 'paused' or 'Paused' in status

                    container_list.append({
                        'container_id': short_id,
                        'full_id': c.get('Id', ''),
                        'name': name,
                        'image': image,
                        'status': 'quarantined' if is_paused else status,
                        'quarantined': is_paused or short_id in self.quarantined_containers,
                        'risk_level': self._score_to_level(baseline_score),
                        'risk_score': baseline_score,
                        'alert_count': 0,
                        'runtime_findings': findings,
                    })
                return container_list
            except Exception as e:
                log.warning("Error querying containers via requests_unixsocket", error=str(e))

        # CLI fallback: use `docker ps` and `docker inspect` to build the list when
        # the SDK and requests_unixsocket are unavailable.
        try:
            result = subprocess.run(
                ["docker", "ps", "--no-trunc", "--format", "{{json .}}"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode != 0:
                log.warning("docker ps failed", stderr=(result.stderr or "").strip())
                return []

            inspect_cache: Dict[str, Dict] = {}
            for line in result.stdout.splitlines():
                if not line.strip():
                    continue
                try:
                    info = json.loads(line)
                    short_id = info.get('ID')
                    name = info.get('Names') or info.get('Name') or ''
                    image = info.get('Image') or 'unknown'
                    status = info.get('Status') or 'unknown'

                    if self._is_ignored_container_name(name):
                        continue

                    # Use inspect-based scoring when possible
                    baseline_score, findings = self._assess_runtime_risk_from_cli(short_id, inspect_cache)

                    is_paused = 'Paused' in status

                    container_list.append({
                        'container_id': short_id,
                        'full_id': inspect_cache.get(short_id, {}).get('Id', ''),
                        'name': name,
                        'image': image,
                        'status': 'quarantined' if is_paused else status,
                        'quarantined': is_paused or short_id in self.quarantined_containers,
                        'risk_level': self._score_to_level(baseline_score),
                        'risk_score': baseline_score,
                        'alert_count': 0,
                        'runtime_findings': findings,
                    })
                except Exception:
                    continue
            return container_list
        except Exception as e:
            log.warning("Error querying containers via CLI fallback", error=str(e))
            return []

    def get_container_id_from_pid(self, pid: int) -> Optional[str]:
        """Resolves PID to Container ID using cgroups"""
        try:
            with open(f"/proc/{pid}/cgroup", "r") as f:
                for line in f:
                    if "docker" in line:
                        # Extract the 64-char ID from the cgroup path
                        parts = line.strip().split('/')
                        for part in parts:
                            if len(part) == 64:
                                return part[:12]
        except Exception:
            return None
        return None
    
    async def get_container_by_pid(self, pid: int) -> Optional[Dict[str, Any]]:
        """Get container info by PID (async wrapper for compatibility)"""
        container_id = self.get_container_id_from_pid(pid)
        if container_id:
            return self.get_container_info(container_id)
        return None

    # Keep your existing quarantine/risk scoring methods below...

    def get_container_info(self, container_id: str) -> Dict[str, Any]:
        """Fetch metadata for a specific container with caching"""
        if container_id in self.container_info_cache:
            return self.container_info_cache[container_id]

        # If SDK is available prefer it for single-item fetches
        if self.docker_client:
            try:
                container = self.docker_client.containers.get(container_id)
                info = {
                    'container_id': container.short_id,
                    'full_id': container.id,
                    'name': container.name,
                    'image': container.image.tags if container.image.tags else 'unknown',
                    'status': container.status,
                }
                self.container_info_cache[container_id] = info
                return info
            except Exception:
                # Fall back to CLI inspect
                pass

        # CLI fallback inspect
        try:
            inspect_data = self._inspect_container(container_id)
            if not inspect_data:
                return {"container_id": container_id, "name": "unknown"}

            name = inspect_data.get('Name', '').lstrip('/')
            image = inspect_data.get('Config', {}).get('Image', 'unknown')
            status = inspect_data.get('State', {}).get('Status', 'unknown')
            info = {
                'container_id': container_id,
                'full_id': inspect_data.get('Id', ''),
                'name': name,
                'image': image,
                'status': status,
            }
            self.container_info_cache[container_id] = info
            return info
        except Exception:
            return {"container_id": container_id, "name": "unknown"}

    # ... Keep your existing get_running_containers, quarantine, etc. methods below ...
    
    # NOTE: _is_ignored_container_name is defined earlier in the file and
    # intentionally only needs a single implementation. This placeholder
    # exists to keep code readers aware of the helper; the real implementation
    # lives near the top of the class to ensure callers do not fail.

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
            # Prefer requests_unixsocket HTTP call if available (no SDK)
            if getattr(self, 'rs_session', None):
                # Use the engine API: /containers/{id}/json
                from urllib.parse import quote
                url = f"http+unix://{quote('/var/run/docker.sock', safe='')}/containers/{container_id}/json"
                resp = self.rs_session.get(url, timeout=3)
                if resp.status_code == 200:
                    return resp.json()
                return {}

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
        # Try requests_unixsocket Engine API when available
        if getattr(self, 'rs_session', None):
            try:
                url = self._rs_url(f"/containers/{container_id}/pause")
                resp = self.rs_session.post(url, timeout=5)
                if resp.status_code in (200, 204):
                    log.info("Container paused", container_id=container_id, method="rs_http")
                    return True
                # Some engines may return 500/409 when already paused; treat 409 as success
                if resp.status_code == 409:
                    log.info("Container already paused (rs_http)", container_id=container_id)
                    return True
                log.error("Pause via rs_http failed", status=resp.status_code, body=resp.text[:200])
            except Exception as e:
                log.warning("Pause via rs_http exception", error=str(e), container_id=container_id)

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
        # Prefer SDK if available
        if self.docker_client:
            try:
                container = self.docker_client.containers.get(container_id)
                networks = list(container.attrs['NetworkSettings']['Networks'].keys())
                for network_name in networks:
                    try:
                        self.docker_client.networks.get(network_name).disconnect(container_id)
                        log.info("Disconnected from network", container_id=container_id, network=network_name)
                    except Exception as e:
                        log.warning("Could not disconnect from network", error=str(e))
                return True
            except Exception as e:
                log.error("Could not disconnect network via SDK", error=str(e))

        # Try requests_unixsocket Engine API
        if getattr(self, 'rs_session', None):
            try:
                # Inspect container to find connected networks
                data = self._inspect_container(container_id)
                networks = list((data.get('NetworkSettings') or {}).get('Networks', {}).keys())
                for network_name in networks:
                    if network_name == 'host':
                        # Cannot disconnect host network
                        continue
                    try:
                        url = self._rs_url(f"/networks/{network_name}/disconnect")
                        body = {'Container': container_id, 'Force': False}
                        resp = self.rs_session.post(url, json=body, timeout=5)
                        if resp.status_code in (200, 204):
                            log.info("Disconnected from network", container_id=container_id, network=network_name)
                        else:
                            log.warning("Failed to disconnect network via rs_http", network=network_name, status=resp.status_code)
                    except Exception as e:
                        log.warning("Exception disconnecting network via rs_http", error=str(e))
                return True
            except Exception as e:
                log.error("Could not disconnect network via rs_http", error=str(e))

        # As a last resort, try CLI (may not be present in container image)
        try:
            result = subprocess.run(["docker", "network", "disconnect", "-f", "bridge", container_id], capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                log.info("Disconnected from default bridge network via CLI", container_id=container_id)
                return True
        except Exception:
            pass
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

            # Try requests_unixsocket Engine API
            if getattr(self, 'rs_session', None):
                try:
                    url = self._rs_url(f"/containers/{target_id}/unpause")
                    resp = self.rs_session.post(url, timeout=5)
                    if resp.status_code in (200, 204):
                        self.quarantined_containers.discard(target_id)
                        self.quarantined_containers.discard(target_id[:12])
                        log.info("Container unquarantined", container_id=target_id, method="rs_http")
                        return True
                    if resp.status_code == 409:
                        # Not paused
                        self.quarantined_containers.discard(target_id)
                        self.quarantined_containers.discard(target_id[:12])
                        log.info("Container not paused when unquarantine attempted", container_id=target_id)
                        return True
                except Exception as e:
                    log.warning("Unpause via rs_http exception", error=str(e), container_id=target_id)

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
        # If requests_unixsocket is available, inspect via Engine API and return
        # the canonical long ID when possible.
        if getattr(self, 'rs_session', None):
            try:
                data = self._inspect_container(container_id)
                if data and data.get('Id'):
                    return data.get('Id')
            except Exception:
                pass
        return container_id
    
    def get_quarantined_containers(self) -> list:
        """Get list of quarantined containers"""
        return list(self.quarantined_containers)
