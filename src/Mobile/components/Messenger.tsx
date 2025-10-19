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
    const socketRef = useRef<WebSocket | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const messagesBlockRef = useRef<HTMLDivElement>(null);

    // WebRTC состояния
    const [isCalling, setIsCalling] = useState(false);
    const [isIncomingCall, setIsIncomingCall] = useState(false);
    const [incomingCallVideo, setIncomingCallVideo] = useState(false);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [interlocutorName, setInterlocutorName] = useState<string>('');
    
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const [iceServers, setIceServers] = useState<RTCIceServer[]>([]);
    const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);

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
        if (text.length === 0 || !socketRef.current) return;

        const id1 = Math.min(user_id, interlocutorId);
        const id2 = Math.max(user_id, interlocutorId);
        const sendedMessage = {
            type: 'message',
            user_id1: id1,
            user_id2: id2,
            text,
            author: user_id
        };

        if (socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify(sendedMessage));
            inputRef.current.value = '';
        }
    };

    const createPeerConnection = () => {
        const config: RTCConfiguration = {
            iceServers: iceServers.length > 0 ? iceServers : [
                { urls: 'stun:stun.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        };

        const pc = new RTCPeerConnection(config);
        
        pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current?.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: event.candidate.toJSON(),
                    author: user_id
                }));
            }
        };

        pc.ontrack = (event) => {
            setRemoteStream(event.streams[0]);
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                hangup();
            }
        };

        peerConnectionRef.current = pc;
        return pc;
    };

    const startCall = async (video: boolean = false) => {
        if (interlocutorId === -1 || !socketRef.current) return;
        if (socketRef.current.readyState !== WebSocket.OPEN) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: video,
                audio: true
            });
            
            setLocalStream(stream);
            setIsVideoEnabled(video);
            setIsAudioEnabled(true);
            
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            const pc = createPeerConnection();
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            socketRef.current.send(JSON.stringify({
                type: 'offer',
                offer: pc.localDescription?.toJSON(),
                author: user_id,
                video: video
            }));
            
            setIsCalling(true);
        } catch (err) {
            console.error('Call error:', err);
            alert('Не удалось начать звонок. Проверьте разрешения камеры/микрофона.');
        }
    };

    const answerCall = async (offer: RTCSessionDescriptionInit, video: boolean = false) => {
        if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;

        try {
            const pc = createPeerConnection();
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: video, 
                audio: true 
            });
            
            setLocalStream(stream);
            setIsVideoEnabled(video);
            setIsAudioEnabled(true);
            
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
            
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socketRef.current.send(JSON.stringify({
                type: 'answer',
                answer: pc.localDescription?.toJSON(),
                author: user_id
            }));

            setIsCalling(true);
            setIsIncomingCall(false);
        } catch (err) {
            console.error('Answer error:', err);
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
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
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
            socketRef.current = null;
            return;
        }

        const id1 = Math.min(user_id, interlocutorId);
        const id2 = Math.max(user_id, interlocutorId);
        const wsUrl = `${getWsUrl()}/me/ws/${id1}/${id2}`;
        
        const newSocket = new WebSocket(wsUrl);

        newSocket.onopen = () => {
            socketRef.current = newSocket;
        };

        newSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const msgType = data.type || 'message';

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
                        ).catch(err => console.error('Error setting remote description'));
                    }
                } else if (msgType === 'ice-candidate' && data.author !== user_id) {
                    if (peerConnectionRef.current && data.candidate) {
                        peerConnectionRef.current.addIceCandidate(
                            new RTCIceCandidate(data.candidate)
                        ).catch(err => console.error('Error adding ICE candidate'));
                    }
                } else if (msgType === 'hangup' && data.author !== user_id) {
                    hangup();
                }
                
                setTimeout(() => {
                    messagesBlockRef.current?.scrollTo(0, messagesBlockRef.current.scrollHeight);
                }, 10);
            } catch (error) {
                console.error('Error processing message');
            }
        };

        newSocket.onerror = () => {
            console.error('WebSocket error');
        };

        newSocket.onclose = () => {
            socketRef.current = null;
        };

        return () => {
            if (newSocket.readyState === WebSocket.OPEN || newSocket.readyState === WebSocket.CONNECTING) {
                newSocket.close(1000, 'Unmounting');
            }
            socketRef.current = null;
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
                    <Box sx={{ flex: 1, position: 'relative', backgroundColor: '#000' }}>
                        {remoteStream && remoteStream.getVideoTracks().length > 0 && remoteStream.getVideoTracks()[0].enabled ? (
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
                        ) : (
                            <Box sx={{ 
                                width: '100%', 
                                height: '100%', 
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
                            border: '2px solid #fff',
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