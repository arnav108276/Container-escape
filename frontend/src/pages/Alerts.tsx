import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../services/api";

interface Alert {
  alert_id?: string;
  timestamp: string;
  container_id: string;
  container_name?: string;
  event_type?: string;
  reason: string;
  risk_score: number;
  risk_category?: string;
  severity: string;
  acknowledged?: boolean;
}

interface AlertSummary {
  open_alerts: number;
  alerts_last_24h: number;
  by_severity: Record<string, number>;
  top_containers: Array<{ container_id: string; count: number }>;
}

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [summary, setSummary] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [includeAcknowledged, setIncludeAcknowledged] = useState(false);
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());
  const [acknowledging, setAcknowledging] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [emailRecipients, setEmailRecipients] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [minSeverity, setMinSeverity] = useState("high");

  const fetchAlerts = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setErrorMessage("");
    try {
      const [alertsResponse, summaryResponse] = await Promise.all([
        apiClient.getAlerts(undefined, 200, includeAcknowledged),
        apiClient.getAlertSummary(),
      ]);
      setAlerts(alertsResponse.data.alerts || []);
      setSummary(summaryResponse.data || null);
      const notificationResponse = await apiClient.getNotificationConfig();
      setEmailRecipients((notificationResponse.data?.recipients || []).join(", "));
      setEmailEnabled(Boolean(notificationResponse.data?.enabled));
      setMinSeverity(notificationResponse.data?.min_severity || "high");
    } catch (error) {
      console.error("Failed to fetch alerts:", error);
      setErrorMessage("Failed to load alerts. Please verify backend connectivity.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts(true);
    const interval = setInterval(() => fetchAlerts(false), 5000);
    return () => clearInterval(interval);
  }, [includeAcknowledged]);

  const selectAll = useMemo(
    () => alerts.length > 0 && selectedAlerts.size === alerts.filter((a) => a.alert_id).length,
    [alerts, selectedAlerts],
  );

  const getSeverityColor = (category?: string) => {
    switch ((category || "LOW").toUpperCase()) {
      case "CRITICAL":
        return "bg-red-950 text-red-200 border-red-600";
      case "HIGH":
        return "bg-orange-950 text-orange-200 border-orange-600";
      case "MEDIUM":
        return "bg-yellow-950 text-yellow-200 border-yellow-600";
      default:
        return "bg-green-950 text-green-200 border-green-600";
    }
  };

  const toggleAlert = (alertId?: string) => {
    if (!alertId) return;
    const next = new Set(selectedAlerts);
    if (next.has(alertId)) next.delete(alertId);
    else next.add(alertId);
    setSelectedAlerts(next);
  };

  const toggleAll = () => {
    if (selectAll) {
      setSelectedAlerts(new Set());
      return;
    }
    setSelectedAlerts(new Set(alerts.filter((a) => a.alert_id).map((a) => a.alert_id!)));
  };

  const acknowledge = async (type: "single" | "selected" | "all", alertId?: string) => {
    setAcknowledging(true);
    try {
      if (type === "single" && alertId) {
        await apiClient.acknowledgeAlert(alertId);
      } else if (type === "selected") {
        await apiClient.acknowledgeMultipleAlerts(Array.from(selectedAlerts));
      } else {
        await apiClient.acknowledgeAllAlerts();
      }
      await fetchAlerts();
    } catch (error: any) {
      alert(`Failed to acknowledge alerts: ${error?.message || "unknown error"}`);
    } finally {
      setAcknowledging(false);
    }
  };

  const saveNotificationConfig = async () => {
    try {
      await apiClient.updateNotificationConfig({
        recipients: emailRecipients.split(",").map((email) => email.trim()).filter(Boolean),
        enabled: emailEnabled,
        min_severity: minSeverity,
      });
      await apiClient.processEmailQueue();
      alert("Email notification settings saved.");
    } catch (error) {
      console.error("Failed to save notification config:", error);
      alert("Failed to save email notification settings.");
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-4xl font-bold">Security Alerts</h1>
        <label className="inline-flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={includeAcknowledged}
            onChange={(e) => setIncludeAcknowledged(e.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-gray-700"
          />
          Show acknowledged alerts
        </label>
      </div>

      {summary && (
        <>
          <section className="rounded-xl border border-gray-700 bg-gray-800 p-4">
            <h2 className="text-lg font-semibold text-white">Email Alerting</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
                Enabled
              </label>
              <select value={minSeverity} onChange={(e) => setMinSeverity(e.target.value)} className="rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white">
                <option value="high">High+</option>
                <option value="critical">Critical only</option>
                <option value="medium">Medium+</option>
              </select>
              <input
                value={emailRecipients}
                onChange={(e) => setEmailRecipients(e.target.value)}
                placeholder="soc@example.com, devops@example.com"
                className="md:col-span-2 rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
              />
            </div>
            <button onClick={saveNotificationConfig} className="mt-3 rounded bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">
              Save Notification Settings
            </button>
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <p className="text-xs uppercase text-gray-400">Open Alerts</p>
              <p className="mt-1 text-2xl font-bold text-white">{summary.open_alerts}</p>
            </div>
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <p className="text-xs uppercase text-gray-400">Alerts (24h)</p>
              <p className="mt-1 text-2xl font-bold text-white">{summary.alerts_last_24h}</p>
            </div>
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <p className="text-xs uppercase text-gray-400">Critical Open</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{summary.by_severity?.critical || 0}</p>
            </div>
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <p className="text-xs uppercase text-gray-400">High Open</p>
              <p className="mt-1 text-2xl font-bold text-orange-300">{summary.by_severity?.high || 0}</p>
            </div>
          </section>

          <section className="rounded-xl border border-gray-700 bg-gray-800 p-4">
            <h2 className="text-lg font-semibold text-white">Containers with Alerts (24h)</h2>
            {summary.top_containers?.length ? (
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                {summary.top_containers.map((container) => (
                  <div key={container.container_id} className="flex items-center justify-between rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm">
                    <span className="font-mono text-gray-200">{container.container_id}</span>
                    <span className="rounded bg-blue-950 px-2 py-0.5 text-xs font-semibold text-blue-200">
                      {container.count} alerts
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-400">No containers with alerts in the last 24 hours.</p>
            )}
          </section>
        </>
      )}

      {errorMessage && <div className="rounded-lg border border-red-700 bg-red-900/40 p-3 text-red-200">{errorMessage}</div>}

      <section className="rounded-xl border border-gray-700 bg-gray-800 p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => acknowledge("all")}
            disabled={alerts.length === 0 || acknowledging}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-600"
          >
            {acknowledging ? "Processing..." : `Acknowledge All (${alerts.length})`}
          </button>
          <button
            onClick={() => acknowledge("selected")}
            disabled={selectedAlerts.size === 0 || acknowledging}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-gray-600"
          >
            {acknowledging ? "Processing..." : `Acknowledge Selected (${selectedAlerts.size})`}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-red-500" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="py-8 text-center text-gray-400">No alerts available.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={selectAll}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-gray-600 bg-gray-700"
              />
              Select all visible alerts
            </div>
            {alerts.map((alert, idx) => (
              <article
                key={`${alert.alert_id || alert.timestamp}-${idx}`}
                className={`rounded-lg border p-4 ${selectedAlerts.has(alert.alert_id || "") ? "border-blue-500 bg-slate-900" : "border-gray-700 bg-gray-900"}`}
              >
                <div className="flex gap-3">
                  <input
                    type="checkbox"
                    checked={selectedAlerts.has(alert.alert_id || "")}
                    onChange={() => toggleAlert(alert.alert_id)}
                    className="mt-1 h-4 w-4 rounded border-gray-600 bg-gray-700"
                  />
                  <div className="flex-1">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{alert.container_name || alert.container_id || "Unknown"}</h3>
                        <p className="text-xs text-gray-400">Container: {(alert.container_id || "unknown").slice(0, 12)}</p>
                        {alert.event_type && <p className="mt-1 text-xs text-blue-300">Event: {alert.event_type}</p>}
                      </div>
                      <span className={`rounded border px-3 py-1 text-xs font-bold ${getSeverityColor(alert.risk_category || alert.severity)}`}>
                        {(alert.risk_category || alert.severity || "low").toUpperCase()}
                      </span>
                    </div>

                    <p className="mt-3 rounded bg-gray-800 p-2 text-sm text-gray-200">{alert.reason}</p>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
                      <span>Risk score: <strong className="text-white">{alert.risk_score}/100</strong></span>
                      <span>{new Date(alert.timestamp).toLocaleString()}</span>
                      <button
                        onClick={() => acknowledge("single", alert.alert_id)}
                        disabled={acknowledging || !alert.alert_id}
                        className="rounded bg-yellow-600 px-3 py-1 font-semibold text-white hover:bg-yellow-700 disabled:bg-gray-600"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
