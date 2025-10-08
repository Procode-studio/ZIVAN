import axios from 'axios';
import { getServerUrl } from '../config/serverConfig';  // Импорт

const apiClient = axios.create({
  baseURL: getServerUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Типы для API
export interface LoginRequest {
  phone: string;
  password: string;
}

export interface RegisterRequest {
  phone: string;
  name: string;
  password: string;
}

export interface User {
  id: number;
  phone: string;
  name: string;
}

// API функции
export const authAPI = {
  login: async (data: LoginRequest): Promise<User> => {
    const response = await apiClient.post('/login', data);
    return response.data;
  },

  register: async (data: RegisterRequest): Promise<User> => {
    const response = await apiClient.post('/register', data);
    return response.data;
  },
};

export default apiClient;