"""WebSocket management for real-time updates"""

import json
import structlog
from fastapi import WebSocket
from typing import List

log = structlog.get_logger(__name__)

# Global connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        log.info("WebSocket client connected", total_connections=len(self.active_connections))
    
    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        log.info("WebSocket client disconnected", total_connections=len(self.active_connections))
    
    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients"""
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                log.error("Failed to send message to client", error=str(e))
                self.disconnect(connection)
    
    async def broadcast_alert(self, alert: dict):
        """Broadcast security alert"""
        await self.broadcast({
            'type': 'alert',
            'severity': 'high',
            'data': alert
        })


manager = ConnectionManager()
