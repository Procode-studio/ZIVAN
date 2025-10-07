export const getServerUrl = (): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8000';
    }
    return 'https://176.58.60.22';  // Твой VPS
  }
  return 'http://localhost:8000';
};

export const getWsUrl = (path: string): string => {
  const base = getServerUrl();
  const protocol = base.startsWith('https') ? 'wss' : 'ws';
  const port = base.includes(':8000') ? ':8000' : '';
  const host = base.split('://')[1].split(':')[0];
  return `${protocol}://${host}${port}${path}`;
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