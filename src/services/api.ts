import axios from 'axios';
import { getServerUrl } from '../config/serverConfig';

const apiClient = axios.create({
  baseURL: getServerUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Interceptor для обработки ошибок (без логов успешных запросов)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Обработка ошибок без логирования
    if (error.code === 'ECONNABORTED') {
      error.message = 'Превышено время ожидания запроса';
    } else if (error.response) {
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
      if (error.code === 'ERR_NETWORK') {
        error.message = 'Сеть недоступна. Проверьте подключение к интернету.';
      } else {
        error.message = 'Не удалось подключиться к серверу';
      }
    } else {
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
    const response = await apiClient.post('/login', data);
    return response.data;
  },

  register: async (data: RegisterRequest): Promise<User> => {
    const response = await apiClient.post('/register', data);
    return response.data;
  },
};

export default apiClient;