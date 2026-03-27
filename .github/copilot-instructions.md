# Container Escape Detection & Prevention - Copilot Instructions

**A production-grade security system detecting container breakout attempts using eBPF LSM hooks**

## Project Overview

This project implements a three-tier modular architecture for detecting and preventing container escape attacks:

- **Frontend**: React 19 TypeScript dashboard with real-time event streaming
- **Backend**: FastAPI async service layer + routers with MongoDB persistence
- **Daemon**: Modular eBPF processor with kernel-level LSM hooks for container security monitoring

## Copilot Usage Guidelines

### Frontend (React/TypeScript)

When working on frontend changes:
- Follow component composition patterns from `react-expert` skill
- Use Zustand store (`store/systemMetrics.ts`) for all state management
- Maintain TypeScript strict mode—all components must have full type annotations
- WebSocket integration for real-time events: connect to `ws://localhost:8000/ws/events`
- API calls through `services/api.ts` with proper error handling
- Import styles from Tailwind utility classes (no CSS files except globals)
- Components must be functional—no class components

**File Structure**:
```
frontend/src/
├── components/      # All UI components (atomic design)
├── pages/          # Page-level components (Dashboard, Alerts, etc.)
├── services/       # API client functions
├── store/          # Zustand global state
└── [styling files] # CSS modules and Tailwind config
```

**Key Components**:
- `Dashboard.tsx`: Main page with tab interface (Overview, Events, Containers, Alerts, Health)
- `MetricsDisplay.tsx`: Key performance indicators
- `EventsDisplay.tsx`: Real-time security event stream
- `ContainersDisplay.tsx`: Container list with risk scores
- `AlertsDisplay.tsx`: Alert management interface
- `SystemHealthDisplay.tsx`: System status monitoring

### Backend (Python/FastAPI)

When working on backend changes:
- Use service layer pattern: **Services** (business logic) → **Routers** (HTTP endpoints)
- Services in `backend/services.py`: MetricsService, ContainerService, EventService, AlertService, ReportService
- Routers in `backend/routes_modular.py`: metrics_router, containers_router, events_router, alerts_router, reports_router, health_router
- All async/await patterns—no blocking I/O
- Use MongoDB async driver (motor) for all database operations
- Proper error handling: HTTPException(500) with logging
- All timestamps in ISO 8601 format (UTC)

**Service Pattern**:
```python
# In services.py
class MyService:
    def __init__(self, db=None):
        self.db = db
    
    async def my_business_logic(self):
        # Pure logic, no HTTP concerns
        pass

# In routes_modular.py
my_router = APIRouter(prefix="/api/my")

@my_router.get("/endpoint")
async def endpoint(service: MyService = Depends()):
    return await service.my_business_logic()
```

### Daemon (Python)

When working on daemon changes:
- Use modular architecture: independent service classes with single responsibility
- Main orchestrator in `daemon_modular.py`: DaemonOrchestrator coordinates all components
- Core modules:
  - `ring_buffer_reader.py`: eBPF event collection (SecurityEvent dataclass)
  - `backend_api_client.py`: Async HTTP client for backend communication
  - `event_processor_orchestrator.py`: Event pipeline (raw → processed → sent)
  - `daemon_modular.py`: Main entry point with signal handling

**Architecture Pattern**:
```
RingBufferReader (event collection)
  ↓ (SecurityEvent objects)
EventProcessorOrchestrator (processing + sending)
  ├─ Risk scoring
  ├─ Alert creation
  └─ Batch backend requests
```

- All async operations using asyncio
- Proper signal handling: SIGINT (Ctrl+C), SIGTERM (termination)
- Statistics tracking for monitoring: events processed, errors, timing
- Deques for buffering: raw→processed→sent at 10Hz/5s intervals

## Architecture Decisions

### Zustand vs Redux
Use Zustand for its simplicity, TypeScript-first design, and smaller bundle size. No boilerplate required.

### Service/Router Separation
Services contain business logic (testable, reusable). Routers are thin HTTP adapters. This allows:
- Unit testing services without FastAPI test client
- Reusing services for RPC/gRPC if needed later
- Clear separation of concerns

