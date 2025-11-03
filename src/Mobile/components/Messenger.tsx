// Mobile Messenger - FIXED VERSION
// Key improvements:
// 1. Auto-scroll fixed
// 2. Keyboard doesn't break UI
// 3. Read receipts work correctly
// 4. Status tracking fixed
// 5. Incoming call dialog uncloseable

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
    Stack,
    Badge
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

type UserStatus = 'online' | 'offline' | 'typing' | 'in_call';

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
    const [userStatus, setUserStatus] = useState<UserStatus>('offline');
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
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // FIXED: Dynamic viewport height for mobile
    useEffect(() => {
        const setVH = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        
        setVH();
        window.addEventListener('resize', setVH);
        window.addEventListener('orientationchange', setVH);
        
        return () => {
            window.removeEventListener('resize', setVH);
            window.removeEventListener('orientationchange', setVH);
        };
    }, []);

    // FIXED: Auto-scroll to bottom
    const scrollToBottom = useCallback(() => {
        requestAnimationFrame(() => {
            if (messagesBlockRef.current) {
                messagesBlockRef.current.scrollTo({
                    top: messagesBlockRef.current.scrollHeight,
                    behavior: 'smooth'
                });
            }
        });
    }, []);

    useEffect(() => {
        if (isLoaded && messages.length > 0) {
            scrollToBottom();
        }
    }, [messages, isLoaded, scrollToBottom]);

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
                    is_read: m.is_read || false, // FIXED
                    created_at: m.created_at || new Date().toISOString()
                }));
                setMessages(data);
                setIsLoaded(true);
            })
            .catch(err => {
                if (!axios.isCancel(err)) {
                    console.error('[Messages] Failed to load:', err);
                }
                setIsLoaded(true);
            });
        return () => controller.abort();
    }, [user_id, interlocutorId]);

    // FIXED: Mark messages as read
    useEffect(() => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        
        const unreadMessages = messages.filter(m => 
            m.author !== user_id && !m.is_read
        );
        
        if (unreadMessages.length > 0) {
            wsRef.current.send(JSON.stringify({
                type: 'mark_read',
                message_ids: unreadMessages.map(m => m.id),
                author: user_id
            }));
        }
    }, [messages, user_id]);

    const createPeerConnection = useCallback(() => {
        try {
            console.log('[RTC] Creating PeerConnection');
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
                    setTimeout(() => {
                        if (remoteVideoRef.current) {
                            remoteVideoRef.current.srcObject = stream;
                            remoteVideoRef.current.play().catch(() => {});
                        }
                        if (remoteAudioRef.current) {
                            remoteAudioRef.current.srcObject = stream;
                            remoteAudioRef.current.muted = false;
                            remoteAudioRef.current.play().catch(() => {});
                        }
                    }, 100);
                }
            };
            pc.onconnectionstatechange = () => {
                if (pc.connectionState === 'connected') {
                    setCallStatus(CallStatus.CONNECTED);
                } else if (pc.connectionState === 'failed') {
                    alert('Connection failed');
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
        if (interlocutorId === -1) return;
        try {
            setCallStatus(CallStatus.CALLING);
            const constraints = withVideo 
                ? {
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' }
                  }
                : { audio: { echoCancellation: true, noiseSuppression: true }, video: false };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            setLocalStream(stream);
            setIsVideoEnabled(withVideo);
            setIsAudioEnabled(true);
            if (localVideoRef.current && withVideo) {
                localVideoRef.current.srcObject = stream;
            }
            const pc = createPeerConnection();
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
            const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
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
            console.error('[Call] Failed to start:', err);
            setCallStatus(CallStatus.FAILED);
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
                setLocalStream(null);
            }
            alert(`Failed to start call: ${err instanceof Error ? err.message : 'Check permissions'}`);
            setTimeout(() => setCallStatus(CallStatus.IDLE), 2000);
        }
    }, [interlocutorId, user_id, createPeerConnection, localStream]);

    const answerCall = useCallback(async (offer: RTCSessionDescriptionInit, withVideo: boolean) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        try {
            setCallStatus(CallStatus.CONNECTED);
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo });
            setLocalStream(stream);
            setIsVideoEnabled(withVideo);
            setIsAudioEnabled(true);
            if (localVideoRef.current && withVideo) {
                localVideoRef.current.srcObject = stream;
            }
            const pc = createPeerConnection();
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
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
            console.error('[Call] Failed to answer:', err);
            setCallStatus(CallStatus.FAILED);
            alert('Failed to answer call');
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

    // FIXED: Handle typing
    const handleInputChange = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'typing',
                author: user_id
            }));
        }
        
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }
        
        typingTimeoutRef.current = setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'stopped_typing',
                    author: user_id
                }));
            }
        }, 1000);
    };

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
            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }
        }
    }, [interlocutorId, user_id]);

    useEffect(() => {
        if (interlocutorId === -1 || !user_id || user_id === -1) {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            setWsConnected(false);
            setUserStatus('offline');
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
        const connect = () => {
            try {
                const ws = new WebSocket(wsUrl);
                ws.onopen = () => {
                    wsRef.current = ws;
                    setWsConnected(true);
                    console.log('[WS] Connected');
                    heartbeatIntervalRef.current = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'ping' }));
                        }
                    }, 30000);
                };
                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        const type = data.type || 'message';
                        
                        // FIXED: Handle user status
                        if (type === 'user_status' && data.user_id === interlocutorId) {
                            setUserStatus(data.status);
                            return;
                        }
                        
                        // FIXED: Handle read receipts
                        if (type === 'message_read') {
                            setMessages(prev => prev.map(m =>
                                data.message_ids.includes(m.id) 
                                    ? { ...m, is_read: true } 
                                    : m
                            ));
                            return;
                        }
                        
                        if (type === 'typing' && data.author !== user_id) {
                            setUserStatus('typing');
                            return;
                        }
                        
                        if (type === 'stopped_typing' && data.author !== user_id) {
                            setUserStatus('online');
                            return;
                        }
                        
                        if (type === 'message') {
                            setMessages(prev => [...prev, {
                                id: data.id || Date.now(),
                                text: data.text,
                                author: data.author,
                                message_type: 'text',
                                is_read: false, // FIXED
                                created_at: data.created_at || new Date().toISOString()
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
                    } catch (e) {}
                };
                ws.onerror = () => {
                    setWsConnected(false);
                    setUserStatus('offline');
                };
                ws.onclose = () => {
                    if (wsRef.current === ws) {
                        wsRef.current = null;
                    }
                    setWsConnected(false);
                    setUserStatus('offline');
                    if (heartbeatIntervalRef.current) {
                        clearInterval(heartbeatIntervalRef.current);
                    }
                    if (!isIntentionallyClosed) {
                        reconnectTimeout = setTimeout(connect, 3000);
                    }
                };
            } catch (err) {
                setWsConnected(false);
                setUserStatus('offline');
            }
        };
        connect();
        return () => {
            isIntentionallyClosed = true;
            clearTimeout(reconnectTimeout);
            if (heartbeatIntervalRef.current) {
                clearInterval(heartbeatIntervalRef.current);
            }
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [user_id, interlocutorId, hangup]);

    const getStatusText = () => {
        if (callStatus === CallStatus.CALLING) return 'Calling...';
        if (callStatus === CallStatus.RINGING) return 'Incoming call';
        if (callStatus === CallStatus.CONNECTED) {
            const mins = Math.floor(callDuration / 60);
            const secs = callDuration % 60;
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        if (userStatus === 'typing') return 'typing...';
        if (userStatus === 'in_call') return 'In another call';
        if (userStatus === 'online' && wsConnected) return 'Online';
        return 'Offline';
    };

    const getStatusColor = () => {
        if (callStatus === CallStatus.CALLING || callStatus === CallStatus.RINGING) return 'warning';
        if (callStatus === CallStatus.CONNECTED) return 'error';
        if (userStatus === 'typing') return 'info';
        if (userStatus === 'online' && wsConnected) return 'success';
        return 'default';
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const isInCall = useMemo(() => callStatus !== CallStatus.IDLE, [callStatus]);

    // FIXED: Input focus handler
    const handleInputFocus = () => {
        setTimeout(() => {
            inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 300);
    };

    return (
        <div id="messenger" style={{ 
            height: 'calc(var(--vh, 1vh) * 100)', // FIXED: Dynamic height
            display: 'flex', 
            flexDirection: 'column' 
        }}>
            {isLoaded && (
                <Paper sx={{ p: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <IconButton onClick={() => navigate('/friends')} size="small">
                            <ArrowBackIcon />
                        </IconButton>
                        <Badge
                            overlap="circular"
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                            variant="dot"
                            sx={{
                                '& .MuiBadge-badge': {
                                    backgroundColor: userStatus === 'online' ? '#44b700' : '#666',
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    border: '2px solid white'
                                }
                            }}
                        >
                            <Avatar sx={{ width: 36, height: 36 }}>
                                {interlocutorName[0]?.toUpperCase() || '?'}
                            </Avatar>
                        </Badge>
                        <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                                {interlocutorName}
                            </Typography>
                            <Chip
                                label={getStatusText()}
                                color={getStatusColor()}
                                size="small"
                                variant="outlined"
                                sx={{ height: 18, fontSize: '0.65rem' }}
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
                    ) : callStatus !== CallStatus.RINGING && (
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
                    Choose a contact
                </span>
            ) : (
                <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', minHeight: 0 }}>
                    {/* Call Dialog - Fullscreen on mobile */}
                    {(callStatus === CallStatus.CALLING || callStatus === CallStatus.CONNECTED) && (
                        <Dialog
                            open={true}
                            onClose={hangup}
                            fullScreen
                            PaperProps={{ sx: { backgroundColor: '#000' } }}
                        >
                            <DialogContent sx={{ p: 0, height: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                                <Box sx={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a' }}>
                                    {remoteStream && remoteStream.getVideoTracks().length > 0 && remoteStream.getVideoTracks()[0].enabled ? (
                                        <video
                                            ref={remoteVideoRef}
                                            autoPlay
                                            playsInline
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'contain'
                                            }}
                                        />
                                    ) : (
                                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                            <Avatar sx={{ width: 120, height: 120, bgcolor: '#4CAF50', fontSize: 48 }}>
                                                {interlocutorName[0]?.toUpperCase()}
                                            </Avatar>
                                            <Typography variant="h5" color="white">
                                                {interlocutorName}
                                            </Typography>
                                            {callStatus === CallStatus.CALLING && (
                                                <Typography variant="body1" color="grey.400">
                                                    Calling...
                                                </Typography>
                                            )}
                                            {callStatus === CallStatus.CONNECTED && (
                                                <Typography variant="h6" color="grey.300">
                                                    {formatTime(callDuration)}
                                                </Typography>
                                            )}
                                        </Box>
                                    )}
                                    {/* FIXED: Smaller local video on mobile */}
                                    {isVideoEnabled && localStream && localStream.getVideoTracks().length > 0 && (
                                        <Box sx={{
                                            position: 'absolute',
                                            top: 16,
                                            right: 16,
                                            width: 100,
                                            height: 133,
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
                                <Box sx={{ 
                                    p: 3, 
                                    display: 'flex', 
                                    gap: 2, 
                                    justifyContent: 'center', 
                                    alignItems: 'center',
                                    backgroundColor: 'rgba(0,0,0,0.9)',
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
                    )}
                    {callStatus === CallStatus.IDLE && (
                        <section 
                            ref={messagesBlockRef} 
                            style={{ 
                                flex: 1, 
                                overflowY: 'auto', 
                                overflowX: 'hidden',
                                padding: '16px',
                                WebkitOverflowScrolling: 'touch' // FIXED: Smooth scrolling on iOS
                            }}
                        >
                            {messages.length === 0 && <span>No messages yet</span>}
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
                                            p: 1.5,
                                            borderRadius: 2,
                                            backgroundColor: m.author === user_id ? '#4CAF50' : '#555',
                                            color: '#fff',
                                            wordWrap: 'break-word',
                                            borderBottomRightRadius: m.author === user_id ? 0 : 2,
                                            borderBottomLeftRadius: m.author !== user_id ? 0 : 2
                                        }}
                                    >
                                        {m.text}
                                    </Typography>
                                    {m.author === user_id && (
                                        <Box sx={{ display: 'flex', alignItems: 'center', pb: 0.5 }}>
                                            {m.is_read ? 
                                                <DoneAllIcon sx={{ fontSize: 16, color: '#4CAF50' }} /> : 
                                                <CheckIcon sx={{ fontSize: 16, color: '#888' }} />
                                            }
                                        </Box>
                                    )}
                                </Stack>
                            ))}
                        </section>
                    )}
                </Box>
            )}
            {/* Incoming Call Dialog - FIXED: Uncloseable, bigger */}
            <Dialog
                open={callStatus === CallStatus.RINGING}
                onClose={() => {}} // FIXED: Prevent closing
                disableEscapeKeyDown // FIXED: Prevent ESC
                maxWidth="xs"
                fullWidth
                PaperProps={{
                    sx: {
                        bgcolor: '#2a2a2a',
                        color: 'white',
                        minWidth: 320
                    }
                }}
            >
                <DialogContent sx={{ textAlign: 'center', py: 4 }}>
                    <Avatar sx={{ width: 90, height: 90, margin: '0 auto 20px', bgcolor: '#4CAF50', fontSize: 36 }}>
                        {interlocutorName[0]?.toUpperCase()}
                    </Avatar>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                        {interlocutorName}
                    </Typography>
                    <Typography variant="body1" color="grey.400" gutterBottom>
                        {incomingCallVideo ? '📹 Video Call' : '📞 Audio Call'}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', mt: 3 }}>
                        <Fab 
                            color="error" 
                            onClick={declineCall}
                            sx={{ width: 60, height: 60 }}
                        >
                            <CallEndIcon fontSize="large" />
                        </Fab>
                        <Fab
                            sx={{ 
                                bgcolor: '#4CAF50',
                                color: 'white',
                                width: 60,
                                height: 60,
                                '&:hover': { bgcolor: '#45a049' }
                            }}
                            onClick={() => pendingOfferRef.current && answerCall(pendingOfferRef.current, incomingCallVideo)}
                        >
                            <PhoneIcon fontSize="large" />
                        </Fab>
                    </Box>
                </DialogContent>
            </Dialog>
            <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
            {callStatus === CallStatus.IDLE && (
                <section style={{ 
                    padding: '10px', 
                    display: 'flex', 
                    gap: '10px',
                    position: 'sticky', // FIXED: Sticky input
                    bottom: 0,
                    backgroundColor: '#212121',
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                    zIndex: 10
                }}>
                    <TextField
                        style={{ flexGrow: 1 }}
                        color="secondary"
                        multiline
                        maxRows={4}
                        placeholder="Type a message..."
                        inputRef={inputRef}
                        disabled={interlocutorId === -1}
                        onChange={handleInputChange}
                        onFocus={handleInputFocus} // FIXED: Handle keyboard
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