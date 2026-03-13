# Container Escape Detection & Prevention System using eBPF

Real-time runtime security monitoring for containerized environments using Linux eBPF technology. Detects kernel-level threats, calculates risk scores, and automatically quarantines compromised containers.

---

## 🎯 Quick Start (Docker)

```bash
# 1. Start services
docker-compose up -d

# 2. Access applications
# Dashboard:  http://localhost:5173
# API Docs:   http://localhost:8000/docs
# API Health: http://localhost:8000/health

# 3. Verify
docker ps
curl http://localhost:8000/health
```

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Installation](#installation)
- [Alert Management](#alert-management)
- [API Reference](#api-reference)
- [Administration](#administration)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

This system provides **kernel-level container security monitoring** with automatic threat response:

- **eBPF Monitoring**: Zero-overhead syscall monitoring at kernel level
- **Real-time Detection**: Privilege escalation, mount attempts, file access, process tracing
- **Risk Scoring**: Precise risk calculation (0-100) based on attack patterns
- **Auto Quarantine**: Containers auto-paused when threat score ≥75
- **Dashboard Control**: Live monitoring, container management, alert review
- **Forensic Logging**: Complete audit trail in MongoDB

---

## 🏗️ Architecture

```
Kernel (eBPF Programs)
    ↓ (syscalls)
Daemon (Event Processor + Risk Scorer)
    ↓ (alerts)
Backend (FastAPI)
    ↓ (JSON)
Frontend (React)
    ↓ (WebUI)
User Dashboard
```

### Components

| Component | Purpose | Tech |
|-----------|---------|------|
| **ebpf/** | Kernel monitoring (privilege escalation, mounts, file access) | C, BCC |
| **daemon/** | Event enrichment, risk scoring, quarantine execution | Python |
| **backend/** | REST API for alerts, containers, events, reports | FastAPI |
| **frontend/** | Real-time dashboard and monitoring UI | React, TypeScript, Tailwind |
| **database/** | Persistent storage for alerts, events, reports | MongoDB |

---

## 📊 Features

### Detection (What We Catch)

| Threat Type | Example | Score |
|-------------|---------|-------|
| **Privilege Escalation** | Container tries `setuid(0)` | 40-100 |
| **Mount Attempts** | Container tries `mount(/host)` | 35-100 |
| **File Access** | Reading `/etc/shadow` | 20-100 |
| **Process Tracing** | Container uses `ptrace()` | 30-100 |
| **Capability Changes** | Adding `CAP_SYS_ADMIN` | 30-100 |

### Response Actions

| Risk Level | Threshold | Action |
|------------|-----------|--------|
| **CRITICAL** | ≥75 | Auto-quarantine container |
| **HIGH** | 50-74 | Alert + log |
| **MEDIUM** | 40-49 | Log + monitor |
| **LOW** | <40 | Forensic log only |

### Dashboard Features

- ✅ Live container inventory with risk levels
- ✅ Real-time alert feed with event types
- ✅ Alert filtering and bulk acknowledgment
- ✅ Container quarantine/unquarantine controls
- ✅ Vulnerability details on hover
- ✅ Database statistics and management

---

## 💻 Installation

### Prerequisites

- **Docker**: 20.10+
- **Docker Compose**: 1.29+
- **Linux kernel**: 5.8+ (for eBPF)

Or for manual setup:
- Python 3.10+, Node.js 18+, MongoDB 6.0+, Make, GCC

### Docker Setup (Recommended)

```bash
# Clone and start
git clone <repo> && cd major2
cp .env.example .env
docker-compose up -d

# View status
docker-compose ps
docker-compose logs backend -f
```

### Manual Setup

**eBPF Programs:**
```bash
cd ebpf && make
```

**Backend:**
```bash
cd backend
uv pip install -r pyproject.toml
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

**Daemon:**
```bash
cd daemon
uv pip install -r pyproject.toml
uv run python daemon.py
```

**Frontend:**
```bash
cd frontend
npm install && npm run dev
```

---

## 🚨 Alert Management

### How Alerts Work

1. **eBPF detects** syscall event from container
2. **Daemon processes** event and calculates risk score
3. **Deduplication** - same container + same attack type = UPDATE existing alert (not duplicate)
4. **Backend stores** alert with `event_type`, `risk_score`, `risk_category`
5. **Dashboard shows** unacknowledged alerts
6. **User dismisses** alert by clicking "Dismiss" or "Acknowledge All"
7. **Alert hidden** from dashboard after acknowledgment

### Alert Deduplication Rule

**Only 1 alert per (container, event_type) pair:**

```
Event 1: Container A → PRIVILEGE_ESCALATION
         Alert created at 10:00

Event 2: Container A → PRIVILEGE_ESCALATION (same type)
         Existing alert UPDATED (timestamp = 10:01)
         NO DUPLICATE created

Event 3: Container A → MOUNT_ATTEMPT (different type)
         NEW alert created at 10:02
         Now 2 alerts for Container A

Result: Dashboard shows 2 alerts, not 3
```

### Managing Alerts on Dashboard

| Action | How | Result |
|--------|-----|--------|
| Dismiss One | Click [Dismiss] button | 1 alert hidden |
| Dismiss Multiple | Check ☐ boxes, click [Acknowledge Selected (N)] | N alerts hidden |
| Dismiss All | Click [Acknowledge All (N)] | All hidden, dashboard clean |
| View Details | Read alert card (reason, event_type, risk_score) | Understand threat |
| Check Vulnerabilities | Hover over Risk Level in Containers page | See recent threats |

### Example: Container Under Attack

```
10:00 - Privilege escalation attempt
        Alert 1: PRIVILEGE_ESCALATION (Score: 85) ← Created

10:01 - Same attack again
        Alert 1: Updated (timestamp: 10:01)                ← Deduplicated

10:02 - Mount attempt
        Alert 2: MOUNT_ATTEMPT (Score: 72)        ← Different type, new alert

10:03 - User reviews alerts
        Dashboard shows: 2 alerts

10:04 - User dismisses Alert 1
        Dashboard shows: 1 alert (just MOUNT_ATTEMPT)

10:05 - Another privilege escalation detected
        Alert 3: PRIVILEGE_ESCALATION (Score: 88) ← New (prev was dismissed)
        Dashboard shows: 2 alerts again
```

---

## 🔌 API Reference

### Alerts API

**Get Unacknowledged Alerts:**
```http
GET /api/alerts?limit=100
```
Response: List of unacknowledged alerts only

**Dismiss Single Alert:**
```http
POST /api/alerts/{alert_id}/acknowledge
Content-Type: application/json
{ "acknowledged_by": "admin" }
```

**Dismiss Multiple Alerts:**
```http
POST /api/alerts/acknowledge/multiple
{ "alert_ids": ["id1", "id2"], "acknowledged_by": "admin" }
```

**Dismiss All Alerts:**
```http
POST /api/alerts/acknowledge/all
{ "acknowledged_by": "admin" }
```

### Container API

**List Containers with Risk:**
```http
GET /api/containers
```
Response: Container inventory with calculated risk levels

**Get Container Vulnerabilities:**
```http
GET /api/containers/{container_id}/vulnerabilities?limit=10
```
Response: Recent alerts and threat breakdown

**Quarantine Container:**
```http
POST /api/containers/{container_id}/quarantine
{ "reason": "Auto-quarantine", "approved_by": "admin" }
```

**Unquarantine Container:**
```http
POST /api/containers/{container_id}/unquarantine
```

### Events API

**Get Security Events:**
```http
GET /api/events?hours=24&limit=1000
```

### Admin API

**View Database Stats:**
```http
GET /api/admin/stats
```
Response: Total alerts, events, containers, breakdown by container

**Clean All Data (Testing):**
```http
POST /api/admin/cleanup/all
```
Response: Count of deleted documents

**Clean Specific Container:**
```http
POST /api/admin/cleanup/container/{container_id}
```

---

## ⚙️ Administration

### Cleaning Test Data

MongoDB persists data even after `docker-compose down`. Clean via admin UI:

1. Go to **Alerts** page
2. Scroll to "Database Statistics"
3. Click **"Clear All Data"** (for full reset) OR
4. Click **"Clean (N)"** next to container name (for specific container)

Or via API:
```bash
curl -X POST http://localhost:8000/api/admin/cleanup/all
```

### Monitoring

**Check system health:**
```bash
curl http://localhost:8000/health
```

**View logs:**
```bash
docker-compose logs daemon -f    # eBPF events
docker-compose logs backend -f   # API activity
docker-compose logs frontend -f  # UI logs
```

**Connect to MongoDB:**
```bash
docker exec -it major2_mongodb_1 mongosh mongodb://admin:password@localhost:27017
```

### Container Quarantine

**How it works:**
1. Risk score ≥75 → Auto-quarantine triggered
2. Container PAUSED (stops consuming resources)
3. Network DISCONNECTED (isolated from others)
4. Status updated in dashboard
5. User can manually unquarantine when safe

**Manual actions:**
```
Dashboard → Containers → [Quarantine] button
```

---

## 🔍 Troubleshooting

### Issue: Alerts not appearing / Risk always LOW

**Causes & Fixes:**
- ❌ eBPF program not loaded → Check kernel version (≥5.8)
- ❌ Daemon not running → `docker-compose logs daemon`
- ❌ Daemon lacks eBPF runtime privileges/headers → run daemon with `privileged: true`, `pid: host`, mount `/lib/modules`, `/usr/src`, `/sys/kernel/debug`, and ensure BCC is installed in daemon image
- ❌ Container not detected → Run sync script to populate
- ❌ Events not reaching backend → Check logs: `curl http://localhost:8000/health`
- ❌ Container started with risky flags but no suspicious syscall executed yet → run an in-container action like `mount`, `setuid`, or sensitive file access to generate events

**Important note:**
- Running a container with `--privileged --pid=host -v /:/host` now raises a **baseline runtime risk** (even before a syscall event).
- Event-based alerts are generated when suspicious syscalls are executed and event risk is at or above `ALERT_THRESHOLD` (default `40`).

**Logic flow checklist (end-to-end):**
1. `daemon` loads eBPF (`eBPF monitor loaded` log line).
2. kernel syscall event is emitted into ring buffer (`events`).
3. daemon resolves `container_id` (from eBPF or `/proc/<pid>/cgroup`).
4. event is enriched + scored (`risk_score`).
5. forensic log is written to MongoDB (`security_events`).
6. alert is POSTed to backend `/api/alerts` if score `>= ALERT_THRESHOLD`.
7. auto-quarantine happens only when score `>= 75`.

**Quick test sequence:**
```bash
# Start risky container

docker run -it --rm \
  --privileged \
  --pid=host \
  -v /:/host \
  ubuntu:22.04 bash

# Inside container, trigger high-risk syscall examples
mount -t proc proc /mnt
cat /etc/shadow
python3 -c "import os; os.setuid(0)"
```


**Verify daemon eBPF attach:**
```bash
docker-compose logs daemon | rg -i "eBPF monitor loaded|Failed to load eBPF"
```


**Verify full pipeline (recommended):**
```bash
# 1) daemon can talk to backend and sync containers
curl -s http://localhost:8000/api/containers | jq '.total'

# 2) trigger a mount attempt in test container (high risk)
docker exec -it <container_id_or_name> mount -t proc proc /mnt || true

# 3) confirm forensic event written
docker exec -it $(docker ps --format "{{.Names}}" | rg mongodb) \
  mongosh "mongodb://admin:password@localhost:27017" --quiet --eval \
  "db.security_events.find().sort({timestamp:-1}).limit(3).pretty()"

# 4) confirm alert exists
curl -s "http://localhost:8000/api/alerts?limit=10" | jq
```

**WSL2 note:**
- On Docker Desktop + WSL2, `linux-headers-$(uname -r)` may not exist in Ubuntu repos (expected).
- In that case kernel-level syscall probes may fail to attach; baseline runtime risk alerts (`RUNTIME_MISCONFIG`) are still emitted from daemon sync for dangerous flags like `--privileged --pid=host -v /:/host`.

### Issue: Seeing old test alerts

**Solution:**
- Old MongoDB data persists after `docker-compose down`
- Use admin cleanup: **Alerts page** → **"Clear All Data"** button
- Or: `curl -X POST http://localhost:8000/api/admin/cleanup/all`

### Issue: Containers not showing

**Causes & Fixes:**
- ❌ Sync not run → Daemon needs to sync containers to backend
- ❌ MongoDB down → Check: `docker-compose ps`

### Issue: Quarantine not working

**Check:**
1. Container actually paused: `docker ps` (see STATUS)
2. Network disconnected: `docker inspect <container>`
3. Logs: `docker-compose logs daemon | grep -i quarantine`

### Issue: Dashboard not responding

**Troubleshoot:**
1. Check frontend: `docker-compose logs frontend`
2. Check API: `curl http://localhost:8000/health`
3. Check MongoDB: `docker-compose ps mongodb`
4. Restart: `docker-compose restart`

### Reset Everything
```bash
# Full reset (removes all data)
docker-compose down -v
docker-compose up -d

# Wait for MongoDB to initialize (~30 seconds)
sleep 30

# Verify
curl http://localhost:8000/health
```

---

## 🛠️ Development

### Technology Stack

| Layer | Tech |
|-------|------|
| Kernel | eBPF (C, BCC), Linux 5.8+ |
| Backend | Python 3.10, FastAPI, MongoDB |
| Frontend | React 18, TypeScript, Tailwind CSS |
| DevOps | Docker, Docker Compose |

### Project Structure

```
major2/
├── ebpf/              # Kernel monitoring programs
├── daemon/            # Event processor and risk scorer
├── backend/           # FastAPI REST API
├── frontend/          # React dashboard
├── docker-compose.yml # Service orchestration
└── README.md          # This file
```

### Building

```bash
# Build Docker images
docker-compose build

# Test build
docker-compose build --no-cache

# Push to registry (if configured)
docker-compose push
```

### Testing

```bash
# Backend tests
cd backend && uv run pytest

# Frontend tests
cd frontend && npm test

# Full service test
curl http://localhost:8000/health
curl http://localhost:8000/api/dashboard/metrics
```

---

## 📚 Key Concepts

### Risk Scoring

- **Base Weight**: Event type (PRIVILEGE_ESCALATION = 40 points)
- **Target Multiplier**: Attack target (/etc/shadow = 3x)
- **Escalation Bonus**: UID 0 attempt = +25 points
- **Formula**: min(base × multiplier + bonus, 100)

### Categorization

- **CRITICAL** (≥75): Auto-quarantine
- **HIGH** (50-74): Alert only
- **MEDIUM** (40-49): Log only
- **LOW** (<40): Forensic log

### Deduplication

Alerts deduplicated by `(container_id, event_type)` pair. Same attack repeated → timestamp updated, no new alert. Different attack type → new alert created.

---

## 📞 Support

### Common Tasks

| Task | Action |
|------|--------|
| View alerts | Go to **Alerts** page |
| Dismiss alerts | Check ☐, click [Acknowledge Selected/All] |
| Quarantine container | Click [Quarantine] in **Containers** page |
| Check vulnerability details | Hover over Risk Level badge in **Containers** |
| Clean test data | Click "Clear All Data" in **Alerts** page |
| Check system health | `curl http://localhost:8000/health` |

### Documentation

- **API Details**: `http://localhost:8000/docs` (interactive Swagger)
- **Health Check**: `http://localhost:8000/health`
- **Dashboard**: `http://localhost:5173`

---

## 📄 Endpoint Endpoints

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
