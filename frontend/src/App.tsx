import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Navigation from "./components/Navigation";
import Sidebar from "./components/Sidebar";

import Dashboard from "./pages/Dashboard";
import Alerts from "./pages/Alerts";
import Containers from "./pages/Containers";
import Reports from "./pages/Reports";

import "./App.css";

function App() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let disposed = false;

    const connectWebSocket = () => {
      if (disposed) return;
      const wsUrl =
        import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/events";

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
      };

      ws.onclose = () => {
        if (disposed) return;
        setIsConnected(false);
        reconnectTimer = window.setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
    };

    connectWebSocket();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  return (
    <Router>
      <div className="flex min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-gray-200">

        {/* Sidebar */}
        <Sidebar />

        {/* Right Side Layout */}
        <div className="flex flex-col flex-1">

          {/* Top Navigation */}
          <Navigation isConnected={isConnected} />

          {/* Main Content */}
          <main className="flex-1 px-6 py-8">

            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/containers" element={<Containers />} />
              <Route path="/reports" element={<Reports />} />
            </Routes>

          </main>

          {/* Footer */}
          <footer className="text-center text-sm text-gray-500 py-4 border-t border-gray-800">
            Container Escape Detection System • Real-Time Security Monitoring
          </footer>

        </div>

      </div>
    </Router>
  );
}

export default App;