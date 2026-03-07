import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/api';

interface Alert {
  timestamp: string;
  container_id: string;
  reason: string;
  risk_score: number;
  severity: string;
}

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAlerts = async () => {
      setLoading(true);
      try {
        const response = await apiClient.getAlerts();
        setAlerts(response.data.alerts || []);
      } catch (error) {
        console.error('Failed to fetch alerts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5000);
    return () => clearInterval(interval);
  }, []);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-900 text-red-200';
      case 'HIGH':
        return 'bg-orange-900 text-orange-200';
      default:
        return 'bg-yellow-900 text-yellow-200';
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="text-4xl font-bold">Security Alerts</h1>

      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No alerts</div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert: Alert, idx: number) => (
            <div key={idx} className="bg-gray-800 rounded-lg p-4 border-l-4 border-red-500">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-lg">{alert.container_id}</h3>
                  <p className="text-gray-400 text-sm">{alert.reason}</p>
                </div>
                <span className={`px-3 py-1 rounded text-sm ${getSeverityColor(alert.severity)}`}>
                  {alert.severity}
                </span>
              </div>
              <div className="flex justify-between items-center text-gray-500 text-sm">
                <span>Risk Score: {alert.risk_score}/100</span>
                <span>{new Date(alert.timestamp).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
