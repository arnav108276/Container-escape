import React, { useState } from 'react';
import { 
  FileText, 
  Download, 
  ExternalLink, 
  Clock, 
  Shield, 
  FileSearch,
  CheckCircle2,
  AlertTriangle,
  ChevronRight
} from 'lucide-react';
import ReportGenerator from '../components/ReportGenerator';

const MOCK_REPORTS = [
  {
    id: "REP-4921-X",
    container: "payment-gateway",
    date: "2024-05-14T10:30:00Z",
    type: "Full Forensic Audit",
    status: "Completed",
    risk: "Critical",
    events: 142
  },
  {
    id: "REP-3812-Y",
    container: "auth-service",
    date: "2024-05-13T14:15:00Z",
    type: "Security Pulse",
    status: "Completed",
    risk: "Low",
    events: 24
  },
  {
    id: "REP-2105-Z",
    container: "worker-node-01",
    date: "2024-05-12T09:00:00Z",
    type: "Compliance Snapshot",
    status: "Archived",
    risk: "Medium",
    events: 56
  }
];

export default function Reports() {
  const [activeTab, setActiveTab] = useState<'generate' | 'archive'>('generate');

  return (
    <div className="space-y-10 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
             <div className="p-2 rounded-lg bg-emerald-600/10 border border-emerald-500/20">
               <FileSearch className="w-5 h-5 text-emerald-400" />
             </div>
             <h1 className="text-4xl font-black text-white tracking-tighter uppercase">Forensic Intelligence</h1>
          </div>
          <p className="text-gray-400 font-medium max-w-2xl">
            Synthesize on-demand forensic reports and compliance audits from deep kernel telemetry history.
          </p>
        </div>

        <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
           <button 
             onClick={() => setActiveTab('generate')}
             className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'generate' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-gray-500 hover:text-gray-300'}`}
           >
             Synthesis Center
           </button>
           <button 
             onClick={() => setActiveTab('archive')}
             className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'archive' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-gray-500 hover:text-gray-300'}`}
           >
             Report Archive
           </button>
        </div>
      </div>

      {activeTab === 'generate' ? (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2">
          <div className="rounded-3xl border border-blue-500/10 bg-blue-600/5 p-6 flex items-center gap-6 group">
            <div className="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20 group-hover:scale-110 transition-transform">
               <Shield className="w-6 h-6 text-blue-400" />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Automated Pipeline Active</p>
              <p className="text-xs text-gray-500 font-medium mt-1 leading-relaxed">
                Scheduled forensic syncs are currently pushing encrypted analytical payloads to the primary secure gateway every 24 hours.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
               <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">GATEWAY LINKED</span>
            </div>
          </div>

          <ReportGenerator />
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
           <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {MOCK_REPORTS.map((report) => (
                <div key={report.id} className="group relative rounded-3xl border border-white/5 bg-gradient-to-br from-white/5 to-transparent hover:border-white/10 transition-all p-6 cursor-pointer">
                   <div className="flex justify-between items-start mb-6">
                      <div className="space-y-1">
                         <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{report.type}</div>
                         <h3 className="text-lg font-black text-white uppercase tracking-tight">{report.id}</h3>
                      </div>
                      <div className={`px-2 py-1 rounded-lg border text-[8px] font-black tracking-widest ${
                        report.risk === 'Critical' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                        report.risk === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                        'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      }`}>
                         {report.risk.toUpperCase()} RISK
                      </div>
                   </div>

                   <div className="space-y-4">
                      <div className="flex items-center justify-between py-3 border-y border-white/5">
                         <div className="space-y-1">
                            <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Workload</p>
                            <p className="text-xs font-bold text-white uppercase">{report.container}</p>
                         </div>
                         <div className="text-right space-y-1">
                            <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Telemetry Events</p>
                            <p className="text-xs font-bold text-white">{report.events}</p>
                         </div>
                      </div>

                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-2 text-gray-500">
                            <Clock className="w-3.5 h-3.5" />
                            <span className="text-[9px] font-bold uppercase tracking-widest">
                               {new Date(report.date).toLocaleDateString()}
                            </span>
                         </div>
                         <div className="flex gap-2">
                            <button className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white transition-colors">
                               <Download className="w-3.5 h-3.5" />
                            </button>
                            <button className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white transition-colors">
                               <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                         </div>
                      </div>
                   </div>
                </div>
              ))}
           </div>
        </div>
      )}
    </div>
  );
}
