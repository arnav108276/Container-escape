import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import { useSystemMetrics } from '../store/systemMetrics';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  AlertTriangle,
  Activity,
  Shield,
  Clock,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';

const RISK_COLORS = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#f59e0b',
  LOW: '#22c55e',
  SAFE: '#14b8a6',
};

interface DashboardMetrics {
  totalContainers: number;
  activeAlerts: number;
  blockedEvents: number;
  riskyProcesses: number;
  quarantinedContainers?: number;
}

type AlertRow = {
  alert_id?: string;
  container_id?: string;
  event_type?: string;
  severity?: string;
  reason?: string;
  risk_score?: number;
  timestamp?: string;
};

type DashboardTab = 'overview' | 'events' | 'containers' | 'alerts' | 'health';

interface SystemOverview {
  service_status: 'healthy' | 'degraded';
  uptime: number;
  timestamp: string;
}

function Dashboard() {
  const { metrics, setMetrics, loading, setLoading } = useSystemMetrics();
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [metricsRes, overviewRes] = await Promise.all([
        apiClient.getDashboardMetrics().catch(() => ({ data: null })),
        apiClient.getSystemOverview().catch(() => ({ data: null })),
      ]);

      if (metricsRes.data) {
        setMetrics(metricsRes.data);
      }

      setOverview(overviewRes.data || {
        service_status: 'degraded',
        uptime: 0,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(() => fetchDashboardData(true), 10000);
    return () => clearInterval(interval);
  }, []);

  const StatCard = ({
    icon: Icon,
    label,
    value,
    className = '',
  }: {
    icon: any;
    label: string;
    value: number | string;
    className?: string;
  }) => (
    <Card className={`p-6 border-white/5 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-all ${className}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-blue-400 font-bold uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-bold text-white mt-2">{value}</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
          <Icon className="w-5 h-5 text-blue-400" />
        </div>
      </div>
    </Card>
  );

  return (
    <div className="space-y-10 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-extrabold text-white tracking-tight">Security Command Center</h1>
          <p className="text-blue-400/80 mt-2 font-medium">Monitoring container integrity and real-time threats</p>
        </div>
        <Button
          onClick={() => fetchDashboardData(true)}
          disabled={refreshing}
          variant="outline"
          size="sm"
          className="bg-blue-600/10 border-blue-500/30 text-blue-400 hover:bg-blue-600/20 gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Syncing...' : 'Sync Now'}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={Shield}
          label="Active Containers"
          value={metrics?.totalContainers ?? 0}
        />
        <StatCard
          icon={AlertTriangle}
          label="Security Alerts"
          value={metrics?.activeAlerts ?? 0}
          className="border-red-500/20 bg-red-500/5"
        />
        <StatCard
          icon={Activity}
          label="Blocked Threats"
          value={metrics?.blockedEvents ?? 0}
        />
        <StatCard
          icon={Clock}
          label="Risk Incidents"
          value={metrics?.riskyProcesses ?? 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 p-8 border-white/5 bg-white/5 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-white">System Health</h3>
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${
              overview?.service_status === 'healthy'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}>
              <div className={`w-2 h-2 rounded-full ${overview?.service_status === 'healthy' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              {overview?.service_status === 'healthy' ? 'SYSTEMS NOMINAL' : 'SYSTEMS DEGRADED'}
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="flex justify-between items-center p-4 rounded-lg bg-white/5 border border-white/5">
              <span className="text-sm text-gray-400">Daemon Status</span>
              <span className="text-sm font-bold text-emerald-400">CONNECTED</span>
            </div>
            <div className="flex justify-between items-center p-4 rounded-lg bg-white/5 border border-white/5">
              <span className="text-sm text-gray-400">eBPF Engine</span>
              <span className="text-sm font-bold text-emerald-400">RUNNING</span>
            </div>
            <div className="flex justify-between items-center p-4 rounded-lg bg-white/5 border border-white/5">
              <span className="text-sm text-gray-400">Policy Controller</span>
              <span className="text-sm font-bold text-emerald-400">ENFORCING</span>
            </div>
          </div>
        </Card>

        <div className="space-y-6">
           <Card className="p-6 border-white/5 bg-blue-600/5 hover:bg-blue-600/10 transition-all cursor-pointer group" onClick={() => window.location.href='/alerts'}>
              <h4 className="font-bold text-white mb-2 flex items-center justify-between">
                Threat Intel
                <TrendingUp className="w-4 h-4 text-blue-400 group-hover:translate-x-1 transition-transform" />
              </h4>
              <p className="text-sm text-gray-400">Review high-priority security alerts and container escape attempts.</p>
           </Card>
           
           <Card className="p-6 border-white/5 bg-blue-600/5 hover:bg-blue-600/10 transition-all cursor-pointer group" onClick={() => window.location.href='/containers'}>
              <h4 className="font-bold text-white mb-2 flex items-center justify-between">
                Fleet Management
                <TrendingUp className="w-4 h-4 text-blue-400 group-hover:translate-x-1 transition-transform" />
              </h4>
              <p className="text-sm text-gray-400">Inspect container runtime security and isolate suspicious workloads.</p>
           </Card>

           <Card className="p-6 border-white/5 bg-blue-600/5 hover:bg-blue-600/10 transition-all cursor-pointer group" onClick={() => window.location.href='/reports'}>
              <h4 className="font-bold text-white mb-2 flex items-center justify-between">
                Forensics
                <TrendingUp className="w-4 h-4 text-blue-400 group-hover:translate-x-1 transition-transform" />
              </h4>
              <p className="text-sm text-gray-400">Generate compliance and security reports for incident response.</p>
           </Card>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
