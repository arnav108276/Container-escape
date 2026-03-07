# System Implementation Guide

Complete step-by-step guide for understanding, deploying, and using the Container Escape Detection System.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Component Walkthrough](#component-walkthrough)
3. [Data Flow Examples](#data-flow-examples)
4. [Common Tasks](#common-tasks)
5. [Troubleshooting](#troubleshooting)
6. [Performance Tuning](#performance-tuning)
7. [Security Hardening](#security-hardening)

---

## Quick Start

### Prerequisites Check

```bash
# Check Docker is installed
docker --version
# Expected: Docker version 20.10+

# Check Docker Compose
docker-compose --version
# Expected: Docker Compose version 2.0+

# Check Python (for test data generator)
python --version
# Expected: Python 3.10+
```

### Deployment (5 minutes)

```bash
# 1. Clone repository
cd ~/projects/major2

# 2. Start all services
docker-compose up -d

# 3. Wait for services to start
sleep 10
docker-compose ps

# Expected output:
# major2-backend-1    RUNNING  8000
# major2-daemon-1     RUNNING  (no port)
# major2-frontend-1   RUNNING  5173
# major2-mongodb-1    HEALTHY  27017

# 4. Verify dashboard
curl http://localhost:8000/api/dashboard/metrics
# Should return: {"total_containers": 7, ...}
```

### Generate Test Data

```bash
# Add sample security events
python test_data_generator.py --events 100 --alerts 50

# View dashboard
# Open browser: http://localhost:5173
```

### Expected Behavior

```
✅ Dashboard shows:
   - Total Containers: 7
   - Critical Alerts: 5-10
   - Events (24h): 100+
   
✅ API endpoints working:
   - GET /api/containers → 7 containers
   - GET /api/alerts → 50+ alerts
   - GET /api/events → 100+ events
   
✅ Daemon logs show:
   - "Found containers via CLI count=7"
   - "Containers synced status=200"
```

---

## Component Walkthrough

### 1. Frontend (React Dashboard)

**What it does**: Real-time visualization of security events and container status

**Files**:
```
frontend/
├── src/
│   ├── App.tsx              # Main app component
│   ├── pages/
│   │   ├── Dashboard.tsx     # Real-time metrics
│   │   ├── Containers.tsx    # Container management
│   │   ├── Alerts.tsx        # Alert feed
│   │   └── Reports.tsx       # Report generation
│   ├── services/
│   │   └── api.ts            # HTTP/WS client
│   └── store/
│       └── dashboardStore.ts # Global state (Zustand)
```

**Key Features**:
```javascript
// Auto-refresh metrics every 5 seconds
useEffect(() => {
  fetchMetrics();
  const interval = setInterval(fetchMetrics, 5000);
  return () => clearInterval(interval);
}, []);

// WebSocket for real-time alerts
const ws = new WebSocket('ws://localhost:8000/ws/events');
ws.onmessage = (event) => {
  const alert = JSON.parse(event.data);
  refreshAlerts();
};
```

**Accessing Dashboard**:
```bash
# Web UI
http://localhost:5173

# REST API (from terminal)
curl http://localhost:8000/api/dashboard/metrics | jq
```

### 2. Backend API (FastAPI)

**What it does**: REST API endpoints for data retrieval and container management

**Request Flow**:
```
Browser Request
    ↓
HTTP Middleware (CORS, logging)
    ↓
Route Matching (/api/containers)
    ↓
Handler Function
    ↓
MongoDB Query
    ↓
Data Transformation
    ↓
JSON Response
    ↓
Browser Receives Data
```

**Key Endpoints**:

```bash
# Get Container List
curl http://localhost:8000/api/containers | jq

# Get Alerts (last 10)
curl http://localhost:8000/api/alerts?limit=10 | jq

# Get Events (last 24 hours)
curl http://localhost:8000/api/events?hours=24&limit=20 | jq

# Get Dashboard Metrics
curl http://localhost:8000/api/dashboard/metrics | jq

# Quarantine a container
curl -X POST http://localhost:8000/api/containers/xxx/quarantine \
  -H "Content-Type: application/json" \
  -d '{"reason": "Escape attempt detected", "approved_by": "admin"}'
```

**Adding New Endpoint**:

```python
# File: backend/routes/alerts.py

@router.get("/alerts/critical")
async def get_critical_alerts(request: Request):
    """Get only critical alerts"""
    try:
        db = request.app.state.db
        alerts = db.db.alerts.find(
            {"severity": "critical"}
        ).sort("timestamp", -1).limit(10)
        
        return {
            'total': db.db.alerts.count_documents({"severity": "critical"}),
            'alerts': [_to_json_serializable(a) for a in alerts]
        }
    except Exception as e:
        log.error("Failed to get critical alerts", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
```

### 3. Event Daemon (Python)

**What it does**: Processes kernel events from eBPF and sends alerts to backend

**Event Processing Pipeline**:

```python
# daemon.py - Main Event Loop

while running:
    # Step 1: Read event from eBPF ring buffer
    event = bpf_buffer.read()  # {pid, uid, syscall, args}
    
    # Step 2: Enrich with container context
    enriched = event_processor.enrich(event)
    # Now has: {container_id, process_name, image}
    
    # Step 3: Calculate risk
    enriched['risk_score'] = risk_scorer.calculate(enriched)
    # Score: 0-100 (based on syscall type, UID, target file)
    
    # Step 4: Log to database
    forensic_logger.log_event(enriched)
    # Insert into: db.security_events
    
    # Step 5: Check if alert needed
    if enriched['risk_score'] >= 75:
        alert = create_alert(enriched)
        http_client.post('/api/alerts', alert)
        
        # Step 6: Quarantine if critical
        if enriched['risk_score'] >= 90:
            container_manager.quarantine(enriched['container_id'])
```

**Testing the Daemon**:

```bash
# View daemon logs
docker-compose logs daemon -f

# Check if daemon syncing containers
docker-compose logs daemon | grep "Containers synced"

# Expected output: "Containers synced count=7 status=200"
```

### 4. Database (MongoDB)

**What it does**: Persistent storage of all security events and metadata

**Collections**:

```bash
# Connect to MongoDB
docker-compose exec mongodb mongosh

# List all databases
show dbs

# Use container_security database
use container_security

# Show collections
show collections

# View sample security event
db.security_events.findOne()

# Count alerts
db.alerts.count()

# Find critical alerts
db.alerts.find({ severity: "critical" }).count()

# Get alerts for specific container
db.alerts.find({ container_id: "malicious-app" }).pretty()

# Get events in last hour
db.security_events.find({
  timestamp: { $gte: new Date(Date.now() - 3600000) }
}).count()

# Delete all test data
db.security_events.deleteMany({})
db.alerts.deleteMany({})
```

### 5. eBPF Programs (Kernel)

**What it does**: Kernel-level syscall monitoring (Linux only)

**Note**: eBPF programs don't compile on Windows WSL2. They require:
- Linux kernel 5.8+
- libbpf headers
- LLVM/Clang

**Programs**:
```
ebpf/monitor.c      - Main monitoring (execute, file access)
ebpf/detections.c   - Detection logic (escape patterns)
```

**Compilation (Linux only)**:
```bash
cd ebpf
make

# Output:
# monitor.o    (compiled eBPF bytecode)
# detections.o (compiled eBPF bytecode)

# Load into kernel (requires root):
bpftool prog load monitor.o type kprobe
```

---

## Data Flow Examples

### Example 1: Detecting Privilege Escalation

```
Timeline:
─────────

T+0ms:   Container Process (UID 1000) calls: execve("/bin/sh")
         ├─ Syscall #59
         ├─ Args: ["/bin/sh", "-c", "whoami"]
         └─ PID: 12345, UID: 1000

T+5μs:   eBPF kprobe (monitor.o) intercepts syscall
         ├─ Context captured
         ├─ Written to BPF ring buffer
         └─ Kernel signals event available

T+100μs: Daemon reads event from ring buffer
         ├─ Raw event: {pid: 12345, uid: 1000, ...}
         ├─ Queries: docker ps → finds container
         └─ Enriched: {container_id: "web-app", image: "nginx:latest"}

T+150μs: RiskScorer evaluates risk
         ├─ Syscall (execve): weight = 20
         ├─ UID (1000, non-root): weight = 5
         ├─ Binary (/bin/sh): weight = 5
         ├─ Recent events: 2 in last minute = 5x multiplier
         └─ TOTAL SCORE: 45/100 (Medium Risk)

T+200μs: ForensicLogger stores in MongoDB
         └─ db.security_events.insertOne({
              timestamp: [current time],
              container_id: "web-app",
              event_type: "PROCESS_SPAWN",
              pid: 12345,
              uid: 1000,
              risk_score: 45,
              filepath: "/bin/sh",
              metadata: {...}
            })

T+250μs: Daemon checks threshold
         ├─ Score 45 < 75 (alert threshold)
         └─ No alert sent, just logged

T+5000ms: Dashboard refresh (5sec poll)
          ├─ GET /api/events
          ├─ Backend queries: db.security_events.find({...})
          ├─ Returns: {total: 45, events: [...]}
          └─ Frontend displays new event in timeline

Result:
   ✅ Event captured and logged (0.2ms detection)
   ✅ Risk scored and stored (Low-medium risk)
   ✅ Dashboard updated within 5 seconds
   ✅ No alert (score below threshold)
```

### Example 2: Detecting Escape Attempt (Critical)

```
Timeline:
─────────

T+0ms:   Container Process attempts: mount /proc/sys/kernel
         └─ Trying to modify kernel parameters (CRITICAL)

T+5μs:   eBPF detections.o trigge
s ESCAPE_ATTEMPT rule
         ├─ Pattern matched: cgroup escape signature
         ├─ Severity: CRITICAL
         └─ BPF_ALERT flag set

T+100μs: Daemon receives ESCAPE_ATTEMPT event
         ├─ Enrich: container_id = "malicious-app"
         └─ Note: Already flagged as critical by eBPF

T+150μs: RiskScorer calculates
         ├─ Event type: ESCAPE_ATTEMPT
         ├─ Base: 90/100
         ├─ UID root: +5 = 95
         ├─ First such event in container: +5 = 100
         └─ FINAL SCORE: 95/100 (CRITICAL)

T+200μs: ForensicLogger stores event
         └─ db.security_events.insertOne({
              risk_score: 95,
              event_type: "ESCAPE_ATTEMPT",
              ...
            })

T+210μs: Daemon checks threshold
         ├─ Score 95 >= 75 (ALERT THRESHOLD)
         ├─ Score 95 >= 90 (QUARANTINE THRESHOLD)
         └─ Actions:
             1. Create CRITICAL alert
             2. POST to /api/alerts
             3. Call container_manager.quarantine()

T+220μs: Backend receives alert
         ├─ db.alerts.insertOne({
         │    severity: "critical",
         │    risk_score: 95,
         │    container_id: "malicious-app",
         │    reason: "Container escape attempt detected"
         │  })
         └─ Returns 200 OK to daemon

T+230μs: Daemon quarantines container
         ├─ docker.Client.containers.get("malicious-app")
         ├─ container.stop(timeout=10)
         ├─ Sends SIGTERM signal
         └─ Waits for graceful shutdown

T+2230μs: Container fully stopped
          ├─ Docker status: Exited (137)
          └─ No more syscalls from this container

Result:
   ✅ Escape attempt detected instantly (0.2ms)
   ✅ CRITICAL alert created (risk score: 95/100)
   ✅ Container quarantined within 2 seconds
   ✅ Forensic data logged for investigation
   ✅ Dashboard updates with alert in <5 seconds
```

---

## Common Tasks

### Task 1: Generate Test Data

```bash
# Single command
python test_data_generator.py --events 100 --alerts 50

# With custom database
python test_data_generator.py \
  --mongodb-uri "mongodb://admin:password@localhost:27017" \
  --db-name "container_security" \
  --events 200 \
  --alerts 100

# Clear old data first
python test_data_generator.py --clear --events 100

# Check statistics
python test_data_generator.py --stats
```

### Task 2: Query Security Events

**Via MongoDB**:
```javascript
// Get all events for a container
db.security_events.find({
  container_id: "malicious-app"
}).explain("executionStats")

// Get events with risk_score >= 60
db.security_events.find({
  risk_score: { $gte: 60 }
}).count()

// Get events from past 1 hour
db.security_events.find({
  timestamp: { $gte: new Date(Date.now() - 3600000) }
}).sort({ timestamp: -1 }).limit(10)

// Aggregate: events by container
db.security_events.aggregate([
  { $group: { _id: "$container_id", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
])
```

**Via API**:
```bash
# Get all events
curl http://localhost:8000/api/events?limit=100

# Get events for specific container
curl http://localhost:8000/api/events?container_id=malicious-app&limit=50

# Get events from last 24 hours
curl http://localhost:8000/api/events?hours=24&limit=1000

# Get event statistics
curl http://localhost:8000/api/events/statistics
```

### Task 3: Quarantine Container

**Manual via API**:
```bash
curl -X POST http://localhost:8000/api/containers/xxx/quarantine \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Confirmed escape attempt",
    "approved_by": "security-team"
  }'
```

**Via Dashboard**:
```
1. Go to http://localhost:5173
2. Click "Containers" tab
3. Find container in list
4. Click "Quarantine" button
5. Enter reason
6. Confirm
```

**Verify Quarantine**:
```bash
# Check container status
docker ps | grep [container_id]
# Status should be: Exited

# Check database
curl http://localhost:8000/api/containers | jq '.containers[] | select(.name=="xxx")'
# Should have: "quarantined": true
```

### Task 4: Generate Forensic Report

**Via API**:
```bash
curl -X POST "http://localhost:8000/api/reports/generate?container_id=malicious-app&hours=24"

# Response:
{
  "report_id": "malicious-app_2026-03-08T01:30:00Z",
  "container_id": "malicious-app",
  "generated_at": "2026-03-08T01:30:00Z",
  "event_count": 45,
  "critical_events": 3,
  "high_risk_events": 8,
  "recommendations": [
    "CRITICAL: Container attempted escape - isolate immediately",
    "Implement stricter capability dropping",
    "Enable read-only filesystem root"
  ],
  "timeline": [...]
}
```

**Via Dashboard**:
```
1. Go to http://localhost:5173
2. Click "Reports" tab
3. Select container from dropdown
4. Click "Generate Report"
5. View recommendations
```

### Task 5: Export Audit Logs

**From MongoDB**:
```bash
# Export to JSON file
docker-compose exec mongodb mongosh \
  container_security \
  --eval "db.security_events.find({}).toArray()" \
  > events.json

# Export to CSV
docker-compose exec mongodb mongoexport \
  --uri "mongodb://admin:password@localhost:27017/container_security" \
  --collection security_events \
  --type csv \
  --out events.csv
```

**From API**:
```bash
# Get all events (paginated)
curl http://localhost:8000/api/events?limit=1000 > page1.json
curl http://localhost:8000/api/events?limit=1000&offset=1000 > page2.json
```

---

## Troubleshooting

### Problem 1: "Cannot connect to MongoDB"

**Symptoms**:
```
MongoDBError: Failed to connect to MongoDB at mongodb://localhost:27017
```

**Solution**:
```bash
# 1. Check if MongoDB container is running
docker-compose ps mongodb

# 2. If not running, start it
docker-compose up -d mongodb

# 3. Wait for health check
sleep 5
docker-compose ps mongodb
# Status should be "healthy"

# 4. Verify connection
docker-compose exec mongodb mongosh

# 5. Check logs for errors
docker-compose logs mongodb --tail=20
```

### Problem 2: "Dashboard shows no data"

**Symptoms**:
- Dashboard loads but metrics empty
- All values are 0

**Solution**:
```bash
# 1. Check backend is running
docker-compose ps backend

# 2. Verify API endpoints
curl http://localhost:8000/api/containers
# Should return: {"total": 7, "containers": [...]}

# 3. Generate test data
python test_data_generator.py --events 100

# 4. Refresh dashboard
# Browser: Ctrl+Shift+R (hard refresh)

# 5. Check backend logs
docker-compose logs backend -f

# Expected:
# INFO: GET /api/dashboard/metrics 200 OK
```

### Problem 3: "Daemon not syncing containers"

**Symptoms**:
```
daemon-1 | 2026-03-08 01:00:00 [error] Failed to sync containers
```

**Solution**:
```bash
# 1. Check daemon is running
docker-compose ps daemon

# 2. Check docker socket is mounted
docker-compose exec daemon ls -la /var/run/docker.sock

# 3. Verify daemon can reach backend
docker-compose exec daemon \
  curl -s http://backend:8000/api/dashboard/metrics

# 4. Check environment variables
docker-compose exec daemon env | grep BACKEND

# 5. View full logs
docker-compose logs daemon --tail=50
```

### Problem 4: "API returns 500 error"

**Symptoms**:
```
HTTP 500: Internal Server Error
```

**Solution**:
```bash
# 1. Check backend logs
docker-compose logs backend --tail=20

# 2. Look for error message
# Example: "ValueError: 'ObjectId' object is not JSON serializable"

# 3. If serialization error:
# Make sure ObjectId conversion is in place
grep "_to_json_serializable" backend/routes/*.py

# 4. Restart backend
docker-compose restart backend

# 5. Test again
curl http://localhost:8000/api/containers
```

---

## Performance Tuning

### Optimize Event Insertion

```python
# Before: Insert one at a time
for event in events:
    db.security_events.insert_one(event)  # 100 inserts = 100 round trips

# After: Batch insert
db.security_events.insert_many(events)    # 1 round trip for 100 events
```

**Impact**: 10x faster insertion (~1000 events/sec → ~10,000 events/sec)

### Add Database Indexes

```bash
# Connect to MongoDB
docker-compose exec mongodb mongosh

# Add indexes for common queries
db.security_events.createIndex({ timestamp: -1 })
db.security_events.createIndex({ container_id: 1 })
db.alerts.createIndex({ severity: 1 })
db.alerts.createIndex({ container_id: 1, timestamp: -1 })

# View indexes
db.security_events.getIndexes()
```

**Impact**: 5-10x faster queries on indexed fields

### Enable Connection Pooling

```python
# In database.py, use MongoClient with pool settings
client = MongoClient(
    mongodb_uri,
    minPoolSize=10,      # Minimum connections
    maxPoolSize=100,     # Maximum connections
    maxIdleTimeMS=30000  # Close idle after 30s
)
```

### Optimize Frontend Polling

```typescript
// Instead of polling every 5 seconds, use exponential backoff
const POLL_INTERVALS = [5000, 10000, 30000];  // 5s, 10s, 30s

if (hasNewData) {
  pollInterval = POLL_INTERVALS[0];  // Fast refresh
} else if (pollCount > 10) {
  pollInterval = POLL_INTERVALS[2];  // Slow refresh if no changes
}
```

---

## Security Hardening

### 1. Enable MongoDB Authentication

```bash
# In docker-compose.yml:
mongodb:
  environment:
    MONGO_INITDB_ROOT_USERNAME: admin          # Already set
    MONGO_INITDB_ROOT_PASSWORD: secure_password # Change this!
```

### 2. Add API Authentication (Future)

```python
from fastapi.security import HTTPBearer

security = HTTPBearer()

@router.get("/alerts")
async def get_alerts(credentials: HTTPAuthCredentials = Depends(security)):
    # Verify token
    token = credentials.credentials
    if not verify_jwt(token):
        raise HTTPException(status_code=401)
    
    # ... continue
```

### 3. Enable CORS Properly

```python
# Don't allow all origins in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://dashboard.company.com"],  # Specific domains
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"]
)
```

### 4. Encrypt Data in Transit

```bash
# Generate self-signed certificate
openssl req -x509 -newkey rsa:4096 -nodes -out cert.pem -keyout key.pem

# Use with FastAPI (in production)
uvicorn main:app --ssl-keyfile key.pem --ssl-certfile cert.pem
```

### 5. Rotate Logs

```bash
# In docker-compose.yml
services:
  backend:
    logging:
      driver: "json-file"
      options:
        max-size: "100m"        # max file size
        max-file: "10"          # keep 10 files
```

---

**For more details, see:**
- [ARCHITECTURE.md](ARCHITECTURE.md) - System design
- [DIAGRAMS.md](DIAGRAMS.md) - Visual diagrams
- [DEMO.md](DEMO.md) - Demo and testing guide

