import {
    CircularProgress,
    IconButton,
    TextField,
    Dialog,
    DialogContent,
    Avatar,
    Box,
    Typography,
    Fab
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
import CheckIcon from '@mui/icons-material/Check';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
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

    const [callStatus, setCallStatus] = useState<CallStatus>('idle');
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
                    console.log('[RTC] Sending ICE candidate');
                    wsRef.current.send(JSON.stringify({
                        type: 'ice-candidate',
                        candidate: e.candidate.toJSON(),
                        author: user_id
                    }));
                }
            };

            pc.ontrack = (e) => {
                console.log('[RTC] Received remote track:', e.track.kind);
                if (e.streams && e.streams[0]) {
                    const stream = e.streams[0];
                    setRemoteStream(stream);

                    setTimeout(() => {
                        if (remoteVideoRef.current) {
                            remoteVideoRef.current.srcObject = stream;
                            remoteVideoRef.current.play().catch(err => console.error('[RTC] Video play error:', err));
                        }
                        if (remoteAudioRef.current) {
                            remoteAudioRef.current.srcObject = stream;
                            remoteAudioRef.current.muted = false;
                            remoteAudioRef.current.play().catch(err => console.error('[RTC] Audio play error:', err));
                        }
                    }, 100);
                }
            };

            pc.onconnectionstatechange = () => {
                console.log('[RTC] Connection state:', pc.connectionState);
                if (pc.connectionState === 'connected') {
                    setCallStatus('connected');
                } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                    alert('Не удалось установить соединение');
                    hangup();
                }
            };

            pc.oniceconnectionstatechange = () => {
                console.log('[RTC] ICE connection state:', pc.iceConnectionState);
                if (pc.iceConnectionState === 'failed') {
                    console.log('[RTC] ICE failed, restarting');
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

        console.log('[Call] Hanging up');

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
        setIsVideoEnabled(false);
        setIsAudioEnabled(true);
        remoteDescriptionSetRef.current = false;
        pendingRemoteCandidatesRef.current = [];
        pendingOfferRef.current = null;

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
            console.log('[Call] Starting call, video:', withVideo);
            setCallStatus('calling');

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
                console.log('[RTC] Adding local track:', track.kind);
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

            console.log('[Call] Sending offer');
            wsRef.current.send(JSON.stringify({
                type: 'offer',
                offer: pc.localDescription!.toJSON(),
                author: user_id,
                video: withVideo
            }));
        } catch (err) {
            console.error('[Call] Start call error:', err);
            setCallStatus('failed');
            
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
                setLocalStream(null);
            }
            
            alert(`Не удалось начать звонок: ${err instanceof Error ? err.message : 'Проверьте разрешения'}`);
            setTimeout(() => setCallStatus('idle'), 2000);
        }
    }, [interlocutorId, user_id, createPeerConnection, localStream]);

    const answerCall = useCallback(async (offer: RTCSessionDescriptionInit, withVideo: boolean) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        try {
            console.log('[Call] Answering call, video:', withVideo);
            setCallStatus('connected');

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
                console.log('[RTC] Adding local track:', track.kind);
                pc.addTrack(track, stream);
            });

            console.log('[Call] Setting remote description (offer)');
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            remoteDescriptionSetRef.current = true;

            if (pendingRemoteCandidatesRef.current.length > 0) {
                console.log('[Call] Adding', pendingRemoteCandidatesRef.current.length, 'pending candidates');
                for (const c of pendingRemoteCandidatesRef.current) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(c));
                    } catch (e) {
                        console.error('[RTC] Failed to add pending candidate:', e);
                    }
                }
                pendingRemoteCandidatesRef.current = [];
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            console.log('[Call] Sending answer');
            wsRef.current.send(JSON.stringify({
                type: 'answer',
                answer: pc.localDescription!.toJSON(),
                author: user_id
            }));
        } catch (err) {
            console.error('[Call] Answer call error:', err);
            setCallStatus('failed');
            alert('Не удалось ответить на звонок');
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
        console.log('[Call] Declining call');
        pendingOfferRef.current = null;
        setCallStatus('idle');
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

                    // Ping каждые 5 секунд
                    pingInterval = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'ping', author: user_id }));
                        }
                    }, 5000);

                    // Проверка активности каждые 3 секунды
                    if (activityCheckIntervalRef.current) {
                        clearInterval(activityCheckIntervalRef.current);
                    }
                    activityCheckIntervalRef.current = setInterval(() => {
                        const timeSinceLastActivity = Date.now() - lastActivityTimeRef.current;
                        const isOnline = timeSinceLastActivity < 15000; // 15 сек таймаут
                        setInterlocutorOnline(isOnline);
                    }, 3000);

                    // Отправляем уведомление о прочтении
                    ws.send(JSON.stringify({ type: 'read', author: user_id }));
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        const type = data.type || 'message';

                        console.log('[WS] Received:', type, 'from:', data.author);

                        // Обновляем время активности при любом сообщении от собеседника
                        if (data.author !== user_id) {
                            lastActivityTimeRef.current = Date.now();
                            setInterlocutorOnline(true);
                        }

                        if (type === 'pong' && data.author !== user_id) {
                            lastActivityTimeRef.current = Date.now();
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

                            // Если сообщение от собеседника, отправляем подтверждение прочтения
                            if (data.author !== user_id && ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({ type: 'read', author: user_id }));
                            }

                            setTimeout(() => {
                                messagesBlockRef.current?.scrollTo(0, messagesBlockRef.current?.scrollHeight || 0);
                            }, 10);
                        } else if (type === 'read') {
                            // Отмечаем все сообщения как прочитанные
                            setMessages(prev => prev.map(m =>
                                m.author === user_id ? { ...m, is_read: true } : m
                            ));
                        } else if (type === 'typing' && data.author !== user_id) {
                            // Показываем индикатор печати
                            setIsTyping(true);
                            if (typingTimeoutRef.current) {
                                clearTimeout(typingTimeoutRef.current);
                            }
                            typingTimeoutRef.current = setTimeout(() => {
                                setIsTyping(false);
                            }, 3000);
                        } else if (type === 'offer' && data.author !== user_id) {
                            console.log('[Call] Received offer');
                            pendingOfferRef.current = data.offer;
                            setIncomingCallVideo(data.video || false);
                            setCallStatus('ringing');
                        } else if (type === 'answer' && data.author !== user_id) {
                            console.log('[Call] Received answer');
                            if (peerConnectionRef.current && data.answer) {
                                peerConnectionRef.current.setRemoteDescription(
                                    new RTCSessionDescription(data.answer)
                                ).then(() => {
                                    console.log('[RTC] Remote description set (answer)');
                                    remoteDescriptionSetRef.current = true;
                                    
                                    if (pendingRemoteCandidatesRef.current.length > 0) {
                                        console.log('[RTC] Adding', pendingRemoteCandidatesRef.current.length, 'pending candidates');
                                        pendingRemoteCandidatesRef.current.forEach(async (c) => {
                                            try {
                                                await peerConnectionRef.current!.addIceCandidate(new RTCIceCandidate(c));
                                            } catch (e) {
                                                console.error('[RTC] Failed to add pending candidate:', e);
                                            }
                                        });
                                        pendingRemoteCandidatesRef.current = [];
                                    }
                                }).catch(err => console.error('[RTC] Failed to set remote description:', err));
                            }
                        } else if (type === 'ice-candidate' && data.author !== user_id) {
                            console.log('[Call] Received ICE candidate');
                            if (peerConnectionRef.current && data.candidate) {
                                if (remoteDescriptionSetRef.current) {
                                    peerConnectionRef.current.addIceCandidate(
                                        new RTCIceCandidate(data.candidate)
                                    ).catch(err => console.error('[RTC] Failed to add ICE candidate:', err));
                                } else {
                                    console.log('[RTC] Queueing ICE candidate');
                                    pendingRemoteCandidatesRef.current.push(data.candidate);
                                }
                            }
                        } else if (type === 'hangup' && data.author !== user_id) {
                            console.log('[Call] Received hangup');
                            hangup();
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
    }, [user_id, interlocutorId, hangup]);

    const getStatusText = () => {
        if (callStatus === 'calling') return 'Вызов...';
        if (callStatus === 'ringing') return 'Входящий вызов';
        if (callStatus === 'connected') {
            const mins = Math.floor(callDuration / 60);
            const secs = callDuration % 60;
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        if (isTyping) return 'печатает...';
        if (interlocutorOnline) return 'в сети';
        return 'не в сети';
    };

    const getStatusColor = () => {
        if (callStatus === 'calling' || callStatus === 'ringing') return '#FFA726';
        if (callStatus === 'connected') return '#EF5350';
        if (isTyping) return '#29B6F6';
        if (interlocutorOnline) return '#4CAF50';
        return '#757575';
    };

    // Функция для отправки typing
    const sendTyping = useCallback(() => {
        const now = Date.now();
        // Отправляем typing не чаще чем раз в 2 секунды
        if (now - lastTypingSentRef.current > 2000 && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'typing', author: user_id }));
            lastTypingSentRef.current = now;
        }
    }, [user_id]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div id="messenger">
            {isLoaded && interlocutorId !== -1 && (
                <Box sx={{
                    p: 2,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'linear-gradient(180deg, rgba(22,33,62,1) 0%, rgba(26,26,46,0.95) 100%)',
                    borderBottom: '1px solid rgba(76, 175, 80, 0.2)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{ position: 'relative' }}>
                            <Avatar
                                sx={{
                                    width: 48,
                                    height: 48,
                                    background: 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)',
                                    fontSize: '1.2rem',
                                    fontWeight: 'bold',
                                    boxShadow: '0 2px 10px rgba(76, 175, 80, 0.3)'
                                }}
                            >
                                {interlocutorName[0]?.toUpperCase() || '?'}
                            </Avatar>
                            {interlocutorOnline && callStatus === 'idle' && !isTyping && (
                                <Box
                                    sx={{
                                        position: 'absolute',
                                        bottom: 0,
                                        right: 0,
                                        width: 14,
                                        height: 14,
                                        backgroundColor: '#4CAF50',
                                        borderRadius: '50%',
                                        border: '3px solid #1a1a2e',
                                        boxShadow: '0 0 8px #4CAF50'
                                    }}
                                />
                            )}
                        </Box>
                        <Box>
                            <Typography sx={{ fontWeight: 600, color: '#fff', fontSize: '1.1rem' }}>
                                {interlocutorName}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <FiberManualRecordIcon
                                    sx={{
                                        fontSize: 10,
                                        color: getStatusColor(),
                                        animation: (callStatus === 'calling' || isTyping) ? 'pulse 1.5s infinite' : 'none',
                                        '@keyframes pulse': {
                                            '0%, 100%': { opacity: 1 },
                                            '50%': { opacity: 0.4 }
                                        }
                                    }}
                                />
                                <Typography sx={{ color: getStatusColor(), fontSize: '0.85rem', fontWeight: 500 }}>
                                    {getStatusText()}
                                </Typography>
                            </Box>
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1.5 }}>
                        {callStatus === 'idle' ? (
                            <>
                                <IconButton
                                    onClick={() => startCall(false)}
                                    sx={{
                                        color: '#4CAF50',
                                        backgroundColor: 'rgba(76, 175, 80, 0.15)',
                                        '&:hover': {
                                            backgroundColor: 'rgba(76, 175, 80, 0.3)',
                                            transform: 'scale(1.1)'
                                        },
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <PhoneIcon />
                                </IconButton>
                                <IconButton
                                    onClick={() => startCall(true)}
                                    sx={{
                                        color: '#4CAF50',
                                        backgroundColor: 'rgba(76, 175, 80, 0.15)',
                                        '&:hover': {
                                            backgroundColor: 'rgba(76, 175, 80, 0.3)',
                                            transform: 'scale(1.1)'
                                        },
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <VideocamIcon />
                                </IconButton>
                            </>
                        ) : (callStatus !== 'ringing' && (
                            <Fab
                                color="error"
                                size="small"
                                onClick={hangup}
                                sx={{ boxShadow: '0 4px 15px rgba(239, 83, 80, 0.4)' }}
                            >
                                <CallEndIcon />
                            </Fab>
                        ))}
                    </Box>
                </Box>
            )}

            {!isLoaded ? (
                <section id='loading' style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CircularProgress color="secondary"/>
                </section>
            ) : interlocutorId === -1 ? (
                <span id="choose-interlocutor-text" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    Выберите собеседника
                </span>
            ) : (
                <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    <section id='messages' ref={messagesBlockRef} style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                        {messages.length === 0 && <span id="no-messages-text">История пуста</span>}
                        {messages.map((m, i) => {
                            const isMe = m.author === user_id;
                            return (
                                <Box
                                    key={i}
                                    sx={{
                                        mb: 1.5,
                                        display: 'flex',
                                        alignItems: 'flex-end',
                                        gap: 0.5,
                                        justifyContent: isMe ? 'flex-end' : 'flex-start'
                                    }}
                                >
                                    <Box sx={{
                                        maxWidth: '60%',
                                        p: '10px 14px',
                                        borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                        background: isMe
                                            ? 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)'
                                            : 'rgba(255,255,255,0.08)',
                                        color: '#fff',
                                        wordWrap: 'break-word',
                                        boxShadow: isMe
                                            ? '0 2px 12px rgba(76, 175, 80, 0.3)'
                                            : '0 2px 8px rgba(0,0,0,0.2)',
                                        border: isMe ? 'none' : '1px solid rgba(255,255,255,0.08)'
                                    }}>
                                        <Typography variant="body2" sx={{ fontSize: '0.95rem', lineHeight: 1.4 }}>
                                            {m.text}
                                        </Typography>
                                    </Box>
                                    {isMe && (
                                        m.is_read ?
                                            <DoneAllIcon sx={{ fontSize: 16, color: '#4CAF50', filter: 'drop-shadow(0 0 4px rgba(76, 175, 80, 0.5))' }} /> :
                                            <CheckIcon sx={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }} />
                                    )}
                                </Box>
                            );
                        })}
                    </section>

                    {(callStatus === 'calling' || callStatus === 'connected') && (
                        <Box sx={{
                            width: 400,
                            borderLeft: '1px solid #444',
                            display: 'flex',
                            flexDirection: 'column',
                            backgroundColor: '#000',
                            position: 'relative'
                        }}>
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
                                        <Avatar sx={{ width: 100, height: 100, bgcolor: '#4CAF50', fontSize: 40 }}>
                                            {interlocutorName[0]?.toUpperCase()}
                                        </Avatar>
                                        <Typography variant="h6" color="white">
                                            {interlocutorName}
                                        </Typography>
                                        {callStatus === 'calling' && (
                                            <Typography variant="body2" color="grey.400">
                                                Вызов...
                                            </Typography>
                                        )}
                                        {callStatus === 'connected' && (
                                            <Typography variant="body2" color="grey.400">
                                                {formatTime(callDuration)}
                                            </Typography>
                                        )}
                                    </Box>
                                )}

                                {isVideoEnabled && localStream && localStream.getVideoTracks().length > 0 && (
                                    <Box sx={{
                                        position: 'absolute',
                                        bottom: 100,
                                        right: 16,
                                        width: 160,
                                        height: 120,
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
                                {localStream && localStream.getVideoTracks().length > 0 && (
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

            <Dialog
                open={callStatus === 'ringing'}
                onClose={declineCall}
                maxWidth="xs"
                fullWidth
                PaperProps={{
                    sx: {
                        background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
                        backgroundImage: 'none',
                        borderRadius: 3,
                        border: '1px solid rgba(76, 175, 80, 0.2)'
                    }
                }}
            >
                <DialogContent sx={{ textAlign: 'center', py: 5 }}>
                    {/* Пульсирующий круг */}
                    <Box sx={{
                        position: 'relative',
                        display: 'inline-block',
                        mb: 2,
                        '&::before': {
                            content: '""',
                            position: 'absolute',
                            top: -10,
                            left: -10,
                            right: -10,
                            bottom: -10,
                            borderRadius: '50%',
                            border: '2px solid rgba(76, 175, 80, 0.3)',
                            animation: 'pulse-ring 1.5s ease-out infinite'
                        },
                        '@keyframes pulse-ring': {
                            '0%': { transform: 'scale(0.9)', opacity: 1 },
                            '100%': { transform: 'scale(1.3)', opacity: 0 }
                        }
                    }}>
                        <Avatar
                            sx={{
                                width: 90,
                                height: 90,
                                background: 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)',
                                fontSize: '2rem',
                                fontWeight: 'bold',
                                boxShadow: '0 4px 20px rgba(76, 175, 80, 0.4)'
                            }}
                        >
                            {interlocutorName[0]?.toUpperCase()}
                        </Avatar>
                    </Box>

                    <Typography
                        variant="h5"
                        sx={{
                            color: '#fff',
                            fontWeight: 600,
                            mb: 1
                        }}
                    >
                        {interlocutorName}
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 3 }}>
                        {incomingCallVideo ? <VideocamIcon sx={{ color: '#4CAF50', fontSize: 20 }} /> : <PhoneIcon sx={{ color: '#4CAF50', fontSize: 20 }} />}
                        <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem' }}>
                            Входящий {incomingCallVideo ? 'видео' : 'аудио'} звонок
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <Box sx={{ textAlign: 'center' }}>
                            <Fab
                                onClick={declineCall}
                                sx={{
                                    background: 'linear-gradient(135deg, #EF5350 0%, #C62828 100%)',
                                    boxShadow: '0 4px 15px rgba(239, 83, 80, 0.4)',
                                    '&:hover': {
                                        background: 'linear-gradient(135deg, #F44336 0%, #D32F2F 100%)',
                                    }
                                }}
                                size="large"
                            >
                                <CallEndIcon />
                            </Fab>
                            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', mt: 1 }}>
                                Отклонить
                            </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'center' }}>
                            <Fab
                                onClick={() => pendingOfferRef.current && answerCall(pendingOfferRef.current, incomingCallVideo)}
                                sx={{
                                    background: 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)',
                                    boxShadow: '0 4px 15px rgba(76, 175, 80, 0.4)',
                                    '&:hover': {
                                        background: 'linear-gradient(135deg, #66BB6A 0%, #43A047 100%)',
                                    }
                                }}
                                size="large"
                            >
                                <PhoneIcon />
                            </Fab>
                            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', mt: 1 }}>
                                Ответить
                            </Typography>
                        </Box>
                    </Box>
                </DialogContent>
            </Dialog>

            <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

            <Box sx={{
                p: 2,
                display: 'flex',
                gap: 2,
                alignItems: 'flex-end',
                background: 'linear-gradient(180deg, rgba(26,26,46,0.95) 0%, rgba(22,33,62,1) 100%)',
                borderTop: '1px solid rgba(76, 175, 80, 0.3)',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.3)'
            }}>
                <TextField
                    fullWidth
                    color="secondary"
                    multiline
                    maxRows={4}
                    placeholder="Сообщение..."
                    inputRef={inputRef}
                    disabled={interlocutorId === -1}
                    onChange={sendTyping}
                    onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                        }
                    }}
                    sx={{
                        '& .MuiOutlinedInput-root': {
                            color: '#fff',
                            backgroundColor: 'rgba(255,255,255,0.08)',
                            borderRadius: '20px',
                            fontSize: '15px',
                            '& fieldset': {
                                borderColor: 'rgba(76, 175, 80, 0.3)',
                                borderWidth: '1px'
                            },
                            '&:hover fieldset': {
                                borderColor: 'rgba(76, 175, 80, 0.5)'
                            },
                            '&.Mui-focused fieldset': {
                                borderColor: '#4CAF50',
                                borderWidth: '2px'
                            }
                        },
                        '& .MuiOutlinedInput-input': {
                            padding: '10px 16px',
                            '&::placeholder': {
                                color: 'rgba(255,255,255,0.5)',
                                opacity: 1
                            }
                        }
                    }}
                />
                <IconButton
                    onClick={sendMessage}
                    disabled={interlocutorId === -1}
                    sx={{
                        width: 48,
                        height: 48,
                        background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
                        color: '#fff',
                        boxShadow: '0 4px 15px rgba(76, 175, 80, 0.4)',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                            background: 'linear-gradient(135deg, #5CBF60 0%, #4CAF50 100%)',
                            transform: 'scale(1.05)',
                            boxShadow: '0 6px 20px rgba(76, 175, 80, 0.5)'
                        },
                        '&:active': {
                            transform: 'scale(0.95)'
                        },
                        '&:disabled': {
                            background: 'rgba(255,255,255,0.1)',
                            color: 'rgba(255,255,255,0.3)',
                            boxShadow: 'none'
                        }
                    }}
                >
                    <SendIcon sx={{ fontSize: 22 }} />
                </IconButton>
            </Box>
        </div>
    );
}