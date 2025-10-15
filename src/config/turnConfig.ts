import { getServerUrl } from './serverConfig';

// STUN серверы (безопасны для публичного использования)
const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

// Кэш для TURN credentials
let turnCredentials: any = null;
let credentialsExpiry = 0;
let isFetching = false;

export async function getTurnServers(): Promise<RTCIceServer[]> {
  try {
    // Проверяем, нужно ли обновить credentials
    const now = Date.now() / 1000;
    if (!turnCredentials || now >= credentialsExpiry) {
      // Предотвращаем множественные запросы
      if (isFetching) {
        // Ждем завершения текущего запроса
        while (isFetching) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        return turnCredentials ? [
          ...STUN_SERVERS,
          ...turnCredentials.uris.map((uri: string) => ({
            urls: uri,
            username: turnCredentials.username,
            credential: turnCredentials.password,
            credentialType: 'password'
          }))
        ] : STUN_SERVERS;
      }

      isFetching = true;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 секунд таймаут

        const response = await fetch(`${getServerUrl()}/turn-credentials`, {
          signal: controller.signal,
          mode: 'cors',
          credentials: 'omit'
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        turnCredentials = data;
        credentialsExpiry = now + (data.ttl || 3600);
      } finally {
        isFetching = false;
      }
    }

    // Возвращаем STUN + TURN серверы
    if (turnCredentials && turnCredentials.uris && turnCredentials.uris.length > 0) {
      return [
        ...STUN_SERVERS,
        ...turnCredentials.uris.map((uri: string) => ({
          urls: uri,
          username: turnCredentials.username,
          credential: turnCredentials.password,
          credentialType: 'password'
        }))
      ];
    }
  } catch (error: any) {
    console.warn('Failed to get TURN credentials, using STUN only:', error);
    
    // Сбрасываем кэш при ошибке
    turnCredentials = null;
    credentialsExpiry = 0;
    
    // В случае ошибки используем только STUN серверы
    return STUN_SERVERS;
  }
  
  return STUN_SERVERS;
}
