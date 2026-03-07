# Demo & Testing Guide

This guide explains how to use the test data generator to populate your system with realistic security events for demo purposes.

## Overview

The Container Escape Detection System includes a test data generator that creates:
- **Security Events** - Realistic kernel-level syscall interception data
- **Security Alerts** - Triggered alerts based on event risk scores
- **Forensic Reports** - Detailed analysis and recommendations per container

## Why Do You Need Test Data?

The system is designed to monitor **real container escape attempts** using eBPF (Linux kernel monitoring). However, since eBPF requires a native Linux environment with kernel hooks, you have two options:

| Scenario | Solution |
|----------|----------|
| **Windows/WSL2 Development** | Use test data generator to simulate events |
| **Production Linux Deployment** | Real eBPF monitoring generates actual events |

## Quick Start: Generate Test Data

### Prerequisites
```bash
# Make sure containers are running
docker-compose up -d

# Verify MongoDB is healthy
docker-compose ps
```

### Option 1: Direct Python Execution

```bash
# Generate 100 events and 50 alerts
python test_data_generator.py

# With custom counts
python test_data_generator.py --events 200 --alerts 100

# Show statistics only
python test_data_generator.py --stats

# Clear existing data and regenerate
python test_data_generator.py --clear --events 150
```

### Option 2: Run in Docker

```bash
# Build and run generator in Docker
docker-compose run --rm data-generator python test_data_generator.py --events 100 --alerts 50
```

### Option 3: From Inside Backend Container

```bash
# Connect to backend container
docker-compose exec backend bash

# Generate test data
python ../test_data_generator.py --events 100 --alerts 50
```

## What Gets Generated

### Security Events (Default: 100)
Simulates kernel-level syscall interception with:
- **Event Types**: PRIVILEGE_ESCALATION, FILE_ACCESS_UNAUTHORIZED, SYSCALL_BLOCKED, PROCESS_SPAWN, NETWORK_ABNORMAL, CAPABILITY_ADD, MOUNT_ATTEMPTED, ESCAPE_ATTEMPT
- **Risk Scores**: 10-95 (higher = more critical)
- **Timestamps**: Last 24 hours
- **Metadata**: Process names, parent processes, network connections, file operations

```json
{
  "timestamp": "2026-03-07T19:30:00Z",
  "container_id": "malicious-app",
  "event_type": "PRIVILEGE_ESCALATION",
  "pid": 12345,
  "uid": 0,
  "risk_score": 85,
  "filepath": "/etc/shadow",
  "metadata": {
    "process_name": "sh",
    "parent_process": "docker",
    "network_connection": "192.168.1.100:8080"
  }
}
```

### Security Alerts (Default: 50)
Alerts triggered for high-risk events:
- **Severity Levels**: low, medium, high, critical
- **Risk Thresholds**:
  - 80+: **CRITICAL** (instant quarantine)
  - 60-79: **HIGH** (review required)
  - 40-59: **MEDIUM** (monitor)
  - <40: **LOW** (log)

```json
{
  "timestamp": "2026-03-07T19:30:15Z",
  "container_id": "malicious-app",
  "severity": "critical",
  "risk_score": 92,
  "reason": "Container escape attempt detected",
  "metadata": {
    "event_type": "ESCAPE_ATTEMPT",
    "action_taken": "quarantine_requested"
  }
}
```

### Forensic Reports
Automated analysis and recommendations:

```json
{
  "container_id": "malicious-app",
  "generated_at": "2026-03-07T19:35:00Z",
  "event_count": 23,
  "critical_events": 5,
  "high_risk_events": 8,
  "recommendations": [
    "CRITICAL: Container attempted escape - isolate immediately",
    "Implement stricter capability dropping",
    "Enable read-only filesystem root"
  ]
}
```

## Viewing Generated Data

### Via Dashboard
1. Go to http://localhost:5173
2. View real-time metrics:
   - **Total Containers**: Now shows 8 (including test containers)
   - **Critical Alerts**: Displays count from generated data
   - **Events (24h)**: Shows 100+ from test generation

### Via API

#### Get All Containers
```bash
curl http://localhost:8000/api/containers | jq .
```

#### Get Alerts
```bash
curl http://localhost:8000/api/alerts?limit=10 | jq .
```

#### Get Events
```bash
curl http://localhost:8000/api/events?hours=24&limit=20 | jq .
```

#### Get Event Statistics
```bash
curl http://localhost:8000/api/events/statistics | jq .
```

#### Get Dashboard Metrics
```bash
curl http://localhost:8000/api/dashboard/metrics | jq .
```

#### Generate Forensic Report for Container
```bash
curl -X POST 'http://localhost:8000/api/reports/generate?container_id=malicious-app&hours=24' | jq .
```

### Via MongoDB

