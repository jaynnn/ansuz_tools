import axios from 'axios';
import { AuthResponse, User, Tool } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

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

// Auth API
export const authAPI = {
  register: (username: string, password: string, nickname: string) =>
    api.post<AuthResponse>('/auth/register', { username, password, nickname }),
  
  login: (username: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { username, password }),
  
  getProfile: () =>
    api.get<User>('/auth/profile'),
  
  updateProfile: (nickname: string) =>
    api.put<User>('/auth/profile', { nickname }),
};

// Tools API
export const toolsAPI = {
  getTools: () =>
    api.get<Tool[]>('/tools'),
  
  createTool: (tool: Omit<Tool, '_id' | 'userId' | 'createdAt'>) =>
    api.post<Tool>('/tools', tool),
  
  updateTool: (id: string, tool: Partial<Omit<Tool, '_id' | 'userId' | 'createdAt'>>) =>
    api.put<Tool>(`/tools/${id}`, tool),
  
  deleteTool: (id: string) =>
    api.delete(`/tools/${id}`),
};