### Async/Await Everywhere
No blocking I/O. All database calls, API requests, ring buffer polling use async/await for:
- Efficient resource usage
- Better scalability
- Proper error handling with try/except blocks

### Event Pipeline Deques
Ring buffer → raw_events → processed_events → backend API
Deques provide backpressure handling and batching:
- raw_events: 10K capacity (kernel events)
- processed_events: 10K capacity (with risk scores)
- Batch send: 100 events max, every 5 seconds

## Development Workflow

### Adding a New API Endpoint

1. **Define service method** in `backend/services.py`:
   ```python
   class MyService:
       async def get_data(self):
           return await self.db.collection.find_one()
   ```

2. **Create router** in `backend/routes_modular.py`:
   ```python
   my_router = APIRouter(prefix="/api/my")
   
   @my_router.get("/data")
   async def get_data(service: MyService = Depends()):
       return await service.get_data()
   ```

3. **Add frontend component** in `frontend/src/components/`:
   ```typescript
   useEffect(() => {
       fetch('/api/my/data')
           .then(r => r.json())
           .then(data => store.update(data))
   }, [])
   ```

### Adding a New Security Event Type

1. Add event type to `SecurityEvent` dataclass in `daemon/ring_buffer_reader.py`
2. Update risk scoring in `daemon/risk_scorer_enhanced.py`
3. Create alert rule in `daemon/event_processor_orchestrator.py`
4. Add new filter in `EventsDisplay.tsx`

### Running Tests

```bash
# Backend tests
cd backend && uv run pytest

# Frontend tests  
cd frontend && npm test

# Linting
cd frontend && npm run lint
```

### Build & Deploy

```bash
# Build all Docker images
docker build -t container-escape-backend ./backend
docker build -t container-escape-frontend ./frontend
docker build -t container-escape-daemon ./daemon

# Run with Docker Compose
docker-compose up
```

## Documentation

- **[MODULAR_ARCHITECTURE.md](../MODULAR_ARCHITECTURE.md)**: Detailed system architecture, component responsibilities, data models, API contracts
- **[README.md](../README.md)**: Quick start guide, feature overview, deployment instructions
- **[backend/README.md](../backend/README.md)**: Backend-specific setup and API documentation
- **[frontend/README.md](../frontend/README.md)**: Frontend-specific setup and component documentation
- **[daemon/README.md](../daemon/README.md)**: Daemon-specific setup and eBPF documentation

## File Organization

```
├── frontend/              # React TypeScript dashboard
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── pages/        # Page components
│   │   ├── services/     # API client
│   │   ├── store/        # Zustand state
│   │   └── App.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── backend/              # FastAPI async backend
│   ├── main.py          # FastAPI app + routers
│   ├── services.py      # Business logic services
│   ├── routes_modular.py # HTTProuters by domain
│   ├── models.py        # Pydantic models
│   ├── database.py      # MongoDB connection
│   ├── routes/          # Legacy routes (to migrate)
│   ├── pyproject.toml
│   └── Dockerfile
│
├── daemon/               # Modular eBPF daemon
│   ├── daemon_modular.py # Main orchestrator
│   ├── ring_buffer_reader.py      # eBPF event collection
│   ├── backend_api_client.py      # API client
│   ├── event_processor_orchestrator.py # Event pipeline
│   ├── risk_scorer_enhanced.py    # Risk scoring
│   ├── container_manager.py       # Container metadata
│   ├── logger.py                  # Forensic logging
│   ├── pyproject.toml
│   ├── requirements.txt
│   └── Dockerfile
│
├── ebpf/                # eBPF LSM kernel programs
│   ├── monitor.c       # Main monitoring hook
│   ├── detections.c    # Event detection rules
│   ├── common.h        # Shared definitions
│   ├── Makefile
│   └── README.md
│
├── docker-compose.yml   # Orchestrates all services
├── MODULAR_ARCHITECTURE.md # This architecture guide
├── README.md           # Quick start
└── .github/
    └── copilot-instructions.md # <-- You are here
```

