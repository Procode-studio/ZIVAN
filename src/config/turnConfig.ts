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
    'stun:stun3.l.google.com:19302',
    'stun:stun4.l.google.com:19302',
];

/**
 * Получает TURN credentials с сервера
 * TURN нужен для NAT traversal (когда прямое соединение невозможно)
 */
export const getTurnServers = async (): Promise<RTCIceServer[]> => {
    try {
        console.log('[TURN] Fetching credentials...');

        // БЕЗ timeout - просто делай запрос
        const response = await fetch(`${getServerUrl()}/turn-credentials`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json() as TurnCredentials;

        const iceServers: RTCIceServer[] = [];

        // Сначала STUN
        iceServers.push({
            urls: FALLBACK_STUN_SERVERS
        });

        // Потом TURN если есть
        if (data.uris && Array.isArray(data.uris) && data.uris.length > 0) {
            if (data.username && data.password) {
                const sanitizedUris = data.uris.filter(uri => {
                    return typeof uri === 'string' && /^turns?:/.test(uri);
                });

                if (sanitizedUris.length > 0) {
                    iceServers.push({
                        urls: sanitizedUris,
                        username: String(data.username),
                        credential: String(data.password)
                    });
                    console.log('[TURN] ✅ Loaded with TURN');
                }
            }
        }

        return iceServers;
    } catch (error) {
        console.warn('[TURN] Using STUN only');
        return [
            {
                urls: FALLBACK_STUN_SERVERS
            }
        ];
    }
};

/**
 * Валидирует RTCIceServer конфигурацию
 */
export const validateIceServers = (servers: RTCIceServer[]): RTCIceServer[] => {
    if (!Array.isArray(servers) || servers.length === 0) {
        console.warn('[TURN] Invalid servers array, using fallback STUN');
        return [{ urls: FALLBACK_STUN_SERVERS }];
    }

    return servers.filter(server => {
        if (!server.urls) return false;
        
        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        return urls.length > 0 && urls.every(u => typeof u === 'string');
    });
};