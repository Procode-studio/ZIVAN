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
import { MessengerInterlocutorId } from "../pages/MessengerPage";
import { UserInfoContext } from "../../App";
import axios from "axios";
import { getServerUrl, getWsUrl } from '../../config/serverConfig';
import { getTurnServers, validateIceServers } from '../../config/turnConfig';
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
    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const [iceServers, setIceServers] = useState<RTCIceServer[]>([]);
    const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
    const pendingRemoteCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const remoteDescriptionSetRef = useRef(false);
    const hangupProcessingRef = useRef(false);
    const [callDuration, setCallDuration] = useState(0);
    const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const hangupRef = useRef<() => void>();

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    useEffect(() => {
        const loadTurnServers = async () => {
            try {
                const servers = await getTurnServers();
                const validated = validateIceServers(servers);
                setIceServers(validated);
            } catch (err) {
                setIceServers([{ urls: 'stun:stun.l.google.com:19302' }]);
            }
        };
        loadTurnServers();
    }, []);

    useEffect(() => {
        return () => {
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
                localStreamRef.current = null;
            }
            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
                peerConnectionRef.current = null;
            }
        };
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
            // Валидация ICE серверов перед использованием
            const validIceServers = iceServers?.length ? iceServers.filter(server => {
                if (!server.urls) return false;
                const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
                // Проверяем что все URL валидны
                return urls.every(url => {
                    if (typeof url !== 'string') return false;
                    // Разрешаем только stun: и turn:/turns:
                    return /^(stun|turns?):/.test(url);
                });
            }) : [];

            console.log('[RTC] Creating PeerConnection with ICE servers:', validIceServers);

            const config: RTCConfiguration = {
                iceServers: validIceServers.length > 0 ? validIceServers : [
                    { urls: 'stun:stun.l.google.com:19302' }
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
                    setRemoteStream(e.streams[0]);
                }
            };

            pc.onconnectionstatechange = () => {
                console.log('[RTC] Connection state:', pc.connectionState);
                if (pc.connectionState === 'connected') {
                    setCallStatus('connected');
                } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                    alert('Не удалось установить соединение');
                    hangupRef.current?.();
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

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                console.log('[Call] Stopping track:', track.kind);
                track.stop();
            });
            localStreamRef.current = null;
        }

        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
        }
        setLocalStream(null);

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
        }, 500);
    }, [user_id, localStream]);

    // Обновляем ref при изменении hangup
    useEffect(() => {
        hangupRef.current = hangup;
    }, [hangup]);

    // Устанавливаем remoteStream на video/audio элементы
    useEffect(() => {
        if (!remoteStream) {
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
            if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
            return;
        }

        if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch(err => {
                if (err.name !== 'AbortError') {
                    console.error('[RTC] Video play error:', err);
                }
            });
        }

        if (remoteAudioRef.current && remoteAudioRef.current.srcObject !== remoteStream) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.muted = false;
            remoteAudioRef.current.play().catch(err => {
                if (err.name !== 'AbortError') {
                    console.error('[RTC] Audio play error:', err);
                }
            });
        }
    }, [remoteStream]);

    useEffect(() => {
        if (callStatus === 'idle' && localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                console.log('[Call] Stopping track (idle):', track.kind);
                track.stop();
            });
            localStreamRef.current = null;
            setLocalStream(null);
        }
    }, [callStatus]);

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
            localStreamRef.current = stream;
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
        // Защита от двойного вызова
        if (callStatus !== 'ringing') return;
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        try {
            console.log('[Call] Answering call, video:', withVideo);
            setCallStatus('calling');

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: withVideo
            });
            localStreamRef.current = stream;
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

            // Ждём подключения WS до 5 секунд
            let attempts = 0;
            while ((!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) && attempts < 50) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }

            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket not connected');
            }

            wsRef.current.send(JSON.stringify({
                type: 'answer',
                answer: pc.localDescription!.toJSON(),
                author: user_id
            }));
        } catch (err) {
            console.error('[Call] Answer call error:', err);
            setCallStatus('failed');
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(t => t.stop());
                localStreamRef.current = null;
            }
            setLocalStream(null);
            alert('Не удалось ответить на звонок');
            setTimeout(() => setCallStatus('idle'), 2000);
        }
    }, [user_id, createPeerConnection, callStatus]);

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

                        // Логируем только важные события (не ping/pong/typing)
                        if (!['ping', 'pong', 'typing', 'read'].includes(type)) {
                            console.log('[WS] Received:', type, 'from:', data.author);
                        }

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
                            if (data.candidate) {
                                if (peerConnectionRef.current && remoteDescriptionSetRef.current) {
                                    // PC существует и remote description установлен - добавляем сразу
                                    peerConnectionRef.current.addIceCandidate(
                                        new RTCIceCandidate(data.candidate)
                                    ).catch(err => console.error('[RTC] Failed to add ICE candidate:', err));
                                } else {
                                    // PC еще не создан или remote description не установлен - сохраняем в очередь
                                    pendingRemoteCandidatesRef.current.push(data.candidate);
                                }
                            }
                        } else if (type === 'hangup' && data.author !== user_id) {
                            console.log('[Call] Received hangup');
                            hangupRef.current?.();
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

                    if (callStatus !== 'idle' && hangupRef.current) {
                        console.log('[WS] Terminating call due to disconnect');
                        hangupRef.current();
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
    }, [user_id, interlocutorId]);

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

    const sendTyping = useCallback(() => {
        const now = Date.now();
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
                            {interlocutorOnline && callStatus === 'idle' && !isTyping && (
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
                        {callStatus === 'idle' ? (
                            <>
                                <IconButton onClick={() => startCall(false)} sx={{ color: theme.accent }}>
                                    <PhoneIcon />
                                </IconButton>
                                <IconButton onClick={() => startCall(true)} sx={{ color: theme.accent }}>
                                    <VideocamIcon />
                                </IconButton>
                            </>
                        ) : callStatus !== 'ringing' && (
                            <Fab color="error" size="small" onClick={hangup}>
                                <CallEndIcon />
                            </Fab>
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
                    {/* Messages */}
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

            {/* Active call dialog - fullscreen */}
            <Dialog
                open={callStatus === 'calling' || callStatus === 'connected'}
                onClose={hangup}
                fullScreen
                PaperProps={{
                    sx: {
                        background: 'linear-gradient(180deg, #0a0a15 0%, #1a1a2e 100%)',
                        margin: 0,
                        borderRadius: 0
                    }
                }}
            >
                <DialogContent sx={{
                    p: 0,
                    height: '100vh',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    {/* Remote video or avatar */}
                    <Box sx={{
                        flex: 1,
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'linear-gradient(180deg, #0a0a15 0%, #1a1a2e 100%)',
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
                                    objectFit: 'contain'
                                }}
                            />
                        ) : (
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                {/* Пульсирующий круг при вызове */}
                                <Box sx={{
                                    position: 'relative',
                                    '&::before': callStatus === 'calling' ? {
                                        content: '""',
                                        position: 'absolute',
                                        top: -20,
                                        left: -20,
                                        right: -20,
                                        bottom: -20,
                                        borderRadius: '50%',
                                        border: '3px solid rgba(76, 175, 80, 0.3)',
                                        animation: 'pulse-call 2s ease-out infinite'
                                    } : {},
                                    '@keyframes pulse-call': {
                                        '0%': { transform: 'scale(0.9)', opacity: 1 },
                                        '100%': { transform: 'scale(1.5)', opacity: 0 }
                                    }
                                }}>
                                    <Avatar
                                        sx={{
                                            width: 150,
                                            height: 150,
                                            background: 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)',
                                            fontSize: '3.5rem',
                                            fontWeight: 'bold',
                                            boxShadow: '0 10px 40px rgba(76, 175, 80, 0.4)'
                                        }}
                                    >
                                        {interlocutorName[0]?.toUpperCase()}
                                    </Avatar>
                                </Box>
                                <Typography
                                    variant="h4"
                                    sx={{
                                        color: '#fff',
                                        fontWeight: 600,
                                        textShadow: '0 2px 10px rgba(0,0,0,0.5)'
                                    }}
                                >
                                    {interlocutorName}
                                </Typography>
                                {callStatus === 'calling' && (
                                    <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.2rem' }}>
                                        Вызов...
                                    </Typography>
                                )}
                                {callStatus === 'connected' && (
                                    <Typography
                                        sx={{
                                            color: '#4CAF50',
                                            fontSize: '2rem',
                                            fontWeight: 500,
                                            fontFamily: 'monospace'
                                        }}
                                    >
                                        {formatTime(callDuration)}
                                    </Typography>
                                )}
                            </Box>
                        )}

                        {/* Local video preview */}
                        {isVideoEnabled && localStream && localStream.getVideoTracks().length > 0 && (
                            <Box sx={{
                                position: 'absolute',
                                top: 30,
                                right: 30,
                                width: 240,
                                height: 180,
                                borderRadius: 3,
                                overflow: 'hidden',
                                border: '3px solid rgba(76, 175, 80, 0.5)',
                                backgroundColor: '#111',
                                boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
                                zIndex: 10
                            }}>
                                <video ref={localVideoRef} autoPlay muted playsInline
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

                    {/* Controls */}
                    <Box sx={{
                        p: 4,
                        display: 'flex',
                        gap: 3,
                        justifyContent: 'center',
                        alignItems: 'center',
                        background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.95) 100%)',
                        position: 'relative',
                        zIndex: 20
                    }}>
                        <Box sx={{ textAlign: 'center' }}>
                            <Fab
                                size="large"
                                onClick={toggleAudio}
                                sx={{
                                    width: 70,
                                    height: 70,
                                    background: isAudioEnabled
                                        ? 'rgba(255,255,255,0.15)'
                                        : 'linear-gradient(135deg, #EF5350 0%, #C62828 100%)',
                                    color: '#fff',
                                    boxShadow: isAudioEnabled
                                        ? '0 6px 20px rgba(0,0,0,0.3)'
                                        : '0 6px 20px rgba(239, 83, 80, 0.5)',
                                    '&:hover': {
                                        background: isAudioEnabled
                                            ? 'rgba(255,255,255,0.25)'
                                            : 'linear-gradient(135deg, #F44336 0%, #D32F2F 100%)',
                                        transform: 'scale(1.05)'
                                    },
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {isAudioEnabled ? <MicIcon sx={{ fontSize: 32 }} /> : <MicOffIcon sx={{ fontSize: 32 }} />}
                            </Fab>
                            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', mt: 1 }}>
                                {isAudioEnabled ? 'Микрофон' : 'Выключен'}
                            </Typography>
                        </Box>

                        {localStream && localStream.getVideoTracks().length > 0 && (
                            <Box sx={{ textAlign: 'center' }}>
                                <Fab
                                    size="large"
                                    onClick={toggleVideo}
                                    sx={{
                                        width: 70,
                                        height: 70,
                                        background: isVideoEnabled
                                            ? 'rgba(255,255,255,0.15)'
                                            : 'linear-gradient(135deg, #EF5350 0%, #C62828 100%)',
                                        color: '#fff',
                                        boxShadow: isVideoEnabled
                                            ? '0 6px 20px rgba(0,0,0,0.3)'
                                            : '0 6px 20px rgba(239, 83, 80, 0.5)',
                                        '&:hover': {
                                            background: isVideoEnabled
                                                ? 'rgba(255,255,255,0.25)'
                                                : 'linear-gradient(135deg, #F44336 0%, #D32F2F 100%)',
                                            transform: 'scale(1.05)'
                                        },
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    {isVideoEnabled ? <VideocamIcon sx={{ fontSize: 32 }} /> : <VideocamOffIcon sx={{ fontSize: 32 }} />}
                                </Fab>
                                <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', mt: 1 }}>
                                    {isVideoEnabled ? 'Камера' : 'Выключена'}
                                </Typography>
                            </Box>
                        )}

                        <Box sx={{ textAlign: 'center' }}>
                            <Fab
                                size="large"
                                onClick={hangup}
                                sx={{
                                    width: 70,
                                    height: 70,
                                    background: 'linear-gradient(135deg, #EF5350 0%, #C62828 100%)',
                                    color: '#fff',
                                    boxShadow: '0 8px 30px rgba(239, 83, 80, 0.6)',
                                    '&:hover': {
                                        background: 'linear-gradient(135deg, #F44336 0%, #D32F2F 100%)',
                                        transform: 'scale(1.05)'
                                    },
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <CallEndIcon sx={{ fontSize: 32 }} />
                            </Fab>
                            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', mt: 1 }}>
                                Завершить
                            </Typography>
                        </Box>
                    </Box>
                </DialogContent>
            </Dialog>
            <Dialog
                open={callStatus === 'calling' || callStatus === 'connected'}
                onClose={hangup}
                fullScreen
                PaperComponent={({ children }) => (
                    <Box
                        sx={{
                            background: 'linear-gradient(180deg, #0a0a15 0%, #1a1a2e 100%)',
                            margin: 0,
                            borderRadius: 0,
                            width: '100%',
                            height: '100%'
                        }}
                    >
                        {children}
                    </Box>
                )}
            >
                <DialogContent sx={{ textAlign: 'center', py: 5 }}>
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
                            border: '2px solid rgba(76, 175, 79, 0.34)',
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