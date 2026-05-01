import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useThemeStore } from "./store/themeStore";
import { apiClient } from "./services/api";
import { Card } from "./components/ui/card";
import { Button } from "./components/ui/button";

import Navigation from "./components/Navigation";
import Sidebar from "./components/Sidebar";

import Dashboard from "./pages/Dashboard";
import Alerts from "./pages/Alerts";
import Containers from "./pages/Containers";
import Reports from "./pages/Reports";

import "./App.css";

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin1234");
  const [authError, setAuthError] = useState("");
  const { getEffectiveTheme, theme } = useThemeStore();

  useEffect(() => {
    const effective = getEffectiveTheme();
    const root = window.document.documentElement;
    root.classList.toggle("dark", effective === "dark");
    window.localStorage.setItem("theme", effective);
  }, [theme, getEffectiveTheme]);

  useEffect(() => {
    const validateToken = async () => {
      try {
        const token = window.localStorage.getItem("access_token");
        if (!token) {
          setIsAuthenticated(false);
          return;
        }
        await apiClient.me();
        setIsAuthenticated(true);
      } catch {
        window.localStorage.removeItem("access_token");
        setIsAuthenticated(false);
      } finally {
        setAuthLoading(false);
      }
    };
    validateToken();
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const connectWebSocket = () => {
      if (disposed) return;
      let wsUrl = import.meta.env.VITE_WS_URL;
      if (!wsUrl) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws/events`;
      }

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
      };

      ws.onclose = () => {
        if (disposed) return;
        setIsConnected(false);
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };
    };

    connectWebSocket();

    return () => {
      disposed = true;
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  const isDark = getEffectiveTheme() === "dark";

  const handleLogin = async () => {
    try {
      setAuthError("");
      const response = await apiClient.login(username, password);
      const token = response.data?.access_token;
      if (!token) throw new Error("missing token");
      window.localStorage.setItem("access_token", token);
      setIsAuthenticated(true);
    } catch {
      setAuthError("Login failed. Check credentials or backend auth settings.");
    }
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md p-6 space-y-4">
          <h1 className="text-2xl font-bold">Enterprise Login</h1>
          <p className="text-sm text-muted-foreground">Use seeded admin credentials first, then rotate password via API policy.</p>
          <input className="w-full rounded-md border border-border bg-background p-2" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className="w-full rounded-md border border-border bg-background p-2" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {authError && <p className="text-sm text-red-500">{authError}</p>}
          <Button className="w-full" onClick={handleLogin}>Sign in</Button>
        </Card>
      </div>
    );
  }

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
