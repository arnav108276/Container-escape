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

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'new':
      return 'bg-red-500 text-white animate-pulse';
    case 'acknowledged':
      return 'bg-yellow-500 text-white';
    case 'resolved':
      return 'bg-green-500 text-white';
    default:
      return 'bg-gray-500 text-white';
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
        setAlerts(data);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch alerts:', error);
        setLoading(false);
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, [setAlerts]);

  const filteredAlerts = alerts.filter((alert: Alert) =>
    filter === 'all' ? true : alert.status === filter
  );

  const handleAcknowledge = async (alertId: string) => {
    try {
      await fetch(`/api/alerts/${alertId}/acknowledge`, { method: 'POST' });
      setAlerts(
        alerts.map((a: Alert) =>
          a.id === alertId ? { ...a, status: 'acknowledged' as const } : a
        )
      );
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    }
  };

  const handleResolve = async (alertId: string) => {
    try {
      await fetch(`/api/alerts/${alertId}/resolve`, { method: 'POST' });
      setAlerts(
        alerts.map((a: Alert) =>
          a.id === alertId ? { ...a, status: 'resolved' as const } : a
        )
      );
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading alerts...</div>;
  }

  return (
    <Card className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <CardHeader className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            🔔 Security Alerts ({filteredAlerts.length})
          </h2>
          <div className="flex gap-2">
            {(['all', 'new', 'acknowledged', 'resolved'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded text-sm font-medium transition ${
                  filter === status
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-300'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-6">
        {filteredAlerts.map((alert: Alert) => (
          <div
            key={alert.id}
            className={`p-4 rounded ${getSeverityColor(alert.severity)} flex items-start justify-between gap-4`}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-bold text-lg">{alert.title}</h3>
                <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusBadge(alert.status)}`}>
                  {alert.status.toUpperCase()}
                </span>
              </div>
              <p className="text-sm mb-2">{alert.message}</p>
              <div className="flex gap-4 text-xs">
                <span>
                  <strong>Container:</strong> {alert.containerName}
                </span>
                <span>
                  <strong>Event:</strong> {alert.eventType}
                </span>
                <span>
                  <strong>Time:</strong> {new Date(alert.timestamp).toLocaleString()}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              {alert.status === 'new' && (
                <button
                  onClick={() => handleAcknowledge(alert.id)}
                  className="px-3 py-1 bg-yellow-500 text-white rounded text-sm hover:bg-yellow-600 transition"
                >
                  Ack
                </button>
              )}
              {alert.status !== 'resolved' && (
                <button
                  onClick={() => handleResolve(alert.id)}
                  className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 transition"
                >
                  Resolve
                </button>
              )}
            </div>
          </div>
        ))}
      </CardContent>

      {filteredAlerts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">
            {filter === 'all' ? 'No alerts' : `No ${filter} alerts`}
          </p>
        </div>
      )}
    </Card>
  );
};

export default AlertsDisplay;
