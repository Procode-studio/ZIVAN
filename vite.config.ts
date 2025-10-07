import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
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
        target: 'http://192.168.0.181:8000',  // ← IP компа вместо localhost
        changeOrigin: true,
        secure: false
      },
      '/login': {  // Если логин без /api — добавь отдельно
        target: 'http://192.168.0.181:8000',
        changeOrigin: true,
        secure: false
      },
      '/register': {  // Аналогично для регистрации
        target: 'http://192.168.0.181:8000',
        changeOrigin: true,
        secure: false
      },
      '/users': {  // Для списка друзей
        target: 'http://192.168.0.181:8000',
        changeOrigin: true,
        secure: false
      },
      '/get-username': {  // Для профиля
        target: 'http://192.168.0.181:8000',
        changeOrigin: true,
        secure: false
      },
      '/messages': {  // Для чата
        target: 'http://192.168.0.181:8000',
        changeOrigin: true,
        secure: false
      }
    }
  }
});