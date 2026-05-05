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
      } catch (error) {
        console.error('Failed to fetch containers:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchContainers();
    const interval = setInterval(fetchContainers, 10000);
    return () => clearInterval(interval);
  }, [setContainers]);

  if (loading) {
    return <div className="text-center py-12 text-blue-400 font-bold animate-pulse">SCANNING CONTAINER FLEET...</div>;
  }

  return (
    <div className="border border-white/5 bg-white/5 backdrop-blur-md rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
        <h2 className="text-sm font-bold text-blue-400 uppercase tracking-widest">
          Active Workloads ({containers.length})
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-white/5">
              <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Identity</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Image Source</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Integrity Status</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Risk Index</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Telemetry Events</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {containers.map((container: Container) => (
              <tr key={container.id} className="hover:bg-white/5 transition-colors group cursor-pointer">
                <td className="px-6 py-4">
                  <div className="font-mono text-sm text-white group-hover:text-blue-400 transition-colors">{container.name}</div>
                  <div className="text-[10px] text-gray-500 font-mono uppercase tracking-tighter mt-1">{container.id.slice(0, 12)}</div>
                </td>
                <td className="px-6 py-4 text-xs text-gray-400 font-medium">
                  {container.image.split('/').pop()}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    container.status === 'running' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}>
                    {container.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-black ${
                      container.riskScore >= 75 ? 'text-rose-400' : container.riskScore >= 50 ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {container.riskScore.toFixed(0)}
                    </span>
                    <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          container.riskScore >= 75 ? 'bg-rose-500' : container.riskScore >= 50 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${container.riskScore}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">
                    {container.eventCount}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {containers.length === 0 && (
        <div className="text-center py-20">
          <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">No active workloads detected in the fleet.</p>
        </div>
      )}
    </div>
  );
};

export default ContainersDisplay;
