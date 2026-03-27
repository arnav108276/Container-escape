import React, { useEffect, useState } from 'react';
import { useSystemMetrics, SecurityEvent } from '../store';

const getRiskColor = (riskLevel: string) => {
  switch (riskLevel) {
    case 'critical':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'high':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case 'low':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const getActionColor = (action: string) => {
  switch (action) {
    case 'blocked':
      return 'text-red-600 font-semibold';
    case 'alerted':
      return 'text-yellow-600 font-semibold';
    case 'allowed':
      return 'text-green-600 font-semibold';
    default:
      return 'text-gray-600';
  }
};

const EventsDisplay: React.FC = () => {
  const { events, addEvent } = useSystemMetrics();
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;

    const connectWebSocket = () => {
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/events';
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsConnected(true);
        console.log('Events WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          addEvent({
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            ...data,
          });
        } catch (error) {
          console.error('Failed to parse event:', error);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        setTimeout(connectWebSocket, 3000);
      };
    };

    connectWebSocket();

    return () => {
      if (ws) ws.close();
    };
  }, [addEvent]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            📊 Real-Time Security Events
          </h2>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {wsConnected ? 'Live' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                Timestamp
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                Container
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                Event Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                Risk Level
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase">
                Description
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {events.slice(0, 20).map((event: SecurityEvent) => (
              <tr
                key={event.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700 transition"
              >
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-300">
                  {new Date(event.timestamp).toLocaleString()}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-300 font-mono">
                  {event.containerName}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-300">
                  <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                    {event.eventType}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  <span className={`px-2 py-1 rounded ${getRiskColor(event.riskLevel)}`}>
                    {event.riskLevel.toUpperCase()}
                  </span>
                </td>
                <td className={`px-6 py-4 text-sm ${getActionColor(event.action)}`}>
                  {event.action.toUpperCase()}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 truncate max-w-xs">
                  {event.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {events.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">
            {wsConnected ? 'Waiting for security events...' : 'Connecting to event stream...'}
          </p>
        </div>
      )}
    </div>
  );
};

export default EventsDisplay;
