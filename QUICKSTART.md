# Quick Start Guide

Get the Container Escape Detection & Prevention System running in 5 minutes.

## Prerequisites Check

- [ ] Docker installed (`docker --version`)
- [ ] Docker Compose installed (`docker-compose --version`)
- [ ] Git installed (`git --version`)

## Start (3 commands)

```bash
# 1. Clone and enter directory
git clone <repository-url> && cd major2

# 2. Copy environment
cp .env.example .env

# 3. Start all services
docker-compose up -d
```

Done! Services are starting...

## Access Applications

| Service | URL | Purpose |
|---------|-----|---------|
| **Dashboard** | http://localhost:5173 | Real-time security monitoring |
| **API Docs** | http://localhost:8000/docs | Interactive API reference |
| **API Health** | http://localhost:8000/health | Service status |

## Verify Everything Works

```bash
# Check all containers running
docker ps

# View logs
docker-compose logs -f

# Test API
curl http://localhost:8000/health
```

## Sync Containers to Dashboard

The dashboard needs to know about running Docker containers. Use the sync script to populate the container list:

```bash
# Run the cross-platform sync script
python sync-containers.py
```

This will:
1. Discover all running Docker containers on your system
2. Send them to the backend API
3. Display them in the dashboard at http://localhost:5173

**Supports**: Windows, Linux, and macOS

## Stop Services

```bash
docker-compose down
```

## Common Tasks

### Sync Containers Automatically

**Windows (using Task Scheduler):**
```powershell
# Create a scheduled task to run sync script every 5 minutes
$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration ([TimeSpan]::MaxValue) -At (Get-Date)
$action = New-ScheduledTaskAction -Execute "python" -Argument "sync-containers.py" -WorkingDirectory "C:\path\to\major2"
Register-ScheduledTask -TaskName "SyncContainers" -Trigger $trigger -Action $action -Force
```

**Linux/macOS (using cron):**
```bash
# Add to crontab: run every 5 minutes
*/5 * * * * cd /path/to/major2 && python sync-containers.py >> /tmp/sync-containers.log 2>&1
```

### See Live Logs
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f daemon
```

### Access MongoDB Shell
```bash
docker-compose exec mongodb mongosh -u admin -p password
```

### Rebuild After Code Changes
```bash
docker-compose build
docker-compose up -d
```

### Clean Everything (Start Fresh)
```bash
docker-compose down -v  # -v removes volumes
docker-compose up -d
```

## Next Steps

1. **Explore Dashboard**: Open http://localhost:5173
2. **Read Full Docs**: See [README.md](README.md)
3. **Development**: Check [DEVELOPMENT.md](DEVELOPMENT.md)
4. **Production**: Check [DEPLOYMENT.md](DEPLOYMENT.md)

## Troubleshooting Quick Fixes

| Problem | Solution |
|---------|----------|
| Port already in use | Change `.env` ports or kill process using port |
| MongoDB won't start | `docker-compose restart mongodb` |
| Frontend blank | Browser cache? Try hard refresh Ctrl+Shift+R |
| Backend 502 | Check logs: `docker-compose logs backend` |
| Out of disk space | `docker system prune -a` |

## Architecture Overview

```
User Browser → Frontend (React) → Backend API (FastAPI) → MongoDB
    ↓                                    ↓
    └─ WebSocket (Real-time Events) ← Daemon (Event Processor)
                                        ↓
                                    eBPF Programs (Kernel)
```

## Support

- **Full Documentation**: [README.md](README.md)
- **Development Guide**: [DEVELOPMENT.md](DEVELOPMENT.md)
- **Deployment Guide**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **Component Docs**: See individual folder READMEs
- **API Documentation**: http://localhost:8000/docs (when running)

---

**For detailed configuration and advanced features, see main README and component documentation.**
