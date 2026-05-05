import React from 'react';
import { FileText } from 'lucide-react';
import ReportGenerator from '../components/ReportGenerator';

export default function Reports() {
  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-extrabold text-white tracking-tight">Forensic Intelligence</h1>
        <p className="text-blue-400 font-medium">Generate on-demand forensic reports and compliance audits from telemetry history.</p>
      </div>

      <div className="rounded-2xl border border-white/5 bg-blue-600/5 p-6 flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-blue-600/10 flex items-center justify-center border border-blue-500/20">
           <FileText className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <p className="text-xs font-bold text-white uppercase tracking-widest">Automation Ready</p>
          <p className="text-[10px] text-gray-500 font-medium mt-0.5">Scheduled report generation is active. Access the API gateway for automated pipeline integration.</p>
        </div>
      </div>

      <ReportGenerator />
    </div>
  );
}
