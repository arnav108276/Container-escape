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

        // Update system metrics based on health data
        setMetrics({
          cpuUsage: data.cpuUsage,
          memoryUsage: data.memoryUsage,
          networkConnections: data.networkConnections,
        });

        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch health:', error);
        setLoading(false);
      }
    };

    fetchHealth();
  }, [setMetrics]);

  if (loading || !health) {
    return <div className="text-center py-8">Loading system health...</div>;
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 dark:text-green-400';
      case 'degraded':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'unhealthy':
        return 'text-red-600 dark:text-red-400';
      case 'connected':
        return 'text-green-600 dark:text-green-400';
      case 'disconnected':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getStatusIcon = (status: string) => {
    if (status === 'healthy' || status === 'connected') return '✓';
    if (status === 'degraded') return '⚠';
    if (status === 'unhealthy' || status === 'disconnected') return '✗';
    return health.ebpfLoaded ? '✓' : '✗';
  };

  const formatUptime = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          💻 System Health & Status
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
        {/* Daemon Status */}
        <div className="border-l-4 border-blue-500 pl-4">
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">Daemon Status</p>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-2xl ${getStatusColor(health.daemonStatus)}`}>
              {getStatusIcon(health.daemonStatus)}
            </span>
            <span className={`text-lg font-semibold ${getStatusColor(health.daemonStatus)}`}>
              {health.daemonStatus.toUpperCase()}
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Uptime: {formatUptime(health.daemonUptime)}
          </p>
        </div>

        {/* Database Status */}
        <div className="border-l-4 border-purple-500 pl-4">
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">Database</p>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-2xl ${getStatusColor(health.databaseStatus)}`}>
              {getStatusIcon(health.databaseStatus)}
            </span>
            <span className={`text-lg font-semibold ${getStatusColor(health.databaseStatus)}`}>
              {health.databaseStatus.toUpperCase()}
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">MongoDB Connection</p>
        </div>

        {/* eBPF Status */}
        <div className="border-l-4 border-green-500 pl-4">
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">eBPF Programs</p>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-2xl ${health.ebpfLoaded ? 'text-green-600' : 'text-red-600'}`}>
              {health.ebpfLoaded ? '✓' : '✗'}
            </span>
            <span className={`text-lg font-semibold ${health.ebpfLoaded ? 'text-green-600' : 'text-red-600'}`}>
              {health.ebpfLoaded ? 'LOADED' : 'FAILED'}
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">LSM Hooks Active</p>
        </div>

        {/* CPU Usage */}
        <div className="border-l-4 border-orange-500 pl-4">
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">CPU Usage</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {health.cpuUsage.toFixed(1)}%
          </p>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${
                health.cpuUsage > 80 ? 'bg-red-500' : health.cpuUsage > 60 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(health.cpuUsage, 100)}%` }}
            />
          </div>
        </div>

        {/* Memory Usage */}
        <div className="border-l-4 border-yellow-500 pl-4">
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">Memory Usage</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {health.memoryUsage.toFixed(1)}%
          </p>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${
                health.memoryUsage > 80 ? 'bg-red-500' : health.memoryUsage > 60 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(health.memoryUsage, 100)}%` }}
            />
          </div>
        </div>

        {/* Network Connections */}
        <div className="border-l-4 border-cyan-500 pl-4">
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">Network Connections</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {health.networkConnections}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Active Connections</p>
        </div>

        {/* Ring Buffer Usage */}
        <div className="border-l-4 border-pink-500 pl-4">
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">Ring Buffer Usage</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {health.ringBufferUsage.toFixed(1)}%
          </p>
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${
                health.ringBufferUsage > 90 ? 'bg-red-500' : health.ringBufferUsage > 70 ? 'bg-yellow-500' : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(health.ringBufferUsage, 100)}%` }}
            />
          </div>
        </div>

        {/* Event Queue Size */}
        <div className="border-l-4 border-indigo-500 pl-4">
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">Event Queue Size</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            {health.eventQueueSize}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Pending Events</p>
        </div>

        {/* Last Health Check */}
        <div className="border-l-4 border-gray-500 pl-4">
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">Last Health Check</p>
          <p className="text-sm font-mono text-gray-900 dark:text-gray-300">
            {new Date(health.lastHealthCheck).toLocaleString()}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
            {((Date.now() - new Date(health.lastHealthCheck).getTime()) / 1000).toFixed(1)}s ago
          </p>
        </div>
      </div>
    </div>
  );
};

export default SystemHealthDisplay;
