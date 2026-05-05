import * as React from 'react';
import { useEffect, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';

import { apiClient } from '../services/api';
import { Card, CardContent, CardHeader } from './ui/card';

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
      const response = await apiClient.listReportSchedules();
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
      const response = await apiClient.generateReport(containerId.trim(), hours);
      setCurrentReport(response.data);
      setStatusMessage('Report synthesized successfully. Analytical payloads ready for extraction.');
    } catch (error) {
      setStatusMessage('Synthesis failed. Verify identity hash and retry.');
      setCurrentReport(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (format: 'json' | 'csv' | 'markdown') => {
    if (!currentReport) return;

    try {
      const response = await apiClient.exportReport(currentReport.report_id, format);
      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `guardian_forensics_${currentReport.report_id}.${format === 'markdown' ? 'md' : format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setStatusMessage('Payload extraction failed.');
    }
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
    try {
      await apiClient.createReportSchedule({
        container_id: containerId.trim(),
        hours,
        frequency: scheduleFrequency,
        time_of_day: scheduleTimeOfDay,
        recipients,
        enabled: true,
      });
      setScheduleRecipients('');
      setStatusMessage('Pipeline registered and active.');
      fetchSchedules();
    } catch (error) {
      setStatusMessage('Pipeline registration failed.');
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    try {
      await apiClient.deleteReportSchedule(scheduleId);
      setStatusMessage('Pipeline decommissioned.');
      fetchSchedules();
    } catch (error) {
      setStatusMessage('Decommissioning failed.');
    }
  };

  const handleRunScheduleNow = async (scheduleId: string) => {
    try {
      await apiClient.runReportSchedule(scheduleId);
      setStatusMessage('Immediate sync initiated.');
      fetchSchedules();
    } catch (error) {
      setStatusMessage('Sync initiation failed.');
    }
  };

  return (
    <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr]">
      <section className="space-y-8">
        <Card className="border border-white/5 bg-white/5 backdrop-blur-md rounded-2xl overflow-hidden shadow-2xl p-8">
          <div className="mb-8">
             <h3 className="text-xl font-bold text-white tracking-tight">On-Demand Synthesis</h3>
             <p className="text-xs text-gray-500 font-medium mt-1 uppercase tracking-widest leading-relaxed">Execute real-time forensic aggregation from deep kernel telemetry.</p>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Workload Identity (Hash/ID)</label>
              <input
                value={containerId}
                onChange={(event) => setContainerId(event.target.value)}
                className="w-full rounded-xl border border-white/5 bg-background/50 p-4 text-sm text-white font-mono placeholder:text-gray-700 outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all"
                placeholder="4f9e..."
              />
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Historical Depth (Hours)</label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={hours}
                  onChange={(event) => setHours(Number(event.target.value))}
                  className="w-full rounded-xl border border-white/5 bg-background/50 p-4 text-sm text-white font-mono outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all"
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Format Gate</label>
                <div className="grid grid-cols-3 gap-2">
                  {EXPORT_FORMATS.map((format) => (
                    <button
                      key={format.value}
                      onClick={() => handleDownload(format.value as 'json' | 'csv' | 'markdown')}
                      disabled={!currentReport}
                      className="px-2 py-3 rounded-xl border border-white/5 bg-background/50 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-white hover:border-blue-500/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
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
                className="w-full rounded-xl bg-blue-600 p-4 text-xs font-black text-white uppercase tracking-[0.2em] shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition-all active:scale-[0.98] disabled:bg-gray-800 disabled:text-gray-600 cursor-pointer"
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
        </Card>

        {currentReport && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 animate-in slide-in-from-top-4">
            <div className="flex items-center justify-between mb-4">
               <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Report Payload: {currentReport.report_id}</span>
               <span className="text-[10px] font-mono text-emerald-400/50">{new Date(currentReport.generated_at).toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
               <div>
                 <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1">Events</p>
                 <p className="text-xl font-black text-white">{currentReport.event_count}</p>
               </div>
               <div>
                 <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1">Critical</p>
                 <p className="text-xl font-black text-rose-400">{currentReport.critical_events}</p>
               </div>
               <div>
                 <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1">Avg Risk</p>
                 <p className="text-xl font-black text-amber-400">{currentReport.average_risk_score.toFixed(1)}</p>
               </div>
               <div>
                 <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest mb-1">Open Alerts</p>
                 <p className="text-xl font-black text-blue-400">{currentReport.open_alert_count}</p>
               </div>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-8">
        <div className="rounded-2xl border border-white/5 bg-background/50 backdrop-blur-md p-8">
          <div className="mb-8">
            <h4 className="text-lg font-bold text-white tracking-tight">Recurrent Pipelines</h4>
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest leading-relaxed mt-1">Manage automated security audit schedules.</p>
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Cycle Cadence</label>
              <select
                value={scheduleFrequency}
                onChange={(event) => setScheduleFrequency(event.target.value as 'daily' | 'weekly' | 'monthly')}
                className="w-full rounded-xl border border-white/5 bg-background p-4 text-xs text-white font-bold uppercase tracking-widest outline-none focus:border-blue-500/50 transition-all cursor-pointer"
              >
                {FREQUENCIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Sync Time (UTC)</label>
                <input
                  type="time"
                  value={scheduleTimeOfDay}
                  onChange={(event) => setScheduleTimeOfDay(event.target.value)}
                  className="w-full rounded-xl border border-white/5 bg-background p-4 text-sm text-white font-mono outline-none focus:border-blue-500/50 transition-all cursor-pointer"
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Notification Gateways</label>
                <input
                  value={scheduleRecipients}
                  onChange={(event) => setScheduleRecipients(event.target.value)}
                  className="w-full rounded-xl border border-white/5 bg-background p-4 text-sm text-white font-medium placeholder:text-gray-700 outline-none focus:border-blue-500/50 transition-all"
                  placeholder="ops@hq.local, security@hq.local"
                />
              </div>
            </div>

            <button 
              onClick={handleCreateSchedule} 
              disabled={scheduleLoading}
              className="w-full rounded-xl border border-blue-500/30 bg-blue-600/10 p-4 text-[10px] font-black text-blue-400 uppercase tracking-widest hover:bg-blue-600/20 transition-all cursor-pointer"
            >
              {scheduleLoading ? 'PROVISIONING...' : 'REGISTER PIPELINE'}
            </button>
          </div>

          <div className="mt-10 pt-8 border-t border-white/5 space-y-4">
             <div className="flex justify-between items-center mb-4">
               <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Active Pipelines</span>
               <span className="text-[10px] font-mono text-blue-500/50">{schedules.length} TOTAL</span>
             </div>
             
             {schedules.length === 0 ? (
               <div className="text-center py-10 rounded-xl border border-dashed border-white/5">
                 <p className="text-[10px] font-black text-gray-700 uppercase tracking-widest">No active automation detected.</p>
               </div>
             ) : (
               <div className="space-y-3">
                 {schedules.map((schedule) => (
                   <div key={schedule.schedule_id} className="rounded-xl border border-white/5 bg-white/5 p-4 group hover:border-white/10 transition-all">
                     <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-[10px] font-black text-white uppercase tracking-widest">{schedule.container_id}</p>
                          <p className="text-[9px] font-bold text-blue-400 mt-0.5 uppercase tracking-widest">{schedule.frequency} @ {schedule.time_of_day}</p>
                        </div>
                        <div className="flex gap-2">
                           <button onClick={() => handleRunScheduleNow(schedule.schedule_id)} className="p-1.5 rounded-lg bg-white/5 text-gray-500 hover:text-white cursor-pointer transition-colors">
                              <RefreshCw className="w-3.5 h-3.5" />
                           </button>
                           <button onClick={() => handleDeleteSchedule(schedule.schedule_id)} className="p-1.5 rounded-lg bg-white/5 text-gray-500 hover:text-rose-400 cursor-pointer transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                           </button>
                        </div>
                     </div>
                     <div className="text-[9px] font-medium text-gray-600 truncate uppercase tracking-tighter">
                        Next Sync: {schedule.next_run ? new Date(schedule.next_run).toLocaleString() : 'PENDING'}
                     </div>
                   </div>
                 ))}
               </div>
             )}
          </div>
        </div>
      </section>
    </div>
  );
}
