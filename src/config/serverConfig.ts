// Server configuration functions
export function getServerUrl(): string {
  // Check if we have an explicit environment variable
  if (import.meta.env.VITE_SERVER_URL) {
    return import.meta.env.VITE_SERVER_URL;
  }
  
  // In production, use the production URL
  if (import.meta.env.PROD) {
    return 'https://zivan.duckdns.org';
  }
  
  // In development, use localhost
  return 'http://localhost:8000';
}

export function getWsUrl(): string {
  // Check if we have an explicit environment variable
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  
  // In production, use the production WebSocket URL
  if (import.meta.env.PROD) {
    return 'wss://zivan.duckdns.org';
  }
  
  // In development, use localhost WebSocket
  return 'ws://localhost:8000';
}

// Debug function to log current configuration
export function logServerConfig(): void {
  console.log('getServerUrl() returning:', getServerUrl());
  console.log('Environment:', import.meta.env.MODE);
  console.log('VITE_SERVER_URL:', import.meta.env.VITE_SERVER_URL);
  console.log('VITE_WS_URL:', import.meta.env.VITE_WS_URL);
}