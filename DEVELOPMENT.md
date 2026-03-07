# Development Guide

## Prerequisites

### System Requirements
- **Linux** (for eBPF development): Kernel 5.8+ with eBPF support
- **macOS/Windows**: Docker with Linux container support (for local development)

### Tools
- **Python 3.10+** with `uv` package manager
- **Node.js 18+** with npm
- **Docker** and **Docker Compose**
- **MongoDB 6.0+** (or use Docker Compose)
- **Git**

### Optional
- **clang/llvm** (for eBPF compilation)
- **VS Code** or other IDE

## Local Development Setup

### 1. Clone Repository
```bash
git clone <repository-url>
cd major2
```

### 2. Copy Environment File
```bash
cp .env.example .env
# Edit .env with your local settings if needed
```

### 3. Start Services with Docker Compose
```bash
docker-compose up -d
```

This starts:
- MongoDB on `localhost:27017`
- Backend API on `http://localhost:8000`
- Frontend on `http://localhost:5173`
- Daemon service

### 4. Access Applications
- **Frontend Dashboard**: http://localhost:5173
- **Backend API Docs**: http://localhost:8000/docs (Swagger UI)
- **Backend Status**: http://localhost:8000/health

## Manual Development (Without Docker)

### Setup Backend
```bash
cd backend
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv pip install -e ".[dev]"
uv run uvicorn main:app --reload
```

Backend will be available at `http://localhost:8000`

### Setup Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend will be available at `http://localhost:5173`

### Setup Daemon
```bash
cd daemon
uv venv
source .venv/bin/activate
uv pip install -e ".[dev]"
uv run python daemon.py
```

### Setup MongoDB
```bash
# Option 1: Using Docker
docker run -d -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo:7.0

# Option 2: Local MongoDB
# Install MongoDB and start mongod service
```

## Testing

### Backend Tests
```bash
cd backend
uv run pytest -v
```

### Frontend Tests
```bash
cd frontend
npm test
```

### Integration Tests
```bash
# Start all services
docker-compose up -d

# Run integration tests
./scripts/run-integration-tests.sh
```

## Code Style

### Backend (Python)
```bash
cd backend
uv run black .
uv run ruff check --fix
```

### Frontend (TypeScript/React)
```bash
cd frontend
npm run lint
npm run format
```

## Debugging

### Backend Debugging
Use VS Code's Python debugger:
- Press F5 or go to Run > Start Debugging
- Select "Backend (uvicorn)" from the dropdown
- Set breakpoints in `main.py` and step through

### Frontend Debugging
- Open DevTools: `F12` or `Ctrl+Shift+I`
- Use React Developer Tools extension
- Network tab to monitor API calls
- WebSocket tab to monitor real-time events

### Daemon Debugging
```bash
cd daemon
LOG_LEVEL=DEBUG uv run python daemon.py
```

## eBPF Development

### Compile eBPF Programs
```bash
cd ebpf
make clean
make
```

### Load eBPF Programs  (requires root)
```bash
# Using libbpf (in production)
sudo ./load-ebpf.sh

# Or directly in Python (development)
cd daemon
python -c "from ebpf_loader import load_programs; load_programs()"
```

## Useful Commands

### Docker
```bash
# View logs
docker-compose logs -f backend
docker-compose logs -f daemon
docker-compose logs -f frontend

# Restart a service
docker-compose restart backend

# Stop all services
docker-compose down

# Build images
docker-compose build --no-cache
```

### MongoDB
```bash
# Access MongoDB shell
mongosh --authenticationDatabase admin -u admin -p password

# View databases
show dbs

# Use container_security database
use container_security

# View collections
show collections

# Query events
db.security_events.find().pretty()
```

### Python Package Management with uv
```bash
# Add a dependency
uv pip install <package>

# See installed packages
uv pip list

# Update dependencies
uv pip install --upgrade <package>
```

## Environment Variables

Key environment variables for development:

```bash
# Backend
BACKEND_URL=http://localhost:8000
LOG_LEVEL=DEBUG  # DEBUG, INFO, WARNING, ERROR
MONGODB_URI=mongodb://admin:password@localhost:27017

# Frontend
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000

# Daemon
BACKEND_URL=http://localhost:8000
MONGODB_URI=mongodb://admin:password@localhost:27017
LOG_LEVEL=DEBUG
```

## Troubleshooting

### MongoDB Connection Issues
```bash
# Check if MongoDB is running
docker ps | grep mongo

# Check logs
docker-compose logs mongodb

# Verify connection
mongosh --authenticationDatabase admin -u admin -p password
```

### Backend Connection Issues
```bash
# Check if backend is running
curl http://localhost:8000/health

# View logs
docker-compose logs backend
```

### Frontend Not Loading
```bash
# Clear node_modules and reinstall
rm -rf frontend/node_modules
cd frontend
npm install
npm run dev
```

### eBPF Loading Errors
```bash
# Check kernel eBPF support
cat /proc/config.gz | zcat | grep BPF

# Check dmesg for errors
sudo dmesg | tail -20

# Verify libbpf is installed
ldconfig -p | grep libbpf
```

## Common Development Tasks

### Adding a New API Endpoint
1. Create route in `backend/routes/`
2. Update `backend/main.py` to include router
3. Update `frontend/src/services/api.ts` if needed
4. Test with Swagger UI at http://localhost:8000/docs

### Adding a New Detection Rule
1. Modify `daemon/risk_scorer.py` or create new file
2. Update `daemon/event_processor.py` to call new rule
3. Add test cases
4. Deploy daemon

### Adding Frontend Component
1. Create component in `frontend/src/components/`
2. Use `useDashboardStore` for state management
3. Call API via `apiClient` from `src/services/api.ts`
4. Import in page component
5. Test with dev server

## Performance Profiling

### Backend
```bash
cd backend
uv run python -m cProfile -s cumulative daemon.py
```

### Frontend
Use Chrome DevTools:
- Performance tab for flame graphs
- Network tab for API call timings
- React Profiler extension

## Contributing

1. Create feature branch: `git checkout -b feature/your-feature`
2. Make changes and test locally
3. Commit with clear messages
4. Push and create pull request
5. Ensure CI pipeline passes

---

For more information, see individual component READMEs and main project README.
