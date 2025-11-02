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

    useEffect(() => {
        const loadTurnServers = async () => {
            try {
                const servers = await getTurnServers();
                const validated = validateIceServers(servers);
                setIceServers(validated);
                console.log('[Setup] ICE servers loaded:', validated);
            } catch (err) {
                console.error('[Setup] Failed to load TURN servers:', err);
                setIceServers([{ urls: 'stun:stun.l.google.com:19302' }]);
            }
        };
        loadTurnServers();
    }, []);

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
                    console.log('[RTC] Sending ICE candidate:', e.candidate.type, e.candidate.protocol);
                    wsRef.current.send(JSON.stringify({
                        type: 'ice-candidate',
                        candidate: e.candidate.toJSON(),
                        author: user_id
                    }));
                } else if (!e.candidate) {
                    console.log('[RTC] ICE gathering complete');
                }
            };

            pc.ontrack = (e) => {
                console.log('[RTC] ontrack:', e.track.kind, 'streams:', e.streams.length);
                
                if (e.streams && e.streams[0]) {
                    const stream = e.streams[0];
                    console.log('[RTC] Remote stream tracks:', stream.getTracks().map(t => t.kind));
                    setRemoteStream(stream);

                    if (e.track.kind === 'video' && remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = stream;
                        remoteVideoRef.current.play().catch(err => 
                            console.warn('[RTC] Video play error:', err)
                        );
                    }
                    if (e.track.kind === 'audio' && remoteAudioRef.current) {
                        remoteAudioRef.current.srcObject = stream;
                        remoteAudioRef.current.muted = false;
                        remoteAudioRef.current.play().catch(err => 
                            console.warn('[RTC] Audio play error:', err)
                        );
                    }
                }
            };

            pc.onconnectionstatechange = () => {
                console.log('[RTC] connectionState:', pc.connectionState);
                if (pc.connectionState === 'connected') {
                    setCallStatus(CallStatus.CONNECTED);
                    console.log('[RTC] ✅ Connection established!');
                } else if (pc.connectionState === 'failed') {
                    console.error('[RTC] Connection FAILED');
                    alert('Не удалось установить соединение. Проверьте интернет.');
                    hangup();
                } else if (pc.connectionState === 'disconnected') {
                    console.warn('[RTC] Connection disconnected');
                }
            };

            pc.oniceconnectionstatechange = () => {
                console.log('[RTC] iceConnectionState:', pc.iceConnectionState);
                if (pc.iceConnectionState === 'failed') {
                    console.error('[RTC] ICE connection failed, restarting ICE...');
                    pc.restartIce();
                }
            };

            pc.onicegatheringstatechange = () => {
                console.log('[RTC] iceGatheringState:', pc.iceGatheringState);
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

        console.log('[Call] Hanging up...');

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
        if (interlocutorId === -1) {
            console.warn('[Call] Invalid interlocutor ID');
            return;
        }

        try {
            setCallStatus(CallStatus.CALLING);
            console.log(`[Call] Starting ${withVideo ? 'video' : 'audio'} call`);

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
            console.log('[Call] Got media stream:', stream.getTracks().map(t => `${t.kind}:${t.enabled}`));

            setLocalStream(stream);
            setIsVideoEnabled(withVideo);
            setIsAudioEnabled(true);

            if (localVideoRef.current && withVideo) {
                localVideoRef.current.srcObject = stream;
            }

            const pc = createPeerConnection();
            
            stream.getTracks().forEach(track => {
                console.log('[Call] Adding local track:', track.kind);
                pc.addTrack(track, stream);
            });

            console.log('[Call] Creating offer...');
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });

            console.log('[Call] Setting local description...');
            await pc.setLocalDescription(offer);

            // Ждем, пока WebSocket будет готов
            let attempts = 0;
            while ((!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) && attempts < 50) {
                console.log('[Call] Waiting for WebSocket... attempt', attempts);
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }

            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket not ready after waiting');
            }

            console.log('[Call] Sending offer to peer');
            wsRef.current.send(JSON.stringify({
                type: 'offer',
                offer: pc.localDescription!.toJSON(),
                author: user_id,
                video: withVideo
            }));

            console.log('[Call] ✅ Offer sent successfully');
        } catch (err) {
            console.error('[Call] Failed to start:', err);
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
            console.log('[Call] Answering call...');
            setCallStatus(CallStatus.CONNECTED);

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: withVideo
            });

            console.log('[Call] Got media stream:', stream.getTracks().map(t => `${t.kind}:${t.enabled}`));

            setLocalStream(stream);
            setIsVideoEnabled(withVideo);
            setIsAudioEnabled(true);

            if (localVideoRef.current && withVideo) {
                localVideoRef.current.srcObject = stream;
            }

            const pc = createPeerConnection();

            stream.getTracks().forEach(track => {
                console.log('[Call] Adding local track:', track.kind);
                pc.addTrack(track, stream);
            });

            console.log('[Call] Setting remote description (offer)...');
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            remoteDescriptionSetRef.current = true;
            console.log('[Call] ✅ Remote description set');

            if (pendingRemoteCandidatesRef.current.length > 0) {
                console.log('[Call] Adding', pendingRemoteCandidatesRef.current.length, 'pending candidates');
                for (const c of pendingRemoteCandidatesRef.current) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(c));
                    } catch (e) {
                        console.warn('[Call] Failed to add pending candidate:', e);
                    }
                }
                pendingRemoteCandidatesRef.current = [];
            }

            console.log('[Call] Creating answer...');
            const answer = await pc.createAnswer();
            
            console.log('[Call] Setting local description...');
            await pc.setLocalDescription(answer);

            console.log('[Call] Sending answer to peer');
            wsRef.current.send(JSON.stringify({
                type: 'answer',
                answer: pc.localDescription!.toJSON(),
                author: user_id
            }));

            console.log('[Call] ✅ Answer sent successfully');
        } catch (err) {
            console.error('[Call] Failed to answer:', err);
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
            return;
        }

        // Если уже подключен к этому же чату - не переподключаемся
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log('[WS] Already connected, skipping reconnect');
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
                    console.log('[WS] ✅ Connected');
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
                            console.log('[WS] Received offer');
                            pendingOfferRef.current = data.offer;
                            setIncomingCallVideo(data.video || false);
                            setCallStatus(CallStatus.RINGING);
                        } else if (type === 'answer' && data.author !== user_id) {
                            console.log('[WS] Received answer');
                            if (peerConnectionRef.current && data.answer) {
                                peerConnectionRef.current.setRemoteDescription(
                                    new RTCSessionDescription(data.answer)
                                ).then(() => {
                                    remoteDescriptionSetRef.current = true;
                                    console.log('[RTC] ✅ Remote description (answer) set');
                                    
                                    if (pendingRemoteCandidatesRef.current.length > 0) {
                                        console.log('[RTC] Adding pending candidates');
                                        pendingRemoteCandidatesRef.current.forEach(async (c) => {
                                            try {
                                                await peerConnectionRef.current!.addIceCandidate(new RTCIceCandidate(c));
                                            } catch (e) {
                                                console.warn('[RTC] Failed to add candidate:', e);
                                            }
                                        });
                                        pendingRemoteCandidatesRef.current = [];
                                    }
                                }).catch(e => console.warn('[RTC] setRemoteDescription error:', e));
                            }
                        } else if (type === 'ice-candidate' && data.author !== user_id) {
                            if (peerConnectionRef.current && data.candidate) {
                                if (remoteDescriptionSetRef.current) {
                                    console.log('[RTC] Adding ICE candidate:', data.candidate.type);
                                    peerConnectionRef.current.addIceCandidate(
                                        new RTCIceCandidate(data.candidate)
                                    ).catch(e => console.warn('[RTC] addIceCandidate error:', e));
                                } else {
                                    console.log('[RTC] Queueing ICE candidate');
                                    pendingRemoteCandidatesRef.current.push(data.candidate);
                                }
                            }
                        } else if (type === 'hangup' && data.author !== user_id) {
                            console.log('[WS] Received hangup');
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
                    if (wsRef.current === ws) {
                        wsRef.current = null;
                    }
                    setWsConnected(false);

                    if (!isIntentionallyClosed) {
                        console.log('[WS] Reconnecting in 3s...');
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
    }, [user_id, interlocutorId, hangup]);

    const getStatusText = () => {
        if (callStatus === CallStatus.CALLING) return 'Вызов...';
        if (callStatus === CallStatus.RINGING) return 'Входящий вызов';
        if (callStatus === CallStatus.CONNECTED) return 'В разговоре';
        if (interlocutorOnline) return 'Online';
        return 'Offline';
    };

    const getStatusColor = () => {
        if (callStatus !== CallStatus.IDLE) return 'error';
        if (interlocutorOnline) return 'success';
        return 'default';
    };

    const isInCall = useMemo(() => callStatus !== CallStatus.IDLE, [callStatus]);

    return (
        <div id="messenger" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            {isLoaded && (
                <Paper sx={{ p: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <IconButton onClick={() => navigate('/friends')} size="small">
                            <ArrowBackIcon />
                        </IconButton>
                        <Avatar sx={{ width: 36, height: 36 }}>
                            {interlocutorName[0]?.toUpperCase() || '?'}
                        </Avatar>
                        <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
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
                    {callStatus === CallStatus.IDLE ? (
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                            <IconButton 
                                onClick={() => startCall(false)} 
                                color="primary"
                                size="small"
                            >
                                <PhoneIcon />
                            </IconButton>
                            <IconButton 
                                onClick={() => startCall(true)} 
                                color="primary"
                                size="small"
                            >
                                <VideocamIcon />
                            </IconButton>
                        </Box>
                    ) : (
                        <Fab 
                            color="error" 
                            size="small"
                            onClick={hangup}
                        >
                            <CallEndIcon />
                        </Fab>
                    )}
                </Paper>
            )}

            {!isLoaded ? (
                <section style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CircularProgress color="secondary" />
                </section>
            ) : interlocutorId === -1 ? (
                <span style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    Выберите собеседника
                </span>
            ) : (
                <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column' }}>
                    {isInCall && (remoteStream || isVideoEnabled) && (
                        <Dialog
                            open={isInCall}
                            onClose={hangup}
                            fullScreen
                            PaperProps={{ sx: { backgroundColor: '#000' } }}
                        >
                            <DialogContent sx={{ p: 0, height: '100vh', display: 'flex', flexDirection: 'column' }}>
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
                                        <Avatar sx={{ width: 80, height: 80, mb: 2 }}>
                                            {interlocutorName[0]?.toUpperCase()}
                                        </Avatar>
                                        <Typography variant="h6" color="white">
                                            {interlocutorName}
                                        </Typography>
                                        <Typography variant="body2" color="grey.400">
                                            Камера выключена
                                        </Typography>
                                    </Box>
                                )}

                                {isVideoEnabled && localStream && (
                                    <Box sx={{
                                        position: 'absolute',
                                        bottom: 80,
                                        right: 10,
                                        width: 100,
                                        height: 140,
                                        borderRadius: 2,
                                        overflow: 'hidden',
                                        border: '2px solid #4CAF50',
                                        backgroundColor: '#222'
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

                                <Box sx={{ p: 2, display: 'flex', gap: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.8)' }}>
                                    <Fab
                                        size="medium"
                                        color={isAudioEnabled ? 'default' : 'error'}
                                        onClick={toggleAudio}
                                    >
                                        {isAudioEnabled ? <MicIcon /> : <MicOffIcon />}
                                    </Fab>
                                    <Fab
                                        size="medium"
                                        color={isVideoEnabled ? 'default' : 'error'}
                                        onClick={toggleVideo}
                                    >
                                        {isVideoEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
                                    </Fab>
                                    <Fab
                                        size="medium"
                                        color="error"
                                        onClick={hangup}
                                    >
                                        <CallEndIcon />
                                    </Fab>
                                </Box>
                            </DialogContent>
                        </Dialog>
                    )}

                    {callStatus === CallStatus.IDLE && (
                        <section ref={messagesBlockRef} style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                            {messages.length === 0 && <span>История пуста</span>}
                            {messages.map((m, i) => (
                                <Stack
                                    key={i}
                                    direction="row"
                                    sx={{
                                        mb: 1,
                                        justifyContent: m.author === user_id ? 'flex-end' : 'flex-start',
                                        alignItems: 'flex-end',
                                        gap: 0.5
                                    }}
                                >
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            maxWidth: '70%',
                                            p: 1,
                                            borderRadius: 2,
                                            backgroundColor: m.author === user_id ? '#4CAF50' : '#555',
                                            color: '#fff'
                                        }}
                                    >
                                        {m.text}
                                    </Typography>
                                    {m.author === user_id && (
                                        <>
                                            {m.is_read ? <DoneAllIcon sx={{ fontSize: 16 }} /> : <CheckIcon sx={{ fontSize: 16 }} />}
                                        </>
                                    )}
                                </Stack>
                            ))}
                        </section>
                    )}
                </Box>
            )}

            <Dialog
                open={callStatus === CallStatus.RINGING}
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

            <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

            {callStatus === CallStatus.IDLE && (
                <section style={{ padding: '10px', display: 'flex', gap: '10px' }}>
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
            )}
        </div>
    );
}