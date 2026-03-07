import React, { useEffect } from 'react';
import { apiClient } from '../services/api';
import { useDashboardStore } from '../store/dashboardStore';

export default function Dashboard() {
  const { metrics, setMetrics, loading, setLoading } = useDashboardStore();

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);
      try {
        const response = await apiClient.getDashboardMetrics();
        setMetrics(response.data);
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [setMetrics, setLoading]);

  const StatCard = ({ label, value, borderColor = 'border-blue-500' }: any) => (
    <div className={`bg-gray-800 border-l-4 ${borderColor} p-6 rounded-lg shadow-lg hover:shadow-xl transition-shadow`}>
      <div className="text-gray-400 text-sm font-semibold uppercase tracking-wider">{label}</div>
      <div className="text-4xl font-bold mt-3 text-white">{value}</div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="mb-8">
        <h1 className="text-5xl font-bold text-white">Security Dashboard</h1>
        <p className="text-gray-400 mt-2">Real-time container escape detection & prevention</p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard label="Total Containers" value={metrics.total_containers} borderColor="border-blue-500" />
            <StatCard label="Quarantined" value={metrics.quarantined_containers} borderColor="border-red-500" />
            <StatCard label="Events (24h)" value={metrics.events_24h} borderColor="border-yellow-500" />
            <StatCard label="Critical Alerts" value={metrics.critical_alerts} borderColor="border-red-500" />
          </div>

          <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 shadow-lg">
            <h2 className="text-3xl font-bold mb-6 text-white">System Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="pb-6 border-b border-gray-700 md:border-b-0 md:border-r md:pr-6">
                <span className="text-gray-400 text-sm uppercase font-semibold">Last Updated</span>
                <p className="text-xl font-semibold text-white mt-2">{new Date().toLocaleTimeString()}</p>
              </div>
              <div className="pb-6 border-b border-gray-700 md:border-b-0 md:border-r md:pr-6">
                <span className="text-gray-400 text-sm uppercase font-semibold">System Health</span>
                <p className="text-xl font-semibold text-white mt-2">
                  <span className="inline-block px-4 py-2 bg-green-900 text-green-200 rounded-lg text-sm font-bold">✓ Operational</span>
                </p>
              </div>
              <div>
                <span className="text-gray-400 text-sm uppercase font-semibold">Response Status</span>
                <p className="text-xl font-semibold text-white mt-2">
                  <span className="inline-block px-4 py-2 bg-green-900 text-green-200 rounded-lg text-sm font-bold">⚡ Active</span>
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
