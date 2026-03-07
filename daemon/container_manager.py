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
                        container_list.append({
                            'container_id': container.short_id,
                            'full_id': container.id,
                            'name': container.name,
                            'image': container.image.tags[0] if container.image.tags else 'unknown',
                            'status': container.status,
                            'quarantined': container.id in self.quarantined_containers,
                            'risk_level': 'low',
                            'alert_count': 0
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
                for line in result.stdout.strip().split('\n'):
                    if not line:
                        continue
                    try:
                        container_data = json.loads(line)
                        containers.append({
                            'container_id': container_data.get('ID', '')[:12],
                            'full_id': container_data.get('ID', ''),
                            'name': container_data.get('Names', ''),
                            'image': container_data.get('Image', ''),
                            'status': 'running',
                            'quarantined': False,
                            'risk_level': 'low',
                            'alert_count': 0
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
            # Pause container
            self._pause_container(container_id)
            
            # Disconnect network
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
        if not self.docker_client:
            return False
        
        try:
            container = self.docker_client.containers.get(container_id)
            container.pause()
            log.info("Container paused", container_id=container_id)
            return True
        except Exception as e:
            log.error("Could not pause container", error=str(e))
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
