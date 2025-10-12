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

export async function getTurnServers(): Promise<RTCIceServer[]> {
  try {
    // Проверяем, нужно ли обновить credentials
    const now = Date.now() / 1000;
    if (!turnCredentials || now >= credentialsExpiry) {
      const response = await fetch(`${getServerUrl()}/turn-credentials`);
      const data = await response.json();
      
      turnCredentials = data;
      credentialsExpiry = now + (data.ttl || 3600);
    }

    // Возвращаем STUN + TURN серверы
    return [
      ...STUN_SERVERS,
      ...turnCredentials.uris.map((uri: string) => ({
        urls: uri,
        username: turnCredentials.username,
        credential: turnCredentials.password,
        credentialType: 'password'
      }))
    ];
  } catch (error) {
    console.warn('Failed to get TURN credentials, using STUN only:', error);
    // В случае ошибки используем только STUN серверы
    return STUN_SERVERS;
  }
}
