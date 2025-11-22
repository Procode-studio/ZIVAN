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
        console.log('[TURN] Fetching credentials from server...');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 секунд таймаут

        const response = await fetch(`${getServerUrl()}/turn-credentials`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json() as TurnCredentials;
        console.log('[TURN] Received config:', {
            hasUsername: !!data.username,
            hasPassword: !!data.password,
            urisCount: data.uris?.length || 0,
            ttl: data.ttl
        });

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
        console.log('[TURN] STUN servers:', allStunUris.length);

        // Добавляем TURN если есть credentials
        if (turnUris.length > 0 && data.username && data.password) {
            iceServers.push({
                urls: turnUris,
                username: String(data.username),
                credential: String(data.password)
            });
            console.log('[TURN] ✅ TURN enabled with', turnUris.length, 'servers');
        } else {
            console.log('[TURN] ⚠️ TURN not available (no credentials or URIs)');
        }

        return iceServers;
    } catch (error) {
        if (error instanceof Error) {
            if (error.name === 'AbortError') {
                console.warn('[TURN] ⚠️ Request timeout, using STUN only');
            } else {
                console.warn('[TURN] ⚠️ Error:', error.message, '- using STUN only');
            }
        }
        return [{ urls: FALLBACK_STUN_SERVERS }];
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

    const validated = servers.filter(server => {
        if (!server.urls) return false;

        const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        return urls.length > 0 && urls.every(u => typeof u === 'string' && u.length > 0);
    });

    if (validated.length === 0) {
        console.warn('[TURN] No valid servers after validation, using fallback');
        return [{ urls: FALLBACK_STUN_SERVERS }];
    }

    return validated;
};