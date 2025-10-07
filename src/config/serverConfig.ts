export const getServerUrl = (): string => {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8000'; 
    } else if (hostname === '192.168.0.181') { 
      return 'http://192.168.0.181:8000';
    } else {
      return 'https://zivan.ddns.net/';
    }
  }
  return 'http://localhost:8000';
};

export const getWsUrl = (path: string): string => {
  const base = getServerUrl();
  const protocol = base.startsWith('https') ? 'wss' : 'ws';
  const port = base.includes(':8000') ? ':8000' : '';
  const host = new URL(base).host;
  return `${protocol}://${host}${port}${path}`;
};
