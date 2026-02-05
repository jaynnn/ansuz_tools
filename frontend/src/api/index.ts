import axios from 'axios';
import type { Tool } from '../types/index';

const API_BASE_URL = 'http://localhost:3000/api';

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
