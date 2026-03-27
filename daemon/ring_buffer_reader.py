"""
Modularized daemon - Event Ring Buffer Reader
Handles reading and parsing events from eBPF ring buffer
"""

import struct
import logging
from typing import Optional, Dict, Any, Callable
from dataclasses import dataclass
from datetime import datetime
import ctypes

logger = logging.getLogger(__name__)


@dataclass
class SecurityEvent:
    """Represents a security event from eBPF"""
    timestamp_ns: int
    pid: int
    uid: int
    gid: int
    event_type: int
    risk_level: int
    container_id: str
    filepath: str
    syscall_nr: int
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert event to dictionary"""
        event_type_map = {
            1: 'file_access',
            2: 'privilege_escalation',
            3: 'network',
            4: 'capability',
            5: 'mount',
        }
        
        return {
            'timestamp': datetime.utcfromtimestamp(self.timestamp_ns / 1e9).isoformat(),
            'pid': self.pid,
            'uid': self.uid,
            'gid': self.gid,
            'event_type': event_type_map.get(self.event_type, 'unknown'),
            'risk_level': self.risk_level,
            'container_id': self.container_id,
            'filepath': self.filepath,
            'syscall_nr': self.syscall_nr,
        }


class RingBufferReader:
    """Reads events from eBPF ring buffer"""
    
    def __init__(self, bpf_obj, buffer_name: str = 'events'):
        self.bpf_obj = bpf_obj
        self.buffer_name = buffer_name
        self.event_callback: Optional[Callable[[SecurityEvent], None]] = None
        self.error_count = 0
        self.event_count = 0
    
    def set_event_callback(self, callback: Callable[[SecurityEvent], None]) -> None:
        """Set callback function for events"""
        self.event_callback = callback
    
    def parse_event(self, data: bytes) -> Optional[SecurityEvent]:
        """Parse raw event data from ring buffer"""
        try:
            if len(data) < 64:
                logger.warning(f'Event data too short: {len(data)} bytes')
                return None
            
            # Parse C struct: timestamp_ns(u64) + pid(u32) + uid(u32) + gid(u32) + 
            #                 event_type(u32) + risk_level(u32) + container_id(32 bytes) + 
            #                 filepath(256 bytes) + syscall_nr(u32)
            
            unpacked = struct.unpack('QIIIIIII256sI', data[:332])
            
            timestamp_ns = unpacked[0]
            pid = unpacked[1]
            uid = unpacked[2]
            gid = unpacked[3]
            event_type = unpacked[4]
            risk_level = unpacked[5]
            container_id = unpacked[6]
            filepath = unpacked[7]
            syscall_nr = unpacked[8]
            
            # Clean up strings
            container_id_str = container_id.decode('utf-8', errors='ignore').rstrip('\x00')
            filepath_str = filepath.decode('utf-8', errors='ignore').rstrip('\x00')
            
            event = SecurityEvent(
                timestamp_ns=timestamp_ns,
                pid=pid,
                uid=uid,
                gid=gid,
                event_type=event_type,
                risk_level=risk_level,
                container_id=container_id_str,
                filepath=filepath_str,
                syscall_nr=syscall_nr,
            )
            
            self.event_count += 1
            return event
            
        except Exception as e:
            logger.error(f'Failed to parse event: {e}')
            self.error_count += 1
            return None
    
    def handle_event(self, ctx, data, size):
        """Callback invoked by ring buffer for each event"""
        try:
            event_bytes = bytes(data)
            event = self.parse_event(event_bytes)
            
            if event and self.event_callback:
                self.event_callback(event)
                
        except Exception as e:
            logger.error(f'Error handling event: {e}')
            self.error_count += 1
    
    def start_polling(self) -> None:
        """Start polling ring buffer"""
        try:
            rb = self.bpf_obj[self.buffer_name]
            rb.open_ring_buffer(self.handle_event)
            logger.info(f'Ring buffer polling started: {self.buffer_name}')
        except Exception as e:
            logger.error(f'Failed to start ring buffer polling: {e}')
            raise
    
    def get_stats(self) -> Dict[str, Any]:
        """Get ring buffer statistics"""
        return {
            'events_processed': self.event_count,
            'errors': self.error_count,
            'error_rate': self.error_count / (self.event_count + self.error_count) 
                         if (self.event_count + self.error_count) > 0 else 0,
        }
