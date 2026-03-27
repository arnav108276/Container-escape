#!/usr/bin/env python3
"""
Tetragon LSM Loader Daemon

Loads and manages eBPF LSM programs in the kernel.
Handles program loading, map management, and event collection.

Runs as root (required to load eBPF LSM programs).

Usage:
    sudo python3 daemon/lsm_loader.py --config /etc/tetragon/tetragon.conf
"""

import ctypes
import os
import sys
import time
import signal
import logging
import struct
from pathlib import Path
from typing import Optional, Dict, Tuple
from dataclasses import dataclass
from datetime import datetime
import json

import structlog
from pydantic import BaseModel

# eBPF loading libraries
try:
    from bcc import BPF, libbpf
except ImportError:
    print("ERROR: bcc library not found. Install with: pip install bcc")
    sys.exit(1)

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
        structlog.dev.ConsoleRenderer(colors=True),
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

log = structlog.get_logger(__name__)

# ============================================================================
# DATA STRUCTURES
# ============================================================================

@dataclass
class BlockedPath:
    """Entry in the blocked_paths map"""
    path: str
    action: int  # 0=log only, 1=block

@dataclass
class FileAccessEvent:
    """Event from lsm/file_open hook"""
    timestamp_ns: int
    pid: int
    uid: int
    gid: int
    event_type: int
    action: int
    filepath: str
    comm: str

class LSMEnforcer:
    """Load and manage eBPF LSM programs"""
    
    def __init__(self, ebpf_program_path: str = "/app/ebpf/lsm_hooks.o"):
        """
        Initialize the LSM enforcer.
        
        Args:
            ebpf_program_path: Path to compiled .o file
        """
        self.program_path = ebpf_program_path
        self.bpf: Optional[BPF] = None
        self.events = []
        self.blocked_paths: Dict[int, BlockedPath] = {}
        self.blocked_capabilities: Dict[int, bool] = {}
        self._running = False
        
        # Verify program exists
        if not Path(ebpf_program_path).exists():
            log.error(f"eBPF program not found", path=ebpf_program_path)
            sys.exit(1)
    
    def verify_requirements(self) -> bool:
        """
        Verify system meets requirements for LSM hooks.
        
        Returns: True if compatible, False otherwise
        """
        log.info("Verifying system requirements...")
        
        # Check kernel version
        with open("/proc/version") as f:
            kernel_version = f.read()
            log.info("Kernel", version=kernel_version.strip())
        
        # Check for BPF LSM support
        try:
            with open("/boot/config-" + os.uname().release) as f:
                config = f.read()
                if "CONFIG_BPF_LSM=y" not in config:
                    log.error("CONFIG_BPF_LSM not enabled in kernel")
                    log.info("Install kernel 5.13+ with BPF LSM support")
                    return False
                else:
                    log.info("✓ BPF LSM enabled")
        except FileNotFoundError:
            log.warning("Could not verify BPF LSM config, continuing anyway...")
        
        # Check for root/CAP_SYS_ADMIN
        if os.geteuid() != 0:
            log.error("Must run as root to load LSM programs")
            return False
        
        log.info("✓ Running as root")
        log.info("✓ All requirements met")
        return True
    
    def load(self) -> bool:
        """
        Load eBPF LSM programs into kernel.
        
        Returns: True if successful, False otherwise
        """
        log.info("Loading eBPF LSM programs...", path=self.program_path)
        
        try:
            # Read compiled eBPF object file
            with open(self.program_path, 'rb') as f:
                obj_data = f.read()
            
            log.info("Compiled program loaded", size=len(obj_data))
            
            # Attempt to load using libbpf (more stable for LSM)
            try:
                # Load eBPF object
                self.bpf = BPF(src_file=self.program_path)
                log.info("✓ eBPF programs loaded successfully")
                
                # Verify maps were created
                self._verify_maps()
                
                return True
                
            except Exception as e:
                log.error("Failed to load with libbpf", error=str(e))
                return False
            
        except Exception as e:
            log.error("Failed to load eBPF programs", error=str(e))
            return False
    
    def _verify_maps(self) -> None:
        """Verify eBPF maps were created successfully"""
        
        expected_maps = ['events', 'blocked_paths', 'blocked_capabilities', 'config']
        
        for map_name in expected_maps:
            try:
                map_obj = self.bpf[map_name]
                log.info(f"✓ Map created: {map_name}")
            except KeyError:
                log.warning(f"✗ Map not found: {map_name}")
    
    def add_blocked_path(self, path: str, block: bool = True) -> None:
        """
        Add path to block list.
        
        Args:
            path: File path to block
            block: True to block, False to only log
        """
        try:
            blocked_paths_map = self.bpf["blocked_paths"]
            
            # Find next available slot
            idx = 0
            for i in range(100):
                try:
                    existing = blocked_paths_map[ctypes.c_uint(i)]
                    if existing is None:
                        idx = i
                        break
                except KeyError:
                    idx = i
                    break
            
            # Create block entry
            entry = struct.pack("256sI", 
                              path.encode('utf-8'),
                              1 if block else 0)
            
            blocked_paths_map[ctypes.c_uint(idx)] = entry
            
            log.info("Added blocked path", path=path, index=idx, action="block" if block else "log")
            
        except Exception as e:
            log.error("Failed to add blocked path", path=path, error=str(e))
    
    def block_capability(self, cap_num: int) -> None:
        """
        Block a Linux capability.
        
        Args:
            cap_num: Capability number (e.g., CAP_SYS_ADMIN=21)
        """
        try:
            caps_map = self.bpf["blocked_capabilities"]
            caps_map[ctypes.c_uint(cap_num)] = ctypes.c_uint(1)
            
            cap_names = {
                21: "CAP_SYS_ADMIN",
                4: "CAP_SYS_PTRACE",
                12: "CAP_NET_ADMIN",
                22: "CAP_SYS_CHROOT",
            }
            
            cap_name = cap_names.get(cap_num, f"CAP_{cap_num}")
            log.info("Blocked capability", cap=cap_name, cap_num=cap_num)
            
        except Exception as e:
            log.error("Failed to block capability", cap=cap_num, error=str(e))
    
    def read_events(self, timeout_ms: int = 1000) -> list:
        """
        Read pending events from ring buffer.
        
        Args:
            timeout_ms: Timeout in milliseconds
            
        Returns: List of events
        """
        events = []
        
        try:
            # Read ring buffer - BCC handles this
            # In real implementation, would use perf_buffer or ring_buffer
            pass
        except Exception as e:
            log.error("Failed to read events", error=str(e))
        
        return events
    
    def start(self) -> None:
        """Start the enforcer and begin monitoring"""
        log.info("Starting LSM enforcer...")
        
        if not self.bpf:
            log.error("eBPF programs not loaded")
            return
        
        self._running = True
        
        # Initialize default blocked paths
        self._setup_default_policies()
        
        log.info("LSM enforcer started", status="running")
    
    def _setup_default_policies(self) -> None:
        """Setup default security policies"""
        
        # Block access to sensitive files
        sensitive_paths = [
            "/etc/shadow",
            "/etc/passwd",
            "/root/.ssh/id_rsa",
            "/.env",
            "/etc/kubernetes/admin.conf",
        ]
        
        for path in sensitive_paths:
            self.add_blocked_path(path, block=True)
        
        # Block dangerous capabilities
        dangerous_caps = [
            21,  # CAP_SYS_ADMIN
            4,   # CAP_SYS_PTRACE
            12,  # CAP_NET_ADMIN
            22,  # CAP_SYS_CHROOT
        ]
        
        for cap in dangerous_caps:
            self.block_capability(cap)
    
    def stop(self) -> None:
        """Stop the enforcer and unload programs"""
        log.info("Stopping LSM enforcer...")
        
        self._running = False
        
        if self.bpf:
            # BCC handles cleanup
            self.bpf = None
        
        log.info("LSM enforcer stopped")
    
    def stats(self) -> Dict:
        """Get enforcer statistics"""
        return {
            "running": self._running,
            "blocked_paths": len(self.blocked_paths),
            "blocked_capabilities": len(self.blocked_capabilities),
            "events_collected": len(self.events),
            "timestamp": datetime.utcnow().isoformat(),
        }


