const isDevelopment = process.env.NODE_ENV === 'development' || 
                      window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';

const PROD_SERVER = 'https://zivan.duckdns.org';
const DEV_SERVER = 'http://localhost:8000';

export const getServerUrl = (): string => {
  // Если на Vercel или в production - всегда используй prod сервер
  if (window.location.hostname.includes('vercel.app') || 
      window.location.hostname === 'zivan.vercel.app') {
    return PROD_SERVER;
  }
  
  return isDevelopment ? DEV_SERVER : PROD_SERVER;
};

export const getWsUrl = (): string => {
  const server = getServerUrl();
  return server.replace('http://', 'ws://').replace('https://', 'wss://');
};

export const logServerConfig = () => {
  console.log('Server Config:', {
    environment: isDevelopment ? 'development' : 'production',
    hostname: window.location.hostname,
    serverUrl: getServerUrl(),
    wsUrl: getWsUrl()
  });
};