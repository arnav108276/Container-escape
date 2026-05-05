"""
Modularized daemon - Event Processor Orchestrator
Coordinates event collection, processing, and response
"""

import asyncio
import logging
from typing import Dict, Any, Optional, Callable
from datetime import datetime
from collections import deque

from ring_buffer_reader import RingBufferReader, SecurityEvent
from risk_scorer_enhanced import EnhancedRiskScorer, SecurityEvent as ScoringEvent, EventType
from backend_api_client import BackendAPIClient
from container_manager import ContainerManager

logger = logging.getLogger(__name__)

EVENT_TYPE_MAP = {
    'file_access': EventType.FILE_OPEN,
    'privilege_escalation': EventType.SETUID,
    'network': EventType.NETWORK,
    'capability': EventType.CAPABILITY,
    'mount': EventType.MOUNT,
}


class EventProcessorOrchestrator:
    """Orchestrates event processing pipeline"""
    
    def __init__(
        self,
        bpf_obj,
        backend_url: str,
        container_manager: Optional[ContainerManager] = None,
        buffer_size: int = 10000,
        batch_send_interval: int = 5,
    ):
        self.bpf_obj = bpf_obj
        self.backend_url = backend_url
        self.container_manager = container_manager
        self.buffer_size = buffer_size
        self.batch_send_interval = batch_send_interval
        
        # Initialize components
        self.ring_buffer_reader = RingBufferReader(bpf_obj)
        self.risk_scorer = EnhancedRiskScorer()
        self.api_client: Optional[BackendAPIClient] = None
        
        # Event pipeline
        self.raw_events: deque = deque(maxlen=buffer_size)
        self.processed_events: deque = deque(maxlen=buffer_size)
        self.alerts: deque = deque(maxlen=buffer_size // 2)
        
        # Statistics
        self.stats = {
            'raw_events_received': 0,
            'events_processed': 0,
            'alerts_created': 0,
            'events_sent': 0,
            'errors': 0,
            'processing_time_ms': [],
        }
        
        # Callbacks
        self.on_alert: Optional[Callable[[Dict[str, Any]], None]] = None
        self.on_risk_threshold: Optional[Callable[[str, float], None]] = None
    
    async def initialize(self) -> bool:
        """Initialize event processor"""
        try:
            logger.info('Initializing event processor orchestrator')
            
            # Initialize API client
            self.api_client = BackendAPIClient(self.backend_url)
            
            # Set ring buffer callback
            self.ring_buffer_reader.set_event_callback(self._on_raw_event)
            
            logger.info('Event processor orchestrator initialized successfully')
            return True
            
        except Exception as e:
            logger.error(f'Failed to initialize event processor: {e}')
            return False
    
    def _on_raw_event(self, event: SecurityEvent) -> None:
        """Handle raw event from ring buffer"""
        try:
            self.raw_events.append(event)
            self.stats['raw_events_received'] += 1
            logger.debug(f'Raw event received: {event.event_type} from PID {event.pid}')
            
        except Exception as e:
            logger.error(f'Error processing raw event: {e}')
            self.stats['errors'] += 1
    
    async def _process_event(self, event: SecurityEvent) -> Optional[Dict[str, Any]]:
        """Process a security event"""
        try:
            import time
            start_time = time.time()
            
            # Convert to dict
            event_dict = event.to_dict()
            
            # Get container info if available
            if self.container_manager:
                container_info = await self.container_manager.get_container_by_pid(event.pid)
                if container_info:
                    event_dict['container_info'] = container_info
            
            # Score the event
            scoring_event = ScoringEvent(
                timestamp=datetime.utcnow(),
                pid=int(event_dict.get('pid', 0) or 0),
                uid=int(event_dict.get('uid', 0) or 0),
                gid=int(event_dict.get('gid', 0) or 0),
                event_type=EVENT_TYPE_MAP.get(event_dict.get('event_type'), EventType.FILE_OPEN),
                context=event_dict.get('filepath') or event_dict.get('event_type') or 'unknown',
                was_blocked=False,
            )
            score_result = self.risk_scorer.score_event(scoring_event)
            if isinstance(score_result, tuple):
                risk_score, risk_level = score_result
                event_dict['risk_level'] = str(risk_level).upper()
            else:
                risk_score = float(score_result)
            event_dict['risk_score'] = risk_score
            
            # Check if alert is needed
            if risk_score >= 50:
                alert = self._create_alert(event_dict, risk_score)
                self.alerts.append(alert)
                self.stats['alerts_created'] += 1
                
                if self.on_alert:
                    self.on_alert(alert)
            
            # Auto-quarantine threshold: high and critical only
            if risk_score >= 50:
                container_id = event_dict.get('container_id')
                if self.on_risk_threshold:
                    self.on_risk_threshold(container_id, risk_score)
            
            # Record processing time
            processing_time_ms = (time.time() - start_time) * 1000
            self.stats['processing_time_ms'].append(processing_time_ms)
            if len(self.stats['processing_time_ms']) > 1000:
                self.stats['processing_time_ms'].pop(0)
            
            self.stats['events_processed'] += 1
            return event_dict
            
        except Exception as e:
            logger.error(f'Error processing event: {e}')
            self.stats['errors'] += 1
            return None
    
    def _create_alert(self, event: Dict[str, Any], risk_score: float) -> Dict[str, Any]:
        """Create an alert for a high-risk event"""
        severity = 'critical' if risk_score >= 75 else 'high' if risk_score >= 50 else 'medium'
        
        return {
            'title': f'{event.get("event_type", "unknown").upper()} - Risk Score: {risk_score:.1f}',
            'message': f'High-risk security event detected in container {event.get("container_id")}',
            'severity': severity,
            'event_type': event.get('event_type'),
            'container_id': event.get('container_id'),
            'risk_score': risk_score,
            'pid': event.get('pid'),
            'uid': event.get('uid'),
            'timestamp': datetime.utcnow().isoformat(),
        }
    
    async def event_processing_loop(self) -> None:
        """Background task: process events from buffer"""
        while True:
            try:
                while self.raw_events:
                    event = self.raw_events.popleft()
                    processed_event = await self._process_event(event)
                    if processed_event:
                        self.processed_events.append(processed_event)
                
                await asyncio.sleep(0.1)  # Process at 10Hz
                
            except Exception as e:
                logger.error(f'Error in event processing loop: {e}')
                self.stats['errors'] += 1
                await asyncio.sleep(1)

    async def ring_buffer_poll_loop(self) -> None:
        """Background task: poll the eBPF ring buffer"""
        while True:
            try:
                # Poll ring buffer (non-blocking or small timeout)
                self.ring_buffer_reader.poll_once(100)
                await asyncio.sleep(0.01) # Small sleep to yield control
            except Exception as e:
                logger.error(f'Error in ring buffer polling loop: {e}')
                self.stats['errors'] += 1
                await asyncio.sleep(1)
    
    async def event_sending_loop(self) -> None:
        """Background task: send events to backend in batches"""
        while True:
            try:
                if self.processed_events and self.api_client:
                    # Batch send events
                    batch_size = min(100, len(self.processed_events))
                    batch = [self.processed_events.popleft() for _ in range(batch_size)]
                    
                    async with self.api_client as client:
                        sent_count = await client.send_events_batch(batch)
                        self.stats['events_sent'] += sent_count
                        
                        if sent_count < batch_size:
                            logger.warning(f'Failed to send {batch_size - sent_count} events')
                
                # Send alerts
                while self.alerts and self.api_client:
                    alert = self.alerts.popleft()
                    async with self.api_client as client:
                        alert_id = await client.create_alert(alert)
                        if alert_id:
                            logger.info(f'Alert created: {alert_id}')
                
                await asyncio.sleep(self.batch_send_interval)
                
            except Exception as e:
                logger.error(f'Error in event sending loop: {e}')
                self.stats['errors'] += 1
                await asyncio.sleep(5)
    
    async def container_sync_loop(self) -> None:
        """Background task: periodically sync running containers to backend"""
        sync_interval = 30  # Sync every 30 seconds
        
        while True:
            try:
                if self.container_manager and self.api_client:
                    # Get running containers
                    containers = self.container_manager.get_running_containers()
                    
                    if containers:
                        logger.info(f'Syncing {len(containers)} containers to backend')
                        async with self.api_client as client:
                            await client.sync_containers(containers)
                
                await asyncio.sleep(sync_interval)
                
            except Exception as e:
                logger.error(f'Error in container sync loop: {e}')
                self.stats['errors'] += 1
                await asyncio.sleep(sync_interval)
    
    async def start(self) -> None:
        """Start event processor"""
        try:
            logger.info('Starting event processor orchestrator')
            
            # Start ring buffer polling
            self.ring_buffer_reader.start_polling()
            
            # Start async tasks
            await asyncio.gather(
                self.ring_buffer_poll_loop(),
                self.event_processing_loop(),
                self.event_sending_loop(),
                self.container_sync_loop(),
            )
            
        except Exception as e:
            logger.error(f'Error starting event processor: {e}')
            raise
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get processing statistics"""
        avg_processing_time = (
            sum(self.stats['processing_time_ms']) / len(self.stats['processing_time_ms'])
            if self.stats['processing_time_ms'] else 0
        )
        
        return {
            'raw_events_received': self.stats['raw_events_received'],
            'events_processed': self.stats['events_processed'],
            'alerts_created': self.stats['alerts_created'],
            'events_sent': self.stats['events_sent'],
            'errors': self.stats['errors'],
            'average_processing_time_ms': avg_processing_time,
            'buffer_sizes': {
                'raw_events': len(self.raw_events),
                'processed_events': len(self.processed_events),
                'alerts': len(self.alerts),
            },
        }
