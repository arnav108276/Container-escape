# eBPF Kernel Programs

Real-time syscall monitoring for container escape detection.

## Components
- `monitor.c`: Main eBPF program for syscall monitoring
- `detections.c`: Detection rules for privilege escalation and unauthorized access
- `common.h`: Shared headers and data structures

## Requirements
- Linux kernel 5.8+ with eBPF support
- clang/llvm
- Linux headers

## Build
```bash
make
```

## Output Artifacts
- `monitor.o`: Compiled eBPF object file
- `detections.o`: Compiled detection rules

## Architecture
The eBPF program:
1. Hooks security-sensitive syscalls (setuid, setgid, open, openat, mount, execve)
2. Captures process context (PID, UID, GID, container ID)
3. Sends events to user space via ring buffer
4. Provides context for risk scoring in user space
