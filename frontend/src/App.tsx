import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useThemeStore } from "./store/themeStore";

import Navigation from "./components/Navigation";
import Sidebar from "./components/Sidebar";

import Dashboard from "./pages/Dashboard";
import Alerts from "./pages/Alerts";
import Containers from "./pages/Containers";
import Reports from "./pages/Reports";

import "./App.css";

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const { getEffectiveTheme } = useThemeStore();

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connectWebSocket = () => {
      const wsUrl =
        import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/events";

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        setIsConnected(false);
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
    };

    connectWebSocket();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  const isDark = getEffectiveTheme() === "dark";

  return (
    <Router>
      <div className="flex h-screen bg-background text-foreground overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Right Side Layout */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Top Navigation */}
          <Navigation isConnected={isConnected} />

          {/* Connection Status Banner */}
          <div
            className={`px-6 py-3 text-sm font-medium flex items-center gap-2 transition-colors ${
              isConnected
                ? isDark
                  ? "bg-emerald-950/40 text-emerald-300"
                  : "bg-emerald-50 text-emerald-700"
                : isDark
                ? "bg-rose-950/40 text-rose-300"
                : "bg-rose-50 text-rose-700"
            }`}
          >
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                isConnected ? "bg-emerald-500" : "bg-rose-500"
              }`}
            />
            {isConnected
              ? "Real-time monitoring active"
              : "Backend disconnected — attempting reconnect"}
          </div>

          {/* Main Content */}
          <main className="flex-1 overflow-auto">
            <div className="px-6 py-8">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/alerts" element={<Alerts />} />
                <Route path="/containers" element={<Containers />} />
                <Route path="/reports" element={<Reports />} />
              </Routes>
            </div>
          </main>

          {/* Footer */}
          <footer className="px-6 py-4 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
            <div>Container Escape Detection System • Real-Time Security Monitoring</div>
            <div>v1.0.0 • Enterprise Edition</div>
          </footer>
        </div>
      </div>
    </Router>
  );
}

export default App;