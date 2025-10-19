// Замени содержимое Desktop/components/Messenger.tsx на это:

import { CircularProgress, IconButton, TextField, Dialog, DialogContent, Avatar, Box, Typography, Fab } from "@mui/material";
import { useState, useRef, useContext, useEffect } from "react";
import { MessageType } from 'my-types/Message';
import SendIcon from '@mui/icons-material/Send';
import PhoneIcon from '@mui/icons-material/Phone';
import VideocamIcon from '@mui/icons-material/Videocam';
import CallEndIcon from '@mui/icons-material/CallEnd';
import { MessengerInterlocutorId } from "../pages/MessengerPage";
import { UserInfoContext } from "../../App";
import axios from "axios";
import InterlocutorProfile from "../../Mobile/components/InterlocutorProfile";
import { getServerUrl, getWsUrl } from '../../config/serverConfig';
import { getTurnServers } from '../../config/turnConfig';
import { useWebRTC } from '../../hooks/useWebRTC';
import CallDialog from '../../components/CallDialog';

export default function Messenger() {
    const interlocutorId = useContext(MessengerInterlocutorId);
    const inputRef = useRef<HTMLInputElement>(null);
    const user = useContext(UserInfoContext);
    const user_id = user.userInfo.user_id;

    const [messages, setMessages] = useState<MessageType[]>([]);
    const socketRef = useRef<WebSocket | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const messagesBlockRef = useRef<HTMLDivElement>(null);

    const [isCalling, setIsCalling] = useState(false);
    const [isIncomingCall, setIsIncomingCall] = useState(false);
    const [incomingCallVideo, setIncomingCallVideo] = useState(false);
    const [interlocutorName, setInterlocutorName] = useState<string>('');
    const [iceServers, setIceServers] = useState<RTCIceServer[]>([]);
    const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);

    const webRTC = useWebRTC({
        userId: user_id,
        iceServers,
        socket: socketRef.current
    });

    useEffect(() => {
        getTurnServers().then(setIceServers).catch(() => {});
    }, []);

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
        if (!text || !socketRef.current) return;

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

    const handleStartCall = async (video: boolean) => {
        try {
            await webRTC.startCall(video);
            setIsCalling(true);
        } catch (error) {
            alert('Не удалось начать звонок');
        }
    };

    const handleAnswerCall = async () => {
        if (!pendingOfferRef.current) return;
        try {
            await webRTC.answerCall(pendingOfferRef.current, incomingCallVideo);
            setIsCalling(true);
            setIsIncomingCall(false);
        } catch (error) {
            alert('Не удалось ответить');
            setIsIncomingCall(false);
        }
    };

    const handleHangup = () => {
        webRTC.cleanup();
        setIsCalling(false);
        setIsIncomingCall(false);
        
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
                type: 'hangup',
                author: user_id
            }));
        }
    };

    const handleDecline = () => {
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
        
        axios.get(`${getServerUrl()}/messages/${id1}/${id2}`, { cancelToken: cancelTokenSource.token })
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
            .catch(() => setIsLoaded(true));

        return () => cancelTokenSource.cancel();
    }, [user_id, interlocutorId]);

    // WebSocket
    useEffect(() => {
        if (interlocutorId === -1 || !user_id || user_id === -1) {
            socketRef.current = null;
            return;
        }

        const id1 = Math.min(user_id, interlocutorId);
        const id2 = Math.max(user_id, interlocutorId);
        const newSocket = new WebSocket(`${getWsUrl()}/me/ws/${id1}/${id2}`);

        newSocket.onopen = () => {
            socketRef.current = newSocket;
        };

        newSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const msgType = data.type || 'message';

                if (msgType === 'message') {
                    setMessages((prev) => [...prev, {
                        id: Date.now(),
                        text: data.text,
                        author: data.author,
                        message_type: 'text',
                        is_read: false,
                        created_at: new Date().toISOString()
                    }]);
                } else if (msgType === 'offer' && data.author !== user_id) {
                    pendingOfferRef.current = data.offer;
                    setIncomingCallVideo(data.video || false);
                    setIsIncomingCall(true);
                } else if (msgType === 'answer' && data.author !== user_id) {
                    webRTC.handleAnswer(data.answer);
                } else if (msgType === 'ice-candidate' && data.author !== user_id) {
                    webRTC.handleIceCandidate(data.candidate);
                } else if (msgType === 'hangup' && data.author !== user_id) {
                    handleHangup();
                }
                
                setTimeout(() => {
                    messagesBlockRef.current?.scrollTo(0, messagesBlockRef.current.scrollHeight);
                }, 10);
            } catch (error) {
                console.error('Message error:', error);
            }
        };

        newSocket.onclose = () => {
            socketRef.current = null;
        };

        return () => {
            if (newSocket.readyState === WebSocket.OPEN || newSocket.readyState === WebSocket.CONNECTING) {
                newSocket.close(1000);
            }
        };
    }, [user_id, interlocutorId]);

    return (
        <div id="messenger">
            {isLoaded && <InterlocutorProfile interlocutorId={interlocutorId} showButton={false}/>}
            
            {!isLoaded ? (
                <section id='loading'><CircularProgress color="secondary"/></section>
            ) : (
                interlocutorId === -1 ? (
                    <span id="choose-interlocutor-text">Выберите собеседника</span>
                ) : (
                    <section id='messages' ref={messagesBlockRef}>
                        {messages.length === 0 ? <span id="no-messages-text">История пуста</span> : null}
                        {messages.map((message, index) =>(
                            <div key={index} data-from={message.author === user_id ? 'me' : 'other'}>
                                {message.text}
                            </div>
                        ))}
                    </section>
                )
            )}
            
            {/* Входящий звонок */}
            <Dialog open={isIncomingCall} onClose={handleDecline} maxWidth="xs" fullWidth>
                <DialogContent sx={{ textAlign: 'center', py: 4 }}>
                    <Avatar sx={{ width: 80, height: 80, margin: '0 auto 16px' }}>
                        {interlocutorName[0]?.toUpperCase()}
                    </Avatar>
                    <Typography variant="h6" gutterBottom>{interlocutorName}</Typography>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        {incomingCallVideo ? 'Видео звонок' : 'Аудио звонок'}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 3 }}>
                        <Fab color="error" onClick={handleDecline}>
                            <CallEndIcon />
                        </Fab>
                        <Fab color="success" onClick={handleAnswerCall}>
                            <PhoneIcon />
                        </Fab>
                    </Box>
                </DialogContent>
            </Dialog>

            {/* Активный звонок */}
            <CallDialog
                open={isCalling}
                interlocutorName={interlocutorName}
                localStream={webRTC.localStream}
                remoteStream={webRTC.remoteStream}
                isVideoEnabled={webRTC.isVideoEnabled}
                isAudioEnabled={webRTC.isAudioEnabled}
                onToggleVideo={webRTC.toggleVideo}
                onToggleAudio={webRTC.toggleAudio}
                onHangup={handleHangup}
            />

            {/* Кнопки звонков */}
            {interlocutorId !== -1 && !isCalling && !isIncomingCall && (
                <div style={{ display: 'flex', gap: 10, marginBottom: 10, padding: '0 10px' }}>
                    <IconButton onClick={() => handleStartCall(false)} color="secondary">
                        <PhoneIcon />
                    </IconButton>
                    <IconButton onClick={() => handleStartCall(true)} color="secondary">
                        <VideocamIcon />
                    </IconButton>
                </div>
            )}
            
            <section id='input'>
                <TextField
                    style={{ flexGrow: 1 }}
                    color="secondary"
                    multiline
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
                    style={{marginBottom: '8px'}} 
                    onClick={sendMessage} 
                    disabled={interlocutorId === -1} 
                    color="secondary"
                >
                    <SendIcon/>
                </IconButton>
            </section>
        </div>
    );
}