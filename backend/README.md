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
- `GET /api/reports` - List forensic reports
- `POST /api/reports/generate` - Generate a forensic report for a container
- `GET /api/reports/{report_id}/export?format={json,csv,markdown}` - Download a generated report
- `POST /api/reports/schedules` - Create a recurring report schedule
- `GET /api/reports/schedules` - List scheduled report jobs
- `DELETE /api/reports/schedules/{schedule_id}` - Delete a scheduled report
- `POST /api/reports/schedules/{schedule_id}/run` - Run a scheduled report immediately
- `WS /ws/events` - WebSocket for live event streaming

## Requirements
- Python 3.10+
- FastAPI
- MongoDB

## Run
```bash
uv run uvicorn main:app --reload
```
