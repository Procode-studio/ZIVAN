import { getServerUrl } from './serverConfig';

export interface TurnCredentials {
    username: string;
    password: string;
    ttl: number;
    realm: string;
    uris: string[];
}

// Fallback STUN серверы (всегда доступны)
const FALLBACK_STUN_SERVERS = [
    'stun:stun.l.google.com:19302',
    'stun:stun1.l.google.com:19302',
    'stun:stun2.l.google.com:19302',
];

/**
 * Получает TURN credentials с сервера
 * TURN нужен для NAT traversal (когда прямое соединение невозможно)
 */
export const getTurnServers = async (): Promise<RTCIceServer[]> => {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(`${getServerUrl()}/turn-credentials`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json() as TurnCredentials;

        const iceServers: RTCIceServer[] = [];

        // Разделяем STUN и TURN URIs
        const stunUris: string[] = [];
        const turnUris: string[] = [];

        if (data.uris && Array.isArray(data.uris)) {
            data.uris.forEach(uri => {
                if (typeof uri === 'string') {
                    if (uri.startsWith('stun:')) {
                        stunUris.push(uri);
                    } else if (uri.startsWith('turn:') || uri.startsWith('turns:')) {
                        turnUris.push(uri);
                    }
                }
            });
        }

        // Добавляем STUN серверы (свои + fallback)
        const allStunUris = [...new Set([...stunUris, ...FALLBACK_STUN_SERVERS])];
        iceServers.push({ urls: allStunUris });

        // Добавляем TURN если есть credentials
        if (turnUris.length > 0 && data.username && data.password) {
            iceServers.push({
                urls: turnUris,
                username: String(data.username),
                credential: String(data.password)
            });
        }

        return iceServers;
    } catch (error) {
        // Fallback to STUN only
        return [{ urls: FALLBACK_STUN_SERVERS }];
    }
};

/**
 * Валидирует RTCIceServer конфигурацию
 */
export const validateIceServers = (servers: RTCIceServer[]): RTCIceServer[] => {
    if (!Array.isArray(servers) || servers.length === 0) {
        return [{ urls: FALLBACK_STUN_SERVERS }];
    }

    const validated = servers.filter(server => {
        if (!server.urls) return false;
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        return urls.length > 0 && urls.every(u => typeof u === 'string' && u.length > 0);
    });

    return validated.length > 0 ? validated : [{ urls: FALLBACK_STUN_SERVERS }];
};