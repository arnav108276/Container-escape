# FastAPI Backend

REST API for container security monitoring, forensic analysis, and alerting.

## Features
- Real-time alert ingestion from daemon
- Forensic report generation
- Container quarantine management
- Rule configuration
- WebSocket support for live dashboard updates

## Endpoints
- `POST /api/alerts` - Receive security alerts
- `GET /api/events` - Query security events
- `GET /api/containers` - List containers and their status
- `POST /api/containers/{id}/quarantine` - Quarantine a container
- `GET /api/reports` - Generate forensic reports
- `WS /ws/events` - WebSocket for live event streaming

## Requirements
- Python 3.10+
- FastAPI
- MongoDB

## Run
```bash
uv run uvicorn main:app --reload
```
