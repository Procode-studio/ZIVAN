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
import { UserInfoContext } from "../../App";
import axios from "axios";
import { useParams } from "react-router-dom";
import InterlocutorProfile from "./InterlocutorProfile";
import { getServerUrl, getWsUrl } from '../../config/serverConfig';
import { getTurnServers } from '../../config/turnConfig';

export default function MobileMessenger() {
    const { id } = useParams();
    const interlocutorId = parseInt(id || '-1');
    const inputRef = useRef<HTMLInputElement>(null);
    const user = useContext(UserInfoContext);
    const user_id = user.userInfo.user_id;

    const [messages, setMessages] = useState<MessageType[]>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const messagesBlockRef = useRef<HTMLDivElement>(null);

    // WebRTC состояние
    const [isCalling, setIsCalling] = useState(false);
    const [isIncomingCall, setIsIncomingCall] = useState(false);
    const [incomingCallVideo, setIncomingCallVideo] = useState(false);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const remoteCompositeStreamRef = useRef<MediaStream | null>(null);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [interlocutorName, setInterlocutorName] = useState<string>('');
    
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);
    const [iceServers, setIceServers] = useState<RTCIceServer[]>([]);
    const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
    const hangupProcessingRef = useRef(false);
    const pendingRemoteCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const remoteDescriptionSetRef = useRef(false);

    // Загружаем TURN credentials
    useEffect(() => {
        getTurnServers()
            .then(setIceServers)
            .catch(() => {
                setIceServers([{ urls: 'stun:stun.l.google.com:19302' }]);
            });
    }, []);

    // Получаем имя собеседника
    useEffect(() => {
        if (interlocutorId !== -1) {
            axios.get(`${getServerUrl()}/users/${interlocutorId}`)
                .then(res => setInterlocutorName(res.data.name))
                .catch(() => setInterlocutorName('Собеседник'));
        }
    }, [interlocutorId]);

    const sendMessage = () => {
        if (!inputRef.current || interlocutorId === -1) return;
        const text = inputRef.current.value.trim();
        if (text.length === 0 || !wsRef.current) return;

        const id1 = Math.min(user_id, interlocutorId);
        const id2 = Math.max(user_id, interlocutorId);
        const sendedMessage = {
            type: 'message',
            user_id1: id1,
            user_id2: id2,
            text,
            author: user_id
        };

        if (wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(sendedMessage));
            inputRef.current.value = '';
        }
    };

    const createPeerConnection = () => {
        console.log('[RTC][Mobile] creating RTCPeerConnection with iceServers:', iceServers);
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
        
        pc.onicecandidate = (event) => {
            console.log('[RTC][Mobile] onicecandidate:', event.candidate ? event.candidate.candidate : null);
            if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: event.candidate.toJSON(),
                    author: user_id
                }));
            }
        };

        pc.ontrack = (event) => {
            console.log('[RTC][Mobile] ontrack:', event.track?.kind, 'streams count:', event.streams?.length || 0);
            if (!remoteCompositeStreamRef.current) {
                remoteCompositeStreamRef.current = new MediaStream();
            }
            const composite = remoteCompositeStreamRef.current;
            if (event.track && !composite.getTracks().includes(event.track)) {
                console.log('[RTC][Mobile] add remote track to composite:', event.track.kind);
                composite.addTrack(event.track);
            }
            setRemoteStream(composite);
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = composite;
                remoteVideoRef.current.play?.().catch(() => {});
            }
            if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = composite;
                remoteAudioRef.current.muted = false;
                remoteAudioRef.current.play?.().catch(() => {});
            }
        };

        pc.onconnectionstatechange = () => {
            console.log('[RTC][Mobile] connectionState:', pc.connectionState);
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                hangup();
            }
        };
        
        pc.oniceconnectionstatechange = () => {
            console.log('[RTC][Mobile] iceConnectionState:', pc.iceConnectionState);
        };

        peerConnectionRef.current = pc;
        remoteDescriptionSetRef.current = false;
        return pc;
    };

    const startCall = async (video: boolean = false) => {
        if (interlocutorId === -1 || !wsRef.current) return;
        if (wsRef.current.readyState !== WebSocket.OPEN) return;

        try {
            if (!video) {
                console.log('[RTC][Mobile] audio-call path');
                const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                setLocalStream(stream);
                setIsVideoEnabled(false);
                setIsAudioEnabled(true);
                const pc = createPeerConnection();
                try { pc.addTransceiver('audio', { direction: 'sendrecv' }); } catch {}
                stream.getTracks().forEach(track => { console.log('[RTC][Mobile] addTrack local:', track.kind); pc.addTrack(track, stream); });
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                wsRef.current.send(JSON.stringify({ type: 'offer', offer: pc.localDescription?.toJSON() || offer, author: user_id, video: false }));
                console.log('[RTC][Mobile] sent offer (audio)');
            } else {
                console.log('[RTC][Mobile] video-call path start');
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
                    console.warn('[RTC][Mobile] primary gUM failed, fallback to simple constraints');
                    stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
                }
                console.log('[RTC][Mobile] getUserMedia(video) success:', stream.getTracks().map(t => `${t.kind}:${t.readyState}:${t.enabled}`));
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
                stream.getTracks().forEach(track => { console.log('[RTC][Mobile] addTrack local:', track.kind); pc.addTrack(track, stream); });
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                wsRef.current.send(JSON.stringify({ type: 'offer', offer: pc.localDescription?.toJSON() || offer, author: user_id, video: true }));
                console.log('[RTC][Mobile] sent offer (video)');
            }
            
            setIsCalling(true);
        } catch (err) {
            console.error('[RTC][Mobile] startCall error', err);
            alert('Не удалось начать звонок. Проверьте разрешения камеры/микрофона.');
            setIsCalling(false);
        }
    };

    const answerCall = async (offer: RTCSessionDescriptionInit, video: boolean = false) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

        try {
            const pc = createPeerConnection();
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            remoteDescriptionSetRef.current = true;
            console.log('[RTC][Mobile] setRemoteDescription(offer) done; flushing pending candidates:', pendingRemoteCandidatesRef.current.length);
            // flush queued candidates if any
            if (pendingRemoteCandidatesRef.current.length > 0) {
                for (const c of pendingRemoteCandidatesRef.current) {
                    try { await pc.addIceCandidate(new RTCIceCandidate(c)); console.log('[RTC][Mobile] flushed ICE'); } catch (e) { console.warn('[RTC][Mobile] flush ICE error', e); }
                }
                pendingRemoteCandidatesRef.current = [];
            }
            
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: video, 
                audio: true 
            });
            
            console.log('[RTC][Mobile] getUserMedia(answer) success: tracks', stream.getTracks().map(t => `${t.kind}:${t.readyState}:${t.enabled}`));
            setLocalStream(stream);
            setIsVideoEnabled(video);
            setIsAudioEnabled(true);
            
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
            
            try { pc.addTransceiver('audio', { direction: 'sendrecv' }); } catch {}
            try { pc.addTransceiver('video', { direction: 'sendrecv' }); } catch {}
            stream.getTracks().forEach(track => { console.log('[RTC][Mobile] addTrack local(answer):', track.kind); pc.addTrack(track, stream); });

            const answer = await pc.createAnswer();
            console.log('[RTC][Mobile] createAnswer done');
            await pc.setLocalDescription(answer);
            console.log('[RTC][Mobile] setLocalDescription(answer)');

            wsRef.current.send(JSON.stringify({
                type: 'answer',
                answer: pc.localDescription?.toJSON() || answer,
                author: user_id
            }));
            console.log('[RTC][Mobile] sent answer');

            setIsCalling(true);
            setIsIncomingCall(false);
        } catch (err) {
            console.error('[RTC][Mobile] answerCall error', err);
            setIsIncomingCall(false);
            alert('Не удалось ответить на звонок');
        }
    };

    const toggleVideo = () => {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsVideoEnabled(videoTrack.enabled);
            }
        }
    };

    const toggleAudio = () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsAudioEnabled(audioTrack.enabled);
            }
        }
    };

    const hangup = () => {
        if (hangupProcessingRef.current) return;
        hangupProcessingRef.current = true;

        if (peerConnectionRef.current) {
            console.log('[RTC][Mobile] hangup: closing RTCPeerConnection');
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
            console.log('[RTC][Mobile] hangup: stopping local tracks');
            localStream.getTracks().forEach(track => { try { track.stop(); } catch {} });
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
            console.log('[RTC][Mobile] hangup: sending hangup');
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
        const cancelTokenSource = axios.CancelToken.source();
        const id1 = Math.min(user_id, interlocutorId);
        const id2 = Math.max(user_id, interlocutorId);
        const url = `${getServerUrl()}/messages/${id1}/${id2}`;
        
        axios.get(url, { cancelToken: cancelTokenSource.token })
            .then((response) => {
                const data: MessageType[] = response.data.map((message: any) => ({
                    id: message.id,
                    text: message.text,
                    author: message.author,
                    message_type: 'text',
                    is_read: false,
                    created_at: message.created_at || new Date().toISOString()
                }));
                setMessages(data);
                setIsLoaded(true);
                setTimeout(() => {
                    messagesBlockRef.current?.scrollTo(0, messagesBlockRef.current.scrollHeight);
                }, 10);
            })
            .catch((error) => {
                if (!axios.isCancel(error)) {
                    console.error('Failed to load messages');
                }
                setIsLoaded(true);
            });

        return () => {
            cancelTokenSource.cancel('Unmounted');
        };
    }, [user_id, interlocutorId]);

    // WebSocket соединение
    useEffect(() => {
        if (interlocutorId === -1 || !user_id || user_id === -1) {
            wsRef.current = null;
            socketRef.current = null;
            return;
        }

        const id1 = Math.min(user_id, interlocutorId);
        const id2 = Math.max(user_id, interlocutorId);
        const wsUrl = `${getWsUrl()}/me/ws/${id1}/${id2}`;
        console.log('[WS][Mobile] connecting', wsUrl);
        
        const newSocket = new WebSocket(wsUrl);

        newSocket.onopen = () => {
            wsRef.current = newSocket;
            socketRef.current = newSocket;
            console.log('[WS][Mobile] open');
        };

        newSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const msgType = data.type || 'message';
                console.log('[WS][Mobile] message', msgType, data);

                if (msgType === 'message') {
                    setMessages((prevMessages) => [
                        ...prevMessages,
                        {
                            id: Date.now(),
                            text: data.text,
                            author: data.author,
                            message_type: 'text',
                            is_read: false,
                            created_at: new Date().toISOString()
                        }
                    ]);
                } else if (msgType === 'offer' && data.author !== user_id) {
                    pendingOfferRef.current = data.offer;
                    setIncomingCallVideo(data.video || false);
                    setIsIncomingCall(true);
                } else if (msgType === 'answer' && data.author !== user_id) {
                    if (peerConnectionRef.current) {
                        peerConnectionRef.current.setRemoteDescription(
                            new RTCSessionDescription(data.answer)
                        ).then(() => { remoteDescriptionSetRef.current = true; console.log('[RTC][Mobile] setRemoteDescription(answer)'); })
                         .catch((e) => { console.warn('[RTC][Mobile] setRemoteDescription(answer) error', e); });
                    }
                } else if (msgType === 'ice-candidate' && data.author !== user_id) {
                    if (peerConnectionRef.current && data.candidate) {
                        if (!remoteDescriptionSetRef.current) {
                            console.log('[RTC][Mobile] queue remote ICE');
                            pendingRemoteCandidatesRef.current.push(data.candidate);
                        } else {
                            peerConnectionRef.current.addIceCandidate(
                                new RTCIceCandidate(data.candidate)
                            ).then(() => console.log('[RTC][Mobile] addIceCandidate ok')).catch((e) => { console.warn('[RTC][Mobile] addIceCandidate error', e); });
                        }
                    }
                } else if (msgType === 'hangup' && data.author !== user_id) {
                    if (!hangupProcessingRef.current) {
                        hangupProcessingRef.current = true;
                        hangup();
                        setTimeout(() => {
                            hangupProcessingRef.current = false;
                        }, 1000);
                    }
                }
                
                setTimeout(() => {
                    messagesBlockRef.current?.scrollTo(0, messagesBlockRef.current.scrollHeight);
                }, 10);
            } catch (error) {
                console.error('Error processing message');
            }
        };

        newSocket.onerror = () => {
            console.error('[WS][Mobile] error');
        };

        newSocket.onclose = () => {
            wsRef.current = null;
            socketRef.current = null;
            console.log('[WS][Mobile] close');
        };

        return () => {
            console.log('[WS][Mobile] useEffect cleanup');
            // Не закрываем соединение здесь, пусть закрывается естественно
        };
    }, [user_id, interlocutorId]);

    // Обновление remote video
    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    return (
        <div id="messenger" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
            {isLoaded && <InterlocutorProfile interlocutorId={interlocutorId} showButton={true}/>}
            
            {!isLoaded ? (
                <section id='loading' style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CircularProgress color="secondary"/>
                </section>
            ) : (
                interlocutorId === -1 ? (
                    <span id="choose-interlocutor-text" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Выберите собеседника</span>
                ) : (
                    <section id='messages' ref={messagesBlockRef} style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                        {messages.length === 0 ? <span id="no-messages-text">История сообщений пуста</span> : null}
                        {messages.map((message, index) =>(
                            <div key={index} data-from={message.author === user_id ? 'me' : 'other'}>
                                {message.text}
                            </div>
                        ))}
                    </section>
                )
            )}
            
            {/* Диалог входящего звонка */}
            <Dialog 
                open={isIncomingCall} 
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
                        <Fab color="success" onClick={() => pendingOfferRef.current && answerCall(pendingOfferRef.current, incomingCallVideo)}>
                            <PhoneIcon />
                        </Fab>
                    </Box>
                </DialogContent>
            </Dialog>

            {/* Диалог активного звонка */}
            <Dialog 
                open={isCalling} 
                onClose={hangup}
                fullScreen
                PaperProps={{
                    sx: { backgroundColor: '#1a1a1a' }
                }}
            >
                <DialogContent sx={{ p: 0, position: 'relative', height: '100vh', display: 'flex', flexDirection: 'column' }}>
                    {/* Remote video/avatar */}
                    <Box sx={{ flex: 1, position: 'relative', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {remoteStream && remoteStream.getVideoTracks().length > 0 && remoteStream.getVideoTracks()[0].enabled ? (
                            <video 
                                ref={remoteVideoRef} 
                                autoPlay 
                                playsInline
                                style={{ 
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    width: 'auto',
                                    height: 'auto',
                                    objectFit: 'contain'
                                }} 
                            />
                        ) : (
                            <Box sx={{ 
                                display: 'flex', 
                                flexDirection: 'column',
                                alignItems: 'center', 
                                justifyContent: 'center',
                                gap: 2
                            }}>
                                <Avatar sx={{ width: 120, height: 120 }}>
                                    {interlocutorName[0]?.toUpperCase()}
                                </Avatar>
                                <Typography variant="h5" color="white">
                                    {interlocutorName}
                                </Typography>
                                <Typography variant="body2" color="grey.400">
                                    {remoteStream ? 'Камера выключена' : 'Соединение...'}
                                </Typography>
                            </Box>
                        )}
                    </Box>

                    {/* Local video preview */}
                    {isVideoEnabled && localStream && (
                        <Box sx={{ 
                            position: 'absolute', 
                            top: 20, 
                            right: 20, 
                            width: 120, 
                            height: 160,
                            borderRadius: 2,
                            overflow: 'hidden',
                            border: '2px solid #4CAF50',
                            boxShadow: 3,
                            backgroundColor: '#000'
                        }}>
                            <video 
                                ref={localVideoRef} 
                                autoPlay 
                                muted 
                                playsInline
                                style={{ 
                                    width: '100%', 
                                    height: '100%',
                                    objectFit: 'cover'
                                }} 
                            />
                        </Box>
                    )}

                    {/* Controls */}
                    <Box sx={{ 
                        p: 3, 
                        display: 'flex', 
                        justifyContent: 'center', 
                        gap: 2,
                        backgroundColor: 'rgba(0,0,0,0.7)'
                    }}>
                        <Fab 
                            color={isAudioEnabled ? "default" : "error"} 
                            onClick={toggleAudio}
                            size="medium"
                        >
                            {isAudioEnabled ? <MicIcon /> : <MicOffIcon />}
                        </Fab>
                        
                        <Fab 
                            color={isVideoEnabled ? "default" : "error"} 
                            onClick={toggleVideo}
                            size="medium"
                        >
                            {isVideoEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
                        </Fab>
                        
                        <Fab color="error" onClick={hangup} size="medium">
                            <CallEndIcon />
                        </Fab>
                    </Box>
                </DialogContent>
            </Dialog>

            {/* Hidden remote audio to ensure sound plays reliably */}
            <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

            {/* Кнопки звонков */}
            {interlocutorId !== -1 && !isCalling && !isIncomingCall && (
                <div style={{ 
                    display: 'flex', 
                    gap: 10, 
                    padding: '10px',
                    justifyContent: 'center'
                }}>
                    <IconButton onClick={() => startCall(false)} color="secondary" title="Аудио звонок">
                        <PhoneIcon />
                    </IconButton>
                    <IconButton onClick={() => startCall(true)} color="secondary" title="Видео звонок">
                        <VideocamIcon />
                    </IconButton>
                </div>
            )}
            
            <section id='input' style={{ padding: '10px', display: 'flex', gap: '10px' }}>
                <TextField
                    style={{ flexGrow: 1 }}
                    color="secondary"
                    multiline
                    maxRows={4}
                    placeholder="Написать сообщение..."
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
                    <SendIcon/>
                </IconButton>
            </section>
        </div>
    )
}