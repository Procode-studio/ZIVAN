// src/config/turnConfig.ts
import { getServerUrl } from './serverConfig';

export interface TurnCredentials {
  username: string;
  password: string;
  ttl: number;
  realm: string;
  uris: string[];
}

export const getTurnServers = async (): Promise<RTCIceServer[]> => {
  try {
    const response = await fetch(`${getServerUrl()}/turn-credentials`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: TurnCredentials = await response.json();
    
    console.log('TURN credentials received:', {
      username: data.username,
      uris: data.uris
    });

    // Формируем конфигурацию ICE серверов
    const iceServers: RTCIceServer[] = [
      // Публичные STUN серверы как запасной вариант
      {
        urls: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302'
        ]
      }
    ];

    // Добавляем TURN сервер если credentials получены
    if (data.uris && data.uris.length > 0) {
      iceServers.push({
        urls: data.uris,
        username: data.username,
        credential: data.password
      });
    }

    return iceServers;
  } catch (error) {
    console.error('Failed to get TURN credentials, using STUN only:', error);
    
    // Возвращаем только STUN сервера в случае ошибки
    return [
      {
        urls: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302'
        ]
      }
    ];
  }
};