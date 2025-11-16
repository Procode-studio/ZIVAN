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
    const wsRef = useRef<WebSocket | null>(null);
    const lastActivityRef = useRef<number>(0);
    const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const activityCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const sendMessage = useCallback((message: WebSocketMessage) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(message));
            return true;
        }
        return false;
    }, []);

    const updateActivity = useCallback(() => {
        lastActivityRef.current = Date.now();
        setInterlocutorOnline(true);
    }, []);

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
        const wsUrl = `${getWsUrl()}/me/ws/${id1}/${id2}`;
        let isIntentionallyClosed = false;

        const connect = () => {
            try {
                const ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    console.log('[WS] Connected');
                    wsRef.current = ws;
                    setIsConnected(true);
                    lastActivityRef.current = Date.now();

                    // Ping interval
                    pingIntervalRef.current = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'ping', author: userId }));
                        }
                    }, 5000);

                    // Activity check
                    activityCheckRef.current = setInterval(() => {
                        const timeSinceLastActivity = Date.now() - lastActivityRef.current;
                        setInterlocutorOnline(timeSinceLastActivity < 15000);
                    }, 3000);

                    // Send read notification
                    ws.send(JSON.stringify({ type: 'read', author: userId }));
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data) as WebSocketMessage;

                        if (data.author !== userId) {
                            updateActivity();
                        }

                        if (data.type === 'ping' && data.author !== userId) {
                            ws.send(JSON.stringify({ type: 'pong', author: userId }));
                        }

                        onMessage(data);
                    } catch (e) {
                        console.error('[WS] Failed to parse message:', e);
                    }
                };

                ws.onerror = () => {
                    console.error('[WS] Error');
                    setIsConnected(false);
                    setInterlocutorOnline(false);
                };

                ws.onclose = () => {
                    console.log('[WS] Disconnected');
                    if (wsRef.current === ws) {
                        wsRef.current = null;
                    }
                    setIsConnected(false);
                    setInterlocutorOnline(false);

                    if (pingIntervalRef.current) {
                        clearInterval(pingIntervalRef.current);
                        pingIntervalRef.current = null;
                    }
                    if (activityCheckRef.current) {
                        clearInterval(activityCheckRef.current);
                        activityCheckRef.current = null;
                    }

                    if (!isIntentionallyClosed) {
                        setTimeout(connect, 3000);
                    }
                };
            } catch (err) {
                console.error('[WS] Connection failed:', err);
                setIsConnected(false);
                setInterlocutorOnline(false);
            }
        };

        connect();

        return () => {
            isIntentionallyClosed = true;
            if (pingIntervalRef.current) {
                clearInterval(pingIntervalRef.current);
            }
            if (activityCheckRef.current) {
                clearInterval(activityCheckRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [userId, interlocutorId, onMessage, updateActivity]);

    return {
        isConnected,
        interlocutorOnline,
        sendMessage,
        wsRef
    };
};