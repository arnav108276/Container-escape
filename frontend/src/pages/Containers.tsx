import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

interface Container {
  container_id: string;
  name?: string;
  status: string;
  risk_level: string;
  alert_count: number;
  last_event_timestamp?: string;
}

interface Vulnerability {
  container_id: string;
  detected_alerts: number;
  runtime_findings?: string[];
  baseline_risk_score?: number;
  baseline_risk_level?: string;
  recent_alerts: Array<{
    timestamp: string;
    reason: string;
    risk_score: number;
    risk_category: string;
    severity: string;
  }>;
  threat_types: Record<string, number>;
}

export default function Containers() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(false);
  const [quarantineId, setQuarantineId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [vulnerabilities, setVulnerabilities] = useState<Record<string, Vulnerability>>({});
  const [hoveredContainer, setHoveredContainer] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  const fetchContainers = async () => {
    if (!initialized) setLoading(true);
    try {
      const response = await apiClient.listContainers();
      setContainers(response.data.containers || []);
    } catch (error) {
      console.error('Failed to fetch containers:', error);
    } finally {
      if (!initialized) {
        setLoading(false);
        setInitialized(true);
      }
    }
  };

  const fetchVulnerabilities = async (containerId: string) => {
    try {
      const response = await apiClient.get(`/api/containers/${containerId}/vulnerabilities`);
      setVulnerabilities(prev => ({
        ...prev,
        [containerId]: response.data
      }));
    } catch (error) {
      console.error('Failed to fetch vulnerabilities:', error);
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

  const handleContainerHover = (containerId: string) => {
    setHoveredContainer(containerId);
    if (!vulnerabilities[containerId]) {
      fetchVulnerabilities(containerId);
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

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'CRITICAL':
        return 'text-red-300 bg-red-950';
      case 'HIGH':
        return 'text-orange-300 bg-orange-950';
      case 'MEDIUM':
        return 'text-yellow-300 bg-yellow-950';
      default:
        return 'text-green-300 bg-green-950';
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-bold">Containers</h1>

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
                <tr 
                  key={container.container_id} 
                  className="hover:bg-gray-700 transition relative"
                  onMouseEnter={() => handleContainerHover(container.container_id)}
                  onMouseLeave={() => setHoveredContainer(null)}
                >
                  <td className="py-4">
                    <div>
                      <div className="font-semibold">{container.name || 'Unnamed'}</div>
                      <div className="text-gray-400 text-xs">{container.container_id.slice(0, 12)}</div>
                    </div>
                  </td>
                  <td className={`py-4 ${getStatusColor(container.status)}`}>{container.status}</td>
                  <td className="py-4 relative group">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold cursor-help ${getRiskColor(container.risk_level)}`}>
                      {container.risk_level}
                    </span>
                    
                    {/* Tooltip showing vulnerabilities */}
                    {hoveredContainer === container.container_id && vulnerabilities[container.container_id] && (
                      <div className="absolute left-0 top-full mt-2 bg-gray-900 border border-gray-700 rounded-lg p-3 z-50 w-80 shadow-xl">
                        <div className="text-white text-xs space-y-2">
                          <div className="font-bold border-b border-gray-700 pb-1">Vulnerabilities Detected</div>
                          
                          {(vulnerabilities[container.container_id].runtime_findings || []).length > 0 && (
                            <div className="border-b border-gray-700 pb-2">
                              <div className="font-semibold text-red-300 mb-1">Runtime Misconfigurations:</div>
                              {(vulnerabilities[container.container_id].runtime_findings || []).map((finding, idx) => (
                                <div key={`finding-${idx}`} className="text-red-200 text-xs">• {finding}</div>
                              ))}
                            </div>
                          )}

                          {vulnerabilities[container.container_id].detected_alerts > 0 ? (
                            <>
                              <div className="text-gray-300">
                                <strong>{vulnerabilities[container.container_id].detected_alerts}</strong> alerts in last 24h
                              </div>
                              
                              {vulnerabilities[container.container_id].recent_alerts.length > 0 && (
                                <div className="border-t border-gray-700 pt-2">
                                  <div className="font-semibold text-gray-200 mb-1">Recent Threats:</div>
                                  {vulnerabilities[container.container_id].recent_alerts.map((alert, idx) => (
                                    <div key={idx} className="mb-1 py-1 px-2 bg-gray-800 rounded text-left">
                                      <div className={`text-xs font-semibold ${getCategoryColor(alert.risk_category)}`}>
                                        {alert.risk_category} (Score: {alert.risk_score})
                                      </div>
                                      <div className="text-gray-300 text-xs mt-1 line-clamp-2">{alert.reason}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              
                              {Object.keys(vulnerabilities[container.container_id].threat_types).length > 0 && (
                                <div className="border-t border-gray-700 pt-2">
                                  <div className="font-semibold text-gray-200 mb-1">Threat Types:</div>
                                  {Object.entries(vulnerabilities[container.container_id].threat_types).map(([type, count]) => (
                                    <div key={type} className="text-gray-300 text-xs">
                                      • {type}: <strong>{count}</strong>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-gray-400">No recent alerts/events detected</div>
                          )}
                        </div>
                      </div>
                    )}
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
