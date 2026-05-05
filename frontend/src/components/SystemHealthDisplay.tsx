import React, { useEffect, useState } from 'react';
import { useSystemMetrics } from '../store';

interface SystemHealth {
  daemonStatus: 'healthy' | 'degraded' | 'unhealthy';
  daemonUptime: number;
  databaseStatus: 'connected' | 'disconnected';
  ebpfLoaded: boolean;
  eventQueueSize: number;
  ringBufferUsage: number;
  cpuUsage: number;
  memoryUsage: number;
  networkConnections: number;
  lastHealthCheck: string;
}

const SystemHealthDisplay: React.FC = () => {
  const { setMetrics } = useSystemMetrics();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const response = await fetch('/api/health');
        const data = await response.json();
        setHealth(data);

        setMetrics({
          cpuUsage: data.cpuUsage,
          memoryUsage: data.memoryUsage,
          networkConnections: data.networkConnections,
        });
      } catch (error) {
        console.error('Failed to fetch health:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, [setMetrics]);

  if (loading || !health) {
    return <div className="text-center py-12 text-blue-400 font-bold animate-pulse">SYNCHRONIZING TELEMETRY...</div>;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'connected':
        return 'text-emerald-400';
      case 'degraded':
        return 'text-amber-400';
      default:
        return 'text-rose-400';
    }
  };

  return (
    <div className="border border-white/5 bg-white/5 backdrop-blur-md rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5 bg-white/5">
        <h2 className="text-sm font-bold text-blue-400 uppercase tracking-widest">
          Node Integrity & Telemetry
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-white/5">
        <div className="bg-background p-6">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Daemon Engine</p>
          <div className={`text-xl font-black ${getStatusColor(health.daemonStatus)}`}>
            {health.daemonStatus.toUpperCase()}
          </div>
        </div>

        <div className="bg-background p-6">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">eBPF Runtime</p>
          <div className={`text-xl font-black ${health.ebpfLoaded ? 'text-emerald-400' : 'text-rose-400'}`}>
            {health.ebpfLoaded ? 'OPERATIONAL' : 'FAULT'}
          </div>
        </div>

        <div className="bg-background p-6">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">CPU Utilization</p>
          <div className="text-xl font-black text-white">{health.cpuUsage.toFixed(1)}%</div>
          <div className="mt-2 w-full h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${health.cpuUsage}%` }} />
          </div>
        </div>

        <div className="bg-background p-6">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Memory Load</p>
          <div className="text-xl font-black text-white">{health.memoryUsage.toFixed(1)}%</div>
          <div className="mt-2 w-full h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${health.memoryUsage}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemHealthDisplay;
