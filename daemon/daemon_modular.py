#!/usr/bin/env python3
"""
Container Escape Detection & Prevention Daemon - Modularized Version
Coordinates eBPF LSM enforcement, event collection, risk scoring, and backend communication
"""

import os
import sys
import asyncio
import logging
import signal
from pathlib import Path
from typing import Optional

import structlog

# Import modularized components
from lsm_loader import LSMEnforcer
from ring_buffer_reader import RingBufferReader
from risk_scorer_enhanced import EnhancedRiskScorer
from backend_api_client import BackendAPIClient
from container_manager import ContainerManager
from event_processor_orchestrator import EventProcessorOrchestrator
from logger import ForensicLogger

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer(),
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

log = structlog.get_logger(__name__)


class DaemonOrchestrator:
    """Main daemon orchestrator - coordinates all components"""
    
    def __init__(self):
        self.lsm_enforcer: Optional[LSMEnforcer] = None
        self.event_processor: Optional[EventProcessorOrchestrator] = None
        self.forensic_logger: Optional[ForensicLogger] = None
        self.running = False
    
    async def initialize(self) -> bool:
        """Initialize all daemon components"""
        try:
            log.info('Initializing Container Escape Detection Daemon')
            
            # 1. Load eBPF LSM enforcer
            log.info('Loading eBPF LSM enforcer...')
            self.lsm_enforcer = LSMEnforcer()
            if not self.lsm_enforcer.verify_requirements():
                log.error('System does not meet kernel requirements for LSM')
                return False
            
            if not self.lsm_enforcer.load():
                log.error('Failed to load eBPF LSM programs')
                return False
            
            bpf_obj = self.lsm_enforcer.bpf
            
            # 2. Initialize forensic logger
            log.info('Initializing forensic logger...')
            self.forensic_logger = ForensicLogger('/var/log/container-escape-detection')
            
            # 3. Initialize container manager
            log.info('Initializing container manager...')
            container_manager = ContainerManager()
            
            # 4. Initialize event processor orchestrator
            log.info('Initializing event processor...')
            backend_url = os.getenv('BACKEND_URL', 'http://localhost:8000')
            self.event_processor = EventProcessorOrchestrator(
                bpf_obj=bpf_obj,
                backend_url=backend_url,
                container_manager=container_manager,
            )
            
            # Set up event callbacks
            self.event_processor.on_alert = self._on_alert
            self.event_processor.on_risk_threshold = self._on_risk_threshold
            
            if not await self.event_processor.initialize():
                log.error('Failed to initialize event processor')
                return False
            
            log.info('Daemon initialization successful')
            return True
            
        except Exception as e:
            log.error('Daemon initialization failed', error=str(e), exc_info=True)
            return False
    
    def _on_alert(self, alert: dict) -> None:
        """Callback when a high-risk alert is generated"""
        try:
            log.warning('Security alert generated', alert=alert)
            if self.forensic_logger:
                self.forensic_logger.log_alert(alert)
        except Exception as e:
            log.error('Error handling alert', error=str(e))
    
    def _on_risk_threshold(self, container_id: str, risk_score: float) -> None:
        """Callback when container exceeds risk threshold (75)"""
        try:
            log.error(
                'Container risk threshold exceeded',
                container_id=container_id,
                risk_score=risk_score
            )
            
            # Could trigger response actions here:
            # - Quarantine container
            # - Alert operations team
            # - Capture forensics
            
            if self.forensic_logger:
                self.forensic_logger.log_forensics({
                    'container_id': container_id,
                    'risk_score': risk_score,
                    'threshold_exceeded': True,
                })
        except Exception as e:
            log.error('Error handling risk threshold', error=str(e))
    
    async def run(self) -> None:
        """Run the daemon"""
        try:
            self.running = True
            log.info('Daemon started')
            
            # Apply default LSM policies
            if self.lsm_enforcer:
                log.info('Applying default eBPF LSM policies')
                self.lsm_enforcer.start()
                stats = self.lsm_enforcer.stats()
                log.info('LSM enforcer ready', stats=stats)
            
            # Start event processor
            await self.event_processor.start()
            
        except asyncio.CancelledError:
            log.info('Daemon received termination signal')
            self.running = False
        except Exception as e:
            log.error('Daemon error', error=str(e), exc_info=True)
            self.running = False
            raise
    
    async def shutdown(self) -> None:
        """Shutdown daemon gracefully"""
        try:
            log.info('Shutting down daemon')
            self.running = False
            
            # Log final statistics
            if self.lsm_enforcer:
                stats = self.lsm_enforcer.stats()
                log.info('LSM enforcer final statistics', stats=stats)
            
            if self.event_processor:
                stats = self.event_processor.get_statistics()
                log.info('Event processor final statistics', stats=stats)
            
            log.info('Daemon shutdown complete')
            
        except Exception as e:
            log.error('Error during shutdown', error=str(e))


async def main():
    """Main entry point"""
    daemon = DaemonOrchestrator()
    
    # Handle signals
    def signal_handler(signum, frame):
        """Handle termination signals"""
        log.info('Received signal', signal=signum)
        if daemon.running:
            asyncio.create_task(daemon.shutdown())
    
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        # Initialize
        if not await daemon.initialize():
            log.error('Failed to initialize daemon')
            sys.exit(1)
        
        # Run
        await daemon.run()
        
    except KeyboardInterrupt:
        log.info('Daemon interrupted by user')
    except Exception as e:
        log.error('Fatal daemon error', error=str(e), exc_info=True)
        sys.exit(1)
    finally:
        await daemon.shutdown()


if __name__ == '__main__':
    # Verify running as root
    if os.geteuid() != 0:
        print('ERROR: This daemon must be run as root (eBPF LSM hooks require root)')
        sys.exit(1)
    
    # Run daemon
    asyncio.run(main())
