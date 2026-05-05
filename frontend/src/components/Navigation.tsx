import React from 'react';
import { Bell, Settings } from 'lucide-react';

interface NavigationProps {
  isConnected: boolean;
}

export default function Navigation({ isConnected }: NavigationProps) {
  return (
    <nav className="border-b border-white/5 bg-background/50 backdrop-blur-xl sticky top-0 z-40">
      <div className="mx-auto flex items-center justify-between px-8 py-4">
        <div>
          <h2 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em]">Operational Status</h2>
          <div className="flex items-center gap-2 mt-1">
             <div className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.5)]'} animate-pulse`} />
             <span className="text-xs font-bold text-white tracking-widest uppercase">
               {isConnected ? 'LIVE FEED ACTIVE' : 'NETWORK OFFLINE'}
             </span>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <button className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer">
              <Bell className="h-4 w-4" />
            </button>
            <button className="p-2.5 rounded-xl bg-white/5 border border-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer">
              <Settings className="h-4 w-4" />
            </button>
            <div className="h-8 w-px bg-white/10 mx-2" />
            <button className="flex items-center gap-3 pl-2 pr-4 py-1.5 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 hover:bg-blue-600/20 transition-all cursor-pointer">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black text-xs">
                A
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">Admin Control</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
