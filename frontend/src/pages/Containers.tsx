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
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
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
      setErrorMessage('Failed to load containers.');
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
      setVulnerabilities((prev) => ({ ...prev, [containerId]: response.data }));
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
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await apiClient.quarantineContainer(containerId, 'Manual quarantine', 'admin');
      const { paused } = response.data || {};
      await fetchContainers();

      if (paused) {
        setSuccessMessage(`Container ${containerId.slice(0, 12)} quarantined and execution paused.`);
      } else {
        setErrorMessage(`Container ${containerId.slice(0, 12)} was marked quarantined, but runtime pause failed.`);
      }
      setTimeout(() => {
        setSuccessMessage('');
        setErrorMessage('');
      }, 4000);
    } catch (error) {
      console.error('Failed to quarantine container:', error);
      setErrorMessage('Quarantine request failed.');
    }
  };

  const handleContainerHover = (containerId: string) => {
    setHoveredContainer(containerId);
    if (!vulnerabilities[containerId]) fetchVulnerabilities(containerId);
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'CRITICAL':
        return 'bg-rose-500/20 text-rose-200 border border-rose-300/40';
      case 'HIGH':
        return 'bg-orange-500/20 text-orange-200 border border-orange-300/40';
      case 'MEDIUM':
        return 'bg-amber-500/20 text-amber-200 border border-amber-300/40';
      default:
        return 'bg-emerald-500/20 text-emerald-200 border border-emerald-300/40';
    }
  };

  const getStatusColor = (status: string) => {
    return status === 'quarantined' ? 'text-rose-300' : status === 'running' ? 'text-emerald-300' : 'text-slate-300';
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'CRITICAL':
        return 'text-rose-300 bg-rose-950/50';
      case 'HIGH':
        return 'text-orange-300 bg-orange-950/50';
      case 'MEDIUM':
        return 'text-amber-300 bg-amber-950/50';
      default:
        return 'text-emerald-300 bg-emerald-950/50';
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-bold text-cyan-100">Containers</h1>

      {successMessage && <div className="rounded-lg border border-emerald-700 bg-emerald-950/40 p-4 text-emerald-200">{successMessage}</div>}
      {errorMessage && <div className="rounded-lg border border-rose-700 bg-rose-950/40 p-4 text-rose-200">{errorMessage}</div>}

      {loading ? (
        <div className="py-8 text-center">Loading...</div>
      ) : containers.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-12 text-center text-slate-400">No containers</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900 p-2">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-700">
              <tr className="text-slate-400">
                <th className="pb-4 pl-4 font-semibold">Container ID</th>
                <th className="pb-4 font-semibold">Status</th>
                <th className="pb-4 font-semibold">Risk Level</th>
                <th className="pb-4 font-semibold">Alerts</th>
                <th className="pb-4 pr-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {containers.map((container: Container) => (
                <tr
                  key={container.container_id}
                  className="relative transition hover:bg-slate-800/80"
                  onMouseEnter={() => handleContainerHover(container.container_id)}
                  onMouseLeave={() => setHoveredContainer(null)}
                >
                  <td className="py-4 pl-4">
                    <div>
                      <div className="font-semibold text-slate-100">{container.name || 'Unnamed'}</div>
                      <div className="text-xs text-slate-400">{container.container_id.slice(0, 12)}</div>
                    </div>
                  </td>
                  <td className={`py-4 ${getStatusColor(container.status)}`}>{container.status}</td>
                  <td className="relative py-4 group">
                    <span className={`cursor-help rounded-full px-3 py-1 text-xs font-semibold ${getRiskColor(container.risk_level)}`}>{container.risk_level}</span>

                    {hoveredContainer === container.container_id && vulnerabilities[container.container_id] && (
                      <div className="absolute left-0 top-full z-20 mt-2 w-96 rounded-lg border border-slate-700 bg-slate-950 p-4 shadow-xl">
                        <div className="mb-2 text-sm font-bold text-cyan-200">Runtime Findings</div>

                        {(vulnerabilities[container.container_id].runtime_findings || []).length > 0 ? (
                          <ul className="mb-3 list-disc space-y-1 pl-5 text-xs text-slate-300">
                            {(vulnerabilities[container.container_id].runtime_findings || []).map((finding) => (
                              <li key={finding}>{finding}</li>
                            ))}
                          </ul>
                        ) : (
                          <div className="mb-3 text-xs text-slate-400">No baseline runtime findings.</div>
                        )}

                        {vulnerabilities[container.container_id].recent_alerts?.length > 0 && (
                          <div className="space-y-2 border-t border-slate-700 pt-2">
                            {vulnerabilities[container.container_id].recent_alerts.slice(0, 4).map((alert, index) => (
                              <div key={index} className={`rounded p-2 text-xs ${getCategoryColor(alert.risk_category)}`}>
                                <div className="font-semibold">{alert.risk_category} • Score {alert.risk_score}</div>
                                <div className="mt-1 line-clamp-2 text-slate-300">{alert.reason}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-4">{container.alert_count}</td>
                  <td className="py-4 pr-4">
                    {container.status !== 'quarantined' ? (
                      <button onClick={() => handleQuarantine(container.container_id)} className="rounded bg-rose-600 px-3 py-1 text-xs transition hover:bg-rose-700">
                        Quarantine
                      </button>
                    ) : (
                      <span className="text-xs font-semibold text-rose-300">Quarantined</span>
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
