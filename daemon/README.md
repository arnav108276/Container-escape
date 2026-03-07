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
- libbpf
- pylibbpf-tools

## Configuration
Set environment variables:
```bash
export BACKEND_URL=http://localhost:8000
export MONGODB_URI=mongodb://localhost:27017
export LOG_LEVEL=INFO
```

## Run
```bash
python daemon.py
```
