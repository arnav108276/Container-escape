# Container Escape Detection & Prevention System Using eBPF

Real-time runtime security monitoring for containerized environments using Linux eBPF technology.

## 🎯 Overview

This system detects and prevents container escape attacks by:
- **Kernel-level syscall monitoring** using eBPF for zero-overhead visibility
- **Real-time threat detection** with risk scoring and automatic response
- **Automated container quarantine** to isolate compromised containers
- **Forensic logging** for compliance and incident investigation
- **Web dashboard** for real-time monitoring and management

## 🏗️ Architecture

### Components
- **ebpf/** - Kernel programs monitoring privilege escalation, unauthorized file access, and escape attempts
- **daemon/** - User-space event processor enriching and scoring detected threats
- **backend/** - FastAPI REST API for alerts, events, and container management
- **frontend/** - React dashboard for real-time monitoring and control
- **database/** - MongoDB for persistent storage of events and forensic data
- **aws/** - Terraform and deployment scripts for cloud infrastructure
- **cicd/** - Docker Compose and GitHub Actions for automated deployment

## 🚀 Quick Start

### Local Development with Docker
```bash
# Copy environment template
cp .env.example .env

# Start all services
docker-compose up -d

# Services available at:
# - Frontend: http://localhost:5173
# - Backend API: http://localhost:8000
# - MongoDB: localhost:27017
```

### Manual Setup

**Requirements:**
- Linux kernel 5.8+ with eBPF support
- Python 3.10+
- Node.js 18+
- MongoDB 6.0+
- uv (Python package manager)

**Build eBPF programs:**
```bash
cd ebpf
make
```

**Start backend:**
```bash
cd backend
uv pip install -r pyproject.toml
uv run uvicorn main:app --reload
```

**Start daemon:**
```bash
cd daemon
uv pip install -r pyproject.toml
uv run python daemon.py
```

**Start frontend:**
```bash
cd frontend
npm install
npm run dev
```

## 📊 Key Features

### ✅ Detection Capabilities
- **Privilege Escalation**: setuid/setgid attempts, capability modifications
- **Unauthorized Filesystem Access**: /proc, /sys, /etc access from containers
- **Mount Operations**: Attempts to mount host filesystems in containers
- **Process Tracing**: ptrace syscalls from untrusted processes
- **Network Socket Creation**: Suspicious network operations

### ✅ Response Actions
- **Automatic Quarantine**: Pause container and disconnect network
- **Real-time Alerts**: WebSocket-based notifications to dashboard
- **Forensic Logging**: Complete event timeline for investigation
- **Risk Scoring**: Contextual threat assessment (0-100)

### ✅ Monitoring & Analysis
- **Live Event Stream**: Real-time syscall visualization
- **Forensic Reports**: Detailed analysis and recommendations
- **Container Risk Assessment**: Per-container threat scoring
- **Dashboard Metrics**: System-wide security overview

## 🔌 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/alerts` | Receive security alerts |
| GET | `/api/alerts` | List security alerts |
| GET | `/api/events` | Query security events |
| GET | `/api/containers` | List all containers |
| POST | `/api/containers/{id}/quarantine` | Quarantine container |
| GET | `/api/reports` | Forensic reports |
| POST | `/api/reports/generate` | Generate analysis report |
| GET | `/api/dashboard` | Dashboard metrics |
| WS | `/ws/events` | Real-time event stream |

## 📈 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Linux Kernel (eBPF)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │   monitor.c  │  │detections.c  │  │ common.h     │   │
│  │ (Syscalls)   │  │(Rules)       │  │(Structures)  │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
│                          ↓                                │
│              [Ring Buffer Event Stream]                   │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│         User Space (Python Daemon)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │Event         │  │Risk          │  │Container     │   │
│  │Processor     │  │Scorer        │  │Manager       │   │
│  └──────────────┘  └──────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────┘
                         ↓
            ┌────────────┬────────────┐
            ↓            ↓            ↓
    ┌──────────────┐ ┌──────────┐ ┌─────────┐
    │   MongoDB    │ │ Backend  │ │WebSocket│
    │   Forensics  │ │  FastAPI │ │ Stream  │
    └──────────────┘ └──────────┘ └─────────┘
                         ↑
    ┌────────────────────┴────────────────────┐
    ↓                                         ↓
┌──────────────┐                      ┌──────────────┐
│   Dashboard  │                      │   API Clients│
│   React UI   │                      │   (CLI/etc)  │
└──────────────┘                      └──────────────┘
```

## � Container Discovery & Synchronization

The system uses a cross-platform container discovery script to populate the dashboard with running containers.

### Quick Sync
```bash
# Sync all running containers to the dashboard
python sync-containers.py
```

### Automated Sync (Recommended)

**Windows (Task Scheduler):**
```powershell
# Run every 5 minutes
$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration ([TimeSpan]::MaxValue) -At (Get-Date)
$action = New-ScheduledTaskAction -Execute "python" -Argument "sync-containers.py" -WorkingDirectory "C:\path\to\project"
Register-ScheduledTask -TaskName "SyncContainers" -Trigger $trigger -Action $action -Force
```

**Linux/macOS (cron):**
```bash
# Add to crontab
*/5 * * * * cd /path/to/project && python sync-containers.py >> /tmp/sync.log 2>&1
```

### How It Works
1. Queries Docker for all running containers: `docker ps --format json`
2. Transforms container data to system format
3. Sends to backend via `POST /api/containers/sync`
4. Backend stores in MongoDB and updates dashboard in real-time
5. Dashboard refreshes to show current containers

### Supported Platforms
- ✅ Windows (Docker Desktop)
- ✅ Linux (Docker Engine, containerd)
- ✅ macOS (Docker Desktop)

### Requirements
- Python 3.10+
- `requests` library (`pip install requests`)
- Docker installed and running
- Backend API accessible at `http://localhost:8000`

