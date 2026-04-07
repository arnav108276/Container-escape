import React, { useEffect, useMemo, useState } from 'react';
import { Pie, PieChart, Cell, ResponsiveContainer } from 'recharts';
import { apiClient } from '../services/api';

const RISK_COLORS = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#f59e0b',
  LOW: '#22c55e',
  SAFE: '#14b8a6',
};

type ContainerRisk = {
  container_id?: string;
  name?: string;
  risk_level?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'SAFE';
  risk_score?: number;
  status?: string;
};

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
  const [overviewError, setOverviewError] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [containers, setContainers] = useState<ContainerRisk[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setOverviewError('');
        const [containerResponse, alertResponse] = await Promise.all([
          apiClient.listContainers(),
          apiClient.getAlerts(undefined, 20, false),
        ]);
        setContainers(containerResponse.data?.containers || []);
        setAlerts(alertResponse.data?.alerts || []);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        setOverviewError('Live telemetry unavailable. Backend may still be starting.');
      }
    };

    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 15000);
    return () => clearInterval(interval);
  }, []);

  const riskDistribution = useMemo(() => {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, SAFE: 0 };
    for (const container of containers) {
      const level = container.risk_level || 'SAFE';
      counts[level] += 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [containers]);

  const totalContainers = containers.length;
  const quarantinedContainers = containers.filter((c) => c.status === 'quarantined').length;
  const criticalContainers = containers.filter((c) => c.risk_level === 'CRITICAL').length;
  const openAlerts = alerts.length;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Security Overview</h1>
            <p className="text-sm text-slate-400">Production-ready runtime security posture</p>
          </div>
          <p className="text-xs text-slate-400">Last updated: {lastUpdated || 'waiting...'}</p>
        </div>
      </section>

      {overviewError && (
        <div className="rounded-xl border border-rose-700 bg-rose-950/50 p-4 text-sm text-rose-200">
          {overviewError}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
          <p className="text-xs uppercase text-slate-400">Total Containers</p>
          <p className="mt-2 text-3xl font-bold text-white">{totalContainers}</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
          <p className="text-xs uppercase text-slate-400">Quarantined</p>
          <p className="mt-2 text-3xl font-bold text-rose-300">{quarantinedContainers}</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
          <p className="text-xs uppercase text-slate-400">Critical Containers</p>
          <p className="mt-2 text-3xl font-bold text-orange-300">{criticalContainers}</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-5">
          <p className="text-xs uppercase text-slate-400">Open Alerts</p>
          <p className="mt-2 text-3xl font-bold text-amber-300">{openAlerts}</p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Container Risk Distribution</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={riskDistribution} dataKey="value" innerRadius={70} outerRadius={105} paddingAngle={3}>
                  {riskDistribution.map((entry) => (
                    <Cell key={entry.name} fill={RISK_COLORS[entry.name as keyof typeof RISK_COLORS]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            {riskDistribution.map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-md border border-slate-700 p-2 text-slate-200">
                <span style={{ color: RISK_COLORS[item.name as keyof typeof RISK_COLORS] }}>{item.name}</span>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Latest Alerts</h2>
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <p className="text-sm text-slate-400">No open alerts.</p>
            ) : (
              alerts.slice(0, 6).map((alert) => (
                <div key={alert.alert_id || `${alert.container_id}-${alert.timestamp}`} className="rounded-md border border-slate-700 bg-slate-950 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-200">{alert.event_type || 'UNKNOWN'}</p>
                    <p className="text-xs uppercase text-slate-400">{alert.severity || 'n/a'}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{alert.reason || 'No reason provided'}</p>
                  <p className="mt-1 text-xs text-cyan-300">Container: {alert.container_id || 'unknown'} | Risk: {alert.risk_score ?? 0}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
