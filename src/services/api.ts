import axios from 'axios';
import { getServerUrl } from '../config/serverConfig';

const apiClient = axios.create({
  baseURL: getServerUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000, // 10 секунд таймаут
});

// Добавляем interceptor для обработки ошибок
apiClient.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

apiClient.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('API Response Error:', error);
    
    if (error.code === 'ECONNABORTED') {
      error.message = 'Превышено время ожидания запроса';
    } else if (error.response) {
      // Сервер ответил с ошибкой
      switch (error.response.status) {
        case 400:
          error.message = error.response.data?.detail || 'Неверный запрос';
          break;
        case 401:
          error.message = error.response.data?.detail || 'Ошибка авторизации';
          break;
        case 403:
          error.message = 'Доступ запрещен';
          break;
        case 404:
          error.message = 'Ресурс не найден';
          break;
        case 500:
          error.message = 'Внутренняя ошибка сервера';
          break;
        default:
          error.message = error.response.data?.detail || `Ошибка ${error.response.status}`;
      }
    } else if (error.request) {
      // Запрос был сделан, но ответ не получен
      if (error.code === 'ERR_NETWORK') {
        error.message = 'Сеть недоступна. Проверьте подключение к интернету.';
      } else {
        error.message = 'Не удалось подключиться к серверу';
      }
    } else {
      // Что-то случилось при настройке запроса
      error.message = 'Ошибка конфигурации запроса';
    }
    
    return Promise.reject(error);
  }
);

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
    try {
      const response = await apiClient.post('/login', data);
      return response.data;
    } catch (error: any) {
      console.error('Login error:', error);
      throw error;
    }
  },

  register: async (data: RegisterRequest): Promise<User> => {
    try {
      const response = await apiClient.post('/register', data);
      return response.data;
    } catch (error: any) {
      console.error('Register error:', error);
      throw error;
    }
  },
};

export default apiClient;