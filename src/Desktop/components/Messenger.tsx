import {
    CircularProgress,
    IconButton,
    TextField,
    Avatar,
    Box,
    Typography
} from "@mui/material";
import { useState, useRef, useContext, useEffect, useCallback } from "react";
import { MessageType } from 'my-types/Message';
import SendIcon from '@mui/icons-material/Send';
import PhoneIcon from '@mui/icons-material/Phone';
import VideocamIcon from '@mui/icons-material/Videocam';
import CheckIcon from '@mui/icons-material/Check';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { MessengerInterlocutorId } from "../pages/MessengerPage";
import { UserInfoContext } from "../../App";
import axios from "axios";
import { getServerUrl, getWsUrl } from '../../config/serverConfig';
import { useWebRTC, CallStatus } from '../hooks/useWebRTC';
import CallDialog from './CallDialog';
import IncomingCallDialog from './IncomingCallDialog';
import './messenger.css';

const theme = {
    bg: {
        primary: '#0f0f1a',
        secondary: '#1a1a2e',
        tertiary: '#16213e',
        message: {
            own: '#4CAF50',
            other: 'rgba(255,255,255,0.1)'
        }
    },
    text: {
        primary: '#ffffff',
        secondary: 'rgba(255,255,255,0.7)',
        muted: 'rgba(255,255,255,0.5)'
    },
    accent: '#4CAF50',
    border: 'rgba(76, 175, 80, 0.2)'
};

interface ExtendedMessage extends MessageType {
    is_read: boolean;
}

