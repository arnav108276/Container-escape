#!/bin/bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if [ ! -d ".venv-wsl" ]; then
  echo "Local WSL virtual environment not found. Run scripts/wsl-local-setup.sh first."
  exit 1
fi

source .venv-wsl/bin/activate

echo "Starting backend on http://0.0.0.0:8000"
(cd backend && uvicorn main:app --host 0.0.0.0 --port 8000) &
backend_pid=$!

echo "Starting frontend dev server on http://0.0.0.0:5173"
(cd frontend && npm run dev -- --host 0.0.0.0 --port 5173) &
frontend_pid=$!

cat <<EOF
Started services:
  Backend PID: $backend_pid
  Frontend PID: $frontend_pid

Use 'kill $backend_pid $frontend_pid' to stop them.
EOF
