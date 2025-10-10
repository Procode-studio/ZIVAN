export const getServerUrl = (): string => {
  return 'https://zivan.duckdns.org';
  
  // Используем переменную окружения из .env
  // return import.meta.env.VITE_SERVER_URL || 'http://localhost:8000';
};

export const getWsUrl = (): string => {
  const base = getServerUrl();
  const protocol = base.startsWith('https') ? 'wss' : 'ws';
  const url = new URL(base);
  return `${protocol}://${url.host}`;
};