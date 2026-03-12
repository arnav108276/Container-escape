import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

interface Container {
  container_id: string;
  status: string;
  risk_level: string;
  alert_count: number;
  last_event_timestamp?: string;
}

export default function Containers() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(false);
  const [quarantineId, setQuarantineId] = useState<string | null>(null);
  const [testDataLoading, setTestDataLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const fetchContainers = async () => {
    setLoading(true);
    try {
      const response = await apiClient.listContainers();
      setContainers(response.data.containers || []);
    } catch (error) {
      console.error('Failed to fetch containers:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContainers();
    const interval = setInterval(fetchContainers, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleQuarantine = async (containerId: string) => {
    try {
      await apiClient.quarantineContainer(containerId, 'Manual quarantine', 'admin');
      setQuarantineId(containerId);
      // Refresh list
      fetchContainers();
      setSuccessMessage(`Container ${containerId.slice(0, 12)} quarantined successfully!`);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Failed to quarantine container:', error);
    }
  };

  const handleGenerateTestData = async () => {
    setTestDataLoading(true);
    try {
      const response = await apiClient.generateTestAlerts();
      console.log('Test data generated:', response);
      // Refresh containers to show new risk levels
      await fetchContainers();
      setSuccessMessage('Test alerts generated! Risk levels updated.');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      console.error('Failed to generate test data:', error);
    } finally {
      setTestDataLoading(false);
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'CRITICAL':
        return 'bg-red-900 text-red-200';
      case 'HIGH':
        return 'bg-orange-900 text-orange-200';
      case 'MEDIUM':
        return 'bg-yellow-900 text-yellow-200';
      default:
        return 'bg-green-900 text-green-200';
    }
  };

  const getStatusColor = (status: string) => {
    return status === 'quarantined'
      ? 'text-red-400'
      : status === 'running'
      ? 'text-green-400'
      : 'text-gray-400';
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-4xl font-bold">Containers</h1>
        <button
          onClick={handleGenerateTestData}
          disabled={testDataLoading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-sm transition"
        >
          {testDataLoading ? 'Generating...' : 'Generate Test Alerts'}
        </button>
      </div>

      {successMessage && (
        <div className="p-4 bg-green-900 text-green-200 rounded">
          {successMessage}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : containers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No containers</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-700">
              <tr className="text-gray-400">
                <th className="pb-4 font-semibold">Container ID</th>
                <th className="pb-4 font-semibold">Status</th>
                <th className="pb-4 font-semibold">Risk Level</th>
                <th className="pb-4 font-semibold">Alerts</th>
                <th className="pb-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {containers.map((container: Container) => (
                <tr key={container.container_id} className="hover:bg-gray-700 transition">
                  <td className="py-4">{container.container_id.slice(0, 12)}</td>
                  <td className={`py-4 ${getStatusColor(container.status)}`}>{container.status}</td>
                  <td className="py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRiskColor(container.risk_level)}`}>
                      {container.risk_level}
                    </span>
                  </td>
                  <td className="py-4">{container.alert_count}</td>
                  <td className="py-4">
                    {container.status !== 'quarantined' && (
                      <button
                        onClick={() => handleQuarantine(container.container_id)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition"
                      >
                        Quarantine
                      </button>
                    )}
                    {container.status === 'quarantined' && (
                      <span className="text-red-400 text-xs font-semibold">Quarantined</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
