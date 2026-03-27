#!/usr/bin/env python3
"""
Kubernetes Pod Identity Resolver

Maps kernel PIDs to Kubernetes pod metadata:
- Pod name, namespace
- Pod labels (for policy selectors)
- Service account
- Owner (Deployment, StatefulSet, etc.)

Used by policy controller to match policies to pods.
"""

import subprocess
import json
import os
import re
from typing import Optional, Dict, List
from dataclasses import dataclass
from datetime import datetime
import logging

try:
    from kubernetes import client, config
    from kubernetes.client.rest import ApiException
except ImportError:
    print("ERROR: kubernetes library not found. Install with: pip install kubernetes")
    exit(1)

log = logging.getLogger(__name__)

@dataclass
class PodIdentity:
    """Kubernetes pod identity information"""
    pod_name: str
    namespace: str
    labels: Dict[str, str]
    service_account: str
    owner_kind: str  # Deployment, StatefulSet, DaemonSet, Job
    owner_name: str
    container_names: List[str]
    node_name: str = ""
    uid: str = ""


class PodIdentityResolver:
    """Resolve container PID to Kubernetes pod identity"""
    
    def __init__(self, cache_size: int = 10000, cache_ttl_seconds: int = 30):
        """
        Initialize resolver.
        
        Args:
            cache_size: Max cached pod identities
            cache_ttl_seconds: Cache entry TTL
        """
        self.cache: Dict[int, tuple] = {}  # pid -> (PodIdentity, timestamp)
        self.cache_size = cache_size
        self.cache_ttl = cache_ttl_seconds
        self.v1 = None
        self.pods_cache: Dict[str, PodIdentity] = {}  # namespace/name -> PodIdentity
        
        self._init_k8s_client()
    
    def _init_k8s_client(self) -> bool:
        """Initialize Kubernetes API client"""
        try:
            # Try in-cluster configuration first (running in pod)
            try:
                config.load_incluster_config()
                log.info("Loaded in-cluster Kubernetes config")
            except config.ConfigException:
                # Fallback to kubeconfig for local testing
                config.load_kube_config()
                log.info("Loaded kubeconfig")
            
            self.v1 = client.CoreV1Api()
            return True
        except Exception as e:
            log.error(f"Failed to initialize K8s client: {e}")
            return False
    
    def resolve(self, pid: int) -> Optional[PodIdentity]:
        """
        Map a process PID to its Kubernetes pod identity.
        
        Algorithm:
        1. Check cache first
        2. Get cgroup path from /proc/pid/cgroup
        3. Extract pod UUID from cgroup
        4. Query Kubernetes API for pod
        5. Cache result
        
        Args:
            pid: Process ID to resolve
            
        Returns:
            PodIdentity if found, None otherwise
        """
        
        # Check cache
        if pid in self.cache:
            identity, timestamp = self.cache[pid]
            age = datetime.utcnow().timestamp() - timestamp
            if age < self.cache_ttl:
                return identity
            else:
                del self.cache[pid]  # Expired
        
        try:
            # Get cgroup path
            cgroup = self._get_pod_cgroup(pid)
            if not cgroup:
                return None
            
            # Parse to extract pod ID
            pod_uuid = self._extract_pod_id_from_cgroup(cgroup)
            if not pod_uuid:
                return None
            
            # Query Kubernetes API
            identity = self._query_k8s_api(pod_uuid)
            
            if identity:
                # Cache it
                self.cache[pid] = (identity, datetime.utcnow().timestamp())
                
                # Evict old entries if cache full
                if len(self.cache) > self.cache_size:
                    oldest_pid = min(self.cache.keys(), 
                                    key=lambda p: self.cache[p][1])
                    del self.cache[oldest_pid]
            
            return identity
            
        except Exception as e:
            log.debug(f"Failed to resolve identity for pid {pid}: {e}")
            return None
    
    def _get_pod_cgroup(self, pid: int) -> Optional[str]:
        """Read cgroup path from /proc/pid/cgroup"""
        try:
            with open(f"/proc/{pid}/cgroup", "r") as f:
                lines = f.readlines()
                
                # Prefer kubepods or docker
                for line in lines:
                    if "kubepods" in line or "docker" in line:
                        return line.strip()
                
                # Fallback to first entry
                return lines[0].strip() if lines else None
        except (FileNotFoundError, IOError):
            return None
    
    def _extract_pod_id_from_cgroup(self, cgroup: str) -> Optional[str]:
        """
        Extract pod UUID from cgroup path.
        
        Examples:
        - /kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod12345abc.slice/
        - /docker/container_id
        - /kubepods/burstable/pod12345abc/
        """
        
        # Kubernetes cgroup format (UUID without dashes)
        match = re.search(r'pod([a-f0-9]{32})', cgroup)
        if match:
            pod_id = match.group(1)
            # Convert to UUID format: 12345abc... -> 12345abc-...
            return f"{pod_id[:8]}-{pod_id[8:12]}-{pod_id[12:16]}-{pod_id[16:20]}-{pod_id[20:]}"
        
        # Docker container ID
        match = re.search(r'([a-f0-9]{12})', cgroup)
        if match:
            return match.group(1)
        
        return None
    
    def _query_k8s_api(self, pod_id: str) -> Optional[PodIdentity]:
        """
        Query Kubernetes API to get pod metadata.
        
        Args:
            pod_id: Pod UUID or container ID
            
        Returns:
            PodIdentity if found
        """
        
        if not self.v1:
            return None
        
        try:
            # List all pods across all namespaces
            pods = self.v1.list_pod_for_all_namespaces(watch=False)
            
            for pod in pods.items:
                # Check if pod UUID matches
                if pod_id in pod.metadata.uid or pod_id == pod.metadata.uid:
                    return self._pod_to_identity(pod)
            
            return None
            
        except ApiException as e:
            log.error(f"Kubernetes API error: {e}")
            return None
        except Exception as e:
            log.error(f"Failed to query Kubernetes API: {e}")
            return None
    
    def _pod_to_identity(self, pod) -> PodIdentity:
        """Convert Kubernetes Pod object to PodIdentity"""
        
        # Extract owner information
        owner_kind = "Unknown"
        owner_name = "Unknown"
        
        if pod.metadata.owner_references:
            owner_ref = pod.metadata.owner_references[0]
            owner_kind = owner_ref.kind
            owner_name = owner_ref.name
        
        return PodIdentity(
            pod_name=pod.metadata.name,
            namespace=pod.metadata.namespace,
            labels=dict(pod.metadata.labels or {}),
            service_account=pod.spec.service_account_name,
            owner_kind=owner_kind,
            owner_name=owner_name,
            container_names=[c.name for c in pod.spec.containers],
            node_name=pod.spec.node_name or "",
            uid=pod.metadata.uid,
        )
    
    def matches_selector(self, identity: Optional[PodIdentity], selectors: List[Dict]) -> bool:
        """
        Check if pod identity matches policy selectors.
        
        Supports:
        - matchLabels (exact match)
        - matchNamespace
        - matchOwnerKind
        
        Args:
            identity: Pod identity to check
            selectors: List of selector conditions
            
        Returns:
            True if matches, False otherwise
        """
        
        if not identity:
            return False
        
        for selector in selectors:
            matched = True
            
            # Namespace check
            if 'matchNamespace' in selector:
                if identity.namespace != selector['matchNamespace']:
                    matched = False
            
            # Owner kind check
            if 'matchOwnerKind' in selector:
                if identity.owner_kind != selector['matchOwnerKind']:
                    matched = False
            
            # Label matching
            if 'matchLabels' in selector:
                for k, v in selector['matchLabels'].items():
                    if identity.labels.get(k) != v:
                        matched = False
                        break
            
            if matched:
                return True
        
        return False
    
    def clear_cache(self) -> None:
        """Clear the cache"""
        self.cache.clear()
        log.info("Cache cleared")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    resolver = PodIdentityResolver()
    
    # Test: resolve current process
    import os
    current_pid = os.getpid()
    
    log.info(f"Attempting to resolve PID {current_pid}")
    identity = resolver.resolve(current_pid)
    
    if identity:
        log.info(f"Pod: {identity.pod_name}")
        log.info(f"Namespace: {identity.namespace}")
        log.info(f"Labels: {identity.labels}")
        log.info(f"Owner: {identity.owner_kind}/{identity.owner_name}")
    else:
        log.info("Not running in Kubernetes or resolution failed")
