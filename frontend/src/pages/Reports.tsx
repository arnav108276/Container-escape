import React from 'react';
import ReportGenerator from '../components/ReportGenerator';
import { useThemeStore } from '../store/themeStore';

export default function Reports() {
  const { getEffectiveTheme } = useThemeStore();
  const darkMode = getEffectiveTheme() === 'dark';

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
