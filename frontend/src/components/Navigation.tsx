import React, { useState, useRef, useEffect } from 'react';
import { Shield, ChevronDown, User, Activity, Lock, LogOut } from 'lucide-react';

interface NavigationProps {
  isConnected: boolean;
}

export default function Navigation({ isConnected }: NavigationProps) {
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsAdminOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
          <div className="flex items-center gap-3 relative" ref={dropdownRef}>
            <button 
              onClick={() => setIsAdminOpen(!isAdminOpen)}
              className="flex items-center gap-3 pl-2 pr-4 py-1.5 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 hover:bg-blue-600/20 transition-all cursor-pointer"
            >
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black text-xs">
                A
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest">Admin Control</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${isAdminOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Admin Dropdown */}
            {isAdminOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-white/10 bg-background/95 backdrop-blur-xl p-2 shadow-2xl animate-in fade-in slide-in-from-top-2 z-50">
                <div className="px-3 py-2 mb-2">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Administrator</p>
                  <p className="text-xs font-bold text-white">admin@guardian.io</p>
                </div>
                
                <div className="space-y-1">
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-left">
                    <User className="w-4 h-4" />
                    User Management
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-left">
                    <Lock className="w-4 h-4" />
                    Security Policies
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-colors text-left">
                    <Activity className="w-4 h-4" />
                    System Audit Logs
                  </button>
                </div>

                <div className="mt-2 pt-2 border-t border-white/5">
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition-colors text-left">
                    <LogOut className="w-4 h-4" />
                    Terminate Session
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
