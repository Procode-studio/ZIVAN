import { CircularProgress, IconButton, InputAdornment, TextField } from "@mui/material";
import { useState, useRef, useContext, useEffect } from "react";
import SendIcon from '@mui/icons-material/Send';
import PhoneIcon from '@mui/icons-material/Phone';  // Иконка звонка
import VideocamIcon from '@mui/icons-material/Videocam';  // Опционально для видео
import { UserInfoContext } from "../../App";
import axios from "axios";
import { useParams } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import InterlocutorProfile from "./InterlocutorProfile";
import { getServerUrl, getWsUrl } from '../../config/serverConfig';

type MessageType = {
  text: string;
  user_id: number;
};

type MessageResponseType = {
  id: number;
  user_id1: number;
  user_id2: number;
  text: string;
  author: number;
};

export default function MobileMessenger() {
    const navigate = useNavigate();
    const { id } = useParams();
    const interlocutorId = parseInt(id || '-1');
    const inputRef = useRef<HTMLInputElement>(null);
    const user = useContext(UserInfoContext);
    const user_id = user.userInfo.user_id;
    const [messages, setMessages] = useState<MessageType[]>([]);
    const [socket, setSocket] = useState<WebSocket | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const messagesBlockRef = useRef<HTMLDivElement>(null);  // Измените на <div> для правильного ref

    const sendMessage = () => {
        if (!inputRef.current || inputRef.current.value.length === 0 || !socket) return;
        const sendedMessage = {
            user_id1: user_id,
            user_id2: interlocutorId,
            text: inputRef.current.value,
            author: user_id
        };
        socket.send(JSON.stringify(sendedMessage));
        inputRef.current.value = '';
        console.log('Отправил ', sendedMessage);
    };

    // Функция для старта звонка (WebRTC)
    const startCall = async (isVideo = false) => {
        if (interlocutorId === -1 || !socket) return;
        
        try {
            // Получаем TURN/STUN creds
            const response = await axios.get(`${getServerUrl()}/get-turn-credentials`);
            const iceServers = response.data.uris.map((uri: string, index: number) => ({
                urls: uri,
                username: response.data.username,
                credential: response.data.password
            }));

            // Создаём RTCPeerConnection
            const pc = new RTCPeerConnection({ iceServers });
            
            // Добавляем tracks (аудио/видео)
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            // Создаём offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // Отправляем offer через WebSocket
            socket.send(JSON.stringify({
                type: 'offer',
                offer: pc.localDescription,
                author: user_id
            }));

            // Обработчики ICE и answer (добавьте onicecandidate, onmessage для answer)
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.send(JSON.stringify({
                        type: 'ice-candidate',
                        candidate: event.candidate,
                        author: user_id
                    }));
                }
            };

            // В onmessage socket добавьте обработку answer/ice (уже частично есть в вашем коде)
            // ...

            console.log('Звонок инициирован');
        } catch (error) {
            console.error('Ошибка звонка:', error);
        }
    };

    useEffect(() => {
        setIsLoaded(false);
        const cancelTokenSource = axios.CancelToken.source();
        const url = `${getServerUrl()}/messages/${user_id}/${interlocutorId}`;
        axios.get(url, { cancelToken: cancelTokenSource.token })
            .then((response) => {
                const data: MessageResponseType[] = response.data;
                setMessages(data.map((message) => ({
                    text: message.text,
                    user_id: message.author
                })));
                setIsLoaded(true);
                setTimeout(() => {
                    messagesBlockRef.current?.scrollTo(0, messagesBlockRef.current.scrollHeight);
                }, 10);
            })
            .catch((error) => {
                console.log(error);
            });
        return () => cancelTokenSource.cancel();
    }, [user_id, interlocutorId]);

    useEffect(() => {
        const newSocket = new WebSocket(`${getWsUrl()}/me/ws/${user_id}/${interlocutorId}`);
        newSocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'offer' || data.type === 'answer' || data.type === 'ice-candidate') {
                // Обработайте для WebRTC (добавьте логику pc.setRemoteDescription, pc.addIceCandidate)
            } else {
                setMessages((prevMessages) => [
                    ...prevMessages,
                    { text: data.text, user_id: data.author }
                ]);
            }
        };
        setSocket(newSocket);
        return () => {
            if (newSocket.readyState === 1) newSocket.close();
        };
    }, [user_id, interlocutorId]);

    return (
        <div id="messenger">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <InterlocutorProfile interlocutorId={interlocutorId} />
                {interlocutorId !== -1 && (
                    <>
                        <IconButton onClick={() => startCall(false)} color="secondary" disabled={!isLoaded}>
                            <PhoneIcon />
                        </IconButton>
                        <IconButton onClick={() => startCall(true)} color="secondary" disabled={!isLoaded}>
                            <VideocamIcon />
                        </IconButton>
                    </>
                )}
            </div>
            {!isLoaded ? (
                <section id="loading">
                    <CircularProgress color="secondary" />
                </section>
            ) : interlocutorId === -1 ? (
                <span id="choose-interlocutor-text">Выберите собеседника</span>
            ) : (
                <section id="messages" ref={messagesBlockRef}>
                    {messages.length === 0 ? (
                        <span id="no-messages-text">История сообщений пуста</span>
                    ) : null}
                    {messages.map((message, index) => (
                        <div
                            key={index}
                            data-from={message.user_id === user_id ? 'me' : 'other'}
                        >
                            {message.text}
                        </div>
                    ))}
                </section>
            )}
            <section id="input">
                <TextField
                    style={{ flexGrow: 1, position: 'relative' }}
                    color="secondary"
                    multiline
                    placeholder="Написать сообщение..."
                    inputRef={inputRef}
                    disabled={interlocutorId === -1}
                />
                <IconButton
                    style={{ marginBottom: '8px' }}
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