import React, { useEffect, useState } from 'react';
import { useSystemMetrics, Alert } from '../store';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-l-4 border-red-500';
    case 'high':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-l-4 border-orange-500';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 border-l-4 border-yellow-500';
    case 'low':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-l-4 border-blue-500';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const getStatusBadge = (status: string = 'new') => {
  switch (status) {
    case 'new':
      return 'bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse';
    case 'acknowledged':
      return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
    case 'resolved':
      return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    default:
      return 'bg-gray-500/10 text-gray-400 border border-white/10';
  }
};

const AlertsDisplay: React.FC = () => {
  const { alerts, setAlerts } = useSystemMetrics();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'new' | 'acknowledged' | 'resolved'>('all');

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await fetch('/api/alerts');
        const data = await response.json();
        // Backend might return { alerts: [...] } or just [...]
        setAlerts(data.alerts || data);
      } catch (error) {
        console.error('Failed to fetch alerts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, [setAlerts]);

  const filteredAlerts = alerts.filter((alert: Alert) =>
    filter === 'all' ? true : (alert.status || 'new') === filter
  );

  const handleAcknowledge = async (alertId?: string) => {
    if (!alertId) return;
    try {
      await fetch(`/api/alerts/${alertId}/acknowledge`, { method: 'POST' });
      setAlerts(
        alerts.map((a: Alert) =>
          (a.id || a.alert_id) === alertId ? { ...a, status: 'acknowledged' as const } : a
        )
      );
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  };

  const handleResolve = async (alertId?: string) => {
    if (!alertId) return;
    try {
      await fetch(`/api/alerts/${alertId}/resolve`, { method: 'POST' });
      setAlerts(
        alerts.map((a: Alert) =>
          (a.id || a.alert_id) === alertId ? { ...a, status: 'resolved' as const } : a
        )
      );
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-blue-400 font-bold animate-pulse">MONITORING SECURITY CHANNELS...</div>;
  }

  return (
    <Card className="border border-white/5 bg-white/5 backdrop-blur-md rounded-2xl overflow-hidden shadow-2xl">
      <CardHeader className="px-6 py-6 border-b border-white/5 bg-white/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-blue-400 uppercase tracking-widest">
              Security Intelligence ({filteredAlerts.length})
            </h2>
          </div>
          <div className="flex bg-background/50 p-1 rounded-xl border border-white/5">
            {(['all', 'new', 'acknowledged', 'resolved'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  filter === status
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-6 overflow-y-auto max-h-[600px]">
        {filteredAlerts.map((alert: Alert, idx) => {
          const alertId = alert.id || alert.alert_id || `temp-${idx}`;
          return (
            <div
              key={alertId}
              className={`p-5 rounded-xl border bg-background/40 hover:bg-background/60 transition-all group ${
                alert.severity === 'critical' ? 'border-rose-500/20' : 'border-white/5'
              } flex flex-col md:flex-row items-start justify-between gap-6`}
            >
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusBadge(alert.status)}`}>
                    {alert.status || 'NEW'}
                  </span>
                  <h3 className="font-bold text-white tracking-tight">{alert.title || alert.reason || 'Security Event'}</h3>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                    alert.severity === 'critical' ? 'text-rose-400 border-rose-500/20 bg-rose-500/10' : 
                    alert.severity === 'high' ? 'text-amber-400 border-amber-500/20 bg-amber-500/10' :
                    'text-blue-400 border-blue-500/20 bg-blue-500/10'
                  }`}>
                    {alert.severity}
                  </span>
                </div>
                
                <p className="text-sm text-gray-400 leading-relaxed font-medium">
                  {alert.message || alert.reason}
                </p>
                
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-[10px] font-mono uppercase tracking-widest">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">Workload:</span>
                    <span className="text-blue-400 font-bold">{alert.containerName || alert.container_name || 'System'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">Signature:</span>
                    <span className="text-white">{alert.eventType || 'Generic'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-600">Logged:</span>
                    <span className="text-gray-400">{new Date(alert.timestamp).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex md:flex-col gap-2 w-full md:w-auto">
                {(alert.status === 'new' || !alert.status) && (
                  <button
                    onClick={() => handleAcknowledge(alert.id || alert.alert_id)}
                    className="flex-1 md:w-24 px-3 py-2 bg-blue-600/10 text-blue-400 border border-blue-500/20 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-600/20 transition-all"
                  >
                    Acknowledge
                  </button>
                )}
                {alert.status !== 'resolved' && (
                  <button
                    onClick={() => handleResolve(alert.id || alert.alert_id)}
                    className="flex-1 md:w-24 px-3 py-2 bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600/20 transition-all"
                  >
                    Resolve
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>

      {filteredAlerts.length === 0 && (
        <div className="text-center py-20">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-[0.2em]">
            {filter === 'all' ? 'CLEAN RECORD: NO INCIDENTS DETECTED' : `NO ${filter} INCIDENTS IN QUEUE`}
          </p>
        </div>
      )}
    </Card>
  );
};

export default AlertsDisplay;
