# React Frontend Dashboard

Real-time web dashboard for container security monitoring.

## Features
- Real-time security alerts
- Container status visualization
- Event timeline and forensic details
- Risk assessment dashboard
- Quarantine management UI

## Setup
```bash
npm install
npm start
```

## Structure
- `src/components/` - React components
- `src/pages/` - Page components
- `src/services/` - API client services
- `src/store/` - State management (Redux/Zustand)
- `public/` - Static assets

## Technologies
- React 18
- TypeScript
- Tailwind CSS
- WebSocket for real-time updates
- Axios for HTTP

## Environment
```
REACT_APP_API_URL=http://localhost:8000
REACT_APP_WS_URL=ws://localhost:8000
```
