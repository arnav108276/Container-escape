# Container Escape Detection System

Real-time eBPF-based container security monitoring with risk scoring and auto-quarantine.

## Quick Start - Local Development

```bash
# Install dependencies
cd frontend && npm install
cd ../backend && pip install -r requirements.txt
cd ../daemon && pip install -r requirements.txt

# Start all services
docker-compose up -d

# Access dashboard
# Frontend: http://localhost:5173
# Backend: http://localhost:8000/api/health
# API Docs: http://localhost:8000/docs
```

## Production - Kubernetes

```bash
# 1. Create namespace & secrets
kubectl create namespace security
kubectl create secret generic container-escape-secrets \
  --from-env-file=.env -n security

# 2. Build and push images
docker build -t registry.yourdomain.com/backend:1.0 ./backend
docker build -t registry.yourdomain.com/frontend:1.0 ./frontend
docker build -t registry.yourdomain.com/daemon:1.0 ./daemon

# 3. Deploy
kubectl apply -f k8s/backend-deployment.yaml -n security
kubectl apply -f k8s/frontend-deployment.yaml -n security
kubectl apply -f k8s/daemon-daemonset.yaml -n security

# 4. Verify
kubectl get pods -n security
kubectl logs -f deployment/backend -n security
```

## Project Structure

```
frontend/    → React dashboard (port 3000)
backend/     → FastAPI server (port 8000)
daemon/      → eBPF event processor
ebpf/        → Kernel LSM hooks
```

## Key Features

- ✅ Detects: Privilege escalation, mount attempts, file access, process tracing
- ✅ Risk scoring: 0-100 scale
- ✅ Auto-quarantine: Containers paused at risk ≥75
- ✅ Real-time alerts: Dashboard + API endpoints
- ✅ Full audit logs: All events persisted to MongoDB
- ✅ Email alert queue with retry/backoff and SMTP integration
- ✅ API key auth + RBAC roles (viewer/analyst/admin)
- ✅ Report exports (Markdown, PDF, CSV) and report schedules
- ✅ Kubernetes-ready manifests with probes/HPA/persistence templates

## API Auth & RBAC

Set these env vars in backend:

- `ADMIN_API_KEY`
- `ANALYST_API_KEY`
- `VIEWER_API_KEY`

When any key is configured, protected endpoints require `X-API-Key`.

## Quick Smoke Test

```bash
sh scripts/smoke-test.sh
```

## Requirements

- **Local**: Docker, Docker Compose, Node 18+, Python 3.10+
- **K8s**: Linux kernel 5.8+, Docker registry, persistent storage
- **Database**: MongoDB 5.0+

## Deployment Commands Summary

| Task | Command |
|------|---------|
| Local dev | `docker-compose up -d` |
| Local test | `curl http://localhost:8000/api/health` |
| K8s deploy | `kubectl apply -f k8s/ -n security` |
| K8s logs | `kubectl logs -f deployment/backend -n security` |
| Cleanup | `docker-compose down` / `kubectl delete ns security` |
