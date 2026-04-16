import axios, { AxiosInstance } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiClient = {
  get: (url: string, config?: any) => api.get(url, config),
  post: (url: string, data?: any, config?: any) => api.post(url, data, config),

  // Dashboard
  getDashboardMetrics: () => api.get('/api/dashboard/metrics'),
  getSystemOverview: () => api.get('/api/system/overview'),

  // Alerts
  getAlerts: (containerId?: string, limit: number = 100, includeAcknowledged: boolean = false) =>
    api.get('/api/alerts', { params: { container_id: containerId, limit, include_acknowledged: includeAcknowledged } }),
  getAlertSummary: () => api.get('/api/alerts/summary'),
  acknowledgeAlert: (alertId: string, acknowledgedBy: string = 'user') =>
    api.post(`/api/alerts/${alertId}/acknowledge`, { acknowledged_by: acknowledgedBy }),
  acknowledgeMultipleAlerts: (alertIds: string[], acknowledgedBy: string = 'user') =>
    api.post('/api/alerts/acknowledge/multiple', { alert_ids: alertIds, acknowledged_by: acknowledgedBy }),
  acknowledgeAllAlerts: (acknowledgedBy: string = 'user') =>
    api.post('/api/alerts/acknowledge/all', { acknowledged_by: acknowledgedBy }),

  // Events
  getEvents: (containerId?: string, hours: number = 24, limit: number = 1000) =>
    api.get('/api/events', { params: { container_id: containerId, hours, limit } }),
  getEventStatistics: (hours: number = 24) => api.get('/api/events/statistics', { params: { hours } }),

  // Containers
  listContainers: () => api.get('/api/containers'),
  getContainerStatus: (containerId: string) => api.get(`/api/containers/${containerId}`),
  getContainerVulnerabilities: (containerId: string, limit: number = 10) =>
    api.get(`/api/containers/${containerId}/vulnerabilities`, { params: { limit } }),
  quarantineContainer: (containerId: string, reason: string, approvedBy: string) =>
    api.post(`/api/containers/${containerId}/quarantine`, { reason, approved_by: approvedBy }),
  getContainerRisk: (containerId: string) => api.get(`/api/containers/${containerId}/risk`),

  // Reports
  listReports: (containerId?: string, limit: number = 100) =>
    api.get('/api/reports', { params: { container_id: containerId, limit } }),
  getReport: (reportId: string) => api.get(`/api/reports/${reportId}`),
  getReportMarkdown: (reportId: string) => api.get(`/api/reports/${reportId}/markdown`),
  exportReport: (reportId: string, format: 'json' | 'csv' | 'markdown') =>
    api.get(`/api/reports/${reportId}/export`, { params: { format }, responseType: 'blob' }),
  generateReport: (containerId: string, hours: number = 24) =>
    api.post('/api/reports/generate', null, { params: { container_id: containerId, hours } }),
  listReportSchedules: (containerId?: string) =>
    api.get('/api/reports/schedules', { params: { container_id: containerId } }),
  createReportSchedule: (schedule: any) =>
    api.post('/api/reports/schedules', schedule),
  deleteReportSchedule: (scheduleId: string) =>
    api.delete(`/api/reports/schedules/${scheduleId}`),
  runReportSchedule: (scheduleId: string) =>
    api.post(`/api/reports/schedules/${scheduleId}/run`),

  // Admin
  cleanupAllData: () => api.post('/api/admin/cleanup/all'),
  cleanupContainerAlerts: (containerId: string) => api.post(`/api/admin/cleanup/container/${containerId}`),
  getAdminStats: () => api.get('/api/admin/stats'),

  // Health
  health: () => api.get('/health'),
  ready: () => api.get('/ready'),
};

export default api;
