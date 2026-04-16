# Container Escape Detection System

Real-time eBPF-based container security monitoring with risk scoring and alerting.

## Current Local Status

- Backend: working in WSL and reachable at `http://localhost:8000/api/health`
- Frontend: working and served by Vite at `http://localhost:5173`
- Daemon: partially ready; eBPF object compilation is supported, but daemon startup is manual and requires root/kernel support

## Quick Start - WSL Local Development

```bash
cd /mnt/c/Users/Arnav/Documents/major2
bash scripts/wsl-local-setup.sh
bash scripts/wsl-local-start.sh
```

Then open:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:8000/api/health`
- OpenAPI docs: `http://localhost:8000/docs`

## What is Working

- Backend starts correctly with FastAPI and responds on port `8000`
- Frontend builds and serves successfully on port `5173`
- `scripts/wsl-local-setup.sh` installs Python and frontend dependencies inside `.venv-wsl`
- `scripts/wsl-local-start.sh` launches backend and frontend in WSL
- `ebpf/vmlinux.h` can be generated from `/sys/kernel/btf/vmlinux`
- `ebpf/lsm_hooks.o` can be compiled successfully with the updated eBPF source

## What Is Not Working / Known Limitations

- The local WSL start script does not launch the daemon automatically
- Daemon execution currently requires root and BPF LSM support in the host kernel
- WSL may not support full eBPF LSM enforcement; the daemon may not load on all WSL kernels
- If the kernel lacks `CONFIG_BPF_LSM`, daemon initialization will fail
- Some advanced eBPF event processing and alerts are not fully verified end-to-end yet
- Docker Compose startup is not the primary verified local path for WSL development

## Daemon Notes

The daemon is under `daemon/` and uses `daemon/daemon_modular.py`.
It loads `ebpf/lsm_hooks.o` and requires:

- Root privileges
- A Linux kernel with BPF LSM support
- Python `bcc`/`python3-bpfcc` support

To run the daemon manually in WSL once the object is compiled:

```bash
cd /mnt/c/Users/Arnav/Documents/major2
sudo .venv-wsl/bin/python daemon/daemon_modular.py
```

## Project Structure

```
frontend/    → React dashboard
backend/     → FastAPI server
daemon/      → eBPF event processor
ebpf/        → Kernel LSM hooks and generated `vmlinux.h`
```

## Requirements

- WSL with `python3-venv`
- Node/npm installed in WSL
- Python 3.12+ in WSL
- Root access for daemon/eBPF bootstrapping
- MongoDB for backend persistence

## Verified Commands

```bash
# Setup local WSL dev environment
bash scripts/wsl-local-setup.sh

# Start backend + frontend
bash scripts/wsl-local-start.sh

# Check backend health
curl http://localhost:8000/api/health

# Compile eBPF program
cd ebpf
sudo bpftool btf dump file /sys/kernel/btf/vmlinux format c > vmlinux.h
clang -O2 -g -target bpf -mllvm -bpf-stack-size=1024 -c lsm_hooks.c -o lsm_hooks.o -I/usr/include -I. -include vmlinux.h
```

## Notes for Next Steps

- If you want full stack testing, the daemon must be started separately and may require a Linux host instead of pure WSL
- Keep `.venv-wsl` in the project root for WSL local development
- Use `kill <pid>` to stop backend/frontend started by `scripts/wsl-local-start.sh`
