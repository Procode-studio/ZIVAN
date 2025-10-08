import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Загружаем переменные окружения
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        'my-types': path.resolve(__dirname, 'src/Desktop/types')
      }
    },
    server: {
      port: 3000,
      host: true,  // Для доступа по сети
      proxy: {
        '/api': {
          target: env.VITE_SERVER_URL || 'http://localhost:8000',
          changeOrigin: true,
          secure: false
        },
        '/login': {
          target: env.VITE_SERVER_URL || 'http://localhost:8000',
          changeOrigin: true,
          secure: false
        },
        '/register': {
          target: env.VITE_SERVER_URL || 'http://localhost:8000',
          changeOrigin: true,
          secure: false
        },
        '/users': {
          target: env.VITE_SERVER_URL || 'http://localhost:8000',
          changeOrigin: true,
          secure: false
        },
        '/get-username': {
          target: env.VITE_SERVER_URL || 'http://localhost:8000',
          changeOrigin: true,
          secure: false
        },
        '/messages': {
          target: env.VITE_SERVER_URL || 'http://localhost:8000',
          changeOrigin: true,
          secure: false
        }
      }
    }
  };
});