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
    Paper
} from "@mui/material";
import { useState, useRef, useContext, useEffect, useCallback } from "react";
import { MessageType } from 'my-types/Message';
import SendIcon from '@mui/icons-material/Send';
import PhoneIcon from '@mui/icons-material/Phone';
import VideocamIcon from '@mui/icons-material/Videocam';
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CheckIcon from '@mui/icons-material/Check';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import './messenger.css';
import { MessengerInterlocutorId } from "../pages/MessengerPage";
import { UserInfoContext } from "../../App";
import axios from "axios";
import InterlocutorProfile from "../../Mobile/components/InterlocutorProfile";
import { getServerUrl, getWsUrl } from '../../config/serverConfig';
import { getTurnServers, validateIceServers } from '../../config/turnConfig';

interface ExtendedMessage extends MessageType {
    is_read: boolean;
}

type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'failed';

export default function Messenger() {
    const interlocutorId = useContext(MessengerInterlocutorId);
    const inputRef = useRef<HTMLInputElement>(null);
    const user = useContext(UserInfoContext);
    const user_id = user.userInfo.user_id;

    // Сообщения
    const [messages, setMessages] = useState<ExtendedMessage[]>([]);
    const [isLoaded, setIsLoaded] = useState(false);
    const messagesBlockRef = useRef<HTMLDivElement>(null);

    // WebSocket и состояние
    const wsRef = useRef<WebSocket | null>(null);
    const [wsConnected, setWsConnected] = useState(false);
    const [interlocutorName, setInterlocutorName] = useState('');
    const [interlocutorOnline, setInterlocutorOnline] = useState(false);

    // WebRTC состояние
    const [callStatus, setCallStatus] = useState<CallStatus>('idle');
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [incomingCallVideo, setIncomingCallVideo] = useState(false);
    
    // Потоки
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    
    // Refs
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);
    const [iceServers, setIceServers] = useState<RTCIceServer[]>([]);
    const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
    const pendingRemoteCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const remoteDescriptionSetRef = useRef(false);
    const hangupProcessingRef = useRef(false);
    const remoteTracksRef = useRef<Map<string, MediaStreamTrack>>(new Map());

    // ===== ЗАГРУЗКА ICE СЕРВЕРОВ =====
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

    // ===== ЗАГРУЗКА ПРОФИЛЯ СОБЕСЕДНИКА =====
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

    // ===== ЗАГРУЗКА СООБЩЕНИЙ =====
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

    // ===== WEBRTC: СОЗДАНИЕ PEER CONNECTION =====
    const createPeerConnection = useCallback(() => {
        try {
            console.log('[RTC] Creating PeerConnection with iceServers:', iceServers.length);
            
            const config: RTCConfiguration = {
                iceServers: iceServers?.length ? iceServers : [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ],
                iceCandidatePoolSize: 10
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
                console.log('[RTC] ontrack:', e.track?.kind);
                if (!e.track) return;

                const trackKey = `${e.track.kind}`;
                remoteTracksRef.current.set(trackKey, e.track);

                // Пересчитываем поток
                const tracks = Array.from(remoteTracksRef.current.values());
                const newStream = new MediaStream(tracks);
                setRemoteStream(newStream);

                // Применяем к видео элементам
                if (remoteVideoRef.current && e.track.kind === 'video') {
                    remoteVideoRef.current.srcObject = newStream;
                    remoteVideoRef.current.play?.().catch(err => 
                        console.warn('[RTC] Video play error:', err)
                    );
                }
                if (remoteAudioRef.current && e.track.kind === 'audio') {
                    remoteAudioRef.current.srcObject = newStream;
                    remoteAudioRef.current.muted = false;
                    remoteAudioRef.current.play?.().catch(err => 
                        console.warn('[RTC] Audio play error:', err)
                    );
                }
            };

            pc.onconnectionstatechange = () => {
                console.log('[RTC] connectionState:', pc.connectionState);
                if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                    hangup();
                }
            };

            pc.oniceconnectionstatechange = () => {
                console.log('[RTC] iceConnectionState:', pc.iceConnectionState);
            };

            peerConnectionRef.current = pc;
            remoteDescriptionSetRef.current = false;
            return pc;
        } catch (err) {
            console.error('[RTC] Failed to create PeerConnection:', err);
            throw err;
        }
    }, [iceServers, user_id]);

    // ===== WEBRTC: НАЧАТЬ ЗВОНОК =====
    const startCall = useCallback(async (withVideo: boolean) => {
        if (interlocutorId === -1 || !wsRef.current) return;
        if (wsRef.current.readyState !== WebSocket.OPEN) {
            console.warn('[Call] WebSocket not ready');
            return;
        }

        try {
            setCallStatus('calling');
            console.log(`[Call] Starting ${withVideo ? 'video' : 'audio'} call...`);

            const constraints = withVideo 
                ? {
                    audio: { echoCancellation: true, noiseSuppression: true },
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        frameRate: { ideal: 30 }
                    }
                  }
                : { audio: true, video: false };

            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (e) {
                console.warn('[Call] Primary constraints failed, using fallback');
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: withVideo ? true : false
                });
            }

            setLocalStream(stream);
            setIsVideoEnabled(withVideo);
            setIsAudioEnabled(true);

            if (localVideoRef.current && withVideo) {
                localVideoRef.current.srcObject = stream;
            }

            const pc = createPeerConnection();
            
            // Добавляем трансиверы
            try { pc.addTransceiver('audio', { direction: 'sendrecv' }); } catch {}
            try { pc.addTransceiver('video', { direction: 'sendrecv' }); } catch {}

            // Добавляем локальные треки
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            wsRef.current.send(JSON.stringify({
                type: 'offer',
                offer: pc.localDescription?.toJSON() || offer,
                author: user_id,
                video: withVideo
            }));

            console.log('[Call] Offer sent');
        } catch (err) {
            console.error('[Call] Failed to start:', err);
            setCallStatus('failed');
            alert('Не удалось начать звонок. Проверьте разрешения.');
            setTimeout(() => setCallStatus('idle'), 2000);
        }
    }, [interlocutorId, user_id, createPeerConnection]);

    // ===== WEBRTC: ОТВЕТИТЬ НА ЗВОНОК =====
    const answerCall = useCallback(async (offer: RTCSessionDescriptionInit, withVideo: boolean) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        try {
            console.log('[Call] Answering call...');
            setCallStatus('connected');

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: withVideo ? true : false
            });

            setLocalStream(stream);
            setIsVideoEnabled(withVideo);
            setIsAudioEnabled(true);

            if (localVideoRef.current && withVideo) {
                localVideoRef.current.srcObject = stream;
            }

            const pc = createPeerConnection();

            // Добавляем трансиверы
            try { pc.addTransceiver('audio', { direction: 'sendrecv' }); } catch {}
            try { pc.addTransceiver('video', { direction: 'sendrecv' }); } catch {}

            // Добавляем локальные треки
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            remoteDescriptionSetRef.current = true;

            // Добавляем скопленные ICE кандидаты
            if (pendingRemoteCandidatesRef.current.length > 0) {
                for (const c of pendingRemoteCandidatesRef.current) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(c));
                    } catch (e) {
                        console.warn('[RTC] Failed to add pending candidate:', e);
                    }
                }
                pendingRemoteCandidatesRef.current = [];
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            wsRef.current.send(JSON.stringify({
                type: 'answer',
                answer: pc.localDescription?.toJSON() || answer,
                author: user_id
            }));

            console.log('[Call] Answer sent');
        } catch (err) {
            console.error('[Call] Failed to answer:', err);
            setCallStatus('failed');
            alert('Не удалось ответить на звонок');
            setTimeout(() => setCallStatus('idle'), 2000);
        }
    }, [user_id, createPeerConnection]);

    // ===== УПРАВЛЕНИЕ МЕДИА =====
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

    // ===== ЗАВЕРШИТЬ ЗВОНОК =====
    const hangup = useCallback(() => {
        if (hangupProcessingRef.current) return;
        hangupProcessingRef.current = true;

        console.log('[Call] Hanging up...');

        if (peerConnectionRef.current) {
            try {
                peerConnectionRef.current.getSenders().forEach(s => {
                    try { s.replaceTrack(null); } catch {}
                    try { s.track?.stop(); } catch {}
                });
            } catch {}
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        if (localStream) {
            localStream.getTracks().forEach(t => {
                try { t.stop(); } catch {}
            });
            setLocalStream(null);
        }

        remoteTracksRef.current.clear();
        setRemoteStream(null);
        if (localVideoRef.current) { try { localVideoRef.current.srcObject = null; } catch {} }
        if (remoteVideoRef.current) { try { remoteVideoRef.current.srcObject = null; } catch {} }
        if (remoteAudioRef.current) { try { remoteAudioRef.current.srcObject = null; } catch {} }

        setCallStatus('idle');
        setIsVideoEnabled(false);
        setIsAudioEnabled(true);

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'hangup',
                author: user_id
            }));
        }

        setTimeout(() => {
            hangupProcessingRef.current = false;
        }, 1000);
    }, [user_id]);

    const declineCall = useCallback(() => {
        pendingOfferRef.current = null;
        setCallStatus('idle');
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'hangup',
                author: user_id
            }));
        }
    }, [user_id]);

    // ===== ОТПРАВКА СООБЩЕНИЯ =====
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

    // ===== WEBSOCKET СОЕДИНЕНИЕ =====
    useEffect(() => {
        if (interlocutorId === -1 || !user_id || user_id === -1) {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            setWsConnected(false);
            return;
        }

        // Если уже подключены - не переподключаемся!
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log('[WS] Already connected, skipping');
            return;
        }

        const id1 = Math.min(user_id, interlocutorId);
        const id2 = Math.max(user_id, interlocutorId);
        const wsUrl = `${getWsUrl()}/me/ws/${id1}/${id2}`;
        
        console.log('[WS] Connecting to:', wsUrl);
        let reconnectTimeout: ReturnType<typeof setTimeout>;
        let isIntentionallyClosed = false;

        const connect = () => {
            try {
                const ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    wsRef.current = ws;
                    setWsConnected(true);
                    console.log('[WS] Connected');
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        const type = data.type || 'message';

                        if (type === 'message') {
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
                            setCallStatus('ringing');
                        } else if (type === 'answer' && data.author !== user_id) {
                            if (peerConnectionRef.current) {
                                peerConnectionRef.current.setRemoteDescription(
                                    new RTCSessionDescription(data.answer)
                                ).then(() => {
                                    remoteDescriptionSetRef.current = true;
                                    setCallStatus('connected');
                                    console.log('[RTC] setRemoteDescription(answer) ✅');
                                }).catch(e => {
                                    console.error('[RTC] setRemoteDescription(answer) error:', e);
                                });
                            }
                        } else if (type === 'ice-candidate' && data.author !== user_id) {
                            if (peerConnectionRef.current && data.candidate) {
                                if (!remoteDescriptionSetRef.current) {
                                    console.log('[RTC] queue remote ICE');
                                    pendingRemoteCandidatesRef.current.push(data.candidate);
                                } else {
                                    peerConnectionRef.current.addIceCandidate(
                                        new RTCIceCandidate(data.candidate)
                                    ).catch(e => { 
                                        console.warn('[RTC] addIceCandidate error', e); 
                                    });
                                }
                            }
                        } else if (type === 'hangup' && data.author !== user_id) {
                            hangup();
                        }

                        setTimeout(() => {
                            messagesBlockRef.current?.scrollTo(0, messagesBlockRef.current?.scrollHeight || 0);
                        }, 10);
                    } catch (e) {
                        console.error('[WS] Message parse error:', e);
                    }
                };

                ws.onerror = (err) => {
                    console.error('[WS] Error:', err);
                    setWsConnected(false);
                };

                ws.onclose = () => {
                    console.log('[WS] Closed');
                    wsRef.current = null;
                    setWsConnected(false);

                    if (!isIntentionallyClosed) {
                        reconnectTimeout = setTimeout(connect, 3000);
                    }
                };
            } catch (err) {
                console.error('[WS] Connection failed:', err);
                setWsConnected(false);
            }
        };

        connect();

        return () => {
            isIntentionallyClosed = true;
            clearTimeout(reconnectTimeout);
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [user_id, interlocutorId]);

    // ===== РЕНДЕР СТАТУСА =====
    const getStatusText = () => {
        if (callStatus === 'calling') return 'Вызов...';
        if (callStatus === 'ringing') return 'Входящий вызов';
        if (callStatus === 'connected') return 'В разговоре';
        if (interlocutorOnline) return 'Online';
        return 'Offline';
    };

    const getStatusColor = () => {
        if (callStatus !== 'idle') return 'error';
        if (interlocutorOnline) return 'success';
        return 'default';
    };

    return (
        <div id="messenger">
            {/* ПАНЕЛЬ СВЕРХУ */}
            {isLoaded && (
                <Paper sx={{ p: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ width: 40, height: 40 }}>
                            {interlocutorName[0]?.toUpperCase() || '?'}
                        </Avatar>
                        <Box>
                            <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                                {interlocutorName}
                            </Typography>
                            <Chip
                                label={getStatusText()}
                                color={getStatusColor()}
                                size="small"
                                variant="outlined"
                            />
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {callStatus === 'idle' && (
                            <>
                                <IconButton 
                                    onClick={() => startCall(false)} 
                                    color="primary"
                                    title="Аудио звонок"
                                >
                                    <PhoneIcon />
                                </IconButton>
                                <IconButton 
                                    onClick={() => startCall(true)} 
                                    color="primary"
                                    title="Видео звонок"
                                >
                                    <VideocamIcon />
                                </IconButton>
                            </>
                        )}
                        {callStatus !== 'idle' && (
                            <Fab 
                                color="error" 
                                size="small"
                                onClick={hangup}
                            >
                                <CallEndIcon />
                            </Fab>
                        )}
                        <IconButton>
                            <MoreVertIcon />
                        </IconButton>
                    </Box>
                </Paper>
            )}

            {/* ОСНОВНАЯ ОБЛАСТЬ */}
            {!isLoaded ? (
                <section id='loading' style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CircularProgress color="secondary"/>
                </section>
            ) : interlocutorId === -1 ? (
                <span id="choose-interlocutor-text" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    Выберите собеседника
                </span>
            ) : (
                <Box sx={{ display: 'flex', flex: 1 }}>
                    {/* СООБЩЕНИЯ */}
                    <section id='messages' ref={messagesBlockRef} style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                        {messages.length === 0 && <span id="no-messages-text">История пуста</span>}
                        {messages.map((m, i) => (
                            <Box 
                                key={i} 
                                data-from={m.author === user_id ? 'me' : 'other'}
                                sx={{ 
                                    mb: 1, 
                                    display: 'flex',
                                    alignItems: 'flex-end',
                                    gap: 0.5,
                                    justifyContent: m.author === user_id ? 'flex-end' : 'flex-start'
                                }}
                            >
                                <Typography variant="body2">
                                    {m.text}
                                </Typography>
                                {m.author === user_id && (
                                    <>
                                        {m.is_read ? <DoneAllIcon sx={{ fontSize: 16 }} /> : <CheckIcon sx={{ fontSize: 16 }} />}
                                    </>
                                )}
                            </Box>
                        ))}
                    </section>

                    {/* ВИДЕО ОКНО (ОТДЕЛЬНОЕ) */}
                    {callStatus !== 'idle' && (remoteStream || isVideoEnabled) && (
                        <Box sx={{
                            width: 300,
                            borderLeft: '1px solid #ccc',
                            display: 'flex',
                            flexDirection: 'column',
                            backgroundColor: '#000'
                        }}>
                            {/* Удаленное видео */}
                            {remoteStream && remoteStream.getVideoTracks().length > 0 ? (
                                <Box sx={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                                </Box>
                            ) : (
                                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                                    <Avatar sx={{ width: 60, height: 60, mb: 1 }}>
                                        {interlocutorName[0]?.toUpperCase()}
                                    </Avatar>
                                    <Typography variant="body2" color="white">
                                        {interlocutorName}
                                    </Typography>
                                    <Typography variant="caption" color="grey.400">
                                        Камера выключена
                                    </Typography>
                                </Box>
                            )}

                            {/* Локальное видео */}
                            {isVideoEnabled && localStream && (
                                <Box sx={{
                                    height: 120,
                                    backgroundColor: '#222',
                                    borderTop: '1px solid #444',
                                    position: 'relative',
                                    overflow: 'hidden'
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

                            {/* Контролы */}
                            <Box sx={{ p: 1, display: 'flex', gap: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)' }}>
                                <Fab
                                    size="small"
                                    color={isAudioEnabled ? 'default' : 'error'}
                                    onClick={toggleAudio}
                                >
                                    {isAudioEnabled ? <MicIcon /> : <MicOffIcon />}
                                </Fab>
                                <Fab
                                    size="small"
                                    color={isVideoEnabled ? 'default' : 'error'}
                                    onClick={toggleVideo}
                                >
                                    {isVideoEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
                                </Fab>
                            </Box>
                        </Box>
                    )}
                </Box>
            )}

            {/* ВХОДЯЩИЙ ЗВОНОК */}
            <Dialog 
                open={callStatus === 'ringing'} 
                onClose={declineCall}
                maxWidth="xs" 
                fullWidth
            >
                <DialogContent sx={{ textAlign: 'center', py: 4 }}>
                    <Avatar sx={{ width: 80, height: 80, margin: '0 auto 16px' }}>
                        {interlocutorName[0]?.toUpperCase()}
                    </Avatar>
                    <Typography variant="h6" gutterBottom>
                        {interlocutorName}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        {incomingCallVideo ? 'Видео звонок' : 'Аудио звонок'}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 3 }}>
                        <Fab color="error" onClick={declineCall}>
                            <CallEndIcon />
                        </Fab>
                        <Fab 
                            color="success" 
                            onClick={() => pendingOfferRef.current && answerCall(pendingOfferRef.current, incomingCallVideo)}
                        >
                            <PhoneIcon />
                        </Fab>
                    </Box>
                </DialogContent>
            </Dialog>

            {/* СКРЫТОЕ АУДИО */}
            <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

            {/* ВВОД СООБЩЕНИЙ */}
            <section id='input' style={{ padding: '10px', display: 'flex', gap: '10px' }}>
                <TextField
                    style={{ flexGrow: 1 }}
                    color="secondary"
                    multiline
                    maxRows={4}
                    placeholder="Написать..."
                    inputRef={inputRef}
                    disabled={interlocutorId === -1}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                        }
                    }}
                />
                <IconButton 
                    onClick={sendMessage} 
                    disabled={interlocutorId === -1} 
                    color="secondary"
                >
                    <SendIcon />
                </IconButton>
            </section>
        </div>
    );
}