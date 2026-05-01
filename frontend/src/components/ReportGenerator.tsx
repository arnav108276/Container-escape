import * as React from 'react';
import { useEffect, useState } from 'react';

import { apiClient } from '../services/api';
import { Button } from './ui/button';
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
  const [scheduleActionLoading, setScheduleActionLoading] = useState(false);

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
      setStatusMessage('Enter a container ID before generating a report.');
      return;
    }

    setLoading(true);
    setStatusMessage('Generating report...');
    try {
      const response = await apiClient.generateReport(containerId.trim(), hours);
      setCurrentReport(response.data);
      setStatusMessage('Report generated successfully. Use export buttons to download.');
    } catch (error) {
      setStatusMessage('Report generation failed. Verify the container ID and try again.');
      setCurrentReport(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (format: 'json' | 'csv' | 'markdown') => {
    if (!currentReport) {
      setStatusMessage('Generate a report first before exporting.');
      return;
    }

    try {
      const response = await apiClient.exportReport(currentReport.report_id, format);
      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/octet-stream' });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `forensic_report_${currentReport.report_id}.${format === 'markdown' ? 'md' : format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setStatusMessage(`Downloaded report as ${format.toUpperCase()}.`);
    } catch (error) {
      setStatusMessage('Failed to download the report.');
    }
  };

  const handleCreateSchedule = async () => {
    if (!containerId.trim()) {
      setStatusMessage('Enter a container ID before scheduling reports.');
      return;
    }

    const recipients = scheduleRecipients
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    setScheduleActionLoading(true);
    setStatusMessage('Creating scheduled report...');
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
      setStatusMessage('Scheduled report created successfully.');
      fetchSchedules();
    } catch (error) {
      setStatusMessage('Failed to create scheduled report.');
    } finally {
      setScheduleActionLoading(false);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    setScheduleActionLoading(true);
    try {
      await apiClient.deleteReportSchedule(scheduleId);
      setStatusMessage('Scheduled report deleted.');
      fetchSchedules();
    } catch (error) {
      setStatusMessage('Failed to delete the scheduled report.');
    } finally {
      setScheduleActionLoading(false);
    }
  };

  const handleRunScheduleNow = async (scheduleId: string) => {
    setScheduleActionLoading(true);
    try {
      await apiClient.runReportSchedule(scheduleId);
      setStatusMessage('Scheduled report executed immediately.');
      fetchSchedules();
    } catch (error) {
      setStatusMessage('Failed to run scheduled report.');
    } finally {
      setScheduleActionLoading(false);
    }
  };

  return (
    <Card className="space-y-6">
      <CardHeader>
        <div>
          <h3 className="text-2xl font-semibold text-foreground">Report Toolkit</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Generate, export, and schedule recurring forensic reports from container telemetry.
          </p>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section className="space-y-6">
            <div className="space-y-3">
              <label className="block text-sm font-medium text-foreground">Container ID</label>
              <input
                aria-label="container-id"
                value={containerId}
                onChange={(event) => setContainerId(event.target.value)}
                className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="Enter container ID"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-foreground">Analysis Window (hours)</label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={hours}
                  onChange={(event) => setHours(Number(event.target.value))}
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-foreground">Output</label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {EXPORT_FORMATS.map((format) => (
                    <Button
                      key={format.value}
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => handleDownload(format.value as 'json' | 'csv' | 'markdown')}
                      disabled={!currentReport}
                    >
                      {format.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleGenerateReport} disabled={loading}>
                {loading ? 'Generating...' : 'Generate Report'}
              </Button>
              {currentReport && (
                <div className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-900">
                  Generated report <strong>{currentReport.report_id}</strong>
                </div>
              )}
            </div>

            {statusMessage ? (
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-900">{statusMessage}</div>
            ) : null}
          </section>

          <section className="space-y-6 rounded-2xl border border-border bg-muted p-6">
            <div className="space-y-3">
              <h4 className="text-lg font-semibold text-foreground">Schedule Recurring Reports</h4>
              <p className="text-sm text-muted-foreground">
                Configure recurring report delivery and optionally email scheduled reports to recipients.
              </p>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-foreground">Frequency</label>
              <select
                value={scheduleFrequency}
                onChange={(event) => setScheduleFrequency(event.target.value as 'daily' | 'weekly' | 'monthly')}
                className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                {FREQUENCIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-foreground">Time of Day</label>
                <input
                  type="time"
                  value={scheduleTimeOfDay}
                  onChange={(event) => setScheduleTimeOfDay(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-foreground">Recipients</label>
                <input
                  value={scheduleRecipients}
                  onChange={(event) => setScheduleRecipients(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background p-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="email@example.com, ops@example.com"
                />
              </div>
            </div>

            <Button variant="default" onClick={handleCreateSchedule} disabled={scheduleLoading || scheduleActionLoading}>
              {scheduleLoading || scheduleActionLoading ? 'Scheduling...' : 'Create Schedule'}
            </Button>

            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-4 flex items-center justify-between">
                <h5 className="text-sm font-semibold text-foreground">Active Scheduled Reports</h5>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">{schedules.length} configured</span>
              </div>
              {scheduleLoading ? (
                <div className="text-sm text-muted-foreground">Loading schedules…</div>
              ) : schedules.length === 0 ? (
                <div className="text-sm text-muted-foreground">No scheduled reports yet.</div>
              ) : (
                <div className="space-y-3">
                  {schedules.map((schedule) => (
                    <div key={schedule.schedule_id} className="rounded-2xl border border-border bg-background p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">{schedule.container_id}</p>
                          <p className="text-xs text-muted-foreground">
                            {schedule.frequency} @ {schedule.time_of_day}
                          </p>
                        </div>
                        <div className="space-x-2">
                          <Button size="sm" variant="outline" onClick={() => handleRunScheduleNow(schedule.schedule_id)} disabled={scheduleActionLoading}>
                            Run now
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteSchedule(schedule.schedule_id)} disabled={scheduleActionLoading}>
                            Delete
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-muted-foreground">
                        Next run: {schedule.next_run ?? 'pending'}
                        {schedule.recipients?.length ? ` • ${schedule.recipients.join(', ')}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
