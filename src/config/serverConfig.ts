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
      return 'https://176.58.60.22';  // Твой VPS IP
    }
  }
  return 'http://localhost:8000';  // Fallback для SSR
};

// Для WS (WebSocket) — wss:// для HTTPS в проде (одна функция, без дублей)
export const getWsUrl = (path: string): string => {
  const base = getServerUrl();
  const protocol = base.startsWith('https') ? 'wss' : 'ws';
  const port = base.includes(':8000') ? ':8000' : '';
  const host = new URL(base).host;  // Безопасно извлекаем host
  return `${protocol}://${host}${port}${path}`;
};