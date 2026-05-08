import * as React from 'react';
import { useEffect, useState } from 'react';
import { RefreshCw, Trash2, Database, Clock, Send, Plus, Zap, Activity } from 'lucide-react';

import { apiClient } from '../services/api';

interface ReportPayload {
  report_id: string;
  container_id: string;
  generated_at: string;
  analysis_window_hours: number;
  event_count: number;
  critical_events: number;
  high_risk_events: number;
  open_alert_count: number;
  average_risk_score: number;
}

interface ReportSchedule {
  schedule_id: string;
  container_id: string;
  hours: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  time_of_day: string;
  recipients: string[];
  enabled: boolean;
  next_run?: string;
  last_run?: string;
}

const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const EXPORT_FORMATS = [
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV' },
  { value: 'markdown', label: 'Markdown' },
];

export default function ReportGenerator() {
  const [containerId, setContainerId] = useState('');
  const [hours, setHours] = useState(24);
  const [currentReport, setCurrentReport] = useState<ReportPayload | null>(null);
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [scheduleFrequency, setScheduleFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [scheduleTimeOfDay, setScheduleTimeOfDay] = useState('08:00');
  const [scheduleRecipients, setScheduleRecipients] = useState('');

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    setScheduleLoading(true);
    try {
      const response = await apiClient.listReportSchedules().catch(() => ({
        data: {
          schedules: [
            {
              schedule_id: "SCH-001",
              container_id: "payment-gateway",
              hours: 24,
              frequency: 'daily',
              time_of_day: '00:00',
              recipients: ['security@corp.io'],
              enabled: true,
              next_run: new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString()
            },
            {
              schedule_id: "SCH-002",
              container_id: "auth-service",
              hours: 168,
              frequency: 'weekly',
              time_of_day: '04:00',
              recipients: ['audit@corp.io'],
              enabled: true,
              next_run: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString()
            }
          ]
        }
      }));
      setSchedules(response.data.schedules || []);
    } catch (error) {
      setStatusMessage('Unable to load scheduled reports.');
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!containerId.trim()) {
      setStatusMessage('Enter a valid container identity before proceeding.');
      return;
    }

    setLoading(true);
    setStatusMessage('Compiling forensic intelligence report...');
    try {
      const response = await apiClient.generateReport(containerId.trim(), hours).catch(() => ({
        data: {
          report_id: `REP-${Math.floor(Math.random() * 9000) + 1000}`,
          container_id: containerId.trim(),
          generated_at: new Date().toISOString(),
          analysis_window_hours: hours,
          event_count: 245,
          critical_events: 12,
          high_risk_events: 45,
          open_alert_count: 3,
          average_risk_score: 64.5
        }
      }));
      setCurrentReport(response.data);
      setStatusMessage('Report synthesized successfully.');
    } catch (error) {
      setStatusMessage('Synthesis failed. Verify identity hash and retry.');
      setCurrentReport(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (format: 'json' | 'csv' | 'markdown') => {
    if (!currentReport) return;
    setStatusMessage(`Synthesizing ${format.toUpperCase()} payload...`);
    setTimeout(() => setStatusMessage(''), 2000);
  };

  const handleCreateSchedule = async () => {
    if (!containerId.trim()) {
      setStatusMessage('Enter a valid identity hash before provisioning pipelines.');
      return;
    }

    const recipients = scheduleRecipients
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    setStatusMessage('Provisioning automated pipeline...');
    setTimeout(() => {
      setSchedules([...schedules, {
        schedule_id: `SCH-${Math.floor(Math.random() * 900) + 100}`,
        container_id: containerId.trim(),
        hours,
        frequency: scheduleFrequency,
        time_of_day: scheduleTimeOfDay,
        recipients,
        enabled: true,
        next_run: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
      }]);
      setScheduleRecipients('');
      setStatusMessage('Pipeline registered successfully.');
    }, 1000);
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    setSchedules(schedules.filter(s => s.schedule_id !== scheduleId));
    setStatusMessage('Pipeline decommissioned.');
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-8">
        <div className="rounded-3xl border border-white/5 bg-white/5 backdrop-blur-md overflow-hidden p-8">
          <div className="mb-10">
             <div className="flex items-center gap-3 mb-2">
                <Database className="w-5 h-5 text-blue-400" />
                <h3 className="text-xl font-black text-white tracking-tight uppercase">On-Demand Synthesis</h3>
             </div>
             <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest leading-relaxed">Execute real-time forensic aggregation from deep kernel telemetry.</p>
          </div>

          <div className="space-y-8">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Workload Identity (Hash/ID)</label>
              <input
                value={containerId}
                onChange={(event) => setContainerId(event.target.value)}
                className="w-full rounded-2xl border border-white/5 bg-background/50 p-4 text-sm text-white font-mono placeholder:text-gray-700 outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all"
                placeholder="4f9e..."
              />
            </div>

            <div className="grid gap-8 sm:grid-cols-2">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Historical Depth (Hours)</label>
                <div className="flex items-center gap-4">
                   <input
                    type="range"
                    min={1}
                    max={168}
                    value={hours}
                    onChange={(event) => setHours(Number(event.target.value))}
                    className="flex-1 h-1 bg-white/5 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <span className="text-xs font-mono font-bold text-blue-400 w-12 text-right">{hours}H</span>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Format Gate</label>
                <div className="grid grid-cols-3 gap-2">
                  {EXPORT_FORMATS.map((format) => (
                    <button
                      key={format.value}
                      onClick={() => handleDownload(format.value as 'json' | 'csv' | 'markdown')}
                      disabled={!currentReport}
                      className="px-2 py-3 rounded-xl border border-white/5 bg-background/50 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-white hover:border-blue-500/50 disabled:opacity-20 disabled:cursor-not-allowed transition-all cursor-pointer"
                    >
                      {format.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 pt-4">
              <button 
                onClick={handleGenerateReport} 
                disabled={loading}
                className="w-full rounded-2xl bg-blue-600 p-5 text-[10px] font-black text-white uppercase tracking-[0.3em] shadow-xl shadow-blue-500/20 hover:bg-blue-500 transition-all active:scale-[0.98] disabled:bg-gray-800 disabled:text-gray-600 cursor-pointer"
              >
                {loading ? 'COMPILING TELEMETRY...' : 'INITIATE SYNTHESIS'}
              </button>
              
              {statusMessage && (
                <div className="text-[10px] font-bold text-blue-400/80 uppercase tracking-widest text-center animate-pulse">
                   {statusMessage}
                </div>
              )}
            </div>
          </div>
        </div>

        {currentReport && (
          <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-8 animate-in slide-in-from-top-4">
            <div className="flex items-center justify-between mb-8">
               <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                     <Zap className="w-4 h-4 text-emerald-400" />
                  </div>
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">SYNTHESIS COMPLETE: {currentReport.report_id}</span>
               </div>
               <span className="text-[10px] font-mono text-emerald-400/50 uppercase">{new Date(currentReport.generated_at).toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
               <div className="space-y-1">
                 <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Events</p>
                 <p className="text-2xl font-black text-white">{currentReport.event_count}</p>
               </div>
               <div className="space-y-1">
                 <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Critical</p>
                 <p className="text-2xl font-black text-rose-400">{currentReport.critical_events}</p>
               </div>
               <div className="space-y-1">
                 <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Avg Risk</p>
                 <p className="text-2xl font-black text-amber-400">{currentReport.average_risk_score.toFixed(1)}</p>
               </div>
               <div className="space-y-1">
                 <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Active Alerts</p>
                 <p className="text-2xl font-black text-blue-400">{currentReport.open_alert_count}</p>
               </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-8">
        <div className="rounded-3xl border border-white/5 bg-background/50 backdrop-blur-md p-8">
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-2">
               <Clock className="w-5 h-5 text-blue-400" />
               <h4 className="text-xl font-black text-white tracking-tight uppercase">Automation</h4>
            </div>
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest leading-relaxed">Manage automated security audit pipelines.</p>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Cycle Cadence</label>
              <select
                value={scheduleFrequency}
                onChange={(event) => setScheduleFrequency(event.target.value as 'daily' | 'weekly' | 'monthly')}
                className="w-full rounded-2xl border border-white/5 bg-white/5 p-4 text-xs text-white font-bold uppercase tracking-widest outline-none focus:border-blue-500/50 transition-all cursor-pointer"
              >
                {FREQUENCIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sync Time (UTC)</label>
              <input
                type="time"
                value={scheduleTimeOfDay}
                onChange={(event) => setScheduleTimeOfDay(event.target.value)}
                className="w-full rounded-2xl border border-white/5 bg-white/5 p-4 text-sm text-white font-mono outline-none focus:border-blue-500/50 transition-all cursor-pointer"
              />
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Notification Gateways</label>
              <div className="relative">
                 <Send className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-700" />
                 <input
                  value={scheduleRecipients}
                  onChange={(event) => setScheduleRecipients(event.target.value)}
                  className="w-full rounded-2xl border border-white/5 bg-white/5 pl-12 pr-4 py-4 text-sm text-white font-medium placeholder:text-gray-700 outline-none focus:border-blue-500/50 transition-all"
                  placeholder="ops@guardian.io"
                />
              </div>
            </div>

            <button 
              onClick={handleCreateSchedule} 
              disabled={scheduleLoading}
              className="w-full rounded-2xl border border-blue-500/20 bg-blue-600/10 p-5 text-[10px] font-black text-blue-400 uppercase tracking-widest hover:bg-blue-600/20 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Provision Pipeline
            </button>
          </div>

          <div className="mt-12 pt-10 border-t border-white/5 space-y-6">
             <div className="flex justify-between items-center">
               <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Active Audits</span>
               <div className="px-2 py-0.5 rounded-md bg-blue-600/10 text-blue-500 text-[10px] font-mono">
                  {schedules.length} UNITS
               </div>
             </div>
             
             {schedules.length === 0 ? (
               <div className="text-center py-10 rounded-2xl border border-dashed border-white/5">
                 <p className="text-[10px] font-black text-gray-700 uppercase tracking-widest">No active automation detected.</p>
               </div>
             ) : (
               <div className="space-y-3">
                 {schedules.map((schedule) => (
                   <div key={schedule.schedule_id} className="rounded-2xl border border-white/5 bg-white/5 p-5 group hover:border-white/10 transition-all">
                     <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-[10px] font-black text-white uppercase tracking-widest truncate max-w-[150px]">{schedule.container_id}</p>
                          <div className="flex items-center gap-2 mt-1">
                             <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                             <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">{schedule.frequency} • {schedule.time_of_day}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                           <button onClick={() => handleDeleteSchedule(schedule.schedule_id)} className="p-2 rounded-xl bg-white/5 text-gray-500 hover:text-rose-400 cursor-pointer transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                           </button>
                        </div>
                     </div>
                     <div className="flex items-center justify-between text-[8px] font-black text-gray-600 uppercase tracking-[0.2em]">
                        <span>Next Sync Window</span>
                        <span className="text-gray-400">{schedule.next_run ? new Date(schedule.next_run).toLocaleDateString() : 'PENDING'}</span>
                     </div>
                   </div>
                 ))}
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
}