```bash
# Connect to MongoDB
docker-compose exec mongodb mongosh

# List databases
show dbs

# Use container_security database
use container_security

# View collections
show collections

# See sample event
db.security_events.findOne()

# Count alerts
db.alerts.countDocuments()

# Get critical alerts only
db.alerts.find({ "severity": "critical" }).pretty()
```

## Understanding the Generated Data

### Container Simulation

The generator tracks **8 sample containers**:
| Container | Behavior |
|-----------|----------|
| `malicious-app` | **HIGH RISK** - Gets 60-95 risk scores |
| `web-server-prod` | Normal activity |
| `api-gateway-prod` | Normal activity |
| `database-primary` | Normal activity |
| `cache-redis` | Normal activity |
| `worker-queue` | Normal activity |
| `monitoring-agent` | Normal activity |
| `logging-service` | Normal activity |

### Event Distribution

```
Events per Container: ~100 events ÷ 8 containers
Risk Score Distribution:
  - malicious-app:     60-95 (HIGH RISK)
  - ESCAPE_ATTEMPT:    70-99 (CRITICAL)
  - PRIV_ESCALATION:   50-85 (HIGH)
  - Others:            10-50 (LOW-MEDIUM)
```

## Advanced Usage

### Generate Large Datasets

```bash
# Generate 1000 events for performance testing
python test_data_generator.py --events 1000 --alerts 500
```

### Clear and Regenerate

```bash
# Remove all old data
python test_data_generator.py --clear

# Generate fresh dataset
python test_data_generator.py --events 100 --alerts 50
```

### Check Database Statistics

```bash
# See how much data is in the database
python test_data_generator.py --stats
```

Output:
```
total_events: 100
total_alerts: 50
total_reports: 8
containers: ['malicious-app', 'web-server-prod', ...]
event_types: ['PRIVILEGE_ESCALATION', 'FILE_ACCESS_UNAUTHORIZED', ...]
```

## Monitoring Data Flow

### Check if Data is Flowing

```bash
# Watch backend logs
docker-compose logs backend -f

# Watch MongoDB activity
docker-compose logs mongodb -f

# Check daemon logs
docker-compose logs daemon -f
```

### Expected Log Output

```
backend-1  | INFO: 172.19.0.1:47258 - "GET /api/alerts" 200 OK
backend-1  | INFO: 172.19.0.1:47258 - "GET /api/events" 200 OK
backend-1  | INFO: 172.19.0.1:47258 - "GET /api/dashboard/metrics" 200 OK
daemon-1   | Found containers via CLI count=7 os=Linux
daemon-1   | Containers synced count=7 status=200
```

## Troubleshooting

### MongoDB Connection Error
```
MongoDBError: Failed to connect to MongoDB
```

**Solution:**
```bash
# Restart MongoDB
docker-compose restart mongodb

# Wait for health check
sleep 10
docker-compose logs mongodb
```

### Generator Fails to Find Data
```
No data in database after generation
```

**Solution:**
```bash
# Check MongoDB is running
docker-compose ps

# Verify connection
python test_data_generator.py --stats

# Check database directly
docker-compose exec mongodb mongosh -u admin -p password
```

### Dashboard Shows No Events

1. Verify test data was generated:
   ```bash
   python test_data_generator.py --stats
   ```

2. Check API directly:
   ```bash
   curl http://localhost:8000/api/events
   ```

3. Verify MongoDB has data:
   ```bash
   docker-compose exec mongodb mongosh
   > use container_security
   > db.security_events.count()
   ```

## Real-World Deployment (Production)

When deploying to **production Linux**, the system will:

1. **Compile eBPF Programs** - During Docker build
2. **Monitor Containers** - Kernel-level syscall interception
3. **Detect Escapes** - Real-time security event detection
4. **Generate Alerts** - Automated response triggers
5. **Archive Forensics** - Compliance and incident investigation

### Difference from Test Data

| Aspect | Test Data | Production |
|--------|-----------|-----------|
| **Source** | Python generator | Linux eBPF kernel |
| **Real-time** | Simulated | Actual syscalls |
| **Accuracy** | 100% reliable | Kernel-verified |
| **Latency** | Batch operation | Sub-millisecond |
| **Coverage** | 8 event types | 100+ syscall monitors |

## Performance Notes

- **Database Size**: 100 events + 50 alerts ≈ 2 MB in MongoDB
- **API Response Time**: < 100ms for typical queries
- **Dashboard Refresh**: 5-second polling interval
- **Scalability**: Tested up to 10,000 events without performance issues

## Next Steps

1. ✅ **Explore Dashboard** - View metrics and alerts
2. ✅ **Test API Endpoints** - Verify data retrieval
3. ✅ **Generate Reports** - See forensic analysis
4. 🔄 **Monitor Real Events** - Deploy on Linux for eBPF monitoring
5. 🔄 **Customize Rules** - Adjust risk scoring for your environment

---

**Need help?** Check [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system design or [README.md](README.md) for project overview.
