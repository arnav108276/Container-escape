import { create } from 'zustand';

export interface SystemMetrics {
  totalContainers: number;
  activeAlerts: number;
  blockedEvents: number;
  riskyProcesses: number;
  cpuUsage: number;
  memoryUsage: number;
  networkConnections: number;
  lastUpdated: string;
  // Dashboard specific metrics
  quarantined_containers?: number;
  events_24h?: number;
  critical_alerts?: number;
}

export interface SecurityEvent {
  id: string;
  timestamp: string;
  containerName: string;
  eventType: 'file_access' | 'privilege_escalation' | 'network' | 'process' | 'capability';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  action: 'blocked' | 'allowed' | 'alerted';
  description: string;
  details: Record<string, unknown>;
}

export interface Container {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'paused' | 'quarantined';
  image: string;
  pid: number;
  riskScore: number;
  eventCount: number;
  lastEvent: string;
  labels: Record<string, string>;
}

export interface Alert {
  alert_id?: string;
  id?: string; // for compatibility
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical' | string;
  title?: string;
  message?: string;
  reason?: string;
  container_id?: string;
  container_name?: string;
  containerName?: string;
  eventType?: string;
  status?: 'new' | 'acknowledged' | 'resolved';
  acknowledged?: boolean;
  risk_score?: number;
}

interface MetricsStore {
  metrics: SystemMetrics;
  events: SecurityEvent[];
  containers: Container[];
  alerts: Alert[];
  loading: boolean;
  error: string | null;
  
  setMetrics: (metrics: Partial<SystemMetrics>) => void;
  addEvent: (event: SecurityEvent) => void;
  setEvents: (events: SecurityEvent[]) => void;
  addContainer: (container: Container) => void;
  setContainers: (containers: Container[]) => void;
  addAlert: (alert: Alert) => void;
  setAlerts: (alerts: Alert[]) => void;
  updateContainerRisk: (containerId: string, riskScore: number) => void;
  clearOldEvents: (olderThan: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const defaultMetrics: SystemMetrics = {
  totalContainers: 0,
  activeAlerts: 0,
  blockedEvents: 0,
  riskyProcesses: 0,
  cpuUsage: 0,
  memoryUsage: 0,
  networkConnections: 0,
  lastUpdated: new Date().toISOString(),
  quarantined_containers: 0,
  events_24h: 0,
  critical_alerts: 0,
};

export const useSystemMetrics = create<MetricsStore>(
  (set: (fn: (state: MetricsStore) => Partial<MetricsStore>) => void) => ({
    metrics: defaultMetrics,
    events: [],
    containers: [],
    alerts: [],
    loading: false,
    error: null,

    setMetrics: (newMetrics: Partial<SystemMetrics>) =>
      set((state: MetricsStore) => {
        const updatedMetrics = {
          ...state.metrics,
          ...newMetrics,
          lastUpdated: new Date().toISOString(),
        };
        // Simple shallow comparison to prevent no-op updates
        if (JSON.stringify(state.metrics) === JSON.stringify(updatedMetrics)) return state;
        return { metrics: updatedMetrics };
      }),

    addEvent: (event: SecurityEvent) =>
      set((state: MetricsStore) => {
        const updatedEvents = [event, ...state.events].slice(0, 1000);
        return {
          events: updatedEvents,
          metrics: {
            ...state.metrics,
            blockedEvents:
              event.action === 'blocked'
                ? state.metrics.blockedEvents + 1
                : state.metrics.blockedEvents,
          },
        };
      }),

    setEvents: (events: SecurityEvent[]) => 
      set((state) => {
        if (state.events.length === events.length && JSON.stringify(state.events) === JSON.stringify(events)) return state;
        return { events };
      }),

    addContainer: (container: Container) =>
      set((state: MetricsStore) => ({
        containers: [...state.containers, container],
        metrics: {
          ...state.metrics,
          totalContainers: state.containers.length + 1,
        },
      })),

    setContainers: (containers: Container[]) =>
      set((state: MetricsStore) => {
        if (state.containers.length === containers.length && JSON.stringify(state.containers) === JSON.stringify(containers)) return state;
        return {
          containers,
          metrics: {
            ...state.metrics,
            totalContainers: containers.length,
          },
        };
      }),

    addAlert: (alert: Alert) =>
      set((state: MetricsStore) => ({
        alerts: [alert, ...state.alerts],
        metrics: {
          ...state.metrics,
          activeAlerts: state.alerts.filter((a: Alert) => a.status === 'new' || !a.acknowledged).length + 1,
        },
      })),

    setAlerts: (alerts: Alert[]) =>
      set((state: MetricsStore) => {
        if (state.alerts.length === alerts.length && JSON.stringify(state.alerts) === JSON.stringify(alerts)) return state;
        return {
          alerts,
          metrics: {
            ...state.metrics,
            activeAlerts: alerts.filter((a: Alert) => a.status === 'new' || !a.acknowledged).length,
          },
        };
      }),

    updateContainerRisk: (containerId: string, riskScore: number) =>
      set((state: MetricsStore) => ({
        containers: state.containers.map((c: Container) =>
          c.id === containerId ? { ...c, riskScore } : c
        ),
      })),

    clearOldEvents: (olderThanMs: number) =>
      set((state: MetricsStore) => ({
        events: state.events.filter(
          (e: SecurityEvent) => Date.now() - new Date(e.timestamp).getTime() < olderThanMs
        ),
      })),

    setLoading: (loading: boolean) => set((state) => state.loading === loading ? state : { loading }),
    setError: (error: string | null) => set((state) => state.error === error ? state : { error }),
  })
);
