import axios, { AxiosInstance } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// API endpoints
export const apiClient = {
  // Dashboard
  getDashboardMetrics: () =>
    api.get('/api/dashboard/metrics'),
  
  // Alerts
  getAlerts: (containerId?: string, limit: number = 100) =>
    api.get('/api/alerts', { params: { container_id: containerId, limit } }),
  
  generateTestAlerts: () =>
    api.post('/api/alerts/test/generate'),
  
  // Events
  getEvents: (containerId?: string, hours: number = 24, limit: number = 1000) =>
    api.get('/api/events', { params: { container_id: containerId, hours, limit } }),
  
  getEventStatistics: (hours: number = 24) =>
    api.get('/api/events/statistics', { params: { hours } }),
  
  // Containers
  listContainers: () =>
    api.get('/api/containers'),
  
  getContainerStatus: (containerId: string) =>
    api.get(`/api/containers/${containerId}`),
  
  quarantineContainer: (containerId: string, reason: string, approvedBy: string) =>
    api.post(`/api/containers/${containerId}/quarantine`, { reason, approved_by: approvedBy }),
  
  getContainerRisk: (containerId: string) =>
    api.get(`/api/containers/${containerId}/risk`),
  
  // Reports
  listReports: (containerId?: string, limit: number = 100) =>
    api.get('/api/reports', { params: { container_id: containerId, limit } }),
  
  generateReport: (containerId: string, hours: number = 24) =>
    api.post('/api/reports/generate', null, { params: { container_id: containerId, hours } }),
  
  // Dashboard
  // getDashboardMetrics: () =>
  //   api.get('/api/dashboard'),
  
  // Health
  health: () =>
    api.get('/health'),
};

export default api;
