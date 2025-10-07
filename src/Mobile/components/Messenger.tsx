import { CircularProgress, IconButton, InputAdornment, TextField } from "@mui/material";
import { useState, useRef, useContext, useEffect } from "react";
import { MessageType, MessageResponseType } from "my-types/Messege";
import SendIcon from '@mui/icons-material/Send';
import { UserInfoContext } from "../../App";
import axios from "axios";
import { useParams } from "react-router-dom";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from "react-router-dom";
import InterlocutorProfile from "./InterlocutorProfile";

export default function MobileMessenger() {

    const navigate = useNavigate();

    const { id } = useParams();

    const interlocutorId = parseInt(id || '-1');

    const inputRef = useRef<HTMLInputElement>(null);

    const user = useContext(UserInfoContext);

    const user_id = user.userInfo.id;

    const [messages, setMessages] = useState<MessageType[]>([]);

    const [socket, setSocket] = useState<WebSocket | null>(null);

    const [isLoaded, setIsLoaded] = useState(false);

    const messagesBlockRef = useRef<HTMLSelectElement>(null);

    const sendMessage = () => {
        if(!inputRef.current) {
            return;
        }
        const text = inputRef.current.value;
        if(text.length === 0) return;
        if(!socket) return;
        const sendedMessage = {
            user_id1: user_id,
            user_id2: interlocutorId,
            text,
            author: user_id
        }
        socket.send(JSON.stringify(sendedMessage));
        inputRef.current.value = '';
        console.log('Отправил ', sendedMessage);
    }

    useEffect(() => {
        setIsLoaded(false);
        const cancelTokenSource = axios.CancelToken.source();
        const url = `me?id1=${user_id}&id2=${interlocutorId}`;
        axios.get(url, {
            cancelToken: cancelTokenSource.token
        })
        .then((response) => {
            const data : MessageResponseType[] = response.data;
            setMessages(data.map((message) => {
                return {
                    text: message.text,
                    user_id: message.author
                }
            })) 
            // setTimeout(() => {
            //     const messagesBlock = document.getElementById('messages');
            //     if(messagesBlock) {
            //         messagesBlock.scrollTop = messagesBlock.scrollHeight;
            //         console.log(messagesBlock);
            //     }
            // },
            // 100)
            setIsLoaded(true);
            setTimeout(() => {
                messagesBlockRef.current?.scrollTo(0, messagesBlockRef.current.scrollHeight);
            },
            10)
        })
        .catch((error) => {
            console.log(error);
        })
        return () => {
            cancelTokenSource.cancel();
        }
    },
    [user_id, interlocutorId]
    )

    useEffect(() => {
        const newSocket = new WebSocket(`wss://simple-messenger-server.onrender.com/me/ws/${user_id}/${interlocutorId}`);
        // const newSocket = new WebSocket(`ws://localhost:8000/me/ws/${user_id}/${interlocutorId}`);

        newSocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            setMessages((prevMessages) => {
                return [
                    ...prevMessages,
                    {
                        text: data.text,
                        user_id: data.author
                    }
                ]
            })
        }

        setSocket(newSocket);
        return () => {
            if(newSocket.readyState === 1) {
                newSocket.close();
            }
        }
    }, [user_id, interlocutorId]);

    return (
        <div id="messenger">
            <InterlocutorProfile interlocutorId={interlocutorId}/>
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
                                data-from={message.user_id === user_id ? 'me' : 'other'}
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
                // InputProps={{
                //     endAdornment:
                //         (
                //         <InputAdornment position="end">
                //             <IconButton style={{marginBottom: '8px'}} onClick={sendMessage} disabled={interlocutorId === -1} color="secondary">
                //                 <SendIcon/>
                //             </IconButton>
                //         </InputAdornment>
                //         )
                // }}
                />
                <IconButton style={{marginBottom: '8px'}} onClick={sendMessage} disabled={interlocutorId === -1} color="secondary">
                    <SendIcon/>
                </IconButton>
            </section>
        </div>
    )
}