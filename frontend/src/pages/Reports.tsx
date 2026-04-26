import React from 'react';
import ReportGenerator from '../components/ReportGenerator';

export default function Reports() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold">Reports</h1>
        <p className="text-muted-foreground mt-2">
          Generate on-demand forensic reports and export as CSV/Markdown/JSON.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        Scheduled report generation is available through the backend API at <code>/api/reports/schedules</code>.
      </div>

      <ReportGenerator />
    </div>
  );
}
