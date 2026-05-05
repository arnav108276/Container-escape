import React, { useEffect, useState } from 'react';
import { useSystemMetrics, SecurityEvent } from '../store';

const getRiskColor = (riskLevel: string) => {
  switch (riskLevel.toLowerCase()) {
    case 'critical':
      return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
    case 'high':
      return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    case 'medium':
      return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    default:
      return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  }
};

const EventsDisplay: React.FC = () => {
  const { events, addEvent } = useSystemMetrics();
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connectWebSocket = () => {
      let wsUrl = import.meta.env.VITE_WS_URL;
      if (!wsUrl) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws/events`;
      }
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setWsConnected(true);
        attempt = 0;
        console.log('Events WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          addEvent({
            id: Math.random().toString(36).substring(2, 11),
            timestamp: new Date().toISOString(),
            containerName: data.container_name || data.container_id || 'Unknown',
            eventType: data.event_type || 'Generic',
            riskLevel: data.severity || data.risk_level || 'low',
            action: data.action || 'alerted',
            description: data.reason || data.description || 'System security event logged',
            details: data.details || {},
          });
        } catch (error) {
          console.error('Failed to parse event:', error);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        const delay = Math.min(30000, 2000 * Math.pow(1.5, attempt));
        attempt++;
        reconnectTimeout = setTimeout(connectWebSocket, delay);
      };
    };

    connectWebSocket();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [addEvent]);

  return (
    <div className="border border-white/5 bg-white/5 backdrop-blur-md rounded-2xl overflow-hidden shadow-2xl">
      <div className="px-6 py-6 border-b border-white/5 bg-white/5 flex items-center justify-between">
        <h2 className="text-sm font-bold text-blue-400 uppercase tracking-widest">
          Telemetry Stream
        </h2>
        <div className="flex items-center gap-3 bg-background/50 px-3 py-1.5 rounded-full border border-white/5">
          <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
            {wsConnected ? 'Live Feed' : 'Offline'}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-white/5">
              <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Timestamp</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Workload</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Event Type</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Risk</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Action</th>
              <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {events.slice(0, 15).map((event: SecurityEvent) => (
              <tr
                key={event.id}
                className="hover:bg-white/5 transition-colors group cursor-default"
              >
                <td className="px-6 py-4 text-xs font-mono text-gray-500 whitespace-nowrap">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </td>
                <td className="px-6 py-4 text-xs font-bold text-white whitespace-nowrap">
                  {event.containerName}
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-[10px] font-black uppercase tracking-widest">
                    {event.eventType}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-0.5 rounded border text-[10px] font-black uppercase tracking-widest ${getRiskColor(event.riskLevel)}`}>
                    {event.riskLevel}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${
                    event.action === 'blocked' ? 'text-rose-400' : 
                    event.action === 'alerted' ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {event.action}
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-gray-400 font-medium max-w-xs truncate">
                  {event.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {events.length === 0 && (
        <div className="text-center py-20">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-[0.2em]">
            {wsConnected ? 'WAITING FOR TELEMETRY PACKETS...' : 'REESTABLISHING CONNECTION...'}
          </p>
        </div>
      )}
    </div>
  );
};

export default EventsDisplay;
