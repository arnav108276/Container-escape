import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

interface Report {
  report_id: string;
  container_id: string;
  generated_at: string;
  event_count: number;
  critical_events: number;
  summary: string;
}

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      try {
        const response = await apiClient.listReports();
        setReports(response.data.reports || []);
      } catch (error) {
        console.error('Failed to fetch reports:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, []);

  const handleGenerateReport = async (containerId: string) => {
    setGeneratingFor(containerId);
    try {
      await apiClient.generateReport(containerId, 24);
      // Refresh reports
      const response = await apiClient.listReports();
      setReports(response.data.reports || []);
    } catch (error) {
      console.error('Failed to generate report:', error);
    } finally {
      setGeneratingFor(null);
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-bold">Forensic Reports</h1>

      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No reports generated yet</div>
      ) : (
        <div className="space-y-4">
          {reports.map((report: Report) => (
            <div key={report.report_id} className="bg-gray-800 rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-bold text-lg">{report.container_id.slice(0, 12)}</h3>
                  <p className="text-gray-400 text-sm">
                    Generated: {new Date(report.generated_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => handleGenerateReport(report.container_id)}
                  disabled={generatingFor === report.container_id}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 transition"
                >
                  {generatingFor === report.container_id ? 'Generating...' : 'Regenerate'}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-gray-700 rounded p-4">
                  <div className="text-gray-400 text-sm">Total Events</div>
                  <div className="text-2xl font-bold">{report.event_count}</div>
                </div>
                <div className="bg-red-900 rounded p-4">
                  <div className="text-gray-400 text-sm">Critical</div>
                  <div className="text-2xl font-bold">{report.critical_events}</div>
                </div>
                <div className="bg-gray-700 rounded p-4">
                  <div className="text-gray-400 text-sm">Analyzed</div>
                  <div className="text-2xl font-bold">24h</div>
                </div>
              </div>

              <p className="text-gray-300 text-sm">{report.summary}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
