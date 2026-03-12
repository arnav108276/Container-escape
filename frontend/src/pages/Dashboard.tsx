import React, { useEffect } from "react";
import { apiClient } from "../services/api";
import { useDashboardStore } from "../store/dashboardStore";
import MetricCard from "../components/MetricCard";

export default function Dashboard() {
  const { metrics, setMetrics, loading, setLoading } = useDashboardStore();

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);
      try {
        const response = await apiClient.getDashboardMetrics();
        setMetrics(response.data);
      } catch (error) {
        console.error("Failed to fetch metrics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();

    const interval = setInterval(fetchMetrics, 5000);

    return () => clearInterval(interval);
  }, [setMetrics, setLoading]);

  return (
    <div className="space-y-10">

      {/* Header */}
      <div>
        <h1 className="text-5xl font-bold text-white">
          Security Dashboard
        </h1>

        <p className="text-gray-400 mt-2">
          Real-time container escape detection & prevention
        </p>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

            <MetricCard
              title="Total Containers"
              value={metrics.total_containers}
              color="#22c55e"
            />

            <MetricCard
              title="Quarantined"
              value={metrics.quarantined_containers}
              color="#ef4444"
            />

            <MetricCard
              title="Events (24h)"
              value={metrics.events_24h}
              color="#38bdf8"
            />

            <MetricCard
              title="Critical Alerts"
              value={metrics.critical_alerts}
              color="#f97316"
            />

          </div>

          {/* System Status */}
          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 shadow-lg">

            <h2 className="text-3xl font-bold mb-6 text-white">
              System Status
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Last Updated */}
              <div className="border-b md:border-b-0 md:border-r border-gray-700 pb-6 md:pb-0 md:pr-6">
                <span className="text-gray-400 text-sm uppercase font-semibold">
                  Last Updated
                </span>

                <p className="text-xl font-semibold text-white mt-2">
                  {new Date().toLocaleTimeString()}
                </p>
              </div>

              {/* Health */}
              <div className="border-b md:border-b-0 md:border-r border-gray-700 pb-6 md:pb-0 md:pr-6">
                <span className="text-gray-400 text-sm uppercase font-semibold">
                  System Health
                </span>

                <p className="mt-2">
                  <span className="inline-block px-4 py-2 bg-green-900 text-green-200 rounded-lg text-sm font-bold">
                    ✓ Operational
                  </span>
                </p>
              </div>

              {/* Response */}
              <div>
                <span className="text-gray-400 text-sm uppercase font-semibold">
                  Response Status
                </span>

                <p className="mt-2">
                  <span className="inline-block px-4 py-2 bg-green-900 text-green-200 rounded-lg text-sm font-bold">
                    ⚡ Active
                  </span>
                </p>
              </div>

            </div>
          </div>
        </>
      )}
    </div>
  );
}