import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { CircularProgress, Divider, IconButton, InputAdornment, TextField } from "@mui/material";
import { useNavigate } from "react-router-dom";
import GetAvatar from '../../features/getAvatarByName';
import { UserInfoContext } from "../../App";
import { useState, useRef, useContext, useEffect } from "react";
import axios from 'axios';
import { getServerUrl } from '../../config/serverConfig';

export default function InterlocutorProfile({interlocutorId, showButton=true}: {interlocutorId: number, showButton?: boolean}) {

    const navigate = useNavigate();

    const [name, setName] = useState<string>('');

    const handleGoBack = () => {
        navigate(-1);
    }

    useEffect(() => {
        if (interlocutorId === -1) {
            setName('Не выбран собеседник');
            return;
        }

        const CancelToken = axios.CancelToken.source();
        const url = `${getServerUrl()}/get-username/${interlocutorId}`;
        axios.get(url, {
            cancelToken: CancelToken.token
        })
        .then((res) => {
            setName(res.data);  // Ожидаем строку с именем
        })
        .catch((error) => {
            if (axios.isCancel(error)) {
                console.log('Request canceled — normal cleanup');
                return;
            }
            if (error.response?.status === 404) {
                setName('Пользователь не найден');  // Fallback для 404
                return;
            }
            console.error('Error loading username:', error);  // Реальные ошибки
        })
        return () => {
            CancelToken.cancel();
        }
    }, [interlocutorId]);

    return (
        <>
            <section className='d-flex ai-center g-10'>
                {showButton && 
                <IconButton onClick={handleGoBack}>
                    <ArrowBackIcon/>
                </IconButton>
                }
                <GetAvatar name={name || '0'}/>
                <h3>
                    {name}
                </h3>
            </section>
            <Divider/>
        </>
    )
}