## Common Copilot Prompts

### Frontend

"Create a new component that displays [feature]. Use Zustand store for state and fetch from `/api/[endpoint]`"

"Add a WebSocket listener to EventsDisplay that updates in real-time"

"Create a TypeScript interface for [data model] and use it in components"

### Backend

"Create a new service in services.py with methods for [business logic], then add a router in routes_modular.py"

"Add MongoDB aggregation pipeline for [query], use MongoDB async driver"

"Add error handling and logging to [endpoint]"

### Daemon

"Create a new EventProcessorOrchestrator method that [behavior]"

"Add a new scoring rule to EnhancedRiskScorer for [event type]"

"Implement [feature] as a modular component in the daemon"

## Important Rules

✅ DO:
- Use service/router separation in backend
- TypeScript strict mode in frontend
- Async/await in all backend and daemon code
- Zustand for frontend state
- Modular components (single responsibility)
- Error handling with proper logging
- Type annotations everywhere

❌ DON'T:
- Use class components in React
- Block I/O operations (always async)
- Mix business logic in routers
- Mutate Zustand state directly (use actions)
- Skip error handling
- Add untyped code or `any` types
- Commit without running tests/linting

## Running the Project

```bash
# Terminal 1: Start services
docker-compose up

# Terminal 2: Access frontend
open http://localhost:3000

# Terminal 3: Check backend health
curl http://localhost:8000/api/health

# View logs
docker logs container-escape-backend   # Backend logs
docker logs container-escape-frontend  # Frontend logs
docker logs container-escape-daemon    # Daemon logs
```

## Execution Guidelines
PROGRESS TRACKING:
If any tools are available to manage the above todo list, use it to track progress through this checklist.
After completing each step, mark it complete and add a summary.
Read current todo list status before starting each new step.

COMMUNICATION RULES:
Avoid verbose explanations or printing full command outputs.
If a step is skipped, state that briefly (e.g. "No extensions needed").
Do not explain project structure unless asked.
Keep explanations concise and focused.

DEVELOPMENT RULES:
Use '.' as the working directory unless user specifies otherwise.
Avoid adding media or external links unless explicitly requested.
Use placeholders only with a note that they should be replaced.
Use VS Code API tool only for VS Code extension projects.
Once the project is created, it is already opened in Visual Studio Code—do not suggest commands to open this project in Visual Studio again.
If the project setup information has additional rules, follow them strictly.

FOLDER CREATION RULES:
Always use the current directory as the project root.
If you are running any terminal commands, use the '.' argument to ensure that the current working directory is used ALWAYS.
Do not create a new folder unless the user explicitly requests it besides a .vscode folder for a tasks.json file.
If any of the scaffolding commands mention that the folder name is not correct, let the user know to create a new folder with the correct name and then reopen it again in vscode.

EXTENSION INSTALLATION RULES:
Only install extension specified by the get_project_setup_info tool. DO NOT INSTALL any other extensions.

PROJECT CONTENT RULES:
If the user has not specified project details, assume they want a "Hello World" project as a starting point.
Avoid adding links of any type (URLs, files, folders, etc.) or integrations that are not explicitly required.
Avoid generating images, videos, or any other media files unless explicitly requested.
If you need to use any media assets as placeholders, let the user know that these are placeholders and should be replaced with the actual assets later.
Ensure all generated components serve a clear purpose within the user's requested workflow.
If a feature is assumed but not confirmed, prompt the user for clarification before including it.
If you are working on a VS Code extension, use the VS Code API tool with a query to find relevant VS Code API references and samples related to that query.

TASK COMPLETION RULES:
Your task is complete when:
	- Project is successfully scaffolded and compiled without errors
	- copilot-instructions.md file in the .github directory exists in the project
	- README.md file exists and is up to date
	- User is provided with clear instructions to debug/launch the project

Before starting a new task in the above plan, update progress in the plan.
- Work through each checklist item systematically.
- Keep communication concise and focused.
- Follow development best practices.

