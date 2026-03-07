# System Diagrams & UML

Complete visual representation of system architecture, data flows, use cases, and component relationships.

## Table of Contents

1. [Use Case Diagram](#use-case-diagram)
2. [Data Flow Diagram (DFD)](#data-flow-diagram-dfd)
3. [Class Diagram](#class-diagram)
4. [Sequence Diagrams](#sequence-diagrams)
5. [Component Diagram](#component-diagram)
6. [Deployment Diagram](#deployment-diagram)
7. [State Machine Diagram](#state-machine-diagram)

---

## Use Case Diagram

Shows actors and their interactions with the system.

```
┌─────────────────────────────────────────────────────────────┐
│                   SYSTEM BOUNDARY                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │                                                     │  │
│  │    Monitor Container          (eBPF + Daemon)     │  │
│  │          ▲ △ ▼                                     │  │
│  │         / X \                                      │  │
│  │    Detect Escape ← → Generate Alert               │  │
│  │        ▲                    △                      │  │
│  │       / \                  / \                     │  │
│  │      /   \                /   \                    │  │
│  │  Security         ┌──────┘     └─────────────┐   │  │
│  │  Analyst          │                          │   │  │
│  │        │      View Alert ← → Quarantine Container   │  │
│  │        │          │               △                │  │
│  │        │          └───────────────┘                │  │
│  │        │                                           │  │
│  │        ├─→ Generate Report                         │  │
│  │        │                                           │  │
│  │        ├─→ View Dashboard                          │  │
│  │        │                                           │  │
│  │        └─→ Release Container                       │  │
│  │                                                     │  │
│  │    System Admin                                     │  │
│  │        │                                           │  │
│  │        ├─→ Configure Rules                         │  │
│  │        │                                           │  │
│  │        ├─→ Manage Users                            │  │
│  │        │                                           │  │
│  │        └─→ Export Logs                             │  │
│  │                                                     │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Actors:
  • Security Analyst: Monitors and responds to security events
  • System Admin: Configures and maintains system
  • eBPF Kernel: Monitors container syscalls
  • Docker Host: Runs containers and manages lifecycle
```

---

## Data Flow Diagram (DFD)

### Level 0: Context Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│     Docker Host                                             │
│   (Containers)                                              │
│          │                                                 │
│          │ Container Events                                │
│          ▼                                                 │
│  ┌──────────────────────────────────┐                     │
│  │  Container Escape Detection      │                     │
│  │     & Prevention System          │                     │
│  └──┬────────────────────────────┬──┘                     │
│     │                            │                         │
│     │ Alerts & Events            │ Quarantine Signal      │
│     │                            │                         │
│     ▼                            ▼                         │
│  ┌──────────────┐             ┌──────────────┐           │
│  │ Monitoring   │             │   Docker     │           │
│  │ Dashboard    │             │   Engine     │           │
│  │ (Security    │             │              │           │
│  │  Analyst)    │             └──────────────┘           │
│  └──────────────┘                                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Level 1: Main Process Decomposition

```
                     Events from
                     Containers
                         │
                         ▼
              ┌────────────────────────┐
              │  1.0 Monitor Events    │
              │  (eBPF Programs)       │
              └────────┬───────────────┘
                       │ Raw Syscall Events
                       ▼
              ┌────────────────────────┐
              │  2.0 Process Events    │
              │  (Daemon)              │
              │                        │
              │ • Enrich Data         │
              │ • Score Risk          │
              │ • Log Forensics       │
              └────────┬───────────────┘
                       │ Scored Events
                       ▼
              ┌────────────────────────┐
              │  3.0 Store Events      │
              │  (MongoDB)             │
              └────────┬───────────────┘
                       │ Event Records
                       ▼
              ┌────────────────────────┐
              │  4.0 Analyze & Alert   │
              │  (Backend API)         │
              │                        │
              │ • Generate Alerts     │
              │ • Create Reports      │
              │ • Send Notifications  │
              └────────┬───────────────┘
                       │ Alerts & Reports
                       ▼
              ┌────────────────────────┐
              │  5.0 Display & Respond │
              │  (Frontend + API)      │
              │                        │
              │ • Show Dashboard      │
              │ • Quarantine Actions  │
              │ • Manual Review       │
              └────────┬───────────────┘
                       │ Quarantine Signal
                       ▼
                  Docker Host
                 (Stop Container)
```

### Level 2: Event Processing Detailed

```
                  Event from
                   Kernel
                     │
                     ▼
         ┌──────────────────────┐
         │  eBPF Ring Buffer    │
         │  (Stores Events)     │
         └──────┬───────────────┘
                │
                ▼
    ┌─────────────────────────────────┐
    │   Daemon Event Loop             │
    │                                 │
    │  2.1 Receive Event              │
    │   └─→ Raw: {pid, uid, syscall} │
    │                                 │
    │  2.2 Enrich Data                │
    │   ├─→ ContainerManager          │
    │   │   • Get container_id        │
    │   │   • Fetch image name        │
    │   │                             │
    │   └─→ EventProcessor            │
    │       • Resolve process name    │
    │       • Add timestamp           │
    │                                 │
    │  2.3 Calculate Risk Score       │
    │   ├─→ RiskScorer                │
    │   │   • Syscall severity: 0-50  │
    │   │   • UID level: 0-30         │
    │   │   • Target sensitivity: 0-20│
    │   │                             │
    │   └─→ Final Score: 0-100        │
    │                                 │
    │  2.4 Log Forensics              │
    │   └─→ ForensicLogger            │
    │       • Insert into DB          │
    │       • Timestamp & context     │
    │                                 │
    │  2.5 Determine Action           │
    │   ├─→ Score >= 75:              │
    │   │   • Critical Alert          │
    │   │   • Quarantine Request      │
    │   │                             │
    │   ├─→ Score >= 50:              │
    │   │   • High Alert              │
    │   │   • Log Event               │
    │   │                             │
    │   └─→ Score < 50:               │
    │       • Store Event             │
    │       • No Action               │
    │                                 │
    └──────┬────────────────────────┘
           │
           ▼
    HTTP POST to Backend
    /api/alerts
```

---

## Class Diagram

### Security Event Processing Classes

```
┌─────────────────────────────────────────────────────────────┐
│ EventProcessor                                              │
├─────────────────────────────────────────────────────────────┤
│ - mongodb_uri: str                                          │
│ - client: MongoClient                                       │
├─────────────────────────────────────────────────────────────┤
│ + enrich(event: Dict) -> Dict                              │
│ + get_process_name(pid: int) -> str                        │
│ + get_container_info(pid: int) -> Dict                     │
│ + log_event(event: Dict) -> bool                           │
└─────────────────────────────────────────────────────────────┘
          △                          △
          │                          │
          │ uses                     │ uses
          │                          │
┌─────────┴──────────┐    ┌──────────┴──────────────┐
│  ContainerManager  │    │    RiskScorer          │
├──────────────────┤    ├─────────────────────────┤
│ - docker_client  │    │ - sensitivity_map: Dict │
├──────────────────┤    ├─────────────────────────┤
│ + list_containers│    │ + calculate(event)     │
│ + get_by_pid()   │    │ + score_syscall()      │
│ + quarantine()   │    │ + score_filepath()     │
│ + release()      │    │ + score_uid_level()    │
└──────────────────┘    └────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ MongoDatabase                                               │
├─────────────────────────────────────────────────────────────┤
│ - client: MongoClient                                       │
│ - db: Database                                              │
├─────────────────────────────────────────────────────────────┤
│ + connect() -> bool                                         │
│ + insert_alert(alert: Dict) -> bool                         │
│ + insert_event(event: Dict) -> bool                         │
│ + get_alerts(container_id) -> List                          │
│ + get_events(container_id) -> List                          │
│ + get_container_status(id) -> Dict                          │
│ + update_container_status(id, status)                       │
└─────────────────────────────────────────────────────────────┘
          △
          │
          │ uses
          │
┌─────────┴──────────────────────────────────────────────────┐
│ API Routes                                                  │
├─────────────────────────────────────────────────────────────┤
│ • alerts.py         - Alert endpoints                       │
│ • events.py         - Event endpoints                       │
│ • containers.py     - Container management endpoints        │
│ • reports.py        - Report generation endpoints           │
└──────────────────────────────────────────────────────────────┘
```

### Data Models

```
┌─────────────────────────────────────────┐
│  SecurityEvent                          │
├─────────────────────────────────────────┤
│ timestamp: datetime                     │
│ container_id: str                       │
│ event_type: str                         │
│ pid: int                                │
│ uid: int                                │
│ gid: int                                │
│ syscall_nr: int                         │
│ filepath: str                           │
│ risk_score: int (0-100)                 │
│ metadata: Dict                          │
└─────────────────────────────────────────┘
            △ △ △
            │ │ │
    ┌───────┘ │ └────────┐
    │         │          │
    │         │          │
┌───┴──────┐  │     ┌────┴─────────┐
│  Alert   │  │     │ ForensicReport│
├──────────┤  │     ├───────────────┤
│timestamp │  │     │report_id      │
│container │  │     │container_id   │
│severity  │  │     │generated_at   │
│reason    │  │     │event_count    │
│risk_score│  │     │recommendations
│metadata  │  │     │timeline       │
└──────────┘  │     └───────────────┘
              │
         ┌────┴───────┐
         │ Container  │
         ├────────────┤
         │container_id│
         │status      │
         │risk_level  │
         │alert_count │
         │quarantined │
         └────────────┘
```

---

## Sequence Diagrams

### Sequence 1: Container Escape Detection

```
┌──────────┐        ┌──────────┐       ┌────────┐      ┌───────────┐
│Container │        │  eBPF    │       │ Daemon │      │ Backend   │
│ Process  │        │ monitor.o│       │        │      │   API     │
└──────────┘        └──────────┘       └────────┘      └───────────┘
     │                   │                  │                │
     │ Attempt            │                  │                │
     │ execve("/sh")      │                  │                │
     │──────────────────→ │                  │                │
     │                    │ Syscall Event    │                │
     │                    │ {pid, uid, path} │                │
     │                    │                  │                │
     │                    │──────────────────→                │
     │                    │                  │                │
     │                    │                  │ Enrich         │
     │                    │                  │ Calculate Risk │
     │                    │                  │ risk_score=85  │
     │                    │                  │                │
     │                    │                  │ Log to DB      │
     │                    │                  │ Insert Event   │
     │                    │                  │                │
     │                    │                  │──────────────→ │
     │                    │                  │ Create Alert   │
     │                    │                  │ severity=HIGH  │
     │                    │                  │←───────────────│
     │                    │                  │                │
     │←─────────────────────────────────────────             │
     │   Quarantine (stop container)        │                │
     │                                       │                │
```

### Sequence 2: Dashboard Display Flow

```
┌────────────┐      ┌──────────────┐      ┌───────────┐      ┌──────────┐
│  Browser   │      │  Frontend    │      │ Backend   │      │MongoDB   │
│ (React)    │      │  (Vite)      │      │  (REST)   │      │          │
└────────────┘      └──────────────┘      └───────────┘      └──────────┘
     │                    │                    │                  │
     │ componentDidMount  │                    │                  │
     │    (every 5s)     │                    │                  │
     ├──────────────────→ │                    │                  │
     │                    │ GET /api/alerts    │                  │
     │                    │───────────────────→│                  │
     │                    │                    │ db.alerts.find() │
     │                    │                    │ ─────────────────→
     │                    │                    │                  │
     │                    │                    │←─────────────────│
     │                    │                    │  [alerts]        │
     │                    │ {total: 5, alerts} │                  │
     │                    │←───────────────────│                  │
     │  setMetrics()      │                    │                  │
     │←──────────────────│                    │                  │
     │                    │                    │                  │
     │ Re-render          │ GET /api/containers│                  │
     │ Dashboard          │───────────────────→│                  │
     │                    │                    │ db.containers    │
     │                    │                    │  ────────────────→
     │                    │                    │                  │
     │                    │                    │←─────────────────│
     │                    │ {containers}       │                  │
     │                    │←───────────────────│                  │
     │                    │                    │                  │
     │ Display:           │                    │                  │
     │ ✓ Total: 7         │                    │                  │
     │ ✓ Alerts: 5        │                    │                  │
     │ ✓ Events: 143      │                    │                  │
     │                    │                    │                  │
```

### Sequence 3: Quarantine Container

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐
│ Security     │    │  Backend     │    │  Docker      │    │ Container│
│ Analyst      │    │  API         │    │  Engine      │    │          │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────┘
     │                   │                   │                  │
     │ Click             │                   │                  │
     │ Quarantine Button │                   │                  │
     │──────────────────→│                   │                  │
     │                   │ POST /api/         │                  │
     │                   │ containers/xxx/    │                  │
     │                   │ quarantine         │                  │
     │                   │                   │                  │
     │                   │ Docker Stop       │                  │
     │                   │──────────────────→│                  │
     │                   │                   │ SIGTERM          │
     │                   │                   │─────────────────→│
     │                   │                   │                  │
     │                   │                   │←─────────────────│
     │                   │                   │  Container Stopped
     │                   │←──────────────────│                  │
     │                   │                   │                  │
     │                   │ Update DB         │                  │
     │                   │ (status changed)  │                  │
     │                   │                   │                  │
     │ Success Response  │                   │                  │
     │←──────────────────│                   │                  │
     │                   │                   │                  │
     │ Dashboard Updates │                   │                  │
     │ Container Status: │                   │                  │
     │ QUARANTINED       │                   │                  │
     │                   │                   │                  │
```

---

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        SYSTEM COMPONENTS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    PRESENTATION LAYER                    │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  Frontend (React + Vite)                          │  │  │
│  │  │  ├─ Dashboard.tsx                                 │  │  │
│  │  │  ├─ Containers.tsx                                │  │  │
│  │  │  ├─ Alerts.tsx                                    │  │  │
│  │  │  ├─ Reports.tsx                                   │  │  │
│  │  │  └─ services/api.ts (HTTP Client)                 │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────┬───────────────────────────────────────────────┘  │
│             │ HTTP + WebSocket                                 │
├─────────────┴───────────────────────────────────────────────────┤
│             │                                                   │
│             ▼                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   APPLICATION LAYER                      │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  Backend (FastAPI)                                │  │  │
│  │  │  ├─ main.py (Application)                         │  │  │
│  │  │  ├─ routes/alerts.py                              │  │  │
│  │  │  ├─ routes/events.py                              │  │  │
│  │  │  ├─ routes/containers.py                          │  │  │
│  │  │  ├─ routes/reports.py                             │  │  │
│  │  │  ├─ models.py (Pydantic Models)                   │  │  │
│  │  │  └─ database.py (MongoDB Interface)               │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────┬───────────────────────────────────────────────┘  │
│             │ MongoDB Driver                                   │
├─────────────┴───────────────────────────────────────────────────┤
│             │                                                   │
│             ▼                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    DATA LAYER                            │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  MongoDB                                          │  │  │
│  │  │  ├─ security_events Collection                    │  │  │
│  │  │  ├─ alerts Collection                             │  │  │
│  │  │  ├─ containers Collection                         │  │  │
│  │  │  ├─ forensic_reports Collection                   │  │  │
│  │  │  ├─ rules Collection                              │  │  │
│  │  │  └─ audit_logs Collection                         │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────┬───────────────────────────────────────────────┘  │
│             │                                                   │
└─────────────┼───────────────────────────────────────────────────┘
              │
              │ Event Insertion
              │
┌─────────────┴───────────────────────────────────────────────────┐
│             │                                                   │
│             ▼                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           EVENT PROCESSING LAYER (DAEMON)               │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  daemon.py (Main Loop)                            │  │  │
│  │  │  ├─ event_processor.py                            │  │  │
│  │  │  ├─ risk_scorer.py                                │  │  │
│  │  │  ├─ container_manager.py                          │  │  │
│  │  │  ├─ logger.py (Forensic)                          │  │  │
│  │  │  └─ httpx.Client (HTTP)                           │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────┬───────────────────────────────────────────────┘  │
│             │ Docker Socket + HTTP                             │
└─────────────┼───────────────────────────────────────────────────┘
              │
     ┌────────┴──────────┐
     │                   │
     ▼                   ▼
┌─────────────┐      ┌──────────────┐
│ eBPF Events │      │Docker Engine │
│  (Ring Buf) │      │              │
└─────────────┘      └──────────────┘
     △                           │
     │ Syscalls                  │
     │                           │ Container Management
┌────┴─────────────┐           │
│ Kernel (Linux)   │           │
│ • kprobes        │           ▼
│ • tracepoints    │      ┌─────────────┐
│ • syscalls       │      │ Containers  │
└──────────────────┘      └─────────────┘
```

---

## Deployment Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                     DEPLOYMENT ARCHITECTURE                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                      HOST MACHINE (Linux)                        │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                                                            │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │         DOCKER & CONTAINERS                         │ │ │
│  │  │                                                      │ │ │
│  │  │  ┌────────────────┐  ┌────────────────┐            │ │ │
│  │  │  │ Container: App │  │ Container: Web │            │ │ │
│  │  │  │ (malicious)    │  │ (trusted)      │  ... more  │ │ │
│  │  │  └────────┬───────┘  └────────┬───────┘            │ │ │
│  │  │           │                   │                    │ │ │
│  │  │           └─────┬─────────────┘                    │ │ │
│  │  │                 │                                  │ │ │
│  │  │        ┌────────▼────────┐                         │ │ │
│  │  │        │ Docker Bridge   │                         │ │ │
│  │  │        │ Network         │                         │ │ │
│  │  │        └────────┬────────┘                         │ │ │
│  │  │                 │                                  │ │ │
│  │  └─────────────────┼──────────────────────────────────┘ │ │
│  │                    │                                     │ │
│  │  ┌───────────────────────────────────────────────────┐  │ │
│  │  │   DOCKER SERVICES (docker-compose up -d)        │  │ │
│  │  │                                                   │  │ │
│  │  │  ┌──────────────┐  ┌──────────────┐             │  │ │
│  │  │  │   MongoDB    │  │  Backend     │             │  │ │
│  │  │  │ (Container)  │  │  (Container) │             │  │ │
│  │  │  │ :27017       │  │  :8000       │             │  │ │
│  │  │  └─────┬────────┘  └──────┬───────┘             │  │ │
│  │  │        │                  │                     │  │ │
│  │  │  ┌─────▼────┐   ┌─────────▼──────┐             │  │ │
│  │  │  │  Daemon  │   │   Frontend     │             │  │ │
│  │  │  │(Container)   │  (Container)   │             │  │ │
│  │  │  │          │   │  nginx :5173   │             │  │ │
│  │  │  └─────┬────┘   └─────────┬──────┘             │  │ │
│  │  │        │                  │                     │  │ │
│  │  │        └──────────┬───────┘                     │  │ │
│  │  │                   │                             │  │ │
│  │  └───────────────────┼─────────────────────────────┘  │ │
│  │                      │                                 │ │
│  │                      │                                 │ │
│  │  ┌──────────────────▼────────────────────────────┐   │ │
│  │  │        KERNEL SPACE                          │   │ │
│  │  │  ┌────────────────────────────────────────┐  │   │ │
│  │  │  │  eBPF Programs (Kernel JIT Compiled)  │  │   │ │
│  │  │  │  ├─ monitor.o                         │  │   │ │
│  │  │  │  ├─ detections.o                      │  │   │ │
│  │  │  │  │                                    │  │   │ │
│  │  │  │  ├─ BPF Ring Buffer                   │  │   │ │
│  │  │  │  │ (Event Queue)                      │  │   │ │
│  │  │  │  │                                    │  │   │ │
│  │  │  │  └─ Attached to:                      │  │   │ │
│  │  │  │  ├─ sys_enter_execve (tracepoint)    │  │   │ │
│  │  │  │  ├─ page_fault (kprobe)               │  │   │ │
│  │  │  │  └─ security_file_open (LSM)         │  │   │ │
│  │  │  └────────────────────────────────────────┘  │   │ │
│  │  │                                               │   │ │
│  │  └───────────────────────────────────────────────┘   │ │
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐ │
│  │  External Systems (Ports Exposed)                   │ │
│  │  ├─ localhost:5173 → Frontend                       │ │
│  │  ├─ localhost:8000 → Backend API                    │ │
│  │  ├─ localhost:27017 → MongoDB                       │ │
│  │  └─ localhost:9090 → Prometheus (metrics, future)   │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## State Machine Diagram

### Container State Lifecycle

```
                    ┌─────────────────┐
                    │   UNKNOWN       │
                    └────────┬────────┘
                             │
                             │ docker pull
                             │
                    ┌────────▼────────┐
                    │   CREATED       │ ◄─────────┐
                    └────────┬────────┘           │
                             │                   │
                             │ docker start      │
                             │                   │
                    ┌────────▼────────┐          │
                    │   RUNNING       │ ─────┐   │
                    └────────┬────────┘       │   │
                             │                │   │
                             │ Escape/Risk    │   │
                             │ Score >= 75    │   │
                             │                │   │
                    ┌────────▼────────┐       │   │
          ┌─────────│ QUARANTINED     │◄──────┘   │
          │         └────────┬────────┘           │
          │                  │                    │
          │                  │ Manual Review      │
          │                  │ & Release          │
          │                  │                    │
          │         ┌────────▼────────┐           │
          │         │ REVIEW_PENDING  │           │
          │         └────────┬────────┘           │
          │                  │                    │
          │                  │ Approved           │
          │                  │                    │
          │         ┌────────▼────────┐           │
          │         │ RELEASED        │───────────┘
          │         └────────┬────────┘
          │                  │
          │                  │ docker stop
          │                  │
          │         ┌────────▼────────┐
          │         │   STOPPED       │
          │         └────────┬────────┘
          │                  │
          │                  │ docker rm
          │                  │
          │         ┌────────▼────────┐
          │         │   REMOVED       │
          │         └─────────────────┘
          │
          │ docker rm (force)
          │
          └──→ [REMOVED]

Alert State Machine:

OPEN → ACKNOWLEDGED → CLOSED
  │                      │
  └──────→ ESCALATED ────┘
```

### Event Processing State Machine

```
┌─────────────────────────────────────────────────────┐
│              EVENT PROCESSING STATES                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────┐                                   │
│  │  CAPTURED   │  (Kernel eBPF)                   │
│  └──────┬──────┘                                   │
│         │                                          │
│         │ Ring buffer → Daemon reads               │
│         ▼                                          │
│  ┌─────────────┐                                   │
│  │  RECEIVED   │  (Python Event Loop)             │
│  └──────┬──────┘                                   │
│         │                                          │
│         │ EventProcessor.enrich()                  │
│         ▼                                          │
│  ┌─────────────┐                                   │
│  │ ENRICHED    │  (+process_name, +container_id)  │
│  └──────┬──────┘                                   │
│         │                                          │
│         │ RiskScorer.calculate()                   │
│         ▼                                          │
│  ┌─────────────┐                                   │
│  │   SCORED    │  (risk_score: 0-100)             │
│  └──────┬──────┘                                   │
│         │                                          │
│    ┌────┴──────┬──────────┬─────────┐             │
│    │           │          │         │             │
│  score<40    score<60   score<75  score>=75       │
│    │           │          │         │             │
│    ▼           ▼          ▼         ▼             │
│  STORED   ALERT_HIGH ALERT_CRIT  QUARANTINE     │
│    │           │          │         │             │
│    ▼           ▼          ▼         ▼             │
│  MongoDB  MongoDB  MongoDB  API Call              │
│                                    │              │
│                                    ▼              │
│                              Container Stopped    │
│                                                   │
└─────────────────────────────────────────────────────┘
```

---

## Call Flow Diagrams

### API Request Processing

```
┌────────────────────────────────────────────────────┐
│  HTTP Request: GET /api/containers                │
│  Headers: {"user-agent": "Mozilla..."}            │
└──────┬─────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│  FastAPI Router                                   │
│  ├─ Parse route: /api/containers                 │
│  ├─ Match method: GET                            │
│  └─ Extract path params, query params            │
└──────┬───────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│  Handler: list_containers(request: Request)     │
│  ├─ Validate request                            │
│  ├─ Get database: request.app.state.db          │
│  └─ Call: db.db.containers.find({})            │
└──────┬───────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│  Database Query                                  │
│  ├─ MongoDB Driver: find() on containers        │
│  ├─ Cursor returned                             │
│  └─ Convert to list                             │
└──────┬───────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│  Data Transformation                             │
│  ├─ Loop through results                        │
│  ├─ Remove ObjectId fields                      │
│  ├─ Convert dates to ISO strings                │
│  └─ Return JSON-serializable list               │
└──────┬───────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│  Response Object                                 │
│  {                                               │
│    "total": 7,                                   │
│    "containers": [...]                          │
│  }                                               │
└──────┬───────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│  JSON Serialization                              │
│  ├─ Pydantic validates response model           │
│  ├─ JSONEncoder handles custom types            │
│  └─ Return JSON string                          │
└──────┬───────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────┐
│  HTTP Response (200 OK)                          │
│  Content-Type: application/json                  │
│  Body: {"total":7,"containers":[...]}           │
└──────────────────────────────────────────────────┘
```

---

## Summary Matrix

| Diagram | Purpose | Components | Updated |
|---------|---------|-----------|---------|
| **Use Case** | Define system actors and interactions | 4 actors, 8 use cases | ✅ |
| **DFD** | Show data flows through system | 5 processes, 3 data stores | ✅ |
| **Class** | Object-oriented design structure | 8 classes, inheritance | ✅ |
| **Sequence** | Time-ordered interactions | 3 scenarios, 4 actors | ✅ |
| **Component** | System building blocks | 5 layers, 20+ components | ✅ |
| **Deployment** | Physical infrastructure | Containers, kernel, host | ✅ |
| **State Machine** | State transitions | 2 machines, 8+ states | ✅ |

---

## Design Principles Followed

✅ **Layered Architecture** - Separation of concerns (presentation, business, data)
✅ **Event-Driven** - Asynchronous event processing with kernel monitoring
✅ **Microservices** - Independent deploy-able components (daemon, backend, frontend)
✅ **REST API** - Standard HTTP endpoints for all operations
✅ **Database Normalization** - Efficient MongoDB schema design
✅ **Real-time Updates** - WebSocket for live metrics
✅ **Scalability** - Stateless backend, horizontal scaling ready
✅ **Security** - Input validation, CORS, audit logging

---

**For implementation details, see:** [ARCHITECTURE.md](ARCHITECTURE.md)
