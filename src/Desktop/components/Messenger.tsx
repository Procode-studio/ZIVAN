import { CircularProgress, IconButton, TextField, Dialog, DialogContent, Avatar, Box, Typography, Fab } from "@mui/material";
import { useState, useRef, useContext, useEffect } from "react";
import { MessageType } from 'my-types/Message';
import SendIcon from '@mui/icons-material/Send';
import PhoneIcon from '@mui/icons-material/Phone';
import VideocamIcon from '@mui/icons-material/Videocam';
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import './messenger.css';
import { MessengerInterlocutorId } from "../pages/MessengerPage";
import { UserInfoContext } from "../../App";
import axios from "axios";
import InterlocutorProfile from "../../Mobile/components/InterlocutorProfile";
import { getServerUrl, getWsUrl } from '../../config/serverConfig';
import { getTurnServers } from '../../config/turnConfig';

export default function Messenger() {
    const interlocutorId = useContext(MessengerInterlocutorId);
    const inputRef = useRef<HTMLInputElement>(null);
    const user = useContext(UserInfoContext);
    const user_id = user.userInfo.user_id;

    const [messages, setMessages] = useState<MessageType[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const messagesBlockRef = useRef<HTMLDivElement>(null);

    // WebRTC состояние
    const [isCalling, setIsCalling] = useState(false);
    const [isIncomingCall, setIsIncomingCall] = useState(false);
    const [incomingCallVideo, setIncomingCallVideo] = useState(false);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [interlocutorName, setInterlocutorName] = useState('');
    
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

    // Загрузка ICE серверов
    useEffect(() => {
        getTurnServers().then(servers => setIceServers(servers)).catch(() => {
            setIceServers([{ urls: 'stun:stun.l.google.com:19302' }]);
        });
    }, []);

    // Загрузка имени собеседника
    useEffect(() => {
        if (interlocutorId !== -1) {
            axios.get(`${getServerUrl()}/users/${interlocutorId}`)
                .then(res => setInterlocutorName(res.data.name))
                .catch(() => setInterlocutorName('Собеседник'));
        }
    }, [interlocutorId]);

    const sendMessage = () => {
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
    };

    const createPeerConnection = () => {
        console.log('[RTC][Desktop] creating RTCPeerConnection with iceServers:', iceServers);
        const config: RTCConfiguration = {
            iceServers: (iceServers && iceServers.length > 0) ? iceServers : [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };

        const pc = new RTCPeerConnection(config);

        pc.onicecandidate = (e) => {
            console.log('[RTC][Desktop] onicecandidate:', e.candidate?.candidate || 'null');
            if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: e.candidate.toJSON(),
                    author: user_id
                }));
            }
        };

        pc.ontrack = (e) => {
            console.log('[RTC][Desktop] ontrack:', e.track?.kind);
            if (!e.track) return;

            const trackKey = `${e.track.kind}`;
            remoteTracksRef.current.set(trackKey, e.track);

            // Создаем новый MediaStream с обновленными треками
            const newStream = new MediaStream(Array.from(remoteTracksRef.current.values()));
            setRemoteStream(newStream);

            // Устанавливаем srcObject сразу
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = newStream;
                remoteVideoRef.current.play?.().catch(err => console.warn('[RTC][Desktop] video play failed:', err));
            }
            if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = newStream;
                remoteAudioRef.current.muted = false;
                remoteAudioRef.current.play?.().catch(err => console.warn('[RTC][Desktop] audio play failed:', err));
            }
        };

        pc.onconnectionstatechange = () => {
            console.log('[RTC][Desktop] connectionState:', pc.connectionState);
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                hangup();
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log('[RTC][Desktop] iceConnectionState:', pc.iceConnectionState);
        };

        peerConnectionRef.current = pc;
        remoteDescriptionSetRef.current = false;
        return pc;
    };

    const startCall = async (video: boolean) => {
        if (interlocutorId === -1 || !wsRef.current) return;
        if (wsRef.current.readyState !== WebSocket.OPEN) {
            console.warn('[RTC][Desktop] WebSocket not ready');
            return;
        }

        try {
            const constraints = video 
                ? {
                    audio: { echoCancellation: true, noiseSuppression: true },
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        aspectRatio: { ideal: 1.777 },
                        frameRate: { ideal: 30 },
                        facingMode: { ideal: 'user' }
                    }
                  }
                : { video: false, audio: true };

            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (e) {
                console.warn('[RTC][Desktop] primary gUM failed, trying fallback');
                stream = await navigator.mediaDevices.getUserMedia(video ? { audio: true, video: true } : { audio: true, video: false });
            }

            setLocalStream(stream);
            setIsVideoEnabled(video);
            setIsAudioEnabled(true);

            if (localVideoRef.current && video) {
                localVideoRef.current.srcObject = stream;
            }

            const pc = createPeerConnection();
            try { pc.addTransceiver('audio', { direction: 'sendrecv' }); } catch {}
            try { pc.addTransceiver('video', { direction: 'sendrecv' }); } catch {}

            stream.getTracks().forEach(t => {
                console.log('[RTC][Desktop] addTrack local:', t.kind);
                pc.addTrack(t, stream);
            });

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            wsRef.current.send(JSON.stringify({ 
                type: 'offer', 
                offer: pc.localDescription?.toJSON() || offer, 
                author: user_id, 
                video 
            }));

            setIsCalling(true);
        } catch (err) {
            console.error('[RTC][Desktop] startCall error', err);
            alert('Не удалось начать звонок. Проверьте разрешения камеры/микрофона.');
            setIsCalling(false);
        }
    };

    const answerCall = async (offer: RTCSessionDescriptionInit, video: boolean) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: video,
                audio: true
            });

            setLocalStream(stream);
            setIsVideoEnabled(video);
            setIsAudioEnabled(true);

            if (localVideoRef.current && video) {
                localVideoRef.current.srcObject = stream;
            }

            const pc = createPeerConnection();
            try { pc.addTransceiver('audio', { direction: 'sendrecv' }); } catch {}
            try { pc.addTransceiver('video', { direction: 'sendrecv' }); } catch {}

            stream.getTracks().forEach(t => {
                console.log('[RTC][Desktop] addTrack local(answer):', t.kind);
                pc.addTrack(t, stream);
            });

            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            remoteDescriptionSetRef.current = true;

            if (pendingRemoteCandidatesRef.current.length > 0) {
                for (const c of pendingRemoteCandidatesRef.current) {
                    try { 
                        await pc.addIceCandidate(new RTCIceCandidate(c));
                    } catch (e) { 
                        console.warn('[RTC][Desktop] flush ICE error', e);
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

            setIsCalling(true);
            setIsIncomingCall(false);
        } catch (err) {
            console.error('[RTC][Desktop] answerCall error', err);
            alert('Не удалось ответить на звонок');
            setIsIncomingCall(false);
        }
    };

    const toggleVideo = () => {
        if (localStream) {
            const track = localStream.getVideoTracks()[0];
            if (track) {
                track.enabled = !track.enabled;
                setIsVideoEnabled(track.enabled);
            }
        }
    };

    const toggleAudio = () => {
        if (localStream) {
            const track = localStream.getAudioTracks()[0];
            if (track) {
                track.enabled = !track.enabled;
                setIsAudioEnabled(track.enabled);
            }
        }
    };

    const hangup = () => {
        if (hangupProcessingRef.current) return;
        hangupProcessingRef.current = true;

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
            localStream.getTracks().forEach(t => { try { t.stop(); } catch {} });
            setLocalStream(null);
        }

        remoteTracksRef.current.clear();
        setRemoteStream(null);
        if (localVideoRef.current) { try { localVideoRef.current.srcObject = null; } catch {} }
        if (remoteVideoRef.current) { try { remoteVideoRef.current.srcObject = null; } catch {} }
        if (remoteAudioRef.current) { try { remoteAudioRef.current.srcObject = null; } catch {} }
        
        setIsCalling(false);
        setIsIncomingCall(false);
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
    };

    const declineCall = () => {
        setIsIncomingCall(false);
        pendingOfferRef.current = null;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                type: 'hangup',
                author: user_id
            }));
        }
    };

    // Загрузка сообщений
    useEffect(() => {
        if (interlocutorId === -1) {
            setMessages([]);
            setIsLoaded(true);
            return;
        }

        setIsLoaded(false);
        const cancel = axios.CancelToken.source();
        const id1 = Math.min(user_id, interlocutorId);
        const id2 = Math.max(user_id, interlocutorId);

        axios.get(`${getServerUrl()}/messages/${id1}/${id2}`, { cancelToken: cancel.token })
            .then((res) => {
                const data: MessageType[] = res.data.map((m: any) => ({
                    id: m.id,
                    text: m.text,
                    author: m.author,
                    message_type: 'text',
                    is_read: false,
                    created_at: m.created_at || new Date().toISOString()
                }));
                setMessages(data);
                setIsLoaded(true);
                setTimeout(() => messagesBlockRef.current?.scrollTo(0, messagesBlockRef.current.scrollHeight), 10);
            })
            .catch(() => setIsLoaded(true));

        return () => cancel.cancel();
    }, [user_id, interlocutorId]);

    // WebSocket
    useEffect(() => {
        if (interlocutorId === -1 || !user_id || user_id === -1) {
            wsRef.current = null;
            return;
        }

        const id1 = Math.min(user_id, interlocutorId);
        const id2 = Math.max(user_id, interlocutorId);
        const wsUrl = `${getWsUrl()}/me/ws/${id1}/${id2}`;
        console.log('[WS][Desktop] connecting', wsUrl);
        
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => { 
            wsRef.current = ws;
            console.log('[WS][Desktop] open'); 
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
                        is_read: false,
                        created_at: new Date().toISOString()
                    }]);
                } else if (type === 'offer' && data.author !== user_id) {
                    pendingOfferRef.current = data.offer;
                    setIncomingCallVideo(data.video || false);
                    setIsIncomingCall(true);
                } else if (type === 'answer' && data.author !== user_id) {
                    if (peerConnectionRef.current) {
                        peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer))
                            .then(() => { 
                                remoteDescriptionSetRef.current = true;
                                console.log('[RTC][Desktop] setRemoteDescription(answer)');
                            })
                            .catch((e) => { 
                                console.warn('[RTC][Desktop] setRemoteDescription(answer) error', e);
                            });
                    }
                } else if (type === 'ice-candidate' && data.author !== user_id) {
                    if (peerConnectionRef.current && data.candidate) {
                        if (!remoteDescriptionSetRef.current) {
                            pendingRemoteCandidatesRef.current.push(data.candidate);
                        } else {
                            peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate))
                                .catch((e) => { console.warn('[RTC][Desktop] addIceCandidate error', e); });
                        }
                    }
                } else if (type === 'hangup' && data.author !== user_id) {
                    if (!hangupProcessingRef.current) {
                        hangupProcessingRef.current = true;
                        hangup();
                        setTimeout(() => {
                            hangupProcessingRef.current = false;
                        }, 1000);
                    }
                }

                setTimeout(() => messagesBlockRef.current?.scrollTo(0, messagesBlockRef.current.scrollHeight), 10);
            } catch (e) {
                console.error('[WS][Desktop] message processing error', e);
            }
        };

        ws.onerror = (err) => {
            console.error('[WS][Desktop] error', err);
        };

        ws.onclose = () => { 
            wsRef.current = null;
            console.log('[WS][Desktop] close'); 
        };

        return () => {
            console.log('[WS][Desktop] useEffect cleanup');
        };
    }, [user_id, interlocutorId]);

    return (
        <div id="messenger">
            {isLoaded && <InterlocutorProfile interlocutorId={interlocutorId} showButton={false}/>}
            
            {!isLoaded ? (
                <section id='loading'><CircularProgress color="secondary"/></section>
            ) : interlocutorId === -1 ? (
                <span id="choose-interlocutor-text">Выберите собеседника</span>
            ) : (
                <section id='messages' ref={messagesBlockRef}>
                    {messages.length === 0 && <span id="no-messages-text">История пуста</span>}
                    {messages.map((m, i) => (
                        <div key={i} data-from={m.author === user_id ? 'me' : 'other'}>{m.text}</div>
                    ))}
                </section>
            )}
            
            {/* Входящий звонок */}
            <Dialog open={isIncomingCall} onClose={declineCall} maxWidth="xs" fullWidth>
                <DialogContent sx={{ textAlign: 'center', py: 4 }}>
                    <Avatar sx={{ width: 80, height: 80, margin: '0 auto 16px' }}>
                        {interlocutorName[0]?.toUpperCase()}
                    </Avatar>
                    <Typography variant="h6">{interlocutorName}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {incomingCallVideo ? 'Видео' : 'Аудио'} звонок
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 3 }}>
                        <Fab color="error" onClick={declineCall}><CallEndIcon /></Fab>
                        <Fab color="success" onClick={() => pendingOfferRef.current && answerCall(pendingOfferRef.current, incomingCallVideo)}>
                            <PhoneIcon />
                        </Fab>
                    </Box>
                </DialogContent>
            </Dialog>

            {/* Активный звонок */}
            <Dialog open={isCalling} onClose={hangup} fullScreen PaperProps={{ sx: { backgroundColor: '#000' } }}>
                <DialogContent sx={{ p: 0, height: '100vh', display: 'flex', flexDirection: 'column' }}>
                    {/* Remote video */}
                    <Box sx={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
                        {remoteStream && remoteStream.getVideoTracks().length > 0 ? (
                            <video 
                                ref={remoteVideoRef} 
                                autoPlay 
                                playsInline 
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                            />
                        ) : (
                            <Box sx={{ textAlign: 'center' }}>
                                <Avatar sx={{ width: 120, height: 120, margin: '0 auto 16px' }}>
                                    {interlocutorName[0]?.toUpperCase()}
                                </Avatar>
                                <Typography variant="h5" color="white">{interlocutorName}</Typography>
                                <Typography variant="body2" color="grey.400">
                                    {remoteStream ? 'Камера выключена' : 'Соединение...'}
                                </Typography>
                            </Box>
                        )}
                    </Box>

                    {/* Local video */}
                    {isVideoEnabled && localStream && (
                        <Box sx={{ position: 'absolute', top: 20, right: 20, width: 200, height: 150, borderRadius: 2, overflow: 'hidden', border: '3px solid #4CAF50', backgroundColor: '#000' }}>
                            <video 
                                ref={localVideoRef} 
                                autoPlay 
                                muted 
                                playsInline 
                                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} 
                            />
                        </Box>
                    )}

                    {/* Controls */}
                    <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', gap: 2, backgroundColor: 'rgba(0,0,0,0.8)' }}>
                        <Fab color={isAudioEnabled ? "default" : "error"} onClick={toggleAudio}>
                            {isAudioEnabled ? <MicIcon /> : <MicOffIcon />}
                        </Fab>
                        <Fab color={isVideoEnabled ? "default" : "error"} onClick={toggleVideo}>
                            {isVideoEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
                        </Fab>
                        <Fab color="error" onClick={hangup}><CallEndIcon /></Fab>
                    </Box>
                </DialogContent>
            </Dialog>

            {/* Hidden remote audio */}
            <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

            {/* Call buttons */}
            {interlocutorId !== -1 && !isCalling && !isIncomingCall && (
                <div style={{ display: 'flex', gap: 10, marginBottom: 10, padding: '0 10px' }}>
                    <IconButton onClick={() => startCall(false)} color="secondary"><PhoneIcon /></IconButton>
                    <IconButton onClick={() => startCall(true)} color="secondary"><VideocamIcon /></IconButton>
                </div>
            )}
            
            <section id='input'>
                <TextField
                    style={{ flexGrow: 1 }}
                    color="secondary"
                    multiline
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
                <IconButton onClick={sendMessage} disabled={interlocutorId === -1} color="secondary">
                    <SendIcon/>
                </IconButton>
            </section>
        </div>
    );
}