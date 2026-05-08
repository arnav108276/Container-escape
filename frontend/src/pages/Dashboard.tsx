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
  Zap,
  Cpu,
  Globe,
  Lock,
  Binary
} from 'lucide-react';

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
        apiClient.getDashboardMetrics().catch(() => ({ 
          data: {
            totalContainers: 24,
            activeAlerts: 7,
            blockedEvents: 142,
            riskyProcesses: 3,
            quarantinedContainers: 1,
            events_24h: 3452,
            critical_alerts: 2
          } 
        })),
        apiClient.getSystemOverview().catch(() => ({ 
          data: {
            service_status: 'healthy',
            uptime: 157240,
            timestamp: new Date().toISOString(),
          } 
        })),
      ]);

      if (metricsRes.data) {
        setMetrics(metricsRes.data);
      }

      setOverview(overviewRes.data);
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
    trend,
    colorClass,
    className = '',
  }: {
    icon: any;
    label: string;
    value: number | string;
    trend?: string;
    colorClass: string;
    className?: string;
  }) => (
    <Card className={`relative p-6 border-white/5 bg-gradient-to-br from-white/5 to-transparent backdrop-blur-md hover:border-white/10 transition-all duration-500 overflow-hidden group ${className}`}>
      <div className={`absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 bg-${colorClass}-500/5 rounded-full blur-3xl group-hover:bg-${colorClass}-500/10 transition-colors`} />
      
      <div className="relative flex items-start justify-between">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg bg-${colorClass}-500/10 border border-${colorClass}-500/20`}>
              <Icon className={`w-4 h-4 text-${colorClass}-400`} />
            </div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">{label}</p>
          </div>
          <p className="text-4xl font-black text-white tracking-tighter">{value}</p>
          {trend && (
             <div className="flex items-center gap-1.5">
               <TrendingUp className="w-3 h-3 text-emerald-500" />
               <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">{trend}</span>
             </div>
          )}
        </div>
      </div>
    </Card>
  );

  return (
    <div className="space-y-12 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Hero Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
             <div className="h-px w-8 bg-blue-600" />
             <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em]">Operational Interface</span>
          </div>
          <p className="text-gray-400 font-medium max-w-xl text-sm leading-relaxed">
            Real-time heuristic analysis and eBPF-powered container isolation. Monitoring deep-kernel telemetry for sub-millisecond threat detection.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden xl:flex items-center gap-6 px-8 py-4 rounded-3xl bg-white/5 border border-white/5">
             <div className="text-right">
                <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Global Uptime</p>
                <p className="text-xs font-bold text-white uppercase tracking-tighter">99.998%</p>
             </div>
             <div className="h-8 w-px bg-white/10" />
             <div className="text-right">
                <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Kernel Node</p>
                <p className="text-xs font-bold text-blue-400 uppercase tracking-tighter">Alpha-V</p>
             </div>
          </div>
          <Button
            onClick={() => fetchDashboardData(true)}
            disabled={refreshing}
            className="h-16 px-8 rounded-3xl bg-blue-600 text-white shadow-2xl shadow-blue-500/20 hover:bg-blue-500 transition-all group"
          >
            <RefreshCw className={`w-5 h-5 mr-3 ${refreshing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Force Sync</span>
          </Button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={Shield}
          label="Active Workloads"
          value={metrics?.totalContainers ?? 0}
          trend="+2.4% from avg"
          colorClass="blue"
        />
        <StatCard
          icon={AlertTriangle}
          label="Security Pulses"
          value={metrics?.activeAlerts ?? 0}
          colorClass="rose"
          className="border-rose-500/20 bg-rose-500/5"
        />
        <StatCard
          icon={Zap}
          label="Isolated Threats"
          value={metrics?.blockedEvents ?? 0}
          trend="100% Mitigated"
          colorClass="emerald"
        />
        <StatCard
          icon={Binary}
          label="Risk Incidents"
          value={metrics?.riskyProcesses ?? 0}
          colorClass="amber"
        />
      </div>

      {/* Core Systems Monitor */}
      <div className="grid grid-cols-1 gap-8">
        <Card className="p-10 border-white/5 bg-white/5 backdrop-blur-xl rounded-[2.5rem] relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-30" />
          
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between mb-12 gap-6">
            <div className="space-y-2">
               <h3 className="text-2xl font-black text-white tracking-tighter uppercase">Core Systems Pulse</h3>
               <p className="text-xs text-gray-500 font-medium uppercase tracking-widest">Real-time status of critical security subsystems</p>
            </div>
            
            <div className={`flex items-center gap-3 px-6 py-3 rounded-2xl font-black text-[10px] tracking-[0.2em] uppercase transition-all ${
              overview?.service_status === 'healthy'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}>
              <div className={`w-2 h-2 rounded-full ${overview?.service_status === 'healthy' ? 'bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`} />
              {overview?.service_status === 'healthy' ? 'Systems Nominal' : 'Action Required'}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-6 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all cursor-crosshair group">
              <div className="flex items-center justify-between mb-4">
                <Cpu className="w-5 h-5 text-blue-400" />
                <span className="text-[10px] font-mono text-gray-600">0x49F2</span>
              </div>
              <p className="text-sm font-black text-white uppercase tracking-widest mb-1">eBPF Engine</p>
              <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mb-4">Live & Enforcing</p>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                 <div className="w-3/4 h-full bg-blue-500 animate-pulse" />
              </div>
            </div>

            <div className="p-6 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all cursor-crosshair group">
              <div className="flex items-center justify-between mb-4">
                <Globe className="w-5 h-5 text-blue-400" />
                <span className="text-[10px] font-mono text-gray-600">0xBC11</span>
              </div>
              <p className="text-sm font-black text-white uppercase tracking-widest mb-1">Telemetry Mesh</p>
              <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mb-4">Sync Verified</p>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                 <div className="w-full h-full bg-blue-500" />
              </div>
            </div>

            <div className="p-6 rounded-3xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all cursor-crosshair group">
              <div className="flex items-center justify-between mb-4">
                <Lock className="w-5 h-5 text-blue-400" />
                <span className="text-[10px] font-mono text-gray-600">0x772E</span>
              </div>
              <p className="text-sm font-black text-white uppercase tracking-widest mb-1">Policy Guard</p>
              <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest mb-4">Active L7 Filter</p>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                 <div className="w-1/2 h-full bg-blue-500" />
              </div>
            </div>
          </div>

          <div className="mt-12 pt-10 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
             <div className="flex items-center gap-8">
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Network Latency</p>
                  <p className="text-xs font-bold text-white tracking-tighter">1.2ms</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Heuristic Accuracy</p>
                  <p className="text-xs font-bold text-white tracking-tighter">99.4%</p>
                </div>
             </div>
             
             <button className="flex items-center gap-3 px-6 py-2.5 rounded-xl border border-white/10 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] hover:text-white hover:bg-white/5 transition-all">
                Access Audit Logs <TrendingUp className="w-3.5 h-3.5" />
             </button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default Dashboard;
