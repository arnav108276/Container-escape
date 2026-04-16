import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';
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

function Dashboard() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [metricsRes, overviewRes] = await Promise.all([
        apiClient.getDashboardMetrics().catch(() => ({ data: null })),
        apiClient.getSystemOverview().catch(() => ({ data: null })),
      ]);

      setMetrics(metricsRes.data || {
        totalContainers: 0,
        activeAlerts: 0,
        blockedEvents: 0,
        riskyProcesses: 0,
        quarantinedContainers: 0,
      });

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
    const interval = setInterval(() => fetchDashboardData(true), 5000);
    return () => clearInterval(interval);
  }, []);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'events', label: 'Events', icon: '📝' },
    { id: 'containers', label: 'Containers', icon: '🐳' },
    { id: 'alerts', label: 'Alerts', icon: '🔔' },
    { id: 'health', label: 'Health', icon: '💚' },
  ] as const;

  const StatCard = ({
    icon: Icon,
    label,
    value,
    trend,
    className = '',
  }: {
    icon: any;
    label: string;
    value: number | string;
    trend?: { value: number; positive: boolean };
    className?: string;
  }) => (
    <Card className={`p-6 bg-gradient-to-br from-background to-muted/50 ${className}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-medium">{label}</p>
          <p className="text-3xl font-bold text-foreground mt-2">{value}</p>
          {trend && (
            <div className={`text-xs mt-2 flex items-center gap-1 ${trend.positive ? 'text-emerald-500' : 'text-rose-500'}`}>
              <TrendingUp className="w-3 h-3" />
              {trend.positive ? '+' : '-'}{Math.abs(trend.value)}%
            </div>
          )}
        </div>
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-6 h-6 text-primary" />
        </div>
      </div>
    </Card>
  );

  return (
    <div className="space-y-8 pb-8">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Security Overview</h2>
          <p className="text-sm text-muted-foreground mt-1">Real-time threat monitoring and analytics</p>
        </div>
        <Button
          onClick={() => fetchDashboardData(true)}
          disabled={refreshing}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refresh...' : 'Refresh'}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as DashboardTab)}
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Shield}
              label="Active Containers"
              value={metrics?.totalContainers ?? 0}
              trend={{ value: 5, positive: true }}
            />
            <StatCard
              icon={AlertTriangle}
              label="Active Alerts"
              value={metrics?.activeAlerts ?? 0}
              trend={{ value: 12, positive: false }}
              className="border-rose-500/20 bg-gradient-to-br from-rose-500/5 to-rose-500/10"
            />
            <StatCard
              icon={Activity}
              label="Blocked Events"
              value={metrics?.blockedEvents ?? 0}
              trend={{ value: 3, positive: true }}
            />
            <StatCard
              icon={Clock}
              label="Risky Processes"
              value={metrics?.riskyProcesses ?? 0}
              trend={{ value: 8, positive: false }}
            />
          </div>

          {/* System Status */}
          <Card className="p-8 bg-gradient-to-r from-blue-500/5 via-cyan-500/5 to-blue-500/5 border-blue-500/20">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">System Status</h3>
                <p className="text-sm text-muted-foreground">
                  Last updated: {new Date().toLocaleTimeString()}
                </p>
              </div>
              <div className="text-right">
                <div className={`inline-block px-4 py-2 rounded-full text-sm font-medium ${
                  overview?.service_status === 'healthy'
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                }`}>
                  {overview?.service_status === 'healthy' ? '✓ Healthy' : '⚠ Degraded'}
                </div>
              </div>
            </div>
          </Card>

          {/* Quick Links */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-6 hover:shadow-lg transition-all cursor-pointer">
              <h4 className="font-semibold text-foreground mb-2">View All Alerts</h4>
              <p className="text-sm text-muted-foreground">Manage and acknowledge security alerts</p>
              <Button variant="ghost" className="mt-4 gap-2" size="sm">
                View Alerts →
              </Button>
            </Card>
            <Card className="p-6 hover:shadow-lg transition-all cursor-pointer">
              <h4 className="font-semibold text-foreground mb-2">Container Status</h4>
              <p className="text-sm text-muted-foreground">Monitor running containers and quarantine status</p>
              <Button variant="ghost" className="mt-4 gap-2" size="sm">
                View Containers →
              </Button>
            </Card>
            <Card className="p-6 hover:shadow-lg transition-all cursor-pointer">
              <h4 className="font-semibold text-foreground mb-2">Security Report</h4>
              <p className="text-sm text-muted-foreground">Generate and view detailed security reports</p>
              <Button variant="ghost" className="mt-4 gap-2" size="sm">
                View Reports →
              </Button>
            </Card>
          </div>
        </div>
      )}

      {/* Placeholder for other tabs */}
      {['events', 'containers', 'alerts', 'health'].includes(activeTab) && (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">
            {activeTab === 'events' && '📝 Security Events content coming soon...'}
            {activeTab === 'containers' && '🐳 Container management content coming soon...'}
            {activeTab === 'alerts' && '🔔 Alert management content coming soon...'}
            {activeTab === 'health' && '💚 System health content coming soon...'}
          </p>
        </Card>
      )}
    </div>
  );
}

export default Dashboard;
