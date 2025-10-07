// src/config/serverConfig.ts
// Конфиг для адреса сервера (бэка). Легко менять для dev/prod.

export const getServerUrl = (): string => {
  if (typeof window !== 'undefined') {
    // В браузере: проверяем hostname для динамики
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8000';  // Dev: локальный сервер
    } else if (hostname === '192.168.0.181') {  // Твой локальный IP (для теста с телефона)
      return 'http://192.168.0.181:8000';
    } else {
      // Prod: VPS или Render (замени на свой)
      return 'https://твой-vps-domain.com';  // Или 'https://simple-messenger-server.onrender.com'
    }
  }
  return 'http://localhost:8000';  // Fallback для SSR
};

// Для WS (WebSocket) — добавь wss:// для HTTPS в проде
export const getWsUrl = (path: string): string => {
  const base = getServerUrl();
  const protocol = base.startsWith('https') ? 'wss' : 'ws';
  const port = base.includes(':8000') ? ':8000' : '';
  return `${protocol}://${base.split('://')[1].split(':')[0]}${port}${path}`;
};

// Экспорт для удобства
export const SERVER_URL = getServerUrl();
export const WS_BASE = getWsUrl('/me/ws/');