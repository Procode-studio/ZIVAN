export const getServerUrl = (): string => {
  // Используем переменную окружения из .env
  return import.meta.env.VITE_SERVER_URL || 'http://localhost:8000';
};

export const getWsUrl = (path: string): string => {
  const base = getServerUrl();
  const protocol = base.startsWith('https') ? 'wss' : 'ws';
  const port = base.includes(':8000') ? ':8000' : '';
  const host = new URL(base).host;
  return `${protocol}://${host}${port}${path}`;
};