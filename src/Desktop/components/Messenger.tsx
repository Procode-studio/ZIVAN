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
    const socketRef = useRef<WebSocket | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const messagesBlockRef = useRef<HTMLDivElement>(null);

    // Звонки
    const [isCalling, setIsCalling] = useState(false);
    const [isIncomingCall, setIsIncomingCall] = useState(false);
    const [incomingCallVideo, setIncomingCallVideo] = useState(false);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const remoteCompositeStreamRef = useRef<MediaStream | null>(null);
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
    const wsRef = useRef<WebSocket | null>(null);
    const hangupProcessingRef = useRef(false);

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
            iceServers: (iceServers && iceServers.length > 0)
                ? iceServers
                : [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ],
            iceCandidatePoolSize: 10
        };

        const pc = new RTCPeerConnection(config);

        pc.onicecandidate = (e) => {
            console.log('[RTC][Desktop] onicecandidate:', e.candidate ? e.candidate.candidate : null);
            if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: e.candidate.toJSON(),
                    author: user_id
                }));
            }
        };

        pc.ontrack = (e) => {
            console.log('[RTC][Desktop] ontrack:', e.track?.kind, 'streams count:', e.streams?.length || 0);
            if (!remoteCompositeStreamRef.current) {
                remoteCompositeStreamRef.current = new MediaStream();
            }
            const remoteStreamLocal = remoteCompositeStreamRef.current;
            if (e.track && !remoteStreamLocal.getTracks().includes(e.track)) {
                console.log('[RTC][Desktop] add remote track to composite:', e.track.kind);
                remoteStreamLocal.addTrack(e.track);
            }
            setRemoteStream(remoteStreamLocal);
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStreamLocal;
                remoteVideoRef.current.play?.().catch(() => {});
            }
            if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = remoteStreamLocal;
                remoteAudioRef.current.muted = false;
                remoteAudioRef.current.play?.().catch(() => {});
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
            if (!video) {
                console.log('[RTC][Desktop] audio-call path');
                const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                setLocalStream(stream);
                setIsVideoEnabled(false);
                setIsAudioEnabled(true);
                const pc = createPeerConnection();
                try { pc.addTransceiver('audio', { direction: 'sendrecv' }); } catch {}
                stream.getTracks().forEach(t => { console.log('[RTC][Desktop] addTrack local:', t.kind); pc.addTrack(t, stream); });
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                wsRef.current.send(JSON.stringify({ type: 'offer', offer: pc.localDescription?.toJSON() || offer, author: user_id, video: false }));
                console.log('[RTC][Desktop] sent offer (audio)');
            } else {
                console.log('[RTC][Desktop] video-call path start');
                const primaryConstraints: MediaStreamConstraints = {
                    audio: { echoCancellation: true, noiseSuppression: true },
                    video: {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        aspectRatio: { ideal: 1.777 },
                        frameRate: { ideal: 30 },
                        facingMode: { ideal: 'user' }
                    }
                };
                const fallbackConstraints: MediaStreamConstraints = { audio: true, video: true };
                let stream: MediaStream;
                try {
                    stream = await navigator.mediaDevices.getUserMedia(primaryConstraints);
                } catch (e) {
                    console.warn('[RTC][Desktop] primary gUM failed, fallback to simple constraints');
                    stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
                }
                console.log('[RTC][Desktop] getUserMedia(video) success:', stream.getTracks().map(t => `${t.kind}:${t.readyState}:${t.enabled}`));
                setLocalStream(stream);
                setIsVideoEnabled(true);
                setIsAudioEnabled(true);
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = stream;
                }
                const pc = createPeerConnection();
                let vTransceiver: RTCRtpTransceiver | undefined;
                try { pc.addTransceiver('audio', { direction: 'sendrecv' }); } catch {}
                try { vTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' }); } catch {}
                try {
                    const sendCodecs = RTCRtpSender.getCapabilities ? RTCRtpSender.getCapabilities('video')?.codecs || [] : [];
                    const pref = sendCodecs.filter(c => /VP8|H264/i.test(c.mimeType));
                    if (vTransceiver && vTransceiver.setCodecPreferences && pref.length) vTransceiver.setCodecPreferences(pref);
                } catch {}
                stream.getTracks().forEach(t => { console.log('[RTC][Desktop] addTrack local:', t.kind); pc.addTrack(t, stream); });
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                wsRef.current.send(JSON.stringify({ type: 'offer', offer: pc.localDescription?.toJSON() || offer, author: user_id, video: true }));
                console.log('[RTC][Desktop] sent offer (video)');
            }

            setIsCalling(true);
        } catch (err) {
            console.error('[RTC][Desktop] startCall error', err);
            alert('Не удалось начать звонок. Проверьте разрешения камеры/микрофона.');
            setIsCalling(false);
        }
    };

    const answerCall = async (offer: RTCSessionDescriptionInit, video: boolean) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.warn('[RTC][Desktop] WebSocket not ready for answer');
            return;
        }

        try {
            console.log('[RTC][Desktop] answerCall: getting user media');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: video,
                audio: true
            });
            console.log('[RTC][Desktop] getUserMedia(answer) success: tracks', stream.getTracks().map(t => `${t.kind}:${t.readyState}:${t.enabled}`));
            setLocalStream(stream);
            setIsVideoEnabled(video);
            setIsAudioEnabled(true);

            const pc = createPeerConnection();
            try { pc.addTransceiver('audio', { direction: 'sendrecv' }); } catch {}
            try { pc.addTransceiver('video', { direction: 'sendrecv' }); } catch {}
            stream.getTracks().forEach(t => { console.log('[RTC][Desktop] addTrack local(answer):', t.kind); pc.addTrack(t, stream); });

            console.log('[RTC][Desktop] setRemoteDescription(offer)');
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            remoteDescriptionSetRef.current = true;
            console.log('[RTC][Desktop] setRemoteDescription(offer) done; flushing pending candidates:', pendingRemoteCandidatesRef.current.length);
            if (pendingRemoteCandidatesRef.current.length > 0) {
                for (const c of pendingRemoteCandidatesRef.current) {
                    try { await pc.addIceCandidate(new RTCIceCandidate(c)); console.log('[RTC][Desktop] flushed ICE'); } catch (e) { console.warn('[RTC][Desktop] flush ICE error', e); }
                }
                pendingRemoteCandidatesRef.current = [];
            }
            const answer = await pc.createAnswer();
            console.log('[RTC][Desktop] createAnswer done');
            await pc.setLocalDescription(answer);
            console.log('[RTC][Desktop] setLocalDescription(answer)');

            wsRef.current.send(JSON.stringify({
                type: 'answer',
                answer: pc.localDescription?.toJSON() || answer,
                author: user_id
            }));
            console.log('[RTC][Desktop] sent answer');

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
            console.log('[RTC][Desktop] hangup: closing RTCPeerConnection');
            try {
                peerConnectionRef.current.getSenders().forEach(s => {
                    try { s.replaceTrack(null); } catch {}
                    try { s.track && s.track.stop(); } catch {}
                });
            } catch {}
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        if (localStream) {
            console.log('[RTC][Desktop] hangup: stopping local tracks');
            localStream.getTracks().forEach(t => { try { t.stop(); } catch {} });
            setLocalStream(null);
        }

        setRemoteStream(null);
        remoteCompositeStreamRef.current = null;
        if (localVideoRef.current) { try { localVideoRef.current.srcObject = null; } catch {} }
        if (remoteVideoRef.current) { try { remoteVideoRef.current.srcObject = null; } catch {} }
        if (remoteAudioRef.current) { try { remoteAudioRef.current.srcObject = null; } catch {} }
        setIsCalling(false);
        setIsIncomingCall(false);
        setIsVideoEnabled(false);
        setIsAudioEnabled(true);

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            console.log('[RTC][Desktop] hangup: sending hangup');
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
            socketRef.current = ws;
            console.log('[WS][Desktop] open'); 
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const type = data.type || 'message';
                console.log('[WS][Desktop] message', type, data);

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
                            .then(() => { remoteDescriptionSetRef.current = true; console.log('[RTC][Desktop] setRemoteDescription(answer)'); })
                            .catch((e) => { console.warn('[RTC][Desktop] setRemoteDescription(answer) error', e); });
                    }
                } else if (type === 'ice-candidate' && data.author !== user_id) {
                    if (peerConnectionRef.current && data.candidate) {
                        if (!remoteDescriptionSetRef.current) {
                            console.log('[RTC][Desktop] queue remote ICE');
                            pendingRemoteCandidatesRef.current.push(data.candidate);
                        } else {
                            peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)).then(() => console.log('[RTC][Desktop] addIceCandidate ok')).catch((e) => { console.warn('[RTC][Desktop] addIceCandidate error', e); });
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
            socketRef.current = null;
            console.log('[WS][Desktop] close'); 
        };

        // Cleanup: не закрываем сокет, просто удаляем ref
        return () => {
            console.log('[WS][Desktop] useEffect cleanup');
            // Не закрываем соединение здесь, пусть закрывается естественно
            // или при переходе на другого пользователя
        };
    }, [user_id, interlocutorId]);

    // Обновление видео
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

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
                        {remoteStream && remoteStream.getVideoTracks()[0]?.enabled ? (
                            <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
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
                        <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
                    </Box>

                    {/* Local video */}
                    {isVideoEnabled && localStream && (
                        <Box sx={{ position: 'absolute', top: 20, right: 20, width: 200, height: 150, borderRadius: 2, overflow: 'hidden', border: '3px solid #4CAF50', backgroundColor: '#000' }}>
                            <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
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

            {/* Кнопки звонков */}
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