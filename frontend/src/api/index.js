import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ───── Sensors ─────
export const fetchSensorData = async (nodeId, range = '1h') => {
  const { data } = await api.get(`/sensors/${nodeId}`, { params: { range } });
  return data;
};

// ───── Nodes ─────
export const fetchNodes = async () => {
  const { data } = await api.get('/nodes');
  return data;
};

export const createNode = async (nodeData) => {
  const { data } = await api.post('/nodes', nodeData);
  return data;
};

export const updateNode = async (id, nodeData) => {
  const { data } = await api.patch(`/nodes/${id}`, nodeData);
  return data;
};

// ───── Alerts ─────
export const fetchAlerts = async () => {
  const { data } = await api.get('/alerts');
  return data;
};

export const dismissAlert = async (id) => {
  const { data } = await api.delete(`/alerts/${id}`);
  return data;
};

export default api;
