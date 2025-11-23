import { useState, useEffect, useRef, useCallback } from 'react';
import { getWsUrl } from '../../config/serverConfig';

export interface WebSocketMessage {
    type: string;
    author: number;
    [key: string]: any;
}

interface UseWebSocketProps {
    userId: number;
    interlocutorId: number;
    onMessage: (data: WebSocketMessage) => void;
}

export const useWebSocket = ({ userId, interlocutorId, onMessage }: UseWebSocketProps) => {
    const [isConnected, setIsConnected] = useState(false);
    const [interlocutorOnline, setInterlocutorOnline] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const lastActivityRef = useRef<number>(0);
    const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const activityCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTypingSentRef = useRef<number>(0);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Используем ref для callback чтобы избежать переподключений
    const onMessageRef = useRef(onMessage);
    onMessageRef.current = onMessage;

    // Отправка сообщения с ожиданием подключения
    const sendMessage = useCallback((message: WebSocketMessage): boolean => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            try {
                wsRef.current.send(JSON.stringify(message));
                return true;
            } catch (e) {
                console.error('[WS] Send failed:', e);
                return false;
            }
        }
        console.warn('[WS] Not connected, message not sent');
        return false;
    }, []);

    // Асинхронная отправка с ожиданием подключения
    const sendMessageAsync = useCallback(async (message: WebSocketMessage, maxWait = 3000): Promise<boolean> => {
        const startTime = Date.now();

        while (Date.now() - startTime < maxWait) {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                try {
                    wsRef.current.send(JSON.stringify(message));
                    return true;
                } catch (e) {
                    console.error('[WS] Send failed:', e);
                    return false;
                }
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.warn('[WS] Timeout waiting for connection');
        return false;
    }, []);

    const sendTyping = useCallback(() => {
        const now = Date.now();
        if (now - lastTypingSentRef.current > 2000) {
            if (sendMessage({ type: 'typing', author: userId })) {
                lastTypingSentRef.current = now;
            }
        }
    }, [userId, sendMessage]);

    useEffect(() => {
        if (interlocutorId === -1 || userId === -1) {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            setIsConnected(false);
            setInterlocutorOnline(false);
            return;
        }

        const id1 = Math.min(userId, interlocutorId);
        const id2 = Math.max(userId, interlocutorId);
        const wsUrl = `${getWsUrl()}/me/ws/${id1}/${id2}?current_user=${userId}`;
        let isIntentionallyClosed = false;

        const cleanup = () => {
            if (pingIntervalRef.current) {
                clearInterval(pingIntervalRef.current);
                pingIntervalRef.current = null;
            }
            if (activityCheckRef.current) {
                clearInterval(activityCheckRef.current);
                activityCheckRef.current = null;
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
        };

        const connect = () => {
            if (isIntentionallyClosed) return;

            // Не создаем новое соединение если уже есть открытое
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                return;
            }

            try {
                console.log('[WS] Connecting to:', wsUrl);
                const ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    console.log('[WS] Connected');
                    wsRef.current = ws;
                    setIsConnected(true);
                    lastActivityRef.current = Date.now();

                    pingIntervalRef.current = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'ping', author: userId }));
                        }
                    }, 5000);

                    activityCheckRef.current = setInterval(() => {
                        const timeSinceLastActivity = Date.now() - lastActivityRef.current;
                        setInterlocutorOnline(timeSinceLastActivity < 15000);
                    }, 3000);

                    ws.send(JSON.stringify({ type: 'read', author: userId }));
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data) as WebSocketMessage;
                        console.log('[WS] Received:', data.type, 'from:', data.author);

                        if (data.author !== userId) {
                            lastActivityRef.current = Date.now();
                            setInterlocutorOnline(true);
                        }

                        if (data.type === 'ping' && data.author !== userId) {
                            ws.send(JSON.stringify({ type: 'pong', author: userId }));
                        } else if (data.type === 'typing' && data.author !== userId) {
                            setIsTyping(true);
                            if (typingTimeoutRef.current) {
                                clearTimeout(typingTimeoutRef.current);
                            }
                            typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
                        }

                        // Используем ref чтобы всегда иметь актуальный callback
                        onMessageRef.current(data);
                    } catch (e) {
                        console.error('[WS] Parse error:', e);
                    }
                };

                ws.onerror = () => {
                    console.error('[WS] Error');
                };

                ws.onclose = () => {
                    console.log('[WS] Connection closed');

                    // Очищаем ref только если это текущее соединение
                    if (wsRef.current === ws) {
                        wsRef.current = null;
                        setIsConnected(false);
                    }

                    cleanup();

                    if (!isIntentionallyClosed) {
                        console.log('[WS] Reconnecting in 2s...');
                        reconnectTimeoutRef.current = setTimeout(connect, 2000);
                    }
                };
            } catch (err) {
                console.error('[WS] Connection error:', err);
                if (!isIntentionallyClosed) {
                    reconnectTimeoutRef.current = setTimeout(connect, 2000);
                }
            }
        };

        connect();

        return () => {
            isIntentionallyClosed = true;
            cleanup();
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            setIsConnected(false);
            setInterlocutorOnline(false);
        };
    }, [userId, interlocutorId]); // Убрали onMessage из зависимостей!

    return {
        isConnected,
        interlocutorOnline,
        isTyping,
        sendMessage,
        sendMessageAsync,
        sendTyping,
        wsRef
    };
};
