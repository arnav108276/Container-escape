import React, { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../services/api';

interface ContainerOption {
  container_id: string;
  name?: string;
}

interface Report {
  report_id: string;
  container_id: string;
  generated_at: string;
  analysis_window_hours?: number;
  event_count: number;
  critical_events: number;
  high_risk_events?: number;
  average_risk_score?: number;
  open_alert_count?: number;
  summary: string;
  recommendations?: string[];
}

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [containers, setContainers] = useState<ContainerOption[]>([]);
  const [selectedContainer, setSelectedContainer] = useState('');
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [markdown, setMarkdown] = useState('');
  const [events24h, setEvents24h] = useState(0);
  const [openAlerts, setOpenAlerts] = useState(0);

  const fetchReports = async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const [reportResponse, eventStatsResponse, alertSummaryResponse] = await Promise.all([
        apiClient.listReports(),
        apiClient.getEventStatistics(24),
        apiClient.getAlertSummary(),
      ]);

      setReports(reportResponse.data.reports || []);
      setEvents24h(eventStatsResponse.data?.total_events || 0);
      setOpenAlerts(alertSummaryResponse.data?.open || 0);
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      if (initial) setLoading(false);
    }
  };

  const fetchContainers = async () => {
    try {
      const response = await apiClient.listContainers();
      const containerList = response.data.containers || [];
      setContainers(containerList);
      if (!selectedContainer && containerList.length > 0) {
        setSelectedContainer(containerList[0].container_id);
      }
    } catch (error) {
      console.error('Failed to fetch containers for report generation:', error);
    }
  };

  useEffect(() => {
    fetchReports(true);
    fetchContainers();
    const interval = setInterval(() => fetchReports(false), 12000);
    return () => clearInterval(interval);
  }, []);

  const reportStats = useMemo(() => ({
    total: reports.length,
    totalEvents: reports.reduce((acc, r) => acc + (r.event_count || 0), 0),
    totalCritical: reports.reduce((acc, r) => acc + (r.critical_events || 0), 0),
  }), [reports]);

  const handleGenerateReport = async () => {
    if (!selectedContainer) return alert('Please select a container.');

    setGenerating(true);
    try {
      await apiClient.generateReport(selectedContainer, hours);
      await fetchReports(false);
      alert('Comprehensive report generated successfully.');
    } catch (error: any) {
      alert(`Failed to generate report: ${error?.message || 'unknown error'}`);
    } finally {
      setGenerating(false);
    }
  };

  const openReport = async (reportId: string) => {
    try {
      const [reportResponse, markdownResponse] = await Promise.all([
        apiClient.getReport(reportId),
        apiClient.getReportMarkdown(reportId),
      ]);
      setSelectedReport(reportResponse.data);
      setMarkdown(markdownResponse.data.markdown || '');
    } catch (error) {
      console.error('Failed to load report details:', error);
      alert('Failed to load report details.');
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-bold text-cyan-100">Forensic Reports</h1>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <p className="text-xs uppercase text-slate-400">Reports Generated</p>
          <p className="mt-1 text-2xl font-bold text-white">{reportStats.total}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <p className="text-xs uppercase text-slate-400">Total Events Analyzed</p>
          <p className="mt-1 text-2xl font-bold text-white">{reportStats.totalEvents}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <p className="text-xs uppercase text-slate-400">Critical Findings</p>
          <p className="mt-1 text-2xl font-bold text-rose-300">{reportStats.totalCritical}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <p className="text-xs uppercase text-slate-400">Live Events (24h)</p>
          <p className="mt-1 text-2xl font-bold text-cyan-300">{events24h}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <p className="text-xs uppercase text-slate-400">Open Alerts</p>
          <p className="mt-1 text-2xl font-bold text-amber-300">{openAlerts}</p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <h2 className="text-xl font-semibold text-white">Generate Comprehensive Report</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm text-slate-300">Container</label>
            <select value={selectedContainer} onChange={(e) => setSelectedContainer(e.target.value)} className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white">
              {containers.map((container) => (
                <option key={container.container_id} value={container.container_id}>
                  {(container.name || 'Unnamed')} ({container.container_id.slice(0, 12)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm text-slate-300">Window (hours)</label>
            <input type="number" min={1} max={168} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white" />
          </div>

          <div className="flex items-end">
            <button onClick={handleGenerateReport} disabled={generating || !selectedContainer} className="w-full rounded bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:bg-slate-600">
              {generating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {loading ? (
          <div className="py-8 text-center">Loading...</div>
        ) : reports.length === 0 ? (
          <div className="rounded-xl border border-slate-700 bg-slate-900 p-12 text-center text-slate-300">
            No reports generated yet. Live data is still flowing above — generate a report to capture a full forensic snapshot.
          </div>
        ) : (
          reports.map((report) => (
            <article key={report.report_id} className="rounded-lg border border-slate-700 bg-slate-900 p-6">
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">{report.container_id.slice(0, 12)}</h3>
                  <p className="text-sm text-slate-400">Generated: {new Date(report.generated_at).toLocaleString()}</p>
                </div>
                <button onClick={() => openReport(report.report_id)} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">View Full Report</button>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <div className="rounded bg-slate-800 p-3"><p className="text-xs text-slate-400">Events</p><p className="text-xl font-bold">{report.event_count}</p></div>
                <div className="rounded bg-rose-950/60 p-3"><p className="text-xs text-slate-400">Critical</p><p className="text-xl font-bold text-rose-300">{report.critical_events}</p></div>
                <div className="rounded bg-orange-950/60 p-3"><p className="text-xs text-slate-400">High Risk</p><p className="text-xl font-bold text-orange-300">{report.high_risk_events || 0}</p></div>
                <div className="rounded bg-slate-800 p-3"><p className="text-xs text-slate-400">Avg Risk</p><p className="text-xl font-bold">{report.average_risk_score || 0}</p></div>
                <div className="rounded bg-slate-800 p-3"><p className="text-xs text-slate-400">Open Alerts</p><p className="text-xl font-bold">{report.open_alert_count || 0}</p></div>
              </div>

              <p className="mt-4 text-sm text-slate-300">{report.summary}</p>
            </article>
          ))
        )}
      </section>

      {selectedReport && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Report {selectedReport.report_id}</h2>
              <button onClick={() => setSelectedReport(null)} className="rounded bg-slate-700 px-3 py-1 text-sm text-white">Close</button>
            </div>

            <p className="mb-4 text-sm text-slate-300">{selectedReport.summary}</p>

            {!!selectedReport.recommendations?.length && (
              <div className="mb-4 rounded border border-slate-700 bg-slate-800 p-4">
                <h3 className="mb-2 font-semibold text-white">Recommendations</h3>
                <ul className="list-disc space-y-1 pl-6 text-sm text-slate-300">
                  {selectedReport.recommendations?.map((rec, index) => <li key={index}>{rec}</li>)}
                </ul>
              </div>
            )}

            <div className="rounded border border-slate-700 bg-black p-4">
              <h3 className="mb-2 font-semibold text-white">Markdown Export</h3>
              <pre className="whitespace-pre-wrap text-xs text-slate-300">{markdown}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
