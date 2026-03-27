import React, { useEffect, useMemo, useState } from 'react';
import apiClient from '../services/api';
import MetricsDisplay from '../components/MetricsDisplay';
import EventsDisplay from '../components/EventsDisplay';
import ContainersDisplay from '../components/ContainersDisplay';
import AlertsDisplay from '../components/AlertsDisplay';
import SystemHealthDisplay from '../components/SystemHealthDisplay';

type DashboardTab = 'overview' | 'events' | 'containers' | 'alerts' | 'health';

interface DashboardMetrics {
  totalContainers: number;
  activeAlerts: number;
  blockedEvents: number;
  riskyProcesses: number;
}

interface SystemOverview {
  service_status: string;
  uptime: number;
  timestamp: string;
}

function Dashboard() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [overviewError, setOverviewError] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  useEffect(() => {
    const fetchDashboardData = async (firstLoad = false) => {
      if (firstLoad) setInitialLoading(true);
      setOverviewError("");

      try {
        const [metricsResponse, overviewResponse] = await Promise.all([
          apiClient.getDashboardMetrics(),
          apiClient.getSystemOverview(),
        ]);

        setMetrics(metricsResponse.data);
        setOverview(overviewResponse.data);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
        setOverviewError("Unable to fetch live system health. Backend may be unavailable.");
      } finally {
        if (firstLoad) setInitialLoading(false);
      }
    };

    fetchDashboardData(true);
    const interval = setInterval(() => fetchDashboardData(false), 5000);
    return () => clearInterval(interval);
  }, []);

  const statusBadge = useMemo(() => {
    if (!overview) return { label: "Unknown", className: "bg-amber-500/20 text-amber-200 border border-amber-300/40" };
    if (overview.service_status === "healthy") {
      return { label: "Healthy", className: "bg-emerald-500/20 text-emerald-200 border border-emerald-300/40" };
    }
    return { label: "Degraded", className: "bg-rose-500/20 text-rose-200 border border-rose-300/40" };
  }, [overview]);

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            🛡️ Container Escape Detection & Prevention
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Real-time security monitoring and event management
          </p>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-20 z-39">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-8" aria-label="Tabs">
            {(['overview', 'events', 'containers', 'alerts', 'health'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-1 py-4 border-b-2 font-medium text-sm transition ${
                  activeTab === tab
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {tab === 'overview' && '📊 Overview'}
                {tab === 'events' && '📝 Security Events'}
                {tab === 'containers' && '🐳 Containers'}
                {tab === 'alerts' && '🔔 Alerts'}
                {tab === 'health' && '💻 System Health'}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <MetricsDisplay />
            
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    ⚠️ Recent Critical Alerts
                  </h2>
                </div>
                <AlertsDisplay />
              </div>
              <div>
                <div className="mb-4">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                    💻 System Status
                  </h2>
                </div>
                <SystemHealthDisplay />
              </div>
            </div>
          </div>
        )}

        {/* Events Tab */}
        {activeTab === 'events' && (
          <div>
            <EventsDisplay />
          </div>
        )}

        {/* Containers Tab */}
        {activeTab === 'containers' && (
          <div>
            <ContainersDisplay />
          </div>
        )}

        {/* Alerts Tab */}
        {activeTab === 'alerts' && (
          <div>
            <AlertsDisplay />
          </div>
        )}

        {/* Health Tab */}
        {activeTab === 'health' && (
          <div>
            <SystemHealthDisplay />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Help</h3>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li><a href="#" className="hover:text-blue-600">Documentation</a></li>
                <li><a href="#" className="hover:text-blue-600">API Reference</a></li>
                <li><a href="#" className="hover:text-blue-600">Troubleshooting</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">System</h3>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <li><a href="#" className="hover:text-blue-600">Policies</a></li>
                <li><a href="#" className="hover:text-blue-600">Settings</a></li>
                <li><a href="#" className="hover:text-blue-600">Logs</a></li>
              </ul>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                © 2026 Container Escape Detection System v1.0.0
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Dashboard;
