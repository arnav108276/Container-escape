#!/bin/bash
# Quick setup script for local development

set -e

echo "🚀 Container Escape Detection - Setup"
echo "========================================"

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
pip install -r requirements.txt
cd ..

# Install frontend dependencies  
echo "📦 Installing frontend dependencies..."
cd frontend
npm install
cd ..

# Install daemon dependencies
echo "📦 Installing daemon dependencies..."
cd daemon
pip install -r requirements.txt
cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "   Local development: docker-compose up -d"
echo "   Or start services individually:"
echo "   - Backend:  cd backend && python -m uvicorn main:app --reload"
echo "   - Frontend: cd frontend && npm run dev"
echo "   - Daemon:   cd daemon && python daemon_modular.py (needs root)"
