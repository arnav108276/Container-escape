import React from 'react';
import ReportGenerator from '../components/ReportGenerator';
import { useThemeStore } from '../store/themeStore';

export default function Reports() {
  const { getEffectiveTheme } = useThemeStore();
  const darkMode = getEffectiveTheme() === 'dark';

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportReport = async (reportId: string, type: 'pdf' | 'csv') => {
    try {
      const response = type === 'pdf' ? await apiClient.getReportPdf(reportId) : await apiClient.getReportCsv(reportId);
      downloadBlob(response.data, `${reportId}.${type}`);
    } catch (error) {
      console.error('Failed to export report:', error);
      alert(`Failed to export ${type.toUpperCase()} report`);
    }
  };

  const handleSchedule = async () => {
    if (!selectedContainer) return;
    try {
      await apiClient.scheduleReport(selectedContainer, hours, cadenceMinutes);
      alert(`Scheduled report every ${cadenceMinutes} minutes.`);
    } catch (error) {
      console.error('Failed to schedule report:', error);
      alert('Failed to schedule report.');
    }
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-900' : 'bg-gray-50'} p-6`}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className={`text-4xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Report Generation
          </h1>
          <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            Generate comprehensive security reports in PDF, CSV, or JSON formats
          </p>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div
            className={`p-4 rounded-lg border ${
              darkMode
                ? 'bg-gray-800 border-gray-700'
                : 'bg-blue-50 border-blue-200'
            }`}
          >
            <h3
              className={`font-semibold ${
                darkMode ? 'text-blue-300' : 'text-blue-900'
              }`}
            >
              📊 Multiple Formats
            </h3>
            <p
              className={`text-sm mt-2 ${
                darkMode ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              Export reports as PDF (professional), CSV (data analysis), or JSON
              (integration)
            </p>
          </div>

          <div
            className={`p-4 rounded-lg border ${
              darkMode
                ? 'bg-gray-800 border-gray-700'
                : 'bg-green-50 border-green-200'
            }`}
          >
            <h3
              className={`font-semibold ${
                darkMode ? 'text-green-300' : 'text-green-900'
              }`}
            >
              📅 Flexible Scheduling
            </h3>
            <p
              className={`text-sm mt-2 ${
                darkMode ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              Schedule recurring reports (daily, weekly, monthly) and receive
              them via email
            </p>
          </div>

          <div
            className={`p-4 rounded-lg border ${
              darkMode
                ? 'bg-gray-800 border-gray-700'
                : 'bg-purple-50 border-purple-200'
            }`}
          >
            <h3
              className={`font-semibold ${
                darkMode ? 'text-purple-300' : 'text-purple-900'
              }`}
            >
              🔍 Detailed Analytics
            </h3>
            <p
              className={`text-sm mt-2 ${
                darkMode ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              Choose from Security Summary, Container Inventory, Alert History,
              or Event Details
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300">Schedule (minutes)</label>
            <input
              type="number"
              min={5}
              max={10080}
              value={cadenceMinutes}
              onChange={(e) => setCadenceMinutes(Number(e.target.value))}
              className="w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white"
            />
            <button
              onClick={handleSchedule}
              disabled={!selectedContainer}
              className="mt-2 w-full rounded bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:bg-slate-600"
            >
              Schedule
            </button>
          </div>
        </div>

        {/* Report Generator Component */}
        <ReportGenerator />

        {/* Footer Note */}
        <div
          className={`mt-8 p-4 rounded-lg border-l-4 ${
            darkMode
              ? 'bg-gray-800 border-yellow-500 text-gray-300'
              : 'bg-yellow-50 border-yellow-400 text-gray-800'
          }`}
        >
          <p className="text-sm">
            <strong>💡 Tip:</strong> Use filters to generate targeted reports for
            specific containers or time periods. Scheduled reports are automatically
            emailed to configured recipients at the specified frequency.
          </p>
        </div>
      </div>
    </div>
  );
}
