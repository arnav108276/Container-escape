# User-Space Daemon

Python-based event processor for kernel-level syscall events from eBPF programs.

## Responsibilities
1. Receives events from eBPF ring buffer
2. Enriches events with additional context
3. Applies detection rules and risk scoring
4. Sends high-risk alerts to backend
5. Manages container quarantine decisions

## Components
- `daemon.py`: Main event loop and listener
- `event_processor.py`: Event enrichment and analysis
- `risk_scorer.py`: Risk assessment engine
- `container_manager.py`: Container lifecycle and quarantine operations
- `logger.py`: Forensic logging

## Requirements
- Python 3.10+
- bcc Python bindings (`from bcc import BPF`)
- Kernel headers for your running kernel (`linux-headers-$(uname -r)`)
- clang/llvm for eBPF C compilation

## Configuration
Set environment variables:
```bash
export BACKEND_URL=http://localhost:8000
export MONGODB_URI=mongodb://localhost:27017
export LOG_LEVEL=INFO
export EBPF_SOURCE_FILE=/ebpf/monitor.c
```

## Run
```bash
python daemon.py
```


## Runtime behavior
- Daemon now attempts to load `ebpf/monitor.c` automatically using BCC.
- If loading fails, daemon continues in degraded mode (container sync still works, syscall events do not).
- Events with `container_id=unknown` are resolved in user space from `/proc/<pid>/cgroup` before risk scoring and alerting.


## Docker runtime requirements for eBPF
- Run daemon container as `privileged: true`
- Use `pid: host`
- Mount `/lib/modules:/lib/modules:ro`, `/usr/src:/usr/src:ro`, `/sys/kernel/debug:/sys/kernel/debug`
- Mount eBPF source path (example: `./ebpf:/ebpf:ro`) and set `EBPF_SOURCE_FILE=/ebpf/monitor.c`


## WSL2 / Docker Desktop caveat
- `linux-headers-$(uname -r)` may be unavailable for the Microsoft WSL2 kernel.
- If eBPF attach fails, daemon now still emits `RUNTIME_MISCONFIG` alerts from container sync when dangerous runtime flags are detected.