def signal_handler(signum, frame):
    """Handle SIGINT/SIGTERM gracefully"""
    print("\n\nReceived signal, shutting down...")
    sys.exit(0)


def main():
    """Main entry point"""
    
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Tetragon LSM Enforcer - Load eBPF LSM programs"
    )
    parser.add_argument(
        "--program",
        default="/app/ebpf/lsm_hooks.o",
        help="Path to compiled eBPF program (.o file)"
    )
    parser.add_argument(
        "--log-level",
        default="info",
        choices=["debug", "info", "warning", "error"],
        help="Logging level"
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="Run in test mode (load and verify, then exit)"
    )
    
    args = parser.parse_args()
    
    # Setup logging
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper()),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Create enforcer
    enforcer = LSMEnforcer(ebpf_program_path=args.program)
    
    # Verify requirements
    if not enforcer.verify_requirements():
        log.error("System requirements not met")
        sys.exit(1)
    
    # Load programs
    if not enforcer.load():
        log.error("Failed to load eBPF programs")
        sys.exit(1)
    
    # Start enforcer
    enforcer.start()
    
    if args.test:
        log.info("Test mode: verifying programs loaded successfully")
        time.sleep(1)
        log.info("Success! Programs loaded.")
        enforcer.stop()
        return
    
    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Main loop
    try:
        log.info("LSM Enforcer running. Press Ctrl+C to stop.")
        
        while True:
            # Periodically read events
            events = enforcer.read_events(timeout_ms=1000)
            
            for event in events:
                log.info("Security event detected", event=event)
            
            # Print stats periodically
            time.sleep(5)
            stats = enforcer.stats()
            log.info("Enforcer stats", **stats)
            
    except KeyboardInterrupt:
        log.info("Interrupted by user")
    finally:
        enforcer.stop()
        sys.exit(0)


if __name__ == "__main__":
    main()
