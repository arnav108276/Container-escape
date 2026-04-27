#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "🚀 WSL Local Setup for Container Escape Detection"

# Ensure Python venv support is available and install system packages if needed
if ! python3 -m venv --help >/dev/null 2>&1; then
  echo "Please install python3-venv in WSL: sudo apt install python3-venv"
  exit 1
fi

if [ ! -d ".venv-wsl" ]; then
  echo "Creating local WSL Python virtual environment..."
  python3 -m venv .venv-wsl
fi

source .venv-wsl/bin/activate
python -m pip install --upgrade pip setuptools wheel
python -m pip install fastapi==0.104.1 "uvicorn[standard]==0.24.0" pymongo==4.6.1 pydantic==2.5.0 python-dotenv==1.0.0 structlog==24.1.0 python-multipart==0.0.6 httpx==0.25.2

echo "Installing frontend dependencies..."
cd frontend
npm install
cd "$PROJECT_ROOT"

echo "Installing daemon dependencies..."
cd daemon
python -m pip install -r requirements.txt
cd "$PROJECT_ROOT"

cat <<'EOF'
✅ Setup complete.
Next steps:
  source .venv-wsl/bin/activate
  cd backend && uvicorn main:app --host 0.0.0.0 --port 8000
  cd frontend && npm run dev -- --host 0.0.0.0 --port 5173
  cd daemon && sudo python daemon_modular.py
EOF
