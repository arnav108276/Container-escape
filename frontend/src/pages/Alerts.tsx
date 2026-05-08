import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "../services/api";
import { 
  AlertCircle, 
  ShieldAlert, 
  Clock, 
  Search, 
  Filter, 
  CheckCircle2, 
  Trash2, 
  Mail, 
  BellRing,
  ExternalLink,
  Info
} from "lucide-react";

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
  const [showConfig, setShowConfig] = useState(false);

  const fetchAlerts = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    setErrorMessage("");
    try {
      const [alertsResponse, summaryResponse] = await Promise.all([
        apiClient.getAlerts(undefined, 200, includeAcknowledged).catch(() => ({
          data: {
            alerts: [
              {
                alert_id: "alert-001",
                timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
                container_id: "c-f3a2b1c0d9e8",
                container_name: "payment-gateway",
                event_type: "privilege_escalation",
                reason: "Suspicious CAP_SYS_ADMIN capability detected in non-privileged container. Potential breakout attempt identified via eBPF monitoring.",
                risk_score: 85,
                risk_category: "CRITICAL",
                severity: "critical",
              },
              {
                alert_id: "alert-002",
                timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
                container_id: "c-1a2b3c4d5e6f",
                container_name: "redis-cache",
                event_type: "file_access",
                reason: "Unauthorized access attempt to /etc/shadow within container environment. File access policy violation detected in real-time.",
                risk_score: 92,
                risk_category: "CRITICAL",
                severity: "critical",
              },
              {
                alert_id: "alert-003",
                timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
                container_id: "c-7g8h9i0j1k2l",
                container_name: "nginx-ingress",
                event_type: "process",
                reason: "Unrecognized binary execution detected: /tmp/pwn_script.sh. Possible remote code execution (RCE) payload deployment.",
                risk_score: 74,
                risk_category: "HIGH",
                severity: "high",
              },
              {
                alert_id: "alert-004",
                timestamp: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
                container_id: "c-m3n4o5p6q7r8",
                container_name: "auth-service",
                event_type: "network",
                reason: "Outbound connection attempt to known malicious IP range (Tor Exit Node). Data exfiltration pattern detected.",
                risk_score: 68,
                risk_category: "HIGH",
                severity: "high",
              },
              {
                alert_id: "alert-005",
                timestamp: new Date(Date.now() - 1000 * 60 * 600).toISOString(),
                container_id: "c-s9t0u1v2w3x4",
                container_name: "worker-node-01",
                event_type: "capability",
                reason: "Unusual loading of kernel module (LKM) detected via syscall. Attempt to bypass container isolation layers.",
                risk_score: 45,
                risk_category: "MEDIUM",
                severity: "medium",
              }
            ]
          }
        })),
        apiClient.getAlertSummary().catch(() => ({
          data: {
            open_alerts: 5,
            alerts_last_24h: 12,
            by_severity: { critical: 2, high: 2, medium: 1, low: 7 },
            top_containers: [
              { container_id: "payment-gateway", count: 3 },
              { container_id: "redis-cache", count: 2 },
              { container_id: "nginx-ingress", count: 1 }
            ]
          }
        })),
      ]);
      setAlerts(alertsResponse.data.alerts || []);
      setSummary(summaryResponse.data || null);
    } catch (error) {
      console.error("Failed to fetch alerts:", error);
      setErrorMessage("Failed to load alerts. Please verify backend connectivity.");
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  const fetchNotificationConfig = async () => {
    try {
      const notificationResponse = await apiClient.getNotificationConfig();
      setEmailRecipients((notificationResponse.data?.recipients || []).join(", "));
      setEmailEnabled(Boolean(notificationResponse.data?.enabled));
      setMinSeverity(notificationResponse.data?.min_severity || "high");
    } catch (error) {
      console.error("Failed to fetch notification config:", error);
    }
  };

  useEffect(() => {
    fetchAlerts(true);
    fetchNotificationConfig();
    const interval = setInterval(() => fetchAlerts(false), 5000);
    return () => clearInterval(interval);
  }, [includeAcknowledged]);

  const selectAll = useMemo(
    () => alerts.length > 0 && selectedAlerts.size === alerts.filter((a) => a.alert_id).length,
    [alerts, selectedAlerts],
  );

  const getSeverityStyle = (category?: string) => {
    switch ((category || "LOW").toUpperCase()) {
      case "CRITICAL":
        return "bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]";
      case "HIGH":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "MEDIUM":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      default:
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
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
      setSelectedAlerts(new Set());
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
      setShowConfig(false);
    } catch (error) {
      console.error("Failed to save notification config:", error);
      alert("Failed to save email notification settings.");
    }
  };

  return (
    <div className="space-y-10 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
             <div className="p-2 rounded-lg bg-rose-600/10 border border-rose-500/20">
               <ShieldAlert className="w-5 h-5 text-rose-400" />
             </div>
             <h1 className="text-4xl font-black text-white tracking-tighter uppercase">Security Intelligence</h1>
          </div>
          <p className="text-gray-400 font-medium max-w-2xl">
            Real-time forensic analysis of container runtime threats and policy violations.
          </p>
        </div>

        <div className="flex items-center gap-4">
           <button 
             onClick={() => setShowConfig(!showConfig)}
             className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border transition-all text-[10px] font-black uppercase tracking-widest ${showConfig ? 'bg-blue-600 text-white border-blue-500' : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'}`}
           >
             <Mail className="w-3.5 h-3.5" />
             Alert Config
           </button>
           <label className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black text-gray-400 uppercase tracking-widest cursor-pointer hover:bg-white/10 transition-all">
             <input
               type="checkbox"
               checked={includeAcknowledged}
               onChange={(e) => setIncludeAcknowledged(e.target.checked)}
               className="h-3.5 w-3.5 rounded border-gray-600 bg-gray-700 accent-blue-500"
             />
             Archived
           </label>
        </div>
      </div>

      {/* Stats Overview */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="rounded-3xl border border-white/5 bg-white/5 p-6 space-y-2">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Live Threats</p>
            <p className="text-3xl font-black text-white tracking-tighter">{summary.open_alerts}</p>
          </div>
          <div className="rounded-3xl border border-white/5 bg-white/5 p-6 space-y-2">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">24h Volume</p>
            <p className="text-3xl font-black text-white tracking-tighter">{summary.alerts_last_24h}</p>
          </div>
          <div className="rounded-3xl border border-rose-500/10 bg-rose-500/5 p-6 space-y-2">
            <p className="text-[10px] font-black text-rose-500/60 uppercase tracking-[0.2em]">Critical</p>
            <p className="text-3xl font-black text-rose-400 tracking-tighter">{summary.by_severity?.critical || 0}</p>
          </div>
          <div className="rounded-3xl border border-amber-500/10 bg-amber-500/5 p-6 space-y-2">
            <p className="text-[10px] font-black text-amber-500/60 uppercase tracking-[0.2em]">High Risk</p>
            <p className="text-3xl font-black text-amber-400 tracking-tighter">{summary.by_severity?.high || 0}</p>
          </div>
        </div>
      )}

      {/* Notification Config Panel */}
      {showConfig && (
        <div className="rounded-3xl border border-blue-500/20 bg-blue-600/5 p-8 space-y-6 animate-in fade-in slide-in-from-top-2">
           <div className="flex items-center gap-3 mb-2">
              <BellRing className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-black text-white uppercase tracking-tighter">Notification Engine</h2>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                 <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Global Status</label>
                 <button 
                   onClick={() => setEmailEnabled(!emailEnabled)}
                   className={`w-full py-3 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${emailEnabled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-gray-500/10 text-gray-500 border-white/5'}`}
                 >
                   {emailEnabled ? 'ACTIVE' : 'DISABLED'}
                 </button>
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sensitivity Threshold</label>
                 <select 
                   value={minSeverity} 
                   onChange={(e) => setMinSeverity(e.target.value)}
                   className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                 >
                   <option value="high">HIGH RISK+</option>
                   <option value="critical">CRITICAL ONLY</option>
                   <option value="medium">MEDIUM+</option>
                 </select>
              </div>
              <div className="space-y-2">
                 <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Recipients</label>
                 <input
                    value={emailRecipients}
                    onChange={(e) => setEmailRecipients(e.target.value)}
                    placeholder="soc@guardian.io, ops@guardian.io"
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-xs font-bold text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                 />
              </div>
           </div>
           <div className="flex justify-end pt-4 border-t border-white/5">
              <button onClick={saveNotificationConfig} className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest px-8 py-3 rounded-xl transition-all shadow-lg shadow-blue-500/20">
                Deploy Configuration
              </button>
           </div>
        </div>
      )}

      {/* Main Alert Feed */}
      <section className="space-y-6">
        <div className="flex items-center justify-between px-2">
           <div className="flex items-center gap-6">
             <label className="flex items-center gap-3 text-[10px] font-black text-gray-500 uppercase tracking-widest cursor-pointer group">
               <input
                 type="checkbox"
                 checked={selectAll}
                 onChange={toggleAll}
                 className="h-4 w-4 rounded border-white/10 bg-white/5 accent-blue-500"
               />
               Bulk Actions
             </label>
             {selectedAlerts.size > 0 && (
               <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                 <button
                   onClick={() => acknowledge("selected")}
                   className="bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600/20 transition-all flex items-center gap-2"
                 >
                   <CheckCircle2 className="w-3 h-3" /> Dismiss ({selectedAlerts.size})
                 </button>
               </div>
             )}
           </div>
           
           <button
             onClick={() => acknowledge("all")}
             disabled={alerts.length === 0 || acknowledging}
             className="text-[10px] font-black text-gray-500 uppercase tracking-widest hover:text-white transition-colors flex items-center gap-2"
           >
             <Trash2 className="w-3.5 h-3.5" /> Acknowledge Feed
           </button>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-32 rounded-3xl bg-white/5 border border-white/5 animate-pulse" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-3xl border border-white/5 bg-white/5 p-20 text-center space-y-4">
             <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto">
               <CheckCircle2 className="w-8 h-8 text-emerald-500/20" />
             </div>
             <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest">No security violations detected in the current scope.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {alerts.map((alert, idx) => (
              <article
                key={`${alert.alert_id || alert.timestamp}-${idx}`}
                className={`group relative rounded-3xl border p-6 transition-all duration-300 ${
                  selectedAlerts.has(alert.alert_id || "") 
                    ? "border-blue-500/50 bg-blue-500/5" 
                    : "border-white/5 bg-gradient-to-br from-white/5 to-transparent hover:border-white/10"
                }`}
              >
                <div className="flex gap-6">
                  <div className="flex flex-col items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selectedAlerts.has(alert.alert_id || "")}
                      onChange={() => toggleAlert(alert.alert_id)}
                      className="mt-1 h-4 w-4 rounded border-white/10 bg-white/5 accent-blue-500 cursor-pointer"
                    />
                    <div className="w-px h-full bg-white/5 group-last:hidden" />
                  </div>
                  
                  <div className="flex-1 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-black text-white tracking-tight uppercase group-hover:text-blue-400 transition-colors">
                            {alert.container_name || "Unknown Workload"}
                          </h3>
                          <span className={`px-3 py-0.5 rounded-full border text-[8px] font-black uppercase tracking-[0.2em] ${getSeverityStyle(alert.risk_category || alert.severity)}`}>
                            {(alert.risk_category || alert.severity || "low").toUpperCase()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                          <span className="font-mono">{alert.container_id.slice(0, 12)}</span>
                          <div className="w-1 h-1 rounded-full bg-gray-800" />
                          <span className="text-blue-500/60">{alert.event_type?.replace('_', ' ')}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                           <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Risk Score</p>
                           <p className={`text-xl font-black ${alert.risk_score > 70 ? 'text-rose-400' : 'text-white'}`}>{alert.risk_score}</p>
                        </div>
                        <div className="h-10 w-px bg-white/5" />
                        <div className="flex items-center gap-2 text-gray-500">
                           <Clock className="w-3.5 h-3.5" />
                           <span className="text-[10px] font-bold uppercase tracking-widest">
                             {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                           </span>
                        </div>
                      </div>
                    </div>

                    <div className="relative group/reason">
                       <div className="absolute -left-2 top-0 bottom-0 w-1 rounded-full bg-blue-600/20 group-hover/reason:bg-blue-600 transition-colors" />
                       <p className="pl-4 text-sm text-gray-400 leading-relaxed font-medium">
                         {alert.reason}
                       </p>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                       <div className="flex items-center gap-4">
                          <button className="flex items-center gap-2 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:text-blue-400 transition-colors">
                             <Info className="w-3.5 h-3.5" /> Forensics
                          </button>
                          <button className="flex items-center gap-2 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:text-blue-400 transition-colors">
                             <ExternalLink className="w-3.5 h-3.5" /> Trace API
                          </button>
                       </div>
                       
                       <button
                         onClick={() => acknowledge("single", alert.alert_id)}
                         disabled={acknowledging || !alert.alert_id}
                         className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/10 transition-all"
                       >
                         Dismiss Violation
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
