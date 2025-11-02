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
                    console.error('Failed to load messages');
                }
                setIsLoaded(true);
            });

        return () => controller.abort();
    }, [user_id, interlocutorId]);

    const createPeerConnection = useCallback(() => {
        try {
            const config: RTCConfiguration = {
                iceServers: iceServers?.length ? iceServers : [
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
                    setCallStatus('connected');
                } else if (pc.connectionState === 'failed') {
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

        setCallStatus('idle');
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
            setCallStatus('calling');

            const constraints = withVideo 
                ? {
                    audio: { echoCancellation: true, noiseSuppression: true },
                    video: { width: { ideal: 1280 }, height: { ideal: 720 } }
                  }
                : { audio: true, video: false };

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
            setCallStatus('failed');
            
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
                setLocalStream(null);
            }
            
            setTimeout(() => setCallStatus('idle'), 2000);
        }
    }, [interlocutorId, user_id, createPeerConnection, localStream]);

    const answerCall = useCallback(async (offer: RTCSessionDescriptionInit, withVideo: boolean) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        try {
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
            setCallStatus('failed');
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
                    setInterlocutorOnline(true);
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
        if (wsConnected && interlocutorOnline) return 'В сети';
        return 'Не в сети';
    };

    const getStatusColor = (): "default" | "error" | "success" | "primary" | "secondary" | "info" | "warning" => {
        if (callStatus === 'calling' || callStatus === 'ringing') return 'warning';
        if (callStatus === 'connected') return 'error';
        if (wsConnected && interlocutorOnline) return 'success';
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
                    Выберите собеседника
                </span>
            ) : (
                <Box sx={{ display: 'flex', flex: 1 }}>
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

                    {(callStatus === 'calling' || callStatus === 'connected') && (
                        <Box sx={{
                            width: 400,
                            borderLeft: '1px solid #ccc',
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
            >
                <DialogContent sx={{ textAlign: 'center', py: 4 }}>
                    <Avatar sx={{ width: 80, height: 80, margin: '0 auto 16px', bgcolor: '#4CAF50' }}>
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