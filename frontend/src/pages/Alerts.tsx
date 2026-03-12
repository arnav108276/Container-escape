import React, { useEffect, useState } from "react";
import { apiClient } from "../services/api";

interface Alert {
  _id?: string;
  timestamp: string;
  container_id: string;
  container_name?: string;
  event_type?: string;
  reason: string;
  risk_score: number;
  risk_category?: string;
  severity: string;
  acknowledged?: boolean;
}

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{
    total_alerts: number;
    total_events: number;
    alerts_by_container: any[];
  } | null>(null);
  const [selectedAlerts, setSelectedAlerts] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);

  useEffect(() => {
    const fetchAlerts = async () => {
      setLoading(true);

      try {
        const response = await apiClient.getAlerts();
        setAlerts(response.data.alerts || []);
        
        // Fetch admin stats to show cleanup option
        try {
          const statsResponse = await apiClient.getAdminStats();
          setStats(statsResponse.data);
        } catch (e) {
          console.log('Could not fetch admin stats');
        }
      } catch (error) {
        console.error("Failed to fetch alerts:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();

    const interval = setInterval(fetchAlerts, 5000);

    return () => clearInterval(interval);
  }, []);

  const getSeverityColor = (risk_category?: string) => {
    const category = (risk_category || 'LOW').toUpperCase();

    if (category === 'CRITICAL')
      return 'bg-red-950 text-red-200 border-red-600';

    if (category === 'HIGH')
      return 'bg-orange-950 text-orange-200 border-orange-600';

    if (category === 'MEDIUM')
      return 'bg-yellow-950 text-yellow-200 border-yellow-600';

    return 'bg-green-950 text-green-200 border-green-600';
  };

  const handleSelectAlert = (alertId: string | undefined) => {
    if (!alertId) return;
    
    const newSelected = new Set(selectedAlerts);
    if (newSelected.has(alertId)) {
      newSelected.delete(alertId);
    } else {
      newSelected.add(alertId);
    }
    setSelectedAlerts(newSelected);
    
    // Update selectAll checkbox state
    setSelectAll(newSelected.size === alerts.length && alerts.length > 0);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedAlerts(new Set());
      setSelectAll(false);
    } else {
      const allIds = new Set(alerts.filter(a => a._id).map(a => a._id!));
      setSelectedAlerts(allIds);
      setSelectAll(true);
    }
  };

  const handleAcknowledgeSelected = async () => {
    if (selectedAlerts.size === 0) {
      alert('Please select alerts to acknowledge');
      return;
    }

    if (!window.confirm(`Acknowledge ${selectedAlerts.size} selected alert(s)?`)) {
      return;
    }

    setAcknowledging(true);
    try {
      const alertIds = Array.from(selectedAlerts);
      await apiClient.acknowledgeMultipleAlerts(alertIds);
      
      // Refresh alerts
      const response = await apiClient.getAlerts();
      setAlerts(response.data.alerts || []);
      setSelectedAlerts(new Set());
      setSelectAll(false);
    } catch (error) {
      alert('Failed to acknowledge alerts: ' + (error as any).message);
    } finally {
      setAcknowledging(false);
    }
  };

  const handleAcknowledgeAll = async () => {
    if (alerts.length === 0) {
      alert('No alerts to acknowledge');
      return;
    }

    if (!window.confirm(`Acknowledge all ${alerts.length} alert(s)?`)) {
      return;
    }

    setAcknowledging(true);
    try {
      await apiClient.acknowledgeAllAlerts();
      
      // Refresh alerts
      const response = await apiClient.getAlerts();
      setAlerts(response.data.alerts || []);
      setSelectedAlerts(new Set());
      setSelectAll(false);
    } catch (error) {
      alert('Failed to acknowledge alerts: ' + (error as any).message);
    } finally {
      setAcknowledging(false);
    }
  };

  const handleAcknowledgeSingle = async (alertId: string | undefined) => {
    if (!alertId) return;

    setAcknowledging(true);
    try {
      await apiClient.acknowledgeAlert(alertId);
      
      // Refresh alerts
      const response = await apiClient.getAlerts();
      setAlerts(response.data.alerts || []);
      
      // Remove from selection
      const newSelected = new Set(selectedAlerts);
      newSelected.delete(alertId);
      setSelectedAlerts(newSelected);
    } catch (error) {
      alert('Failed to acknowledge alert: ' + (error as any).message);
    } finally {
      setAcknowledging(false);
    }
  };

  const handleCleanupAll = async () => {
    if (window.confirm('WARNING: This will delete ALL alerts and events from the database. This cannot be undone. Continue?')) {
      try {
        const response = await apiClient.cleanupAllData();
        alert(`Cleanup complete:\n- Alerts deleted: ${response.data.alerts_deleted}\n- Events deleted: ${response.data.events_deleted}\n- Reports deleted: ${response.data.reports_deleted}`);
        // Refresh alerts
        const refreshResponse = await apiClient.getAlerts();
        setAlerts(refreshResponse.data.alerts || []);
      } catch (error) {
        alert('Cleanup failed: ' + (error as any).message);
      }
    }
  };

  const handleCleanupContainer = async (container_id: string) => {
    if (window.confirm(`Delete all alerts and events for container ${container_id.slice(0, 12)}?`)) {
      try {
        const response = await apiClient.cleanupContainerAlerts(container_id);
        alert(`Cleanup complete:\n- Alerts deleted: ${response.data.alerts_deleted}\n- Events deleted: ${response.data.events_deleted}`);
        // Refresh alerts
        const refreshResponse = await apiClient.getAlerts();
        setAlerts(refreshResponse.data.alerts || []);
      } catch (error) {
        alert('Cleanup failed: ' + (error as any).message);
      }
    }
  };

  return (
    <div className="space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-white">
          Security Alerts
        </h1>

        <p className="text-gray-400 mt-2">
          Real-time alerts generated from container security events
        </p>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-gray-400 text-xs">Total Alerts</p>
              <p className="text-3xl font-bold text-white">{stats.total_alerts}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Total Events</p>
              <p className="text-3xl font-bold text-white">{stats.total_events}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Containers with Alerts</p>
              <p className="text-3xl font-bold text-white">{stats.alerts_by_container.length}</p>
            </div>
          </div>
          
          {/* Top containers by alert count */}
          {stats.alerts_by_container.length > 0 && (
            <div className="mt-4 border-t border-gray-700 pt-4">
              <p className="text-gray-400 text-xs mb-2 font-semibold">Top Containers by Alert Count:</p>
              <div className="space-y-1">
                {stats.alerts_by_container.slice(0, 5).map((container, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs">
                    <span className="text-gray-300">{container.container_name || 'Unknown'}</span>
                    <button
                      onClick={() => handleCleanupContainer(container._id)}
                      className="text-red-400 hover:text-red-300 text-xs"
                    >
                      Clean ({container.alert_count})
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cleanup buttons */}
          <div className="mt-4 border-t border-gray-700 pt-4 flex gap-2">
            <button
              onClick={handleCleanupAll}
              className="px-3 py-1 bg-red-900 hover:bg-red-800 text-red-200 rounded text-xs font-semibold transition"
            >
              Clear All Data
            </button>
            <p className="text-gray-500 text-xs">
              (Use if seeing old test alerts from before Docker cleanup)
            </p>
          </div>
        </div>
      )}

      {/* Alerts Actions Bar */}
      {alerts.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectAll && alerts.length > 0}
              onChange={handleSelectAll}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 cursor-pointer"
              title="Select all alerts"
            />
            <span className="text-gray-300 text-sm">
              {selectedAlerts.size > 0
                ? `${selectedAlerts.size} selected`
                : 'Select all'
              }
            </span>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleAcknowledgeAll}
              disabled={alerts.length === 0 || acknowledging}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded text-sm font-semibold transition"
            >
              {acknowledging ? 'Processing...' : `Acknowledge All (${alerts.length})`}
            </button>
            
            <button
              onClick={handleAcknowledgeSelected}
              disabled={selectedAlerts.size === 0 || acknowledging}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded text-sm font-semibold transition"
            >
              {acknowledging ? 'Processing...' : `Acknowledge Selected (${selectedAlerts.size})`}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-lg">
          No alerts detected. System is secure.
        </div>
      ) : (

        <div className="space-y-4">

          {alerts.map((alert: Alert, idx: number) => (

            <div
              key={`${alert.timestamp}-${idx}`}
              className={`rounded-xl p-5 border-l-4 border-red-500 shadow hover:shadow-lg transition ${
                selectedAlerts.has(alert._id || '')
                  ? 'bg-gray-750 border-blue-500'
                  : 'bg-gray-800'
              }`}
            >

              {/* Checkbox and content */}
              <div className="flex gap-3">
                <input
                  type="checkbox"
                  checked={selectedAlerts.has(alert._id || '')}
                  onChange={() => handleSelectAlert(alert._id)}
                  className="w-5 h-5 rounded border-gray-600 bg-gray-700 cursor-pointer mt-1 flex-shrink-0"
                  disabled={acknowledging}
                />

                <div className="flex-1">
                  {/* Top section */}
                  <div className="flex justify-between items-start mb-3">

                    <div>
                      <h3 className="font-bold text-lg text-white">
                        {alert.container_name || alert.container_id || 'Unknown Container'}
                      </h3>
                      <p className="text-gray-400 text-xs mt-1">
                        ID: {(alert.container_id || 'Unknown').slice(0, 12)}
                        {alert.event_type && (
                          <span className="ml-2 px-2 py-1 bg-gray-700 rounded text-xs">
                            {alert.event_type}
                          </span>
                        )}
                      </p>
                    </div>

                    <span
                      className={`px-3 py-1 rounded text-xs font-bold border ${getSeverityColor(
                        alert.risk_category
                      )} flex-shrink-0`}
                    >
                      {alert.risk_category || alert.severity.toUpperCase()}
                    </span>

                  </div>

                  {/* Reason section */}
                  <div className="mb-3 p-3 bg-gray-900 rounded border-l-2 border-red-500">
                    <p className="text-sm text-gray-300">
                      <span className="font-semibold text-white">Reason: </span>
                      {alert.reason}
                    </p>
                  </div>

                  {/* Bottom section with actions */}
                  <div className="flex justify-between items-center text-sm text-gray-400">

                    <span>
                      Risk Score:
                      <span className="ml-1 font-semibold text-white">
                        {alert.risk_score}/100
                      </span>
                    </span>

                    <div className="flex gap-2 items-center">
                      <span className="text-xs">
                        {new Date(alert.timestamp).toLocaleString()}
                      </span>
                      <button
                        onClick={() => handleAcknowledgeSingle(alert._id)}
                        disabled={acknowledging}
                        className="px-2 py-1 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white rounded text-xs font-semibold transition whitespace-nowrap"
                      >
                        Dismiss
                      </button>
                    </div>

                  </div>
                </div>
              </div>

            </div>

          ))}

        </div>
      )}
    </div>
  );
}
//         return 'bg-red-900 text-red-200';
//       case 'HIGH':
//         return 'bg-orange-900 text-orange-200';
//       default:
//         return 'bg-yellow-900 text-yellow-200';
//     }
//   };

//   return (
//     <div className="space-y-8">
//       <h1 className="text-4xl font-bold">Security Alerts</h1>

//       {loading ? (
//         <div className="text-center py-8">Loading...</div>
//       ) : alerts.length === 0 ? (
//         <div className="text-center py-12 text-gray-400">No alerts</div>
//       ) : (
//         <div className="space-y-4">
//           {alerts.map((alert: Alert, idx: number) => (
//             <div key={idx} className="bg-gray-800 rounded-lg p-4 border-l-4 border-red-500">
//               <div className="flex justify-between items-start mb-2">
//                 <div>
//                   <h3 className="font-bold text-lg">{alert.container_id}</h3>
//                   <p className="text-gray-400 text-sm">{alert.reason}</p>
//                 </div>
//                 <span className={`px-3 py-1 rounded text-sm ${getSeverityColor(alert.severity)}`}>
//                   {alert.severity}
//                 </span>
//               </div>
//               <div className="flex justify-between items-center text-gray-500 text-sm">
//                 <span>Risk Score: {alert.risk_score}/100</span>
//                 <span>{new Date(alert.timestamp).toLocaleString()}</span>
//               </div>
//             </div>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }
