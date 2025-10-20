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
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [interlocutorName, setInterlocutorName] = useState('');
    
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const [iceServers, setIceServers] = useState<RTCIceServer[]>([]);
    const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
    const pendingRemoteCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const remoteDescriptionSetRef = useRef(false);

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
        if (!inputRef.current || interlocutorId === -1 || !socketRef.current) return;
        const text = inputRef.current.value.trim();
        if (!text) return;

        const id1 = Math.min(user_id, interlocutorId);
        const id2 = Math.max(user_id, interlocutorId);

        if (socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
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
            if (e.candidate && socketRef.current?.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: e.candidate.toJSON(),
                    author: user_id
                }));
            }
        };

        pc.ontrack = (e) => {
            if (e.streams && e.streams[0]) {
                setRemoteStream(e.streams[0]);
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                hangup();
            }
        };

        peerConnectionRef.current = pc;
        remoteDescriptionSetRef.current = false;
        return pc;
    };

    const startCall = async (video: boolean) => {
        if (interlocutorId === -1 || !socketRef.current) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: video,
                audio: true
            });

            setLocalStream(stream);
            setIsVideoEnabled(video);
            setIsAudioEnabled(true);

            const pc = createPeerConnection();
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            socketRef.current.send(JSON.stringify({
                type: 'offer',
                offer: pc.localDescription?.toJSON() || offer,
                author: user_id,
                video: video
            }));

            setIsCalling(true);
        } catch (err) {
            alert('Не удалось начать звонок');
        }
    };

    const answerCall = async (offer: RTCSessionDescriptionInit, video: boolean) => {
        if (!socketRef.current) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: video,
                audio: true
            });

            setLocalStream(stream);
            setIsVideoEnabled(video);
            setIsAudioEnabled(true);

            const pc = createPeerConnection();
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            remoteDescriptionSetRef.current = true;
            // flush any queued candidates
            if (pendingRemoteCandidatesRef.current.length > 0) {
                for (const c of pendingRemoteCandidatesRef.current) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(c));
                    } catch {}
                }
                pendingRemoteCandidatesRef.current = [];
            }
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socketRef.current.send(JSON.stringify({
                type: 'answer',
                answer: pc.localDescription?.toJSON() || answer,
                author: user_id
            }));

            setIsCalling(true);
            setIsIncomingCall(false);
        } catch (err) {
            alert('Не удалось ответить');
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
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            setLocalStream(null);
        }

        setRemoteStream(null);
        setIsCalling(false);
        setIsIncomingCall(false);
        setIsVideoEnabled(false);
        setIsAudioEnabled(true);

        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
                type: 'hangup',
                author: user_id
            }));
        }
    };

    const declineCall = () => {
        setIsIncomingCall(false);
        pendingOfferRef.current = null;
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
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
        if (interlocutorId === -1 || !user_id || user_id === -1) return;

        const id1 = Math.min(user_id, interlocutorId);
        const id2 = Math.max(user_id, interlocutorId);
        const ws = new WebSocket(`${getWsUrl()}/me/ws/${id1}/${id2}`);

        ws.onopen = () => { socketRef.current = ws; };

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
                            .then(() => { remoteDescriptionSetRef.current = true; })
                            .catch(() => {});
                    }
                } else if (type === 'ice-candidate' && data.author !== user_id) {
                    if (peerConnectionRef.current && data.candidate) {
                        // If remote description not set yet, queue the candidates
                        if (!remoteDescriptionSetRef.current) {
                            pendingRemoteCandidatesRef.current.push(data.candidate);
                        } else {
                            peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {});
                        }
                    }
                } else if (type === 'hangup' && data.author !== user_id) {
                    hangup();
                }

                setTimeout(() => messagesBlockRef.current?.scrollTo(0, messagesBlockRef.current.scrollHeight), 10);
            } catch (e) {}
        };

        ws.onclose = () => { socketRef.current = null; };

        return () => {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
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