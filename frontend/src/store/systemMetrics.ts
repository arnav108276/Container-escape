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
  status: 'running' | 'stopped' | 'paused';
  image: string;
  pid: number;
  riskScore: number;
  eventCount: number;
  lastEvent: string;
  labels: Record<string, string>;
}

export interface Alert {
  id: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  containerName: string;
  eventType: string;
  status: 'new' | 'acknowledged' | 'resolved';
}

interface MetricsStore {
  metrics: SystemMetrics;
  events: SecurityEvent[];
  containers: Container[];
  alerts: Alert[];
  
  setMetrics: (metrics: Partial<SystemMetrics>) => void;
  addEvent: (event: SecurityEvent) => void;
  setEvents: (events: SecurityEvent[]) => void;
  addContainer: (container: Container) => void;
  setContainers: (containers: Container[]) => void;
  addAlert: (alert: Alert) => void;
  setAlerts: (alerts: Alert[]) => void;
  updateContainerRisk: (containerId: string, riskScore: number) => void;
  clearOldEvents: (olderThan: number) => void;
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
};

const isEqual = <T>(left: T, right: T) => JSON.stringify(left) === JSON.stringify(right);

export const useSystemMetrics = create<MetricsStore>(
  (set: (fn: (state: MetricsStore) => Partial<MetricsStore>) => void) => ({
    metrics: defaultMetrics,
    events: [],
    containers: [],
    alerts: [],

    setMetrics: (newMetrics: Partial<SystemMetrics>) =>
      set((state: MetricsStore) => {
        const mergedMetrics = {
          ...state.metrics,
          ...newMetrics,
        };
        if (isEqual(state.metrics, mergedMetrics)) return {};
        return {
          metrics: {
            ...mergedMetrics,
            lastUpdated: new Date().toISOString(),
          },
        };
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
      set((state: MetricsStore) => (isEqual(state.events, events) ? {} : { events })),

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
        const nextMetrics = {
          ...state.metrics,
          totalContainers: containers.length,
        };
        if (isEqual(state.containers, containers) && isEqual(state.metrics, nextMetrics)) return {};
        return {
          containers,
          metrics: nextMetrics,
        };
      }),

    addAlert: (alert: Alert) =>
      set((state: MetricsStore) => ({
        alerts: [alert, ...state.alerts],
        metrics: {
          ...state.metrics,
          activeAlerts: state.alerts.filter((a: Alert) => a.status === 'new').length + 1,
        },
      })),

    setAlerts: (alerts: Alert[]) =>
      set((state: MetricsStore) => {
        const nextMetrics = {
          ...state.metrics,
          activeAlerts: alerts.filter((a: Alert) => a.status === 'new').length,
        };
        if (isEqual(state.alerts, alerts) && isEqual(state.metrics, nextMetrics)) return {};
        return {
          alerts,
          metrics: nextMetrics,
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
  })
);