export default function Messenger() {
    const interlocutorId = useContext(MessengerInterlocutorId);
    const inputRef = useRef<HTMLInputElement>(null);
    const user = useContext(UserInfoContext);
    const user_id = user.userInfo.user_id;

    const [messages, setMessages] = useState<ExtendedMessage[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const messagesBlockRef = useRef<HTMLDivElement>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const [wsConnected, setWsConnected] = useState(false);
    const [interlocutorName, setInterlocutorName] = useState('');
    const [interlocutorOnline, setInterlocutorOnline] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const lastActivityTimeRef = useRef<number>(0);
    const activityCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTypingSentRef = useRef<number>(0);

    // WebSocket message sender
    const sendWsMessage = useCallback((msg: any) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(msg));
            return true;
        }
        return false;
    }, []);

    // WebRTC hook
    const {
        callStatus,
        isVideoEnabled,
        isAudioEnabled,
        localStream,
        remoteStream,
        callDuration,
        incomingCallVideo,
        pendingOfferRef,
        startCall,
        answerCall,
        hangup,
        toggleAudio,
        toggleVideo,
        handleSignalingMessage,
        declineCall
    } = useWebRTC({ userId: user_id, sendWsMessage });

    // Load interlocutor name
    useEffect(() => {
        if (interlocutorId === -1) {
            setInterlocutorName('');
            return;
        }

        const controller = new AbortController();
        axios.get(`${getServerUrl()}/users/${interlocutorId}`, {
            signal: controller.signal
        })
            .then(res => {
                if (res.data?.name) {
                    setInterlocutorName(res.data.name);
                }
            })
            .catch(err => {
                if (!axios.isCancel(err)) {
                    console.error('[Profile] Failed to load:', err);
                    setInterlocutorName(`User #${interlocutorId}`);
                }
            });

        return () => controller.abort();
    }, [interlocutorId]);

    // Load messages
    useEffect(() => {
        if (interlocutorId === -1) {
            setMessages([]);
            setIsLoaded(true);
            return;
        }

        setIsLoaded(false);
        const controller = new AbortController();
        const id1 = Math.min(user_id, interlocutorId);
        const id2 = Math.max(user_id, interlocutorId);

        axios.get(`${getServerUrl()}/messages/${id1}/${id2}`, {
            signal: controller.signal
        })
            .then(res => {
                const data = (res.data || []).map((m: any) => ({
                    id: m.id,
                    text: m.text,
                    author: m.author,
                    message_type: 'text',
                    is_read: m.author === user_id,
                    created_at: m.created_at || new Date().toISOString()
                }));
                setMessages(data);
                setIsLoaded(true);
                setTimeout(() => {
                    messagesBlockRef.current?.scrollTo(0, messagesBlockRef.current?.scrollHeight || 0);
                }, 10);
            })
            .catch(err => {
                if (!axios.isCancel(err)) {
                    console.error('[Messages] Failed to load:', err);
                }
                setIsLoaded(true);
            });

        return () => controller.abort();
    }, [user_id, interlocutorId]);

    const sendMessage = useCallback(() => {
        if (!inputRef.current || interlocutorId === -1 || !wsRef.current) return;
        const text = inputRef.current.value.trim();
        if (!text) return;

        const id1 = Math.min(user_id, interlocutorId);
        const id2 = Math.max(user_id, interlocutorId);

        if (wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'message',
                user_id1: id1,
                user_id2: id2,
                text,
                author: user_id
            }));
            inputRef.current.value = '';
        }
    }, [interlocutorId, user_id]);

    // WebSocket connection
    useEffect(() => {
        if (interlocutorId === -1 || !user_id || user_id === -1) {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            setWsConnected(false);
            setInterlocutorOnline(false);
            return;
        }

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            return;
        }

        const id1 = Math.min(user_id, interlocutorId);
        const id2 = Math.max(user_id, interlocutorId);
        const wsUrl = `${getWsUrl()}/me/ws/${id1}/${id2}?current_user=${user_id}`;

        let reconnectTimeout: ReturnType<typeof setTimeout>;
        let isIntentionallyClosed = false;
        let pingInterval: ReturnType<typeof setInterval>;

        const connect = () => {
            try {
                console.log('[WS] Connecting to:', wsUrl);
                const ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    console.log('[WS] Connected');
                    wsRef.current = ws;
                    setWsConnected(true);
                    lastActivityTimeRef.current = Date.now();

                    pingInterval = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'ping', author: user_id }));
                        }
                    }, 5000);

                    if (activityCheckIntervalRef.current) {
                        clearInterval(activityCheckIntervalRef.current);
                    }
                    activityCheckIntervalRef.current = setInterval(() => {
                        const timeSinceLastActivity = Date.now() - lastActivityTimeRef.current;
                        const isOnline = timeSinceLastActivity < 15000;
                        setInterlocutorOnline(isOnline);
                    }, 3000);

                    ws.send(JSON.stringify({ type: 'read', author: user_id }));
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        const type = data.type || 'message';

                        if (data.author !== user_id) {
                            lastActivityTimeRef.current = Date.now();
                            setInterlocutorOnline(true);
                        }

                        if (type === 'pong' && data.author !== user_id) {
                            lastActivityTimeRef.current = Date.now();
                            setInterlocutorOnline(true);
                        } else if (type === 'ping' && data.author !== user_id) {
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({ type: 'pong', author: user_id }));
                            }
                        } else if (type === 'message') {
                            setMessages(prev => [...prev, {
                                id: Date.now(),
                                text: data.text,
                                author: data.author,
                                message_type: 'text',
                                is_read: data.author === user_id,
                                created_at: new Date().toISOString()
                            }]);

                            if (data.author !== user_id && ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({ type: 'read', author: user_id }));
                            }

                            setTimeout(() => {
                                messagesBlockRef.current?.scrollTo(0, messagesBlockRef.current?.scrollHeight || 0);
                            }, 10);
                        } else if (type === 'read') {
                            setMessages(prev => prev.map(m =>
                                m.author === user_id ? { ...m, is_read: true } : m
                            ));
                        } else if (type === 'typing' && data.author !== user_id) {
                            setIsTyping(true);
                            if (typingTimeoutRef.current) {
                                clearTimeout(typingTimeoutRef.current);
                            }
                            typingTimeoutRef.current = setTimeout(() => {
                                setIsTyping(false);
                            }, 3000);
                        } else if (['offer', 'answer', 'ice-candidate', 'hangup'].includes(type)) {
                            handleSignalingMessage(data);
                        }
                    } catch (e) {
                        console.error('[WS] Message parsing error:', e);
                    }
                };

                ws.onerror = (err) => {
                    console.error('[WS] Error:', err);
                    setWsConnected(false);
                    setInterlocutorOnline(false);
                };

                ws.onclose = () => {
                    console.log('[WS] Connection closed');
                    if (wsRef.current === ws) {
                        wsRef.current = null;
                    }
                    setWsConnected(false);
                    setInterlocutorOnline(false);
                    clearInterval(pingInterval);
                    if (activityCheckIntervalRef.current) {
                        clearInterval(activityCheckIntervalRef.current);
                        activityCheckIntervalRef.current = null;
                    }

                    if (callStatus !== CallStatus.IDLE) {
                        console.log('[WS] Terminating call due to disconnect');
                        hangup();
                    }

                    if (!isIntentionallyClosed) {
                        console.log('[WS] Reconnecting in 3s...');
                        reconnectTimeout = setTimeout(connect, 3000);
                    }
                };
            } catch (err) {
                console.error('[WS] Connection error:', err);
                setWsConnected(false);
                setInterlocutorOnline(false);
            }
        };

        connect();

        return () => {
            isIntentionallyClosed = true;
            clearTimeout(reconnectTimeout);
            clearInterval(pingInterval);
            if (activityCheckIntervalRef.current) {
                clearInterval(activityCheckIntervalRef.current);
                activityCheckIntervalRef.current = null;
            }
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [user_id, interlocutorId, handleSignalingMessage, callStatus, hangup]);

    const getStatusText = () => {
        if (callStatus === CallStatus.CALLING) return 'Вызов...';
        if (callStatus === CallStatus.RINGING) return 'Входящий вызов';
        if (callStatus === CallStatus.CONNECTED) {
            const mins = Math.floor(callDuration / 60);
            const secs = callDuration % 60;
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        if (isTyping) return 'печатает...';
        if (interlocutorOnline) return 'в сети';
        return 'не в сети';
    };

    const getStatusColor = () => {
        if (callStatus === CallStatus.CALLING || callStatus === CallStatus.RINGING) return '#FFA726';
        if (callStatus === CallStatus.CONNECTED) return '#EF5350';
        if (isTyping) return '#29B6F6';
        if (interlocutorOnline) return '#4CAF50';
        return '#757575';
    };

    const sendTyping = useCallback(() => {
        const now = Date.now();
        if (now - lastTypingSentRef.current > 2000 && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'typing', author: user_id }));
            lastTypingSentRef.current = now;
        }
    }, [user_id]);

    return (
        <Box sx={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            background: `linear-gradient(180deg, ${theme.bg.secondary} 0%, ${theme.bg.tertiary} 100%)`,
            overflow: 'hidden'
        }}>
            {/* Header */}
            {isLoaded && interlocutorId !== -1 && (
                <Box sx={{
                    p: 2,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: theme.bg.primary,
                    borderBottom: `1px solid ${theme.border}`
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ position: 'relative' }}>
                            <Avatar sx={{
                                width: 44,
                                height: 44,
                                bgcolor: theme.accent,
                                fontSize: '1.1rem',
                                fontWeight: 600
                            }}>
                                {interlocutorName[0]?.toUpperCase() || '?'}
                            </Avatar>
                            {interlocutorOnline && callStatus === CallStatus.IDLE && !isTyping && (
                                <Box sx={{
                                    position: 'absolute',
                                    bottom: 0,
                                    right: 0,
                                    width: 12,
                                    height: 12,
                                    bgcolor: theme.accent,
                                    borderRadius: '50%',
                                    border: `2px solid ${theme.bg.primary}`
                                }} />
                            )}
                        </Box>
                        <Box>
                            <Typography sx={{ fontWeight: 600, color: theme.text.primary, fontSize: '1rem' }}>
                                {interlocutorName}
                            </Typography>
                            <Typography sx={{ color: getStatusColor(), fontSize: '0.8rem' }}>
                                {getStatusText()}
                            </Typography>
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        {callStatus === CallStatus.IDLE && (
                            <>
                                <IconButton onClick={() => startCall(false)} sx={{ color: theme.accent }}>
                                    <PhoneIcon />
                                </IconButton>
                                <IconButton onClick={() => startCall(true)} sx={{ color: theme.accent }}>
                                    <VideocamIcon />
                                </IconButton>
                            </>
                        )}
                    </Box>
                </Box>
            )}

            {/* Content */}
            {!isLoaded ? (
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CircularProgress sx={{ color: theme.accent }} />
                </Box>
            ) : interlocutorId === -1 ? (
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography sx={{ color: theme.text.muted, fontSize: '1.2rem' }}>
                        Выберите собеседника
                    </Typography>
                </Box>
            ) : (
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <Box
                        ref={messagesBlockRef}
                        sx={{
                            flex: 1,
                            overflowY: 'auto',
                            p: 2,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 1
                        }}
                    >
                        {messages.length === 0 ? (
                            <Box sx={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 2
                            }}>
                                <Typography sx={{ color: theme.text.muted }}>
                                    Начните общение
                                </Typography>
                            </Box>
                        ) : (
                            messages.map((m, i) => {
                                const isMe = m.author === user_id;
                                return (
                                    <Box
                                        key={i}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'flex-end',
                                            gap: 0.5,
                                            justifyContent: isMe ? 'flex-end' : 'flex-start'
                                        }}
                                    >
                                        <Box sx={{
                                            maxWidth: '65%',
                                            p: '10px 14px',
                                            borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                            bgcolor: isMe ? theme.bg.message.own : theme.bg.message.other,
                                            color: theme.text.primary,
                                            wordBreak: 'break-word'
                                        }}>
                                            <Typography sx={{ fontSize: '0.9rem', lineHeight: 1.4 }}>
                                                {m.text}
                                            </Typography>
                                        </Box>
                                        {isMe && (
                                            m.is_read ?
                                                <DoneAllIcon sx={{ fontSize: 14, color: theme.accent }} /> :
                                                <CheckIcon sx={{ fontSize: 14, color: theme.text.muted }} />
                                        )}
                                    </Box>
                                );
                            })
                        )}
                    </Box>
                </Box>
            )}

            {/* Call Dialog */}
            <CallDialog
                open={callStatus === CallStatus.CALLING || callStatus === CallStatus.CONNECTED}
                callStatus={callStatus}
                interlocutorName={interlocutorName}
                callDuration={callDuration}
                localStream={localStream}
                remoteStream={remoteStream}
                isVideoEnabled={isVideoEnabled}
                isAudioEnabled={isAudioEnabled}
                onHangup={hangup}
                onToggleAudio={toggleAudio}
                onToggleVideo={toggleVideo}
            />

            {/* Incoming Call Dialog */}
            <IncomingCallDialog
                open={callStatus === CallStatus.RINGING}
                interlocutorName={interlocutorName}
                isVideoCall={incomingCallVideo}
                onAccept={() => pendingOfferRef.current && answerCall(pendingOfferRef.current, incomingCallVideo)}
                onDecline={declineCall}
            />

            {/* Input */}
            {interlocutorId !== -1 && isLoaded && (
                <Box sx={{
                    p: 2,
                    display: 'flex',
                    gap: 1.5,
                    alignItems: 'flex-end',
                    background: theme.bg.primary,
                    borderTop: `1px solid ${theme.border}`
                }}>
                    <TextField
                        fullWidth
                        multiline
                        maxRows={4}
                        placeholder="Сообщение..."
                        inputRef={inputRef}
                        onChange={sendTyping}
                        onKeyPress={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                sendMessage();
                            }
                        }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                color: theme.text.primary,
                                bgcolor: 'rgba(255,255,255,0.05)',
                                borderRadius: '12px',
                                '& fieldset': { borderColor: theme.border },
                                '&:hover fieldset': { borderColor: theme.accent },
                                '&.Mui-focused fieldset': { borderColor: theme.accent }
                            },
                            '& .MuiOutlinedInput-input': {
                                p: '12px 16px',
                                '&::placeholder': { color: theme.text.muted, opacity: 1 }
                            }
                        }}
                    />
                    <IconButton
                        onClick={sendMessage}
                        sx={{
                            width: 44,
                            height: 44,
                            bgcolor: theme.accent,
                            color: '#fff',
                            '&:hover': { bgcolor: '#45a049' }
                        }}
                    >
                        <SendIcon />
                    </IconButton>
                </Box>
            )}
        </Box>
    );
}
