import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Загружаем переменные окружения
  const env = loadEnv(mode, process.cwd(), '');
  
  // Определяем базовый URL для прокси в зависимости от режима
  const proxyTarget = mode === 'production' 
    ? (env.VITE_SERVER_URL || 'https://zivan.duckdns.org')
    : (env.VITE_SERVER_URL || 'http://localhost:8000');
  
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
          target: proxyTarget,
          changeOrigin: true,
          secure: false
        },
        '/login': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false
        },
        '/register': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false
        },
        '/users': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false
        },
        '/get-username': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false
        },
        '/messages': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false
        }
      }
    }
  };
});