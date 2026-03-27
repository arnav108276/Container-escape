#!/usr/bin/env python3
"""
Kubernetes Policy Controller

Watches for TracingPolicy CRD changes and dynamically updates eBPF enforcement.
Supports hot-reload without daemon restart.
"""

import asyncio
import logging
import json
from typing import Dict, List, Optional
from datetime import datetime

try:
    from kubernetes import client, config, watch
    from kubernetes.client.rest import ApiException
except ImportError:
    print("ERROR: kubernetes library not found. Install with: pip install kubernetes")
    exit(1)

log = logging.getLogger(__name__)

# CRD Group and Version
CRD_GROUP = "security.io"
CRD_VERSION = "v1alpha1"
CRD_PLURAL = "tracingpolicies"


class PolicyController:
    """Watch and apply TracingPolicy CRDs"""
    
    def __init__(self, enforcer, pod_resolver):
        """
        Initialize controller.
        
        Args:
            enforcer: LSMEnforcer instance to update
            pod_resolver: PodIdentityResolver instance
        """
        self.enforcer = enforcer
        self.resolver = pod_resolver
        self.v1_custom = None
        self.policies: Dict[str, Dict] = {}  # key: "namespace/name"
        self._init_k8s_client()
    
    def _init_k8s_client(self) -> bool:
        """Initialize Kubernetes API client"""
        try:
            try:
                config.load_incluster_config()
                log.info("Loaded in-cluster Kubernetes config")
            except config.ConfigException:
                config.load_kube_config()
                log.info("Loaded kubeconfig")
            
            self.v1_custom = client.CustomObjectsApi()
            return True
        except Exception as e:
            log.error(f"Failed to initialize K8s client: {e}")
            return False
    
    async def start(self) -> None:
        """Start watching for policy changes"""
        if not self.v1_custom:
            log.error("K8s client not initialized")
            return
        
        log.info("Starting policy controller")
        
        # Load all existing policies
        await self._load_all_policies()
        
        # Watch for changes
        asyncio.create_task(self._watch_policies())
    
    async def _load_all_policies(self) -> None:
        """Load all active policies from cluster"""
        try:
            policies = self.v1_custom.list_cluster_custom_object(
                group=CRD_GROUP,
                version=CRD_VERSION,
                plural=CRD_PLURAL
            )
            
            log.info(f"Found {len(policies.get('items', []))} policies in cluster")
            
            for item in policies.get('items', []):
                await self._apply_policy(item)
                
        except ApiException as e:
            log.error(f"Failed to load policies: {e}")
    
    async def _watch_policies(self) -> None:
        """Watch for policy additions, updates, deletions"""
        
        w = watch.Watch()
        
        try:
            for event in w.stream(
                self.v1_custom.list_cluster_custom_object,
                group=CRD_GROUP,
                version=CRD_VERSION,
                plural=CRD_PLURAL,
                timeout_seconds=None
            ):
                obj = event['object']
                event_type = event['type']
                
                name = obj['metadata']['name']
                namespace = obj['metadata'].get('namespace', 'default')
                
                if event_type == 'ADDED' or event_type == 'MODIFIED':
                    await self._apply_policy(obj)
                    log.info(f"[{event_type}] Policy: {namespace}/{name}")
                
                elif event_type == 'DELETED':
                    await self._delete_policy(obj)
                    log.info(f"[DELETED] Policy: {namespace}/{name}")
                    
        except Exception as e:
            log.error(f"Error watching policies: {e}")
    
    async def _apply_policy(self, policy_obj: Dict) -> None:
        """
        Load a policy into enforcement.
        
        Converts policy YAML to enforcement rules.
        """
        
        name = policy_obj['metadata']['name']
        namespace = policy_obj['metadata'].get('namespace', 'default')
        spec = policy_obj['spec']
        
        key = f"{namespace}/{name}"
        
        try:
            rules = spec.get('rules', [])
            selectors = spec.get('selector', {})
            
            log.info(f"Applying policy {key} with {len(rules)} rules")
            
            # Process rules
            for rule in rules:
                rule_name = rule.get('name', 'unnamed')
                event_type = rule.get('event', '')
                action = rule.get('action', 'log')
                
                # Parse event type
                if 'file' in event_type.lower():
                    # File access rule
                    paths = rule.get('args', {}).get('paths', [])
                    for path in paths:
                        if action == 'block':
                            self.enforcer.add_blocked_path(path, block=True)
                        elif action == 'log':
                            self.enforcer.add_blocked_path(path, block=False)
                
                elif 'capability' in event_type.lower():
                    # Capability rule
                    caps = rule.get('args', {}).get('capabilities', [])
                    cap_map = {
                        'CAP_SYS_ADMIN': 21,
                        'CAP_SYS_PTRACE': 4,
                        'CAP_NET_ADMIN': 12,
                        'CAP_SYS_CHROOT': 22,
                        'CAP_SYS_RAWIO': 3,
                        'CAP_SYS_MODULE': 13,
                    }
                    
                    for cap_str in caps:
                        cap_num = cap_map.get(cap_str)
                        if cap_num and action == 'block':
                            self.enforcer.block_capability(cap_num)
            
            # Store policy
            self.policies[key] = spec
            
            log.info(f"Policy {key} applied successfully")
            
        except Exception as e:
            log.error(f"Failed to apply policy {key}: {e}")
    
    async def _delete_policy(self, policy_obj: Dict) -> None:
        """Remove policy from enforcement"""
        
        name = policy_obj['metadata']['name']
        namespace = policy_obj['metadata'].get('namespace', 'default')
        key = f"{namespace}/{name}"
        
        if key in self.policies:
            del self.policies[key]
            log.info(f"Removed policy {key}")
    
    async def evaluate_enforcement(self, event: Dict) -> Dict:
        """
        Determine if an event should be blocked based on policies.
        
        Args:
            event: Security event with pid, event_type, context
            
        Returns:
            Decision dict with action and reason
        """
        
        pid = event.get('pid')
        
        # Resolve pod identity
        identity = self.resolver.resolve(pid)
        if not identity:
            return {'action': 'log', 'reason': 'not_in_k8s'}
        
        # Find matching policies
        matching_policies = []
        for policy_spec in self.policies.values():
            selector = policy_spec.get('selector', {})
            
            # Check namespace match
            if 'matchNamespace' in selector:
                if identity.namespace != selector['matchNamespace']:
                    continue
            
            # Check label match
            if 'matchLabels' in selector:
                labels_match = all(
                    identity.labels.get(k) == v
                    for k, v in selector['matchLabels'].items()
                )
                if not labels_match:
                    continue
            
            matching_policies.append(policy_spec)
        
        # Evaluate rules from matching policies
        for policy in matching_policies:
            for rule in policy.get('rules', []):
                
                # Check if event matches rule
                event_type = rule.get('event', '')
                
                if 'file' in event_type.lower() and 'filepath' in event:
                    action = rule.get('action', 'log')
                    paths = rule.get('args', {}).get('paths', [])
                    
                    for path in paths:
                        if path in event.get('filepath', ''):
                            return {
                                'action': action,
                                'policy': policy.get('name'),
                                'rule': rule.get('name'),
                                'pod': identity.pod_name,
                                'namespace': identity.namespace,
                            }
        
        return {'action': 'allow', 'reason': 'no_matching_policy'}
    
    def get_policy_stats(self) -> Dict:
        """Get policy statistics"""
        return {
            'total_policies': len(self.policies),
            'policies': list(self.policies.keys()),
            'timestamp': datetime.utcnow().isoformat(),
        }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    log.info("Policy controller ready (requires enforcer and resolver instances)")
