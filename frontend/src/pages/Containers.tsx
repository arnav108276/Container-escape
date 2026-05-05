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
      const { paused, quarantine_status: quarantineStatus } = response.data || {};
      await fetchContainers();

      if (quarantineStatus === 'already_quarantined') {
        setSuccessMessage(`Container ${containerId.slice(0, 12)} is already quarantined.`);
      } else if (paused) {
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

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-extrabold text-white tracking-tight">Fleet Intelligence</h1>
        <p className="text-blue-400 font-medium">Monitoring runtime integrity and workload isolation across the fleet.</p>
      </div>

      {successMessage && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-400 font-bold text-xs uppercase tracking-widest">{successMessage}</div>}
      {errorMessage && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-rose-400 font-bold text-xs uppercase tracking-widest">{errorMessage}</div>}

      {loading ? (
        <div className="py-20 text-center text-blue-400 font-bold animate-pulse uppercase tracking-[0.3em]">SYNCHRONIZING FLEET DATA...</div>
      ) : containers.length === 0 ? (
        <div className="rounded-2xl border border-white/5 bg-white/5 backdrop-blur-md p-20 text-center">
           <p className="text-xs font-black text-gray-600 uppercase tracking-widest">No active workloads detected in this sector.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/5 bg-white/5 backdrop-blur-md overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/5 border-b border-white/5">
                <th className="px-6 py-5 text-[10px] font-black text-gray-500 uppercase tracking-widest">Identity</th>
                <th className="px-6 py-5 text-[10px] font-black text-gray-500 uppercase tracking-widest">Runtime Status</th>
                <th className="px-6 py-5 text-[10px] font-black text-gray-500 uppercase tracking-widest">Threat Index</th>
                <th className="px-6 py-5 text-[10px] font-black text-gray-500 uppercase tracking-widest">Alert Count</th>
                <th className="px-6 py-5 text-[10px] font-black text-gray-500 uppercase tracking-widest text-right">Intervention</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {containers.map((container: Container) => (
                <tr
                  key={container.container_id}
                  className="group relative transition-colors hover:bg-white/5"
                  onMouseEnter={() => handleContainerHover(container.container_id)}
                  onMouseLeave={() => setHoveredContainer(null)}
                >
                  <td className="px-6 py-5">
                    <div className="font-bold text-white tracking-tight group-hover:text-blue-400 transition-colors">{container.name || 'Unnamed workload'}</div>
                    <div className="text-[10px] text-gray-500 font-mono uppercase tracking-tighter mt-1">{container.container_id.slice(0, 12)}</div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                      container.status === 'quarantined' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 
                      container.status === 'running' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                      'bg-white/5 text-gray-400 border-white/10'
                    }`}>
                      {container.status}
                    </span>
                  </td>
                  <td className="relative px-6 py-5 group/risk">
                    <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${
                      container.risk_level === 'CRITICAL' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 
                      container.risk_level === 'HIGH' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 
                      'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    }`}>
                      {container.risk_level}
                    </span>

                    {hoveredContainer === container.container_id && vulnerabilities[container.container_id] && (
                      <div className="absolute left-0 bottom-full z-50 mb-4 w-96 rounded-2xl border border-white/10 bg-background/95 backdrop-blur-xl p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-2">
                        <div className="mb-4 text-xs font-black text-blue-400 uppercase tracking-widest">Runtime Analysis Baseline</div>

                        {(vulnerabilities[container.container_id].runtime_findings || []).length > 0 ? (
                          <ul className="mb-4 space-y-2 list-none">
                            {(vulnerabilities[container.container_id].runtime_findings || []).map((finding) => (
                              <li key={finding} className="text-xs text-gray-300 font-medium flex items-center gap-2">
                                <div className="w-1 h-1 rounded-full bg-blue-500" />
                                {finding}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="mb-4 text-xs text-gray-500 font-medium italic">No baseline anomalies detected.</div>
                        )}

                        {vulnerabilities[container.container_id].recent_alerts?.length > 0 && (
                          <div className="space-y-3 border-t border-white/5 pt-4">
                            <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Recent Security Pulses</div>
                            {vulnerabilities[container.container_id].recent_alerts.slice(0, 3).map((alert, index) => (
                              <div key={index} className="rounded-xl p-3 bg-white/5 border border-white/5">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-[10px] font-black text-white uppercase tracking-widest">{alert.risk_category}</span>
                                  <span className="text-[10px] font-mono text-gray-500">SCORE {alert.risk_score}</span>
                                </div>
                                <div className="text-[10px] text-gray-400 font-medium line-clamp-1">{alert.reason}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-5 font-mono text-xs text-blue-400">
                    {container.alert_count}
                  </td>
                  <td className="px-6 py-5 text-right">
                    {container.status !== 'quarantined' ? (
                      <button 
                        onClick={() => handleQuarantine(container.container_id)} 
                        className="rounded-xl bg-rose-600/10 text-rose-400 border border-rose-500/20 px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all hover:bg-rose-600/20 active:scale-95 cursor-pointer"
                      >
                        Isolate Workload
                      </button>
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-widest text-rose-400 bg-rose-500/10 border border-rose-500/20 px-4 py-2 rounded-xl">Quarantined</span>
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