## �🔧 Configuration

### Environment Variables
```bash
# Backend
BACKEND_URL=http://localhost:8000
LOG_LEVEL=INFO

# Database
MONGODB_URI=mongodb://localhost:27017
MONGODB_USER=admin
MONGODB_PASSWORD=password

# Frontend
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000

# AWS (cloud deployment)
AWS_REGION=us-east-1
AWS_ACCOUNT_ID=123456789012
```

See `.env.example` for all available options.

## 📚 Documentation

- [eBPF Components Documentation](ebpf/README.md)
- [Daemon Configuration](daemon/README.md)
- [Backend API Reference](backend/README.md)
- [Frontend Setup](frontend/README.md)
- [AWS Deployment](aws/README.md)
- [CI/CD Pipeline](cicd/README.md)

## 🧪 Testing

Run all tests:
```bash
# Backend
cd backend && uv run pytest

# Daemon
cd daemon && uv run pytest

# Frontend
cd frontend && npm test
```

## 🚢 Production Deployment

### AWS EC2
```bash
cd aws
terraform init
terraform plan
terraform apply
```

### AWS EKS (Kubernetes)
```bash
bash aws/scripts/deploy-eks.sh
```

## 📖 Academic Reference

**End-Term Report:** `Container Escape Detection & Prevention System Using eBPF`
- **Students:** Aryan Bansal, Arnav Goel
- **Advisor:** Mr. Pranshu Srivastava
- **Institution:** University of Petroleum & Energy Studies (UPES), Dehradun
- **Program:** B.Tech Computer Science & Engineering, DevOps Specialization

## ⚠️ Limitations & Future Work

### Current Limitations
- Linux-only (requires eBPF support)
- Requires root/CAP_SYS_ADMIN privileges for eBPF loading
- Container ID extraction requires cgroup parsing
- High-load performance optimization needed

### Future Enhancements
- Multi-cloud support (GCP, Azure)
- Kubernetes-native integration
- Machine learning-based anomaly detection
- Custom rule DSL for operators
- Resource-aware quarantine policies

## 📝 License

Academic project - University of Petroleum & Energy Studies (UPES)

## 🤝 Contributors

- **Aryan Bansal** (SAP ID: 500101700)
- **Arnav Goel** (SAP ID: 500108276)

---

**For support and questions, refer to individual component READMEs and end-term report documentation.**
