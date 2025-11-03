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
    Badge
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
import { getServerUrl, getWsUrl } from '../../config/serverConfig';
import { getTurnServers, validateIceServers } from '../../config/turnConfig';

interface ExtendedMessage extends MessageType {
    is_read: boolean;
}

type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected' | 'failed';
type UserStatus = 'online' | 'offline' | 'typing' | 'in_call';

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
    const [userStatus, setUserStatus] = useState<UserStatus>('offline');

    const [callStatus, setCallStatus] = useState<CallStatus>('idle');
    const [isVideoCall, setIsVideoCall] = useState(false);
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

    // Auto-scroll to bottom (FIXED)
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
                setIceServers([
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]);
            }
        };
        loadTurnServers();
    }, []);

    useEffect(() => {
        if (callStatus === 'connected') {
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
                    is_read: m.is_read || false, // FIXED: use server value
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

    // Mark messages as read when they appear on screen
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
                    console.log('[RTC] Sending ICE candidate');
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
                console.log('[RTC] ontrack:', e.track.kind);
                if (e.streams && e.streams[0]) {
                    const stream = e.streams[0];
                    setRemoteStream(stream);

                    setTimeout(() => {
                        if (remoteVideoRef.current) {
                            remoteVideoRef.current.srcObject = stream;
                            remoteVideoRef.current.play().catch(err => 
                                console.warn('[RTC] Video play error:', err)
                            );
                        }
                        if (remoteAudioRef.current) {
                            remoteAudioRef.current.srcObject = stream;
                            remoteAudioRef.current.muted = false;
                            remoteAudioRef.current.play().catch(err => 
                                console.warn('[RTC] Audio play error:', err)
                            );
                        }
                    }, 100);
                }
            };

            pc.onconnectionstatechange = () => {
                console.log('[RTC] connectionState:', pc.connectionState);
                if (pc.connectionState === 'connected') {
                    setCallStatus('connected');
                    console.log('[RTC] ✅ Connection established!');
                } else if (pc.connectionState === 'failed') {
                    console.error('[RTC] Connection FAILED');
                    alert('Connection failed. Please check your internet.');
                    hangup();
                } else if (pc.connectionState === 'disconnected') {
                    console.warn('[RTC] Connection disconnected');
                    // Give it 5 seconds to reconnect
                    setTimeout(() => {
                        if (pc.connectionState === 'disconnected') {
                            hangup();
                        }
                    }, 5000);
                }
            };

            pc.oniceconnectionstatechange = () => {
                console.log('[RTC] iceConnectionState:', pc.iceConnectionState);
                if (pc.iceConnectionState === 'failed') {
                    console.error('[RTC] ICE connection failed, restarting ICE...');
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

        setCallStatus('idle');
        setIsVideoCall(false);
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
            setCallStatus('calling');
            setIsVideoCall(withVideo);
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
            console.log('[Call] Got media stream');
            setLocalStream(stream);
            setIsVideoEnabled(withVideo);
            setIsAudioEnabled(true);

            if (localVideoRef.current && withVideo) {
                localVideoRef.current.srcObject = stream;
                localVideoRef.current.play();
            }

            const pc = createPeerConnection();
            
            stream.getTracks().forEach(track => {
                console.log('[Call] Adding local track:', track.kind);
                pc.addTrack(track, stream);
            });

            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });

            await pc.setLocalDescription(offer);

            // Wait for WebSocket
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
            console.log('[Call] ✅ Offer sent');

        } catch (err) {
            console.error('[Call] Failed to start:', err);
            setCallStatus('failed');
            
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
                setLocalStream(null);
            }
            
            alert(`Failed to start call: ${err instanceof Error ? err.message : 'Check permissions'}`);
            setTimeout(() => setCallStatus('idle'), 2000);
        }
    }, [interlocutorId, user_id, createPeerConnection, localStream]);

    const answerCall = useCallback(async (offer: RTCSessionDescriptionInit, withVideo: boolean) => {
        try {
            console.log('[Call] Answering call...');
            setCallStatus('connected');
            setIsVideoCall(withVideo);

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: withVideo
            });

            setLocalStream(stream);
            setIsVideoEnabled(withVideo);
            setIsAudioEnabled(true);

            if (localVideoRef.current && withVideo) {
                localVideoRef.current.srcObject = stream;
                localVideoRef.current.play();
            }

            const pc = createPeerConnection();

            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            remoteDescriptionSetRef.current = true;

            // Process pending ICE candidates
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

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // FIXED: Wait for WebSocket to be ready
            let attempts = 0;
            while ((!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) && attempts < 50) {
                console.log('[Call] Waiting for WebSocket... attempt', attempts);
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }

            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket not ready after waiting');
            }

            wsRef.current.send(JSON.stringify({
                type: 'answer',
                answer: pc.localDescription!.toJSON(),
                author: user_id
            }));
            console.log('[Call] ✅ Answer sent');

        } catch (err) {
            console.error('[Call] Failed to answer:', err);
            setCallStatus('failed');
            alert('Failed to answer call');
            setTimeout(() => setCallStatus('idle'), 2000);
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
        setCallStatus('idle');
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'hangup',
                author: user_id
            }));
        }
    }, [user_id]);

    // Handle typing indicator
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
            
            // Stop typing indicator
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
                    console.log('[WS] ✅ Connected');
                    
                    // Start heartbeat
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

                        // FIXED: Handle user status updates
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

                        // Handle typing indicator
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
                                is_read: false, // FIXED: default to false
                                created_at: data.created_at || new Date().toISOString()
                            }]);
                        } else if (type === 'offer' && data.author !== user_id) {
                            console.log('[WS] Received offer');
                            pendingOfferRef.current = data.offer;
                            setIncomingCallVideo(data.video || false);
                            setCallStatus('ringing');
                        } else if (type === 'answer' && data.author !== user_id) {
                            console.log('[WS] Received answer');
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
                            console.log('[WS] Received hangup');
                            hangup();
                        }
                    } catch (e) {
                        console.error('[WS] Message parse error:', e);
                    }
                };

                ws.onerror = (err) => {
                    console.error('[WS] Error:', err);
                    setWsConnected(false);
                    setUserStatus('offline');
                };

                ws.onclose = () => {
                    console.log('[WS] Closed');
                    if (wsRef.current === ws) {
                        wsRef.current = null;
                    }
                    setWsConnected(false);
                    setUserStatus('offline');
                    
                    if (heartbeatIntervalRef.current) {
                        clearInterval(heartbeatIntervalRef.current);
                    }

                    if (!isIntentionallyClosed) {
                        console.log('[WS] Reconnecting in 3s...');
                        reconnectTimeout = setTimeout(connect, 3000);
                    }
                };
            } catch (err) {
                console.error('[WS] Connection failed:', err);
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
        if (callStatus === 'calling') return 'Calling...';
        if (callStatus === 'ringing') return 'Incoming call';
        if (callStatus === 'connected') {
            const mins = Math.floor(callDuration / 60);
            const secs = callDuration % 60;
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        
        // FIXED: Use actual user status
        if (userStatus === 'typing') return 'typing...';
        if (userStatus === 'in_call') return 'In another call';
        if (userStatus === 'online' && wsConnected) return 'Online';
        
        return 'Offline';
    };

    const getStatusColor = (): "default" | "error" | "success" | "primary" | "secondary" | "info" | "warning" => {
        if (callStatus === 'calling' || callStatus === 'ringing') return 'warning';
        if (callStatus === 'connected') return 'error';
        if (userStatus === 'typing') return 'info';
        if (userStatus === 'online' && wsConnected) return 'success';
        return 'default';
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div id="messenger">
            {isLoaded && (
                <Paper sx={{ 
                    p: 1.5, 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    mb: 1 
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Badge
                            overlap="circular"
                            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                            variant="dot"
                            sx={{
                                '& .MuiBadge-badge': {
                                    backgroundColor: userStatus === 'online' ? '#44b700' : '#666',
                                    color: userStatus === 'online' ? '#44b700' : '#666',
                                    boxShadow: '0 0 0 2px #212121',
                                    width: 12,
                                    height: 12,
                                    borderRadius: '50%'
                                }
                            }}
                        >
                            <Avatar sx={{ width: 40, height: 40 }}>
                                {interlocutorName[0]?.toUpperCase() || '?'}
                            </Avatar>
                        </Badge>
                        <Box>
                            <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                                {interlocutorName}
                            </Typography>
                            <Chip
                                label={getStatusText()}
                                color={getStatusColor()}
                                size="small"
                                sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {callStatus === 'idle' && (
                            <>
                                <IconButton 
                                    onClick={() => startCall(false)} 
                                    color="primary"
                                >
                                    <PhoneIcon />
                                </IconButton>
                                <IconButton 
                                    onClick={() => startCall(true)} 
                                    color="primary"
                                >
                                    <VideocamIcon />
                                </IconButton>
                            </>
                        )}
                        {callStatus !== 'idle' && callStatus !== 'ringing' && (
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

            {!isLoaded ? (
                <section id='loading' style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CircularProgress color="secondary"/>
                </section>
            ) : interlocutorId === -1 ? (
                <span id="choose-interlocutor-text" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    Choose a contact
                </span>
            ) : (
                <Box sx={{ display: 'flex', flex: 1 }}>
                    <section id='messages' ref={messagesBlockRef} style={{ 
                        flex: 1, 
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                    }}>
                        {messages.length === 0 && <span id="no-messages-text">No messages yet</span>}
                        {messages.map((m, i) => (
                            <Box 
                                key={i} 
                                sx={{ 
                                    display: 'flex',
                                    alignItems: 'flex-end',
                                    gap: 1,
                                    justifyContent: m.author === user_id ? 'flex-end' : 'flex-start',
                                    animation: 'slideIn 0.3s ease-out'
                                }}
                            >
                                {m.author !== user_id && (
                                    <Avatar sx={{ width: 32, height: 32, bgcolor: '#8BC34A', fontSize: 14 }}>
                                        {interlocutorName[0]?.toUpperCase()}
                                    </Avatar>
                                )}
                                <Paper
                                    sx={{
                                        p: 1.5,
                                        px: 2,
                                        maxWidth: '60%',
                                        bgcolor: m.author === user_id 
                                            ? 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)' 
                                            : '#3a3a3a',
                                        color: 'white',
                                        borderRadius: 2.5,
                                        borderBottomRightRadius: m.author === user_id ? 0 : 2.5,
                                        borderBottomLeftRadius: m.author !== user_id ? 0 : 2.5,
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                        wordWrap: 'break-word',
                                        background: m.author === user_id 
                                            ? 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)' 
                                            : '#3a3a3a'
                                    }}
                                >
                                    <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                                        {m.text}
                                    </Typography>
                                </Paper>
                                {m.author === user_id && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', pb: 0.3 }}>
                                        {m.is_read ? 
                                            <DoneAllIcon sx={{ fontSize: 18, color: '#4CAF50' }} /> : 
                                            <CheckIcon sx={{ fontSize: 18, color: '#888' }} />
                                        }
                                    </Box>
                                )}
                            </Box>
                        ))}
                    </section>

                    {/* Call Panel (Side by side on desktop) */}
                    {(callStatus === 'calling' || callStatus === 'connected') && (
                        <Box sx={{
                            width: 450,
                            borderLeft: '1px solid #ccc',
                            display: 'flex',
                            flexDirection: 'column',
                            backgroundColor: '#000',
                            position: 'relative'
                        }}>
                            <Box sx={{ 
                                flex: 1, 
                                position: 'relative', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                backgroundColor: '#1a1a1a' 
                            }}>
                                {remoteStream && isVideoCall && remoteStream.getVideoTracks().length > 0 && remoteStream.getVideoTracks()[0].enabled ? (
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
                                        {callStatus === 'calling' && (
                                            <Typography variant="body1" color="grey.400">
                                                Calling...
                                            </Typography>
                                        )}
                                        {callStatus === 'connected' && (
                                            <Typography variant="h6" color="grey.300">
                                                {formatTime(callDuration)}
                                            </Typography>
                                        )}
                                    </Box>
                                )}

                                {/* Local video preview */}
                                {isVideoEnabled && localStream && localStream.getVideoTracks().length > 0 && (
                                    <Box sx={{
                                        position: 'absolute',
                                        bottom: 100,
                                        right: 16,
                                        width: 180,
                                        height: 135,
                                        borderRadius: 2,
                                        overflow: 'hidden',
                                        border: '2px solid #4CAF50',
                                        backgroundColor: '#222',
                                        boxShadow: 3
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

                            {/* Call controls */}
                            <Box sx={{ 
                                p: 2, 
                                display: 'flex', 
                                gap: 2, 
                                justifyContent: 'center', 
                                alignItems: 'center',
                                backgroundColor: 'rgba(0,0,0,0.9)',
                                borderTop: '1px solid #333'
                            }}>
                                <Fab
                                    size="medium"
                                    color={isAudioEnabled ? 'default' : 'error'}
                                    onClick={toggleAudio}
                                    sx={{ bgcolor: isAudioEnabled ? '#424242' : undefined }}
                                >
                                    {isAudioEnabled ? <MicIcon /> : <MicOffIcon />}
                                </Fab>
                                {isVideoCall && localStream && localStream.getVideoTracks().length > 0 && (
                                    <Fab
                                        size="medium"
                                        color={isVideoEnabled ? 'default' : 'error'}
                                        onClick={toggleVideo}
                                        sx={{ bgcolor: isVideoEnabled ? '#424242' : undefined }}
                                    >
                                        {isVideoEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
                                    </Fab>
                                )}
                                <Fab
                                    size="medium"
                                    color="error"
                                    onClick={hangup}
                                >
                                    <CallEndIcon />
                                </Fab>
                            </Box>
                        </Box>
                    )}
                </Box>
            )}

            {/* Incoming Call Dialog - FIXED: Uncloseable */}
            <Dialog 
                open={callStatus === 'ringing'} 
                onClose={() => {}} // Prevent closing by clicking outside
                disableEscapeKeyDown // Prevent ESC key
                maxWidth="sm" 
                fullWidth
                PaperProps={{
                    sx: {
                        minWidth: 420,
                        bgcolor: '#2a2a2a',
                        color: 'white'
                    }
                }}
            >
                <DialogContent sx={{ textAlign: 'center', py: 5 }}>
                    <Avatar sx={{ 
                        width: 100, 
                        height: 100, 
                        margin: '0 auto 24px', 
                        bgcolor: '#4CAF50',
                        fontSize: 40
                    }}>
                        {interlocutorName[0]?.toUpperCase()}
                    </Avatar>
                    <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
                        {interlocutorName}
                    </Typography>
                    <Typography variant="h6" color="grey.400" gutterBottom>
                        {incomingCallVideo ? '📹 Video Call' : '📞 Audio Call'}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 4, justifyContent: 'center', mt: 4 }}>
                        <Fab 
                            color="error" 
                            onClick={declineCall}
                            sx={{ width: 64, height: 64 }}
                        >
                            <CallEndIcon sx={{ fontSize: 32 }} />
                        </Fab>
                        <Fab 
                            sx={{ 
                                bgcolor: '#4CAF50',
                                color: 'white',
                                width: 64,
                                height: 64,
                                '&:hover': {
                                    bgcolor: '#45a049'
                                }
                            }}
                            onClick={() => pendingOfferRef.current && answerCall(pendingOfferRef.current, incomingCallVideo)}
                        >
                            <PhoneIcon sx={{ fontSize: 32 }} />
                        </Fab>
                    </Box>
                </DialogContent>
            </Dialog>

            <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

            <section id='input' style={{ padding: '10px', display: 'flex', gap: '10px' }}>
                <TextField
                    style={{ flexGrow: 1 }}
                    color="secondary"
                    multiline
                    maxRows={4}
                    placeholder="Type a message..."
                    inputRef={inputRef}
                    disabled={interlocutorId === -1}
                    onChange={handleInputChange}
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