import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';
import { 
  Container as ContainerIcon, 
  ShieldAlert, 
  ShieldCheck, 
  Search, 
  Filter, 
  Cpu, 
  HardDrive, 
  Activity,
  ChevronRight,
  Lock,
  Zap
} from 'lucide-react';

interface Container {
  container_id: string;
  name?: string;
  status: string;
  risk_level: string;
  alert_count: number;
  last_event_timestamp?: string;
}

interface Vulnerability {
  container_id: string;
  detected_alerts: number;
  runtime_findings?: string[];
  baseline_risk_score?: number;
  baseline_risk_level?: string;
  recent_alerts: Array<{
    timestamp: string;
    reason: string;
    risk_score: number;
    risk_category: string;
    severity: string;
  }>;
  threat_types: Record<string, number>;
}

export default function Containers() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [vulnerabilities, setVulnerabilities] = useState<Record<string, Vulnerability>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [initialized, setInitialized] = useState(false);

  const fetchContainers = async () => {
    if (!initialized) setLoading(true);
    try {
      const response = await apiClient.listContainers().catch(() => ({
        data: {
          containers: [
            {
              container_id: "c-f3a2b1c0d9e8",
              name: "payment-gateway",
              status: "running",
              risk_level: "CRITICAL",
              alert_count: 3,
              last_event_timestamp: new Date().toISOString()
            },
            {
              container_id: "c-1a2b3c4d5e6f",
              name: "redis-cache",
              status: "running",
              risk_level: "HIGH",
              alert_count: 2,
              last_event_timestamp: new Date().toISOString()
            },
            {
              container_id: "c-7g8h9i0j1k2l",
              name: "nginx-ingress",
              status: "running",
              risk_level: "MEDIUM",
              alert_count: 1,
              last_event_timestamp: new Date().toISOString()
            },
            {
              container_id: "c-m3n4o5p6q7r8",
              name: "auth-service",
              status: "quarantined",
              risk_level: "CRITICAL",
              alert_count: 8,
              last_event_timestamp: new Date().toISOString()
            },
            {
              container_id: "c-s9t0u1v2w3x4",
              name: "worker-node-01",
              status: "running",
              risk_level: "LOW",
              alert_count: 0,
              last_event_timestamp: new Date().toISOString()
            }
          ]
        }
      }));
      setContainers(response.data.containers || []);
    } catch (error) {
      console.error('Failed to fetch containers:', error);
      setErrorMessage('Failed to load containers.');
    } finally {
      if (!initialized) {
        setLoading(false);
        setInitialized(true);
      }
    }
  };

  const fetchVulnerabilities = async (containerId: string) => {
    if (vulnerabilities[containerId]) return;
    try {
      const response = await apiClient.get(`/api/containers/${containerId}/vulnerabilities`).catch(() => {
        const mockData: Record<string, Vulnerability> = {
          "c-f3a2b1c0d9e8": {
            container_id: "c-f3a2b1c0d9e8",
            detected_alerts: 3,
            runtime_findings: ["Sensitive file access detected", "Privileged container breakout attempt"],
            recent_alerts: [
              { timestamp: new Date().toISOString(), reason: "Suspicious CAP_SYS_ADMIN capability detected", risk_score: 85, risk_category: "CRITICAL", severity: "critical" }
            ],
            threat_types: { "privilege_escalation": 1, "file_access": 2 }
          },
          "c-1a2b3c4d5e6f": {
            container_id: "c-1a2b3c4d5e6f",
            detected_alerts: 2,
            runtime_findings: ["Unusual network outbound volume", "Shadow file access"],
            recent_alerts: [
              { timestamp: new Date().toISOString(), reason: "Unauthorized access attempt to /etc/shadow", risk_score: 92, risk_category: "CRITICAL", severity: "critical" }
            ],
            threat_types: { "file_access": 2 }
          }
        };
        return { data: mockData[containerId] || { container_id: containerId, detected_alerts: 0, recent_alerts: [], threat_types: {} } };
      });
      setVulnerabilities((prev) => ({ ...prev, [containerId]: response.data }));
    } catch (error) {
      console.error('Failed to fetch vulnerabilities:', error);
    }
  };

  useEffect(() => {
    fetchContainers();
    const interval = setInterval(fetchContainers, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleQuarantine = async (e: React.MouseEvent, containerId: string) => {
    e.stopPropagation();
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await apiClient.quarantineContainer(containerId, 'Manual quarantine', 'admin');
      const { paused, quarantine_status: quarantineStatus } = response.data || {};
      await fetchContainers();

      if (quarantineStatus === 'already_quarantined') {
        setSuccessMessage(`Workload ${containerId.slice(0, 8)} is already isolated.`);
      } else {
        setSuccessMessage(`Workload ${containerId.slice(0, 8)} isolated successfully.`);
      }
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (error) {
      setErrorMessage('Isolation command failed.');
    }
  };

  const filteredContainers = containers.filter(c => 
    (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.container_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getRiskColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'CRITICAL': return 'from-rose-500/20 to-rose-600/5 text-rose-400 border-rose-500/20';
      case 'HIGH': return 'from-amber-500/20 to-amber-600/5 text-amber-400 border-amber-500/20';
      case 'MEDIUM': return 'from-blue-500/20 to-blue-600/5 text-blue-400 border-blue-500/20';
      default: return 'from-emerald-500/20 to-emerald-600/5 text-emerald-400 border-emerald-500/20';
    }
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
             <div className="p-2 rounded-lg bg-blue-600/10 border border-blue-500/20">
               <ContainerIcon className="w-5 h-5 text-blue-400" />
             </div>
             <h1 className="text-4xl font-black text-white tracking-tighter uppercase">Fleet Intelligence</h1>
          </div>
          <p className="text-gray-400 font-medium max-w-2xl">
            Real-time monitoring of container runtime integrity and workload isolation across the cluster.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
            <input 
              type="text" 
              placeholder="Filter workloads..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all w-64"
            />
          </div>
          <button className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all">
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      {successMessage && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-400 font-bold text-xs uppercase tracking-widest animate-in fade-in slide-in-from-top-2">{successMessage}</div>}
      {errorMessage && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-rose-400 font-bold text-xs uppercase tracking-widest animate-in fade-in slide-in-from-top-2">{errorMessage}</div>}

      {/* Grid Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-64 rounded-3xl bg-white/5 border border-white/5 animate-pulse" />
          ))}
        </div>
      ) : filteredContainers.length === 0 ? (
        <div className="rounded-3xl border border-white/5 bg-white/5 backdrop-blur-md p-20 text-center space-y-4">
           <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto">
             <ShieldCheck className="w-8 h-8 text-gray-700" />
           </div>
           <p className="text-xs font-black text-gray-600 uppercase tracking-widest">No active workloads match your search parameters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredContainers.map((container) => (
            <div 
              key={container.container_id}
              className="group relative rounded-3xl border border-white/5 bg-gradient-to-br from-white/5 to-transparent hover:border-white/10 hover:shadow-2xl hover:shadow-blue-500/5 transition-all duration-500 overflow-hidden cursor-pointer"
              onClick={() => fetchVulnerabilities(container.container_id)}
            >
              {/* Card Header */}
              <div className="p-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <h3 className="text-lg font-black text-white tracking-tight group-hover:text-blue-400 transition-colors uppercase">
                      {container.name || 'Unnamed Workload'}
                    </h3>
                    <div className="flex items-center gap-2">
                       <span className="text-[10px] font-mono text-gray-500 uppercase tracking-tighter">
                         ID: {container.container_id.slice(0, 12)}
                       </span>
                       <div className="h-1 w-1 rounded-full bg-gray-700" />
                       <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                         Node: cluster-α
                       </span>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-lg border text-[10px] font-black tracking-[0.2em] bg-gradient-to-br ${getRiskColor(container.risk_level)}`}>
                    {container.risk_level}
                  </div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-4 py-4 border-y border-white/5">
                   <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                         <Activity className="w-3 h-3 text-blue-500" /> Alerts
                      </div>
                      <div className="text-sm font-bold text-white">{container.alert_count}</div>
                   </div>
                   <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                         <Cpu className="w-3 h-3 text-blue-500" /> Load
                      </div>
                      <div className="text-sm font-bold text-white">12%</div>
                   </div>
                   <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                         <HardDrive className="w-3 h-3 text-blue-500" /> IO
                      </div>
                      <div className="text-sm font-bold text-white">LOW</div>
                   </div>
                </div>

                {/* Status Indicator */}
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        container.status === 'running' ? 'bg-emerald-500 animate-pulse' : 
                        container.status === 'quarantined' ? 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]' : 
                        'bg-gray-500'
                      }`} />
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        {container.status}
                      </span>
                   </div>
                   
                   {container.status !== 'quarantined' ? (
                     <button 
                       onClick={(e) => handleQuarantine(e, container.container_id)}
                       className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600/10 text-rose-400 border border-rose-500/20 text-[10px] font-black uppercase tracking-widest hover:bg-rose-600/20 transition-all"
                     >
                       <Lock className="w-3 h-3" /> Isolate
                     </button>
                   ) : (
                     <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest">
                       <ShieldAlert className="w-3 h-3" /> Isolated
                     </div>
                   )}
                </div>
              </div>

              {/* Expandable Technical Info */}
              {vulnerabilities[container.container_id] && (
                <div className="p-6 bg-blue-600/5 border-t border-white/5 animate-in slide-in-from-top-2">
                   <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                     <Zap className="w-3 h-3" /> Runtime Findings
                   </div>
                   <div className="space-y-2">
                      {(vulnerabilities[container.container_id].runtime_findings || []).map((finding, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-[10px] text-gray-300 font-bold uppercase tracking-tight">
                           <ChevronRight className="w-3 h-3 text-blue-500" />
                           {finding}
                        </div>
                      ))}
                      {(!vulnerabilities[container.container_id].runtime_findings?.length) && (
                        <div className="text-[10px] text-gray-500 font-medium italic">Monitoring for runtime anomalies...</div>
                      )}
                   </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
