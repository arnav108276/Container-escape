import React, { useEffect, useState } from "react";
import { apiClient } from "../services/api";

interface Alert {
  timestamp: string;
  container_id: string;
  container_name?: string;
  reason: string;
  risk_score: number;
  risk_category?: string;
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

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500"></div>
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-lg">
          No alerts detected
        </div>
      ) : (

        <div className="space-y-4">

          {alerts.map((alert: Alert, idx: number) => (

            <div
              key={`${alert.timestamp}-${idx}`}
              className="bg-gray-800 rounded-xl p-5 border-l-4 border-red-500 shadow hover:shadow-lg transition"
            >

              {/* Top section */}
              <div className="flex justify-between items-start mb-3">

                <div>
                  <h3 className="font-bold text-lg text-white">
                    {alert.container_name || alert.container_id}
                  </h3>
                  <p className="text-gray-400 text-xs mt-1">
                    ID: {alert.container_id.slice(0, 12)}
                  </p>
                </div>

                <span
                  className={`px-3 py-1 rounded text-xs font-bold border ${getSeverityColor(
                    alert.risk_category
                  )}`}
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

              {/* Bottom section */}
              <div className="flex justify-between items-center text-sm text-gray-400">

                <span>
                  Risk Score:
                  <span className="ml-1 font-semibold text-white">
                    {alert.risk_score}/100
                  </span>
                </span>

                <span>
                  {new Date(alert.timestamp).toLocaleString()}
                </span>

              </div>

            </div>

          ))}

        </div>
      )}
    </div>
  );
}


// import React, { useEffect, useState } from 'react';
// import { apiClient } from '../services/api';

// interface Alert {
//   timestamp: string;
//   container_id: string;
//   reason: string;
//   risk_score: number;
//   severity: string;
// }

// export default function Alerts() {
//   const [alerts, setAlerts] = useState<Alert[]>([]);
//   const [loading, setLoading] = useState(false); 

//   useEffect(() => { 
//     const fetchAlerts = async () => {
//       setLoading(true);
//       try {
//         const response = await apiClient.getAlerts();
//         setAlerts(response.data.alerts || []);
//       } catch (error) {
//         console.error('Failed to fetch alerts:', error);
//       } finally {
//         setLoading(false);
//       }
//     };

//     fetchAlerts();
//     const interval = setInterval(fetchAlerts, 5000);
//     return () => clearInterval(interval);
//   }, []);

//   const getSeverityColor = (severity: string) => {
//     switch (severity) {
//       case 'CRITICAL':
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
