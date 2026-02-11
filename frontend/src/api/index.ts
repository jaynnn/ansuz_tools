import axios from 'axios';
import type { Tool, UserImpression, MatchedUser, UserProfile, Notification, PrivateInfo, AddedUser, ContactVotes } from '../types/index';
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

  updateAvatar: async (avatar: string) => {
    const response = await api.put('/auth/avatar', { avatar });
    return response.data;
  },

  deleteAccount: async (password: string) => {
    const response = await api.delete('/auth/account', { data: { password } });
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

// LLM APIs
export const llmAPI = {
  getConfig: async () => {
    const response = await api.get('/llm/config');
    return response.data;
  },

  chat: async (messages: Array<{ role: string; content: string }>, config?: Record<string, string>) => {
    const response = await api.post('/llm/chat', { messages, config });
    return response.data;
  },
};

// MBTI APIs
export const mbtiAPI = {
  analyze: async (answers: Array<{
    questionId: number;
    dimension: string;
    direction: string;
    value: number;
  }>, scores: { EI: number; SN: number; TF: number; JP: number }) => {
    const response = await api.post('/mbti/analyze', { answers, scores });
    return response.data;
  },

  save: async (data: {
    mbtiType: string;
    scores: { EI: number; SN: number; TF: number; JP: number };
    answers: Array<{
      questionId: number;
      dimension: string;
      direction: string;
      value: number;
    }>;
  }) => {
    const response = await api.post('/mbti/save', data);
    return response.data;
  },

  getHistory: async () => {
    const response = await api.get('/mbti/history');
    return response.data;
  },

  getById: async (id: number) => {
    const response = await api.get(`/mbti/history/${id}`);
    return response.data;
  },

  deleteResult: async (id: number) => {
    const response = await api.delete(`/mbti/history/${id}`);
    return response.data;
  },
};

// Impression APIs
export const impressionAPI = {
  getMyImpression: async (): Promise<UserImpression> => {
    const response = await api.get('/impression/me');
    return response.data;
  },

  getUserImpression: async (userId: number): Promise<UserProfile> => {
    const response = await api.get(`/impression/user/${userId}`);
    return response.data;
  },

  getUserProfile: async (userId: number): Promise<{ profile: string }> => {
    const response = await api.get(`/impression/user/${userId}/profile`);
    return response.data;
  },
};

// Friend Match APIs
export const friendMatchAPI = {
  getTopMatches: async (): Promise<{ matches: MatchedUser[] }> => {
    const response = await api.get('/friend-match/top');
    return response.data;
  },

  getPrivateInfo: async (): Promise<PrivateInfo> => {
    const response = await api.get('/friend-match/private-info');
    return response.data;
  },

  updatePrivateInfo: async (info: Partial<PrivateInfo>) => {
    const response = await api.put('/friend-match/private-info', info);
    return response.data;
  },

  sendWantToKnow: async (targetUserId: number) => {
    const response = await api.post('/friend-match/want-to-know', { targetUserId });
    return response.data;
  },

  getNotifications: async (): Promise<{ notifications: Notification[] }> => {
    const response = await api.get('/friend-match/notifications');
    return response.data;
  },

  getUnreadCount: async (): Promise<{ count: number }> => {
    const response = await api.get('/friend-match/notifications/unread-count');
    return response.data;
  },

  markNotificationsRead: async () => {
    const response = await api.put('/friend-match/notifications/read');
    return response.data;
  },

  addUser: async (targetUserId: number) => {
    const response = await api.post('/friend-match/add-user', { targetUserId });
    return response.data;
  },

  removeAddedUser: async (targetUserId: number) => {
    const response = await api.delete(`/friend-match/add-user/${targetUserId}`);
    return response.data;
  },

  blockUser: async (targetUserId: number) => {
    const response = await api.post('/friend-match/block-user', { targetUserId });
    return response.data;
  },

  unblockUser: async (targetUserId: number) => {
    const response = await api.delete(`/friend-match/block-user/${targetUserId}`);
    return response.data;
  },

  getAddedUsers: async (): Promise<{ users: AddedUser[] }> => {
    const response = await api.get('/friend-match/added-users');
    return response.data;
  },

  voteContact: async (targetUserId: number, vote: 'true' | 'false') => {
    const response = await api.post('/friend-match/contact-vote', { targetUserId, vote });
    return response.data;
  },

  getContactVotes: async (targetUserId: number): Promise<ContactVotes> => {
    const response = await api.get(`/friend-match/contact-votes/${targetUserId}`);
    return response.data;
  },

  refreshMatches: async (): Promise<{ message: string }> => {
    const response = await api.post('/friend-match/refresh');
    return response.data;
  },
};
