import React from 'react';
import { Bell, User, Settings, LogOut } from 'lucide-react';
import { Button } from './ui/button';

interface NavigationProps {
  isConnected: boolean;
}

export default function Navigation({ isConnected }: NavigationProps) {
  return (
    <nav className="border-b border-border bg-card">
      <div className="mx-auto flex items-center justify-between px-6 py-4">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Security Dashboard</p>
          <p className="text-xs text-muted-foreground">Real-time threat intelligence & monitoring</p>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Connection Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-muted/30">
            <div
              className={`h-2 w-2 rounded-full animate-pulse ${
                isConnected ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            />
            <span className="text-xs font-medium text-muted-foreground">
              {isConnected ? 'Live' : 'Offline'}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 border-l border-border pl-4">
            <Button variant="ghost" size="icon" className="h-9 w-9" title="Notifications">
              <Bell className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" title="Settings">
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" title="User Profile">
              <User className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" title="Logout">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
