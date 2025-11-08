import { 
    CircularProgress, 
    IconButton, 
    TextField, 
    Dialog, 
    DialogContent, 
    Avatar, 
    Box, 
    Typography, 
    Fab, 
    Chip,
    Paper,
    Stack
} from "@mui/material";
import { useState, useRef, useContext, useEffect, useCallback, useMemo } from "react";
import { MessageType } from 'my-types/Message';
import SendIcon from '@mui/icons-material/Send';
import PhoneIcon from '@mui/icons-material/Phone';
import VideocamIcon from '@mui/icons-material/Videocam';
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckIcon from '@mui/icons-material/Check';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { UserInfoContext } from "../../App";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";
import { getServerUrl, getWsUrl } from '../../config/serverConfig';
import { getTurnServers, validateIceServers } from '../../config/turnConfig';

interface ExtendedMessage extends MessageType {
    is_read: boolean;
}

enum CallStatus {
    IDLE = 'idle',
    CALLING = 'calling',
    RINGING = 'ringing',
    CONNECTED = 'connected', 
    FAILED = 'failed'
}

export default function MobileMessenger() {
    const { id } = useParams();
    const navigate = useNavigate();
    const interlocutorId = parseInt(id || '-1');
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
    const lastPingTimeRef = useRef<number>(0);
    const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.IDLE);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [incomingCallVideo, setIncomingCallVideo] = useState(false);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);
    const [iceServers, setIceServers] = useState<RTCIceServer[]>([]);
    const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
    const pendingRemoteCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const remoteDescriptionSetRef = useRef(false);
    const hangupProcessingRef = useRef(false);
    const [callDuration, setCallDuration] = useState(0);
    const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const loadTurnServers = async () => {
            try {
                const servers = await getTurnServers();
                const validated = validateIceServers(servers);
                setIceServers(validated);
            } catch (err) {
                console.error('[Setup] Failed to load TURN servers:', err);
                setIceServers([{ urls: 'stun:stun.l.google.com:19302' }]);
            }
        };
        loadTurnServers();
    }, []);

    useEffect(() => {
        if (callStatus === CallStatus.CONNECTED) {
            setCallDuration(0);
            callTimerRef.current = setInterval(() => {
                setCallDuration(d => d + 1);
            }, 1000);
        } else {
            if (callTimerRef.current) {
                clearInterval(callTimerRef.current);
                callTimerRef.current = null;
            }
            setCallDuration(0);
        }
        return () => {
            if (callTimerRef.current) {
                clearInterval(callTimerRef.current);
            }
        };
    }, [callStatus]);

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

    const createPeerConnection = useCallback(() => {
        try {
            console.log('[RTC] Creating PeerConnection with ICE servers:', iceServers);
            const config: RTCConfiguration = {
                iceServers: iceServers?.length ? iceServers : [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ],
                iceCandidatePoolSize: 10,
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require',
                iceTransportPolicy: 'all'
            };
            const pc = new RTCPeerConnection(config);
            pc.onicecandidate = (e) => {
                if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                        type: 'ice-candidate',
                        candidate: e.candidate.toJSON(),
                        author: user_id
                    }));
                }
            };
            pc.ontrack = (e) => {
                if (e.streams && e.streams[0]) {
                    const stream = e.streams[0];
                    setRemoteStream(stream);
                    if (remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = stream;
                        remoteVideoRef.current.play().catch(() => {});
                    }
                    if (remoteAudioRef.current) {
                        remoteAudioRef.current.srcObject = stream;
                        remoteAudioRef.current.muted = false;
                        remoteAudioRef.current.play().catch(() => {});
                    }
                }
            };
            pc.onconnectionstatechange = () => {
                if (pc.connectionState === 'connected') {
                    setCallStatus(CallStatus.CONNECTED);
                } else if (pc.connectionState === 'failed') {
                    alert('Не удалось установить соединение');
                    hangup();
                }
            };
            pc.oniceconnectionstatechange = () => {
                if (pc.iceConnectionState === 'failed') {
                    pc.restartIce();
                }
            };
            peerConnectionRef.current = pc;
            remoteDescriptionSetRef.current = false;
            return pc;
        } catch (err) {
            console.error('[RTC] Failed to create PeerConnection:', err);
            throw err;
        }
    }, [iceServers, user_id]);

    const hangup = useCallback(() => {
        if (hangupProcessingRef.current) return;
        hangupProcessingRef.current = true;
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            setLocalStream(null);
        }
        setRemoteStream(null);
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
        setCallStatus(CallStatus.IDLE);
        setIsVideoEnabled(false);
        setIsAudioEnabled(true);
        remoteDescriptionSetRef.current = false;
        pendingRemoteCandidatesRef.current = [];
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'hangup',
                author: user_id
            }));
        }
        setTimeout(() => {
            hangupProcessingRef.current = false;
        }, 1000);
    }, [user_id, localStream]);

    const startCall = useCallback(async (withVideo: boolean) => {
        if (interlocutorId === -1) return;
        try {
            setCallStatus(CallStatus.CALLING);
            const constraints = withVideo 
                ? {
                    audio: { 
                        echoCancellation: true, 
                        noiseSuppression: true,
                        autoGainControl: true 
                    },
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        frameRate: { ideal: 30 },
                        facingMode: 'user'
                    }
                  }
                : { 
                    audio: { 
                        echoCancellation: true, 
                        noiseSuppression: true 
                    }, 
                    video: false 
                };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            setLocalStream(stream);
            setIsVideoEnabled(withVideo);
            setIsAudioEnabled(true);
            if (localVideoRef.current && withVideo) {
                localVideoRef.current.srcObject = stream;
            }
            const pc = createPeerConnection();
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            await pc.setLocalDescription(offer);
            let attempts = 0;
            while ((!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) && attempts < 50) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket not ready');
            }
            wsRef.current.send(JSON.stringify({
                type: 'offer',
                offer: pc.localDescription!.toJSON(),
                author: user_id,
                video: withVideo
            }));
        } catch (err) {
            setCallStatus(CallStatus.FAILED);
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
                setLocalStream(null);
            }
            alert(`Не удалось начать звонок: ${err instanceof Error ? err.message : 'Проверьте разрешения'}`);
            setTimeout(() => setCallStatus(CallStatus.IDLE), 2000);
        }
    }, [interlocutorId, user_id, createPeerConnection, localStream]);

    const answerCall = useCallback(async (offer: RTCSessionDescriptionInit, withVideo: boolean) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        try {
            setCallStatus(CallStatus.CONNECTED);
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: withVideo
            });
            setLocalStream(stream);
            setIsVideoEnabled(withVideo);
            setIsAudioEnabled(true);
            if (localVideoRef.current && withVideo) {
                localVideoRef.current.srcObject = stream;
            }
            const pc = createPeerConnection();
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            remoteDescriptionSetRef.current = true;
            if (pendingRemoteCandidatesRef.current.length > 0) {
                for (const c of pendingRemoteCandidatesRef.current) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(c));
                    } catch (e) {}
                }
                pendingRemoteCandidatesRef.current = [];
            }
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            wsRef.current.send(JSON.stringify({
                type: 'answer',
                answer: pc.localDescription!.toJSON(),
                author: user_id
            }));
        } catch (err) {
            setCallStatus(CallStatus.FAILED);
            alert('Не удалось ответить на звонок');
            setTimeout(() => setCallStatus(CallStatus.IDLE), 2000);
        }
    }, [user_id, createPeerConnection]);

    const toggleAudio = useCallback(() => {
        if (!localStream) return;
        const track = localStream.getAudioTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            setIsAudioEnabled(track.enabled);
        }
    }, [localStream]);

    const toggleVideo = useCallback(() => {
        if (!localStream) return;
        const track = localStream.getVideoTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            setIsVideoEnabled(track.enabled);
        }
    }, [localStream]);

    const declineCall = useCallback(() => {
        pendingOfferRef.current = null;
        setCallStatus(CallStatus.IDLE);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'hangup',
                author: user_id
            }));
        }
    }, [user_id]);

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
        const wsUrl = `${getWsUrl()}/me/ws/${id1}/${id2}`;
        let reconnectTimeout: ReturnType<typeof setTimeout>;
        let isIntentionallyClosed = false;
        let pingInterval: ReturnType<typeof setInterval>;
        
        const connect = () => {
            try {
                const ws = new WebSocket(wsUrl);
                ws.onopen = () => {
                    wsRef.current = ws;
                    setWsConnected(true);
                    lastPingTimeRef.current = Date.now();
                    
                    // Отправляем ping каждые 5 секунд
                    pingInterval = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'ping', author: user_id }));
                        }
                    }, 5000);
                    
                    // Проверяем активность каждые 10 секунд
                    const checkActivity = setInterval(() => {
                        const timeSinceLastPing = Date.now() - lastPingTimeRef.current;
                        setInterlocutorOnline(timeSinceLastPing < 15000); // 15 сек таймаут
                    }, 10000);
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        const type = data.type || 'message';
                        
                        // Обновляем время последней активности при любом сообщении от собеседника
                        if (data.author !== user_id) {
                            lastPingTimeRef.current = Date.now();
                            setInterlocutorOnline(true);
                        }
                        
                        if (type === 'pong' && data.author !== user_id) {
                            lastPingTimeRef.current = Date.now();
                            setInterlocutorOnline(true);
                        } else if (type === 'ping' && data.author !== user_id) {
                            // Отвечаем на ping
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
                        } else if (type === 'offer' && data.author !== user_id) {
                            pendingOfferRef.current = data.offer;
                            setIncomingCallVideo(data.video || false);
                            setCallStatus(CallStatus.RINGING);
                        } else if (type === 'answer' && data.author !== user_id) {
                            if (peerConnectionRef.current && data.answer) {
                                peerConnectionRef.current.setRemoteDescription(
                                    new RTCSessionDescription(data.answer)
                                ).then(() => {
                                    remoteDescriptionSetRef.current = true;
                                    if (pendingRemoteCandidatesRef.current.length > 0) {
                                        pendingRemoteCandidatesRef.current.forEach(async (c) => {
                                            try {
                                                await peerConnectionRef.current!.addIceCandidate(new RTCIceCandidate(c));
                                            } catch (e) {}
                                        });
                                        pendingRemoteCandidatesRef.current = [];
                                    }
                                }).catch(() => {});
                            }
                        } else if (type === 'ice-candidate' && data.author !== user_id) {
                            if (peerConnectionRef.current && data.candidate) {
                                if (remoteDescriptionSetRef.current) {
                                    peerConnectionRef.current.addIceCandidate(
                                        new RTCIceCandidate(data.candidate)
                                    ).catch(() => {});
                                } else {
                                    pendingRemoteCandidatesRef.current.push(data.candidate);
                                }
                            }
                        } else if (type === 'hangup' && data.author !== user_id) {
                            hangup();
                        }
                        setTimeout(() => {
                            messagesBlockRef.current?.scrollTo(0, messagesBlockRef.current?.scrollHeight || 0);
                        }, 10);
                    } catch (e) {}
                };

                ws.onerror = () => {
                    setWsConnected(false);
                    setInterlocutorOnline(false);
                };

                ws.onclose = () => {
                    if (wsRef.current === ws) {
                        wsRef.current = null;
                    }
                    setWsConnected(false);
                    setInterlocutorOnline(false);
                    clearInterval(pingInterval);
                    if (!isIntentionallyClosed) {
                        reconnectTimeout = setTimeout(connect, 3000);
                    }
                };
            } catch (err) {
                setWsConnected(false);
                setInterlocutorOnline(false);
            }
        };

        connect();

        return () => {
            isIntentionallyClosed = true;
            clearTimeout(reconnectTimeout);
            clearInterval(pingInterval);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [user_id, interlocutorId, hangup]);

    const getStatusText = () => {
        if (callStatus === CallStatus.CALLING) return 'Вызов...';
        if (callStatus === CallStatus.RINGING) return 'Входящий вызов';
        if (callStatus === CallStatus.CONNECTED) {
            const mins = Math.floor(callDuration / 60);
            const secs = callDuration % 60;
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        if (interlocutorOnline) return 'В сети';
        return 'Не в сети';
    };

    const getStatusColor = () => {
        if (callStatus === CallStatus.CALLING || callStatus === CallStatus.RINGING) return 'warning';
        if (callStatus === CallStatus.CONNECTED) return 'error';
        if (interlocutorOnline) return 'success';
        return 'default';
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <Box sx={{ 
            height: '100vh',
            width: '100vw',
            display: 'flex', 
            flexDirection: 'column',
            position: 'fixed',
            top: 0,
            left: 0,
            overflow: 'hidden',
            backgroundColor: '#212121'
        }}>
            {/* HEADER */}
            {isLoaded && (
                <Paper sx={{ 
                    p: 1.5, 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    borderRadius: 0,
                    flexShrink: 0
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
                        <IconButton onClick={() => navigate('/friends')} size="small" sx={{ flexShrink: 0 }}>
                            <ArrowBackIcon />
                        </IconButton>
                        <Avatar sx={{ width: 36, height: 36, flexShrink: 0 }}>
                            {interlocutorName[0]?.toUpperCase() || '?'}
                        </Avatar>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', fontSize: '0.9rem' }} noWrap>
                                {interlocutorName}
                            </Typography>
                            <Chip
                                label={getStatusText()}
                                color={getStatusColor()}
                                size="small"
                                variant="outlined"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                        </Box>
                    </Box>
                    {callStatus === CallStatus.IDLE ? (
                        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                            <IconButton 
                                onClick={() => startCall(false)} 
                                color="primary"
                                size="small"
                            >
                                <PhoneIcon fontSize="small" />
                            </IconButton>
                            <IconButton 
                                onClick={() => startCall(true)} 
                                color="primary"
                                size="small"
                            >
                                <VideocamIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    ) : callStatus !== CallStatus.RINGING && (
                        <Fab 
                            color="error" 
                            size="small"
                            onClick={hangup}
                            sx={{ flexShrink: 0 }}
                        >
                            <CallEndIcon fontSize="small" />
                        </Fab>
                    )}
                </Paper>
            )}

            {/* CONTENT */}
            {!isLoaded ? (
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CircularProgress color="secondary" />
                </Box>
            ) : interlocutorId === -1 ? (
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                    Выберите собеседника
                </Box>
            ) : (
                <>
                    {/* MESSAGES AREA */}
                    {callStatus === CallStatus.IDLE && (
                        <Box 
                            ref={messagesBlockRef}
                            sx={{ 
                                flex: 1,
                                overflowY: 'auto',
                                overflowX: 'hidden',
                                p: 2,
                                WebkitOverflowScrolling: 'touch',
                                '&::-webkit-scrollbar': {
                                    width: '4px'
                                },
                                '&::-webkit-scrollbar-thumb': {
                                    backgroundColor: '#888',
                                    borderRadius: '4px'
                                }
                            }}
                        >
                            {messages.length === 0 ? (
                                <Typography sx={{ textAlign: 'center', color: '#999', mt: 4 }}>
                                    История пуста
                                </Typography>
                            ) : (
                                messages.map((m, i) => (
                                    <Stack
                                        key={i}
                                        direction="row"
                                        sx={{
                                            mb: 1.5,
                                            justifyContent: m.author === user_id ? 'flex-end' : 'flex-start',
                                            alignItems: 'flex-end',
                                            gap: 0.5
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                maxWidth: '75%',
                                                p: 1.5,
                                                borderRadius: 2,
                                                backgroundColor: m.author === user_id ? '#4CAF50' : '#424242',
                                                color: '#fff',
                                                wordWrap: 'break-word'
                                            }}
                                        >
                                            <Typography variant="body2">
                                                {m.text}
                                            </Typography>
                                        </Box>
                                        {m.author === user_id && (
                                            m.is_read ? 
                                                <DoneAllIcon sx={{ fontSize: 14, color: '#4CAF50' }} /> : 
                                                <CheckIcon sx={{ fontSize: 14, color: '#999' }} />
                                        )}
                                    </Stack>
                                ))
                            )}
                        </Box>
                    )}

                    {/* INPUT AREA - FIXED AT BOTTOM */}
                    {callStatus === CallStatus.IDLE && (
                        <Paper 
                            elevation={4}
                            sx={{ 
                                p: 1.5,
                                display: 'flex',
                                gap: 1,
                                alignItems: 'flex-end',
                                borderRadius: 0,
                                flexShrink: 0,
                                backgroundColor: '#1e1e1e'
                            }}
                        >
                            <TextField
                                fullWidth
                                color="secondary"
                                multiline
                                maxRows={3}
                                placeholder="Написать..."
                                inputRef={inputRef}
                                disabled={interlocutorId === -1}
                                variant="outlined"
                                size="small"
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        sendMessage();
                                    }
                                }}
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        color: '#fff',
                                        backgroundColor: '#2a2a2a',
                                        '& fieldset': {
                                            borderColor: '#444'
                                        }
                                    }
                                }}
                            />
                            <IconButton
                                onClick={sendMessage}
                                disabled={interlocutorId === -1}
                                color="secondary"
                                sx={{ 
                                    backgroundColor: '#4CAF50',
                                    color: '#fff',
                                    '&:hover': {
                                        backgroundColor: '#45a049'
                                    },
                                    '&:disabled': {
                                        backgroundColor: '#333'
                                    }
                                }}
                            >
                                <SendIcon />
                            </IconButton>
                        </Paper>
                    )}
                </>
            )}

            {/* CALL SCREEN - FULLSCREEN DIALOG */}
            <Dialog
                open={callStatus === CallStatus.CALLING || callStatus === CallStatus.CONNECTED}
                onClose={hangup}
                fullScreen
                PaperProps={{ 
                    sx: { 
                        backgroundColor: '#000',
                        margin: 0,
                        borderRadius: 0
                    } 
                }}
            >
                <DialogContent sx={{ 
                    p: 0, 
                    height: '100vh',
                    width: '100vw',
                    display: 'flex', 
                    flexDirection: 'column',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    {/* REMOTE VIDEO/AVATAR */}
                    <Box sx={{ 
                        flex: 1, 
                        position: 'relative', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        backgroundColor: '#1a1a1a',
                        overflow: 'hidden'
                    }}>
                        {remoteStream && remoteStream.getVideoTracks().length > 0 && remoteStream.getVideoTracks()[0].enabled ? (
                            <video
                                ref={remoteVideoRef}
                                autoPlay
                                playsInline
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover'
                                }}
                            />
                        ) : (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <Avatar sx={{ width: 100, height: 100, bgcolor: '#4CAF50', fontSize: 40 }}>
                                    {interlocutorName[0]?.toUpperCase()}
                                </Avatar>
                                <Typography variant="h5" color="white">
                                    {interlocutorName}
                                </Typography>
                                {callStatus === CallStatus.CALLING && (
                                    <Typography variant="body1" color="grey.400">
                                        Вызов...
                                    </Typography>
                                )}
                                {callStatus === CallStatus.CONNECTED && (
                                    <Typography variant="h6" color="grey.300">
                                        {formatTime(callDuration)}
                                    </Typography>
                                )}
                            </Box>
                        )}

                        {/* LOCAL VIDEO PREVIEW */}
                        {isVideoEnabled && localStream && localStream.getVideoTracks().length > 0 && (
                            <Box sx={{
                                position: 'absolute',
                                top: 16,
                                right: 16,
                                width: 100,
                                height: 140,
                                borderRadius: 2,
                                overflow: 'hidden',
                                border: '2px solid #4CAF50',
                                backgroundColor: '#222',
                                boxShadow: 3,
                                zIndex: 10
                            }}>
                                <video
                                    ref={localVideoRef}
                                    autoPlay
                                    muted
                                    playsInline
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        transform: 'scaleX(-1)'
                                    }}
                                />
                            </Box>
                        )}
                    </Box>

                    {/* CALL CONTROLS */}
                    <Box sx={{ 
                        p: 3,
                        pb: 5,
                        display: 'flex', 
                        gap: 2, 
                        justifyContent: 'center', 
                        alignItems: 'center',
                        backgroundColor: 'rgba(0,0,0,0.95)',
                        position: 'relative',
                        zIndex: 20
                    }}>
                        <Fab
                            size="large"
                            color={isAudioEnabled ? 'default' : 'error'}
                            onClick={toggleAudio}
                            sx={{ bgcolor: isAudioEnabled ? '#424242' : undefined }}
                        >
                            {isAudioEnabled ? <MicIcon /> : <MicOffIcon />}
                        </Fab>
                        {localStream && localStream.getVideoTracks().length > 0 && (
                            <Fab
                                size="large"
                                color={isVideoEnabled ? 'default' : 'error'}
                                onClick={toggleVideo}
                                sx={{ bgcolor: isVideoEnabled ? '#424242' : undefined }}
                            >
                                {isVideoEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
                            </Fab>
                        )}
                        <Fab
                            size="large"
                            color="error"
                            onClick={hangup}
                        >
                            <CallEndIcon />
                        </Fab>
                    </Box>
                </DialogContent>
            </Dialog>

            {/* INCOMING CALL DIALOG */}
            <Dialog
                open={callStatus === CallStatus.RINGING}
                onClose={declineCall}
                maxWidth="xs"
                fullWidth
                PaperProps={{
                    sx: {
                        backgroundColor: '#1e1e1e',
                        backgroundImage: 'none'
                    }
                }}
            >
                <DialogContent sx={{ textAlign: 'center', py: 4 }}>
                    <Avatar sx={{ width: 80, height: 80, margin: '0 auto 16px', bgcolor: '#4CAF50' }}>
                        {interlocutorName[0]?.toUpperCase()}
                    </Avatar>
                    <Typography variant="h6" gutterBottom color="white">
                        {interlocutorName}
                    </Typography>
                    <Typography variant="body2" color="grey.400" gutterBottom>
                        {incomingCallVideo ? 'Видео звонок' : 'Аудио звонок'}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', mt: 3 }}>
                        <Fab color="error" onClick={declineCall} size="large">
                            <CallEndIcon />
                        </Fab>
                        <Fab
                            color="success"
                            onClick={() => pendingOfferRef.current && answerCall(pendingOfferRef.current, incomingCallVideo)}
                            size="large"
                        >
                            <PhoneIcon />
                        </Fab>
                    </Box>
                </DialogContent>
            </Dialog>

            {/* HIDDEN AUDIO ELEMENT FOR REMOTE AUDIO */}
            <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
        </Box>
    );
}    