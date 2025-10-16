import { CircularProgress, IconButton, TextField } from "@mui/material";
import { useState, useRef, useContext, useEffect } from "react";
import { MessageType } from 'my-types/Message';
import SendIcon from '@mui/icons-material/Send';
import './messenger.css';
import { MessengerInterlocutorId } from "../pages/MessengerPage";
import { UserInfoContext } from "../../App";
import axios from "axios";
import InterlocutorProfile from "../../Mobile/components/InterlocutorProfile";
import PhoneIcon from '@mui/icons-material/Phone';
import VideocamIcon from '@mui/icons-material/Videocam';
import CallEndIcon from '@mui/icons-material/CallEnd';
import { getServerUrl, getWsUrl } from '../../config/serverConfig';
import { getTurnServers } from '../../config/turnConfig';

export default function Messenger() {

    const interlocutorId = useContext(MessengerInterlocutorId);
    const inputRef = useRef<HTMLInputElement>(null);
    const user = useContext(UserInfoContext);
    const user_id = user.userInfo.user_id;

    const [messages, setMessages] = useState<MessageType[]>([]);
    const [socket, setSocket] = useState<WebSocket | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const messagesBlockRef = useRef<HTMLSelectElement>(null);

    // WebRTC состояния
    const [isCalling, setIsCalling] = useState(false);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const [iceServers, setIceServers] = useState<RTCIceServer[]>([]);

    // Загружаем TURN credentials при монтировании
    useEffect(() => {
        const loadTurnServers = async () => {
            try {
                const servers = await getTurnServers();
                setIceServers(servers);
                console.log('✅ ICE servers loaded:', servers.length);
            } catch (error) {
                console.error('❌ Failed to load TURN servers:', error);
                // Используем только STUN при ошибке
                setIceServers([
                    { urls: 'stun:stun.l.google.com:19302' }
                ]);
            }
        };
        loadTurnServers();
    }, []);

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
            console.log('📤 Sent:', sendedMessage);
        } else {
            console.error('❌ WebSocket not open, state:', socketRef.current.readyState);
        }
    };

    const createPeerConnection = () => {
        if (iceServers.length === 0) {
            console.warn('⚠️ No ICE servers available, using default STUN');
        }
        
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
                console.log('🧊 ICE candidate sent');
            }
        };

        pc.ontrack = (event) => {
            console.log('📹 Remote track received');
            setRemoteStream(event.streams[0]);
        };

        pc.onconnectionstatechange = () => {
            console.log('🔄 Connection state:', pc.connectionState);
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                hangup();
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log('🧊 ICE connection state:', pc.iceConnectionState);
        };

        peerConnectionRef.current = pc;
        return pc;
    };

    const startCall = async (video: boolean = false) => {
        if (interlocutorId === -1 || !socketRef.current) {
            console.error('❌ Cannot start call: no interlocutor or socket');
            return;
        }

        if (socketRef.current.readyState !== WebSocket.OPEN) {
            console.error('❌ WebSocket not ready, state:', socketRef.current.readyState);
            return;
        }

        try {
            console.log(`📞 Starting ${video ? 'video' : 'audio'} call...`);
            
            const stream = await navigator.mediaDevices.getUserMedia({
                video: video,
                audio: true
            });
            
            setLocalStream(stream);
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            const pc = createPeerConnection();
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
                console.log('➕ Added track:', track.kind);
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
            console.log('✅ Call offer sent');
        } catch (err) {
            console.error('❌ Call error:', err);
            alert(`Не удалось начать звонок: ${err}`);
        }
    };

    const answerCall = async (offer: RTCSessionDescriptionInit, video: boolean = false) => {
        if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
            console.error('❌ Socket not ready for answer');
            return;
        }

        try {
            console.log(`📞 Answering ${video ? 'video' : 'audio'} call...`);
            
            const pc = createPeerConnection();
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: video, 
                audio: true 
            });
            
            setLocalStream(stream);
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
            
            stream.getTracks().forEach(track => {
                pc.addTrack(track, stream);
                console.log('➕ Added track:', track.kind);
            });

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socketRef.current.send(JSON.stringify({
                type: 'answer',
                answer: pc.localDescription?.toJSON(),
                author: user_id
            }));

            setIsCalling(true);
            console.log('✅ Call answer sent');
        } catch (err) {
            console.error('❌ Answer error:', err);
            alert(`Не удалось ответить на звонок: ${err}`);
        }
    };

    const hangup = () => {
        console.log('📴 Hanging up...');
        
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        
        if (localStream) {
            localStream.getTracks().forEach(track => {
                track.stop();
                console.log('⏹️ Stopped track:', track.kind);
            });
            setLocalStream(null);
        }
        
        setRemoteStream(null);
        setIsCalling(false);
        
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
                    console.error('❌ Failed to load messages:', error);
                }
                setIsLoaded(true);
            });

        return () => {
            cancelTokenSource.cancel('Component unmounted');
        };
    }, [user_id, interlocutorId]);

    // WebSocket соединение
    useEffect(() => {
        if (interlocutorId === -1 || !user_id || user_id === -1) {
            setSocket(null);
            socketRef.current = null;
            return;
        }

        const id1 = Math.min(user_id, interlocutorId);
        const id2 = Math.max(user_id, interlocutorId);
        const wsUrl = `${getWsUrl()}/me/ws/${id1}/${id2}`;
        
        console.log('🔌 Connecting to WebSocket:', wsUrl);
        const newSocket = new WebSocket(wsUrl);

        newSocket.onopen = () => {
            console.log('✅ WebSocket connected');
            socketRef.current = newSocket;
            setSocket(newSocket);
        };

        newSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const msgType = data.type || 'message';

                console.log('📨 Received:', msgType, data);

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
                    const video = data.video || false;
                    if (confirm(`Входящий ${video ? 'видео' : 'аудио'} звонок! Принять?`)) {
                        answerCall(data.offer, video);
                    }
                } else if (msgType === 'answer' && data.author !== user_id) {
                    if (peerConnectionRef.current) {
                        peerConnectionRef.current.setRemoteDescription(
                            new RTCSessionDescription(data.answer)
                        ).then(() => {
                            console.log('✅ Remote description set');
                        }).catch(err => {
                            console.error('❌ Error setting remote description:', err);
                        });
                    }
                } else if (msgType === 'ice-candidate' && data.author !== user_id) {
                    if (peerConnectionRef.current && data.candidate) {
                        peerConnectionRef.current.addIceCandidate(
                            new RTCIceCandidate(data.candidate)
                        ).then(() => {
                            console.log('✅ ICE candidate added');
                        }).catch(err => {
                            console.error('❌ Error adding ICE candidate:', err);
                        });
                    }
                } else if (msgType === 'hangup' && data.author !== user_id) {
                    hangup();
                }
                
                setTimeout(() => {
                    messagesBlockRef.current?.scrollTo(0, messagesBlockRef.current.scrollHeight);
                }, 10);
            } catch (error) {
                console.error('❌ Error processing message:', error);
            }
        };

        newSocket.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
        };

        newSocket.onclose = (event) => {
            console.log('🔌 WebSocket closed:', event.code, event.reason);
            socketRef.current = null;
            setSocket(null);
        };

        return () => {
            console.log('🧹 Cleaning up WebSocket');
            if (newSocket.readyState === WebSocket.OPEN || newSocket.readyState === WebSocket.CONNECTING) {
                newSocket.close(1000, 'Component unmounting');
            }
            socketRef.current = null;
        };
    }, [user_id, interlocutorId]);

    // Обновление remote video
    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
            console.log('📹 Remote video updated');
        }
    }, [remoteStream]);

    return (
        <div id="messenger">
            {
                isLoaded && 
                <InterlocutorProfile interlocutorId={interlocutorId} showButton={false}/>
            }
            {
                !isLoaded ? <section id='loading'><CircularProgress color="secondary"/></section>
                :
                (
                    interlocutorId === -1 ? <span id="choose-interlocutor-text">Выберите собеседника</span> :
                    <section id='messages' ref={messagesBlockRef}>
                        {
                            messages.length === 0 ? <span id="no-messages-text">История сообщений пуста</span> : null
                        }
                        {
                            messages.map((message, index) =>(
                                <div
                                key={index}
                                data-from={message.author === user_id ? 'me' : 'other'}
                                >
                                    {message.text}
                                </div>
                            ))
                        }
                    </section>
                )
            }
            
            {/* WebRTC UI */}
            {isCalling && (
                <div id="call-ui" style={{ 
                    position: 'fixed', 
                    bottom: 100, 
                    right: 10, 
                    background: 'rgba(0,0,0,0.9)', 
                    color: 'white', 
                    padding: 10, 
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    zIndex: 1000
                }}>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                        <video 
                            ref={localVideoRef} 
                            autoPlay 
                            muted 
                            playsInline
                            style={{ 
                                width: '120px', 
                                height: '90px',
                                borderRadius: 4,
                                border: '2px solid #4CAF50'
                            }} 
                        />
                        <video 
                            ref={remoteVideoRef} 
                            autoPlay 
                            playsInline
                            style={{ 
                                width: '240px', 
                                height: '180px',
                                borderRadius: 4,
                                border: '2px solid #2196F3'
                            }} 
                        />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <IconButton onClick={hangup} color="error" size="large">
                            <CallEndIcon />
                        </IconButton>
                    </div>
                </div>
            )}
            
            {/* Кнопки звонков */}
            {interlocutorId !== -1 && !isCalling && (
                <div style={{ 
                    display: 'flex', 
                    gap: 10, 
                    marginBottom: 10,
                    padding: '0 10px'
                }}>
                    <IconButton onClick={() => startCall(false)} color="secondary" title="Аудио звонок">
                        <PhoneIcon />
                    </IconButton>
                    <IconButton onClick={() => startCall(true)} color="secondary" title="Видео звонок">
                        <VideocamIcon />
                    </IconButton>
                </div>
            )}
            
            <section id='input'>
                <TextField
                    style={{
                        flexGrow: 1,
                        position: 'relative',
                    }}
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
    )
}