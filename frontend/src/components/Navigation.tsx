import React from 'react';

interface NavigationProps {
  isConnected: boolean;
}

export default function Navigation({ isConnected }: NavigationProps) {
  return (
    <nav className="border-b border-slate-700 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900">
      <div className="mx-auto flex items-center justify-between px-6 py-4">
        <div>
          <p className="text-lg font-semibold text-cyan-200">Container Guardian</p>
          <p className="text-xs text-slate-400">Real-time runtime threat intelligence</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-slate-600 bg-slate-900/70 px-3 py-1.5">
          <div className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-rose-500'}`} />
          <span className="text-xs text-slate-300">{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>
    </nav>
  );
}
