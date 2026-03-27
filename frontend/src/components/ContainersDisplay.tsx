import React, { useEffect, useState } from 'react';
import { useSystemMetrics, Container } from '../store';

const getRiskBadgeColor = (riskScore: number) => {
  if (riskScore >= 75) return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  if (riskScore >= 50) return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
  if (riskScore >= 25) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'running':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'paused':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'stopped':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const ContainersDisplay: React.FC = () => {
  const { containers, setContainers } = useSystemMetrics();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchContainers = async () => {
      try {
        const response = await fetch('/api/containers');
        const data = await response.json();
        setContainers(data);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch containers:', error);
        setLoading(false);
      }
    };

    fetchContainers();
    const interval = setInterval(fetchContainers, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [setContainers]);

  if (loading) {
    return <div className="text-center py-8">Loading containers...</div>;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          🐳 Containers ({containers.length})
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                Image
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                PID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                Risk Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                Events
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                Last Event
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {containers.map((container: Container) => (
              <tr
                key={container.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                <td className="px-6 py-4 text-sm font-mono text-gray-900 dark:text-gray-300">
                  {container.name}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                  {container.image.split('/').pop()}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span className={`px-2 py-1 rounded capitalize ${getStatusBadge(container.status)}`}>
                    {container.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm font-mono text-gray-900 dark:text-gray-300">
                  {container.pid}
                </td>
                <td className="px-6 py-4 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded font-semibold ${getRiskBadgeColor(container.riskScore)}`}>
                      {container.riskScore}
                    </span>
                    <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          container.riskScore >= 75
                            ? 'bg-red-500'
                            : container.riskScore >= 50
                            ? 'bg-orange-500'
                            : container.riskScore >= 25
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                        }`}
                        style={{ width: `${container.riskScore}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-300">
                  <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                    {container.eventCount}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                  {container.lastEvent
                    ? new Date(container.lastEvent).toLocaleString()
                    : 'Never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {containers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">No containers detected</p>
        </div>
      )}
    </div>
  );
};

export default ContainersDisplay;
