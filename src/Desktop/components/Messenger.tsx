import { CircularProgress, IconButton, InputAdornment, TextField } from "@mui/material";
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


export default function Messenger() {

    const interlocutorId = useContext(MessengerInterlocutorId);

    const inputRef = useRef<HTMLInputElement>(null);

    const user = useContext(UserInfoContext);

    const user_id = user.userInfo.id;

    const [messages, setMessages] = useState<MessageType[]>([]);

    const [socket, setSocket] = useState<WebSocket | null>(null);
    const socketRef = useRef<WebSocket | null>(null);

    const [isLoaded, setIsLoaded] = useState(false);

    const messagesBlockRef = useRef<HTMLSelectElement>(null);

    // Новые состояния для WebRTC
    const [isCalling, setIsCalling] = useState(false);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    // ICE servers (замени на свои Coturn creds)
    const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { 
            urls: 'turn:твой-vps-ip:3478?transport=udp',
            username: 'твой-turn-username',
            credential: 'твой-turn-password'
        }
    ];

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
        socketRef.current.send(JSON.stringify(sendedMessage));
        inputRef.current.value = '';
        console.log('Sent:', sendedMessage);
    };

    // WebRTC функции (как в предыдущем фиксе)
    const createPeerConnection = () => {
        const pc = new RTCPeerConnection({ iceCandidatePoolSize: 10, iceServers });
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socketRef.current?.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: event.candidate,
                    author: user_id
                }));
            }
        };
        pc.ontrack = (event) => {
            setRemoteStream(event.streams[0]);
        };
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'disconnected') {
                hangup();
            }
        };
        peerConnectionRef.current = pc;
        return pc;
    };

    const startCall = async (video: boolean = false) => {
        if (interlocutorId === -1 || !socketRef.current) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: video,
                audio: true
            });
            setLocalStream(stream);
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;

            const pc = createPeerConnection();
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            socketRef.current.send(JSON.stringify({
                type: 'offer',
                offer: pc.localDescription,
                author: user_id,
                video: video
            }));
            setIsCalling(true);
        } catch (err) {
            console.error('Call error:', err);
        }
    };

    const answerCall = async (offer: RTCSessionDescriptionInit, video: boolean = false) => {
        if (!socketRef.current) {
            console.error('Socket not ready for answer');
            return;
        }
        const pc = createPeerConnection();
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const stream = await navigator.mediaDevices.getUserMedia({ video: video, audio: true });
        setLocalStream(stream);
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socketRef.current.send(JSON.stringify({
            type: 'answer',
            answer: pc.localDescription,
            author: user_id
        }));
        setIsCalling(true);
    };

    const hangup = () => {
        peerConnectionRef.current?.close();
        localStream?.getTracks().forEach(track => track.stop());
        setLocalStream(null);
        setRemoteStream(null);
        setIsCalling(false);
        socketRef.current?.send(JSON.stringify({ type: 'hangup', author: user_id }));
    };

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
                    text: message.text,
                    author: message.author,
                }));
                setMessages(data);
                setIsLoaded(true);
                setTimeout(() => {
                    messagesBlockRef.current?.scrollTo(0, messagesBlockRef.current.scrollHeight);
                }, 10);
            })
            .catch((error) => {
                if (!axios.isCancel(error)) {
                    console.error('Failed to load messages:', error);
                }
                setIsLoaded(true);
            });

        return () => {
            cancelTokenSource.cancel();
        };
    }, [user_id, interlocutorId]);

    useEffect(() => {
        if (interlocutorId === -1 || !user_id || user_id === -1) {
            setSocket(null);
            socketRef.current = null;
            return;
        }

        const id1 = Math.min(user_id, interlocutorId);
        const id2 = Math.max(user_id, interlocutorId);
        const newSocket = new WebSocket(`${getWsUrl()}/me/ws/${id1}/${id2}`);

        newSocket.onopen = () => {
            console.log('WebSocket connected');
            socketRef.current = newSocket;
            setSocket(newSocket);
        };

        newSocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            const msgType = data.type || 'message';

            if (msgType === 'message') {
                setMessages((prevMessages) => [
                    ...prevMessages,
                    {
                        text: data.text,
                        author: data.author
                    }
                ]);
            } else if (msgType === 'offer' && data.author !== user_id) {
                const video = data.video || false;
                if (confirm(`Входящий ${video ? 'видео' : 'аудио'} звонок от собеседника! Принять?`)) {
                    answerCall(data.offer, video);
                }
            } else if (msgType === 'answer' && data.author !== user_id) {
                peerConnectionRef.current?.setRemoteDescription(new RTCSessionDescription(data.answer));
            } else if (msgType === 'ice-candidate' && data.author !== user_id) {
                peerConnectionRef.current?.addIceCandidate(new RTCIceCandidate(data.candidate));
            } else if (msgType === 'hangup' && data.author !== user_id) {
                hangup();
            }
            setTimeout(() => {
                messagesBlockRef.current?.scrollTo(0, messagesBlockRef.current.scrollHeight);
            }, 10);
        };
        newSocket.onerror = (error) => console.error('WebSocket error:', error);
        newSocket.onclose = () => {
            console.log('WebSocket closed');
            socketRef.current = null;
        };

        return () => {
            if (newSocket.readyState === WebSocket.OPEN) {
                newSocket.close();
            }
            socketRef.current = null;
        };
    }, [user_id, interlocutorId]);

    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
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
                                    {
                                        message.text
                                    }
                                </div>
                            ))
                        }
                    </section>
                )
            }
            {/* WebRTC UI */}
            {isCalling && (
                <div id="call-ui" style={{ position: 'fixed', bottom: 100, right: 10, background: 'rgba(0,0,0,0.8)', color: 'white', padding: 10, borderRadius: 5 }}>
                    <video ref={localVideoRef} autoPlay muted style={{ width: '100px', height: '75px' }} />
                    <video ref={remoteVideoRef} autoPlay style={{ width: '200px', height: '150px' }} />
                    <IconButton onClick={hangup} color="error">
                        <CallEndIcon />
                    </IconButton>
                </div>
            )}
            {interlocutorId !== -1 && !isCalling && (
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                    <IconButton onClick={() => startCall(false)} color="secondary">
                        <PhoneIcon />
                    </IconButton>
                    <IconButton onClick={() => startCall(true)} color="secondary">
                        <VideocamIcon />
                    </IconButton>
                </div>
            )}
            <section id='input'>
                <TextField
                style={
                    {
                        flexGrow: 1,
                        position: 'relative',
                    }
                }
                color="secondary"
                multiline
                placeholder="Написать сообщение..."
                inputRef={inputRef}
                disabled={interlocutorId === -1}
                />
                <IconButton style={{marginBottom: '8px'}} onClick={sendMessage} disabled={interlocutorId === -1} color="secondary">
                    <SendIcon/>
                </IconButton>
            </section>
        </div>
    )
}