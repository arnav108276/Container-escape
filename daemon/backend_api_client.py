"""
Modularized daemon - API Client
Handles communication with backend API
"""

import aiohttp
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime
import asyncio

logger = logging.getLogger(__name__)


class BackendAPIClient:
    """Client for communicating with backend API"""
    
    def __init__(self, base_url: str, api_key: Optional[str] = None, timeout: int = 30):
        self.base_url = base_url.rstrip('/')
        self.api_key = api_key
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.session: Optional[aiohttp.ClientSession] = None
        self.request_count = 0
        self.error_count = 0
    
    async def __aenter__(self):
        """Async context manager entry"""
        self.session = aiohttp.ClientSession(timeout=self.timeout)
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()
    
    def _get_headers(self) -> Dict[str, str]:
        """Get request headers"""
        headers = {'Content-Type': 'application/json'}
        if self.api_key:
            headers['Authorization'] = f'Bearer {self.api_key}'
        return headers
    
    async def send_event(self, event_data: Dict[str, Any]) -> bool:
        """Send a security event to backend"""
        try:
            if not self.session:
                raise RuntimeError('Client not initialized. Use async with statement.')
            
            url = f'{self.base_url}/api/events'
            async with self.session.post(url, json=event_data, headers=self._get_headers()) as resp:
                self.request_count += 1
                if resp.status == 200 or resp.status == 201:
                    logger.debug(f'Event sent successfully: {resp.status}')
                    return True
                else:
                    logger.error(f'Failed to send event: {resp.status}')
                    self.error_count += 1
                    return False
                    
        except Exception as e:
            logger.error(f'Error sending event: {e}')
            self.error_count += 1
            return False
    
    async def send_events_batch(self, events: List[Dict[str, Any]]) -> int:
        """Send multiple events in batch"""
        if not events:
            return 0
        
        success_count = 0
        for event in events:
            if await self.send_event(event):
                success_count += 1
        
        return success_count
    
    async def create_alert(self, alert_data: Dict[str, Any]) -> Optional[str]:
        """Create an alert in the backend"""
        try:
            if not self.session:
                raise RuntimeError('Client not initialized. Use async with statement.')
            
            url = f'{self.base_url}/api/alerts'
            async with self.session.post(url, json=alert_data, headers=self._get_headers()) as resp:
                self.request_count += 1
                if resp.status == 200 or resp.status == 201:
                    data = await resp.json()
                    logger.debug(f'Alert created: {data.get("id")}')
                    return data.get('id')
                else:
                    logger.error(f'Failed to create alert: {resp.status}')
                    self.error_count += 1
                    return None
                    
        except Exception as e:
            logger.error(f'Error creating alert: {e}')
            self.error_count += 1
            return None
    
    async def acknowledge_alert(self, alert_id: str) -> bool:
        """Acknowledge an alert"""
        try:
            if not self.session:
                raise RuntimeError('Client not initialized. Use async with statement.')
            
            url = f'{self.base_url}/api/alerts/{alert_id}/acknowledge'
            async with self.session.post(url, headers=self._get_headers()) as resp:
                self.request_count += 1
                if resp.status == 200:
                    logger.debug(f'Alert acknowledged: {alert_id}')
                    return True
                else:
                    logger.error(f'Failed to acknowledge alert: {resp.status}')
                    self.error_count += 1
                    return False
                    
        except Exception as e:
            logger.error(f'Error acknowledging alert: {e}')
            self.error_count += 1
            return False
    
    async def update_container_risk(self, container_id: str, risk_score: float) -> bool:
        """Update container risk score"""
        try:
            if not self.session:
                raise RuntimeError('Client not initialized. Use async with statement.')
            
            url = f'{self.base_url}/api/containers/{container_id}/risk-score'
            async with self.session.post(
                url,
                json={'risk_score': risk_score},
                headers=self._get_headers()
            ) as resp:
                self.request_count += 1
                if resp.status == 200:
                    logger.debug(f'Container risk updated: {container_id} -> {risk_score}')
                    return True
                else:
                    logger.error(f'Failed to update container risk: {resp.status}')
                    self.error_count += 1
                    return False
                    
        except Exception as e:
            logger.error(f'Error updating container risk: {e}')
            self.error_count += 1
            return False
    
    async def get_metrics(self) -> Optional[Dict[str, Any]]:
        """Get system metrics from backend"""
        try:
            if not self.session:
                raise RuntimeError('Client not initialized. Use async with statement.')
            
            url = f'{self.base_url}/api/metrics'
            async with self.session.get(url, headers=self._get_headers()) as resp:
                self.request_count += 1
                if resp.status == 200:
                    return await resp.json()
                else:
                    logger.error(f'Failed to get metrics: {resp.status}')
                    self.error_count += 1
                    return None
                    
        except Exception as e:
            logger.error(f'Error getting metrics: {e}')
            self.error_count += 1
            return None
    
    async def health_check(self) -> bool:
        """Check backend API health"""
        try:
            if not self.session:
                raise RuntimeError('Client not initialized. Use async with statement.')
            
            url = f'{self.base_url}/api/health'
            async with self.session.get(url, headers=self._get_headers()) as resp:
                self.request_count += 1
                return resp.status == 200
                     
        except Exception as e:
            logger.error(f'Health check failed: {e}')
            self.error_count += 1
            return False
    
    async def sync_containers(self, containers: List[Dict[str, Any]]) -> bool:
        """Sync running containers to backend"""
        try:
            if not self.session:
                raise RuntimeError('Client not initialized. Use async with statement.')
            
            url = f'{self.base_url}/api/containers/sync'
            async with self.session.post(
                url,
                json={'containers': containers},
                headers=self._get_headers()
            ) as resp:
                self.request_count += 1
                if resp.status in (200, 201):
                    logger.debug(f'Containers synced: {len(containers)} containers')
                    return True
                else:
                    logger.error(f'Failed to sync containers: {resp.status}')
                    self.error_count += 1
                    return False
                     
        except Exception as e:
            logger.error(f'Error syncing containers: {e}')
            self.error_count += 1
            return False
    
    def get_stats(self) -> Dict[str, Any]:
        """Get client statistics"""
        return {
            'requests_sent': self.request_count,
            'errors': self.error_count,
            'error_rate': self.error_count / self.request_count if self.request_count > 0 else 0,
            'connected': self.session is not None and not self.session.closed,
        }
