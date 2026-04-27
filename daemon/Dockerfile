# =============================================================================
# Unified eBPF Daemon Image
# =============================================================================
FROM ubuntu:22.04

# 1. Grab the uv binary
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV DEBIAN_FRONTEND=noninteractive
ENV UV_SYSTEM_PYTHON=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# 2. Install runtime dependencies AND build tools required by BCC's JIT Compiler
RUN apt-get update && apt-get install -y \
    build-essential curl git libbpf-dev bpfcc-tools \
    python3-bpfcc libbpfcc-dev linux-libc-dev \
    ca-certificates gnupg lsb-release python3-pip python3-dev \
    flex bison libssl-dev libelf-dev bc \
    && rm -rf /var/lib/apt/lists/*

# 3. Embed WSL2 Kernel Headers safely (BCC needs these at runtime!)
RUN git clone --depth 1 -b linux-msft-wsl-6.6.y https://github.com/microsoft/WSL2-Linux-Kernel.git /opt/wsl-kernel && \
    cd /opt/wsl-kernel && \
    cp Microsoft/config-wsl .config && \
    make prepare modules_prepare

ENV BCC_KERNEL_SOURCE=/opt/wsl-kernel

# 4. Install Python dependencies using uv directly to the system
COPY pyproject.toml requirements.txt ./
RUN uv pip install --no-cache --system -r requirements.txt

# 5. Copy application code
COPY . .

# 6. Crucial: Delete any local host virtual environments that got copied over
RUN rm -rf /app/.venv

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

# Note: eBPF requires root privileges to attach hooks. 
# Do not switch to a non-root user via USER command.
CMD ["python3", "daemon_modular.py"]