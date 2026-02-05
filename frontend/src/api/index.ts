import axios from 'axios';
import type { Tool } from '../types/index';
import type { StockPrediction } from '../types/stock';

// Use relative URL in production (when served by backend)
// Use absolute URL in development (when using Vite dev server)
const API_BASE_URL = import.meta.env.DEV 
  ? 'http://localhost:4000/api'
  : '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auth APIs
export const authAPI = {
  register: async (username: string, password: string, nickname?: string) => {
    const response = await api.post('/auth/register', { username, password, nickname });
    return response.data;
  },
  
  login: async (username: string, password: string) => {
    const response = await api.post('/auth/login', { username, password });
    return response.data;
  },
  
  getMe: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
  
  updateNickname: async (nickname: string) => {
    const response = await api.put('/auth/nickname', { nickname });
    return response.data;
  },
};

// Tools APIs
export const toolsAPI = {
  getAll: async () => {
    const response = await api.get('/tools');
    return response.data;
  },
  
  getById: async (id: number) => {
    const response = await api.get(`/tools/${id}`);
    return response.data;
  },
  
  create: async (tool: Omit<Tool, 'id' | 'user_id' | 'created_at'>) => {
    const response = await api.post('/tools', tool);
    return response.data;
  },
  
  update: async (id: number, tool: Omit<Tool, 'id' | 'user_id' | 'created_at'>) => {
    const response = await api.put(`/tools/${id}`, tool);
    return response.data;
  },
  
  delete: async (id: number) => {
    const response = await api.delete(`/tools/${id}`);
    return response.data;
  },
};

// Stock Predictions APIs
export const stockPredictionsAPI = {
  getAll: async () => {
    const response = await api.get('/stock-predictions');
    return response.data;
  },
  
  getById: async (id: string) => {
    const response = await api.get(`/stock-predictions/${id}`);
    return response.data;
  },
  
  create: async (prediction: Omit<StockPrediction, 'id'>) => {
    const response = await api.post('/stock-predictions', prediction);
    return response.data;
  },
  
  update: async (id: string, prediction: Omit<StockPrediction, 'id'>) => {
    const response = await api.put(`/stock-predictions/${id}`, prediction);
    return response.data;
  },
  
  delete: async (id: string) => {
    const response = await api.delete(`/stock-predictions/${id}`);
    return response.data;
  },
  
  batchCreate: async (predictions: Omit<StockPrediction, 'id'>[]) => {
    const response = await api.post('/stock-predictions/batch', { predictions });
    return response.data;
  },
};
