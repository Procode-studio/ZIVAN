import axios from 'axios';
import { getServerUrl } from '../config/serverConfig';  // Импорт



// Динамический baseURL: используем IP для сети, localhost для dev
const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') {
    // В браузере: проверяем hostname
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://localhost:8000'
      : 'http://192.168.0.181:8000';  // Твой IP компа (замени если изменился)
  }
  return 'http://localhost:8000';  // Для SSR/server-side
};

const API_BASE_URL = getApiBaseUrl();

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