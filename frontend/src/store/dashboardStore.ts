import { create } from 'zustand';

interface DashboardState {
  metrics: {
    total_containers: number;
    quarantined_containers: number;
    events_24h: number;
    critical_alerts: number;
  };
  alerts: any[];
  loading: boolean;
  error: string | null;
  setMetrics: (metrics: any) => void;
  setAlerts: (alerts: any[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  addAlert: (alert: any) => void;
}

const isEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const useDashboardStore = create<DashboardState>((set) => ({
  metrics: {
    total_containers: 0,
    quarantined_containers: 0,
    events_24h: 0,
    critical_alerts: 0,
  },
  alerts: [],
  loading: false,
  error: null,
  setMetrics: (metrics) => set((state) => (isEqual(state.metrics, metrics) ? state : { metrics })),
  setAlerts: (alerts) => set((state) => (isEqual(state.alerts, alerts) ? state : { alerts })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, 100),
    })),
}));
