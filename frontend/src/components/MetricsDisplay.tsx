import React, { useEffect, useState } from 'react';
import { useSystemMetrics } from '../store';

const MetricsDisplay: React.FC = () => {
  const { metrics, setMetrics } = useSystemMetrics();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch('/api/metrics');
        const data = await response.json();
        setMetrics(data);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch metrics:', error);
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [setMetrics]);

  if (loading) {
    return <div className="text-center py-8">Loading metrics...</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      {/* Total Containers */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border-l-4 border-blue-500">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
              Total Containers
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
              {metrics.totalContainers}
            </p>
          </div>
          <div className="text-4xl text-blue-500">📦</div>
        </div>
      </div>

      {/* Active Alerts */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border-l-4 border-red-500">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
              Active Alerts
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
              {metrics.activeAlerts}
            </p>
          </div>
          <div className="text-4xl text-red-500">🚨</div>
        </div>
      </div>

      {/* Blocked Events */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border-l-4 border-orange-500">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
              Blocked Events
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
              {metrics.blockedEvents}
            </p>
          </div>
          <div className="text-4xl text-orange-500">🛡️</div>
        </div>
      </div>

      {/* Risky Processes */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 border-l-4 border-yellow-500">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
              Risky Processes
            </p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
              {metrics.riskyProcesses}
            </p>
          </div>
          <div className="text-4xl text-yellow-500">⚠️</div>
        </div>
      </div>
    </div>
  );
};

export default MetricsDisplay;
