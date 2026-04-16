#!/bin/bash
# Quick setup script for local development

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "🚀 Container Escape Detection - Setup"
echo "========================================"

echo "📦 Installing backend dependencies..."
if [ ! -d ".venv-wsl" ]; then
  python3 -m venv .venv-wsl
fi
source .venv-wsl/bin/activate
python -m pip install --upgrade pip setuptools wheel
python -m pip install fastapi==0.104.1 "uvicorn[standard]==0.24.0" pymongo==4.6.1 pydantic==2.5.0 python-dotenv==1.0.0 structlog==24.1.0 python-multipart==0.0.6 httpx==0.25.2

cd frontend
npm install
cd "$PROJECT_ROOT"

echo "📦 Installing daemon dependencies..."
cd daemon
source "$PROJECT_ROOT/.venv-wsl/bin/activate"
python -m pip install -r requirements.txt
cd "$PROJECT_ROOT"

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "   Run locally in WSL:"
echo "     source .venv-wsl/bin/activate"
echo "     cd backend && uvicorn main:app --host 0.0.0.0 --port 8000"
echo "     cd frontend && npm run dev -- --host 0.0.0.0 --port 5173"
echo "     cd daemon && sudo python daemon_modular.py"
