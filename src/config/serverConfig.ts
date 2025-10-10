export const getServerUrl = (): string => {
  // Временное решение для проверки
  const url = 'https://zivan.duckdns.org';
  console.log('getServerUrl() returning:', url);
  console.log('Server URL:', url);
  return url;
  
  // Используем переменную окружения из .env
  // return import.meta.env.VITE_SERVER_URL || 'http://localhost:8000';
};

export const getWsUrl = (): string => {
  const base = getServerUrl();
  const protocol = base.startsWith('https') ? 'wss' : 'ws';
  const url = new URL(base);
  return `${protocol}://${url.host}`;
};