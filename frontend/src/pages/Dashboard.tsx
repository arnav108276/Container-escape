import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../services/api";
import { useDashboardStore } from "../store/dashboardStore";
import MetricCard from "../components/MetricCard";

type OverviewResponse = {
  service_status: "healthy" | "degraded";
  database: "connected" | "disconnected";
  uptime_seconds: number;
  timestamp: string;
  events_last_hour: number;
  high_priority_open_alerts: Array<{
    container_id: string;
    event_type: string;
    severity: string;
    risk_score: number;
    timestamp: string;
  }>;
};

const PLATFORM_CAPABILITIES = [
  {
    title: "Runtime Signal Collection",
    detail: "Collects kernel-level eBPF telemetry from production hosts for process and namespace activity.",
  },
  {
    title: "Escape Detection Analytics",
    detail: "Scores suspicious container behavior and surfaces critical escape attempts in real time.",
  },
  {
    title: "Operational Response",
    detail: "Supports rapid triage with quarantining workflows and evidence-rich forensics integration.",
  },
];

function formatUptime(seconds?: number): string {
  if (!seconds || seconds < 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function Dashboard() {
  const { metrics, setMetrics } = useDashboardStore();
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [overviewError, setOverviewError] = useState<string>("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>("--");

  useEffect(() => {
    const fetchDashboardData = async (firstLoad = false) => {
      if (firstLoad) setInitialLoading(true);
      setOverviewError("");

      try {
        const [metricsResponse, overviewResponse] = await Promise.all([
          apiClient.getDashboardMetrics(),
          apiClient.getSystemOverview(),
        ]);

        setMetrics(metricsResponse.data);
        setOverview(overviewResponse.data);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
        setOverviewError("Unable to fetch live system health. Backend may be unavailable.");
      } finally {
        if (firstLoad) setInitialLoading(false);
      }
    };

    fetchDashboardData(true);
    const interval = setInterval(() => fetchDashboardData(false), 5000);
    return () => clearInterval(interval);
  }, [setMetrics]);

  const statusBadge = useMemo(() => {
    if (!overview) return { label: "Unknown", className: "bg-amber-500/20 text-amber-200 border border-amber-300/40" };
    if (overview.service_status === "healthy") {
      return { label: "Healthy", className: "bg-emerald-500/20 text-emerald-200 border border-emerald-300/40" };
    }
    return { label: "Degraded", className: "bg-rose-500/20 text-rose-200 border border-rose-300/40" };
  }, [overview]);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-cyan-400/20 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-8 shadow-2xl shadow-indigo-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white md:text-5xl">Enterprise Container Escape Defense</h1>
            <p className="mt-3 max-w-4xl text-slate-300">Secure production workloads with eBPF-powered monitoring, threat scoring, and automated response controls.</p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/90 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Platform Health</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`rounded-md px-3 py-1 text-sm font-semibold ${statusBadge.className}`}>{statusBadge.label}</span>
              <span className="text-sm text-slate-400">DB: {overview?.database ?? "unknown"}</span>
            </div>
          </div>
        </div>
      </section>

      {overviewError && <div className="rounded-lg border border-rose-700 bg-rose-950/40 p-4 text-sm text-rose-200">{overviewError}</div>}

      {initialLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-cyan-400"></div>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Total Containers" value={metrics.total_containers} color="#22c55e" />
            <MetricCard title="Quarantined" value={metrics.quarantined_containers} color="#ef4444" />
            <MetricCard title="Events (24h)" value={metrics.events_24h} color="#38bdf8" />
            <MetricCard title="Critical Alerts" value={metrics.critical_alerts} color="#f97316" />
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            {PLATFORM_CAPABILITIES.map((capability) => (
              <article key={capability.title} className="rounded-xl border border-slate-700 bg-slate-900/80 p-6">
                <h3 className="text-lg font-semibold text-cyan-200">{capability.title}</h3>
                <p className="mt-2 text-sm text-slate-300">{capability.detail}</p>
              </article>
            ))}
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <div className="rounded-xl border border-indigo-400/20 bg-slate-900 p-6 shadow-lg">
              <h2 className="text-2xl font-bold text-white">Operations Snapshot</h2>
              <dl className="mt-4 grid grid-cols-1 gap-4 text-sm text-slate-300 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-700 bg-slate-950 p-4">
                  <dt className="text-slate-400">Last Poll</dt>
                  <dd className="mt-1 text-base font-semibold text-white">{lastUpdated}</dd>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-950 p-4">
                  <dt className="text-slate-400">Uptime</dt>
                  <dd className="mt-1 text-base font-semibold text-white">{formatUptime(overview?.uptime_seconds)}</dd>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-950 p-4">
                  <dt className="text-slate-400">Events (1h)</dt>
                  <dd className="mt-1 text-base font-semibold text-white">{overview?.events_last_hour ?? 0}</dd>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-950 p-4">
                  <dt className="text-slate-400">Critical Workflow</dt>
                  <dd className="mt-1 text-base font-semibold text-emerald-300">Active</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-xl border border-rose-400/20 bg-slate-900 p-6 shadow-lg">
              <h2 className="text-2xl font-bold text-white">High Priority Open Alerts</h2>
              <div className="mt-4 space-y-3">
                {overview?.high_priority_open_alerts?.length ? (
                  overview.high_priority_open_alerts.map((alert, index) => (
                    <div key={`${alert.container_id}-${index}`} className="rounded-lg border border-rose-800 bg-rose-950/30 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-rose-200">{alert.event_type}</p>
                        <span className="rounded bg-rose-900 px-2 py-0.5 text-xs uppercase text-rose-200">{alert.severity}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-300">Container: {alert.container_id}</p>
                      <p className="text-sm text-slate-300">Risk score: {alert.risk_score ?? "n/a"}</p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg border border-slate-700 bg-slate-950 p-4 text-sm text-slate-300">No high-priority open alerts right now.</p>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
