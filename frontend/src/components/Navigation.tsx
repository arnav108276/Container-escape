import React from 'react';
import { Link } from 'react-router-dom';
interface NavigationProps {
  isConnected: boolean;
}

export default function Navigation({ isConnected }: NavigationProps) {
  return (
    <nav className="bg-gray-800 border-b border-gray-700">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-8">
            <Link to="/" className="text-2xl font-bold text-blue-400">
              🛡️ Container Guardian
            </Link>
            <div className="flex gap-6">
              <Link to="/" className="text-gray-300 hover:text-white transition">
                Dashboard
              </Link>
              <Link to="/alerts" className="text-gray-300 hover:text-white transition">
                Alerts
              </Link>
              <Link to="/containers" className="text-gray-300 hover:text-white transition">
                Containers
              </Link>
              <Link to="/reports" className="text-gray-300 hover:text-white transition">
                Reports
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-400">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}
