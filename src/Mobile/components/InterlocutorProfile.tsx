import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Divider, IconButton } from "@mui/material";
import { useNavigate } from "react-router-dom";
import GetAvatar from '../../features/getAvatarByName';
import { useState, useEffect } from "react";
import axios from 'axios';
import { getServerUrl } from '../../config/serverConfig';

export default function InterlocutorProfile({interlocutorId, showButton=true}: {interlocutorId: number, showButton?: boolean}) {

    const navigate = useNavigate();
    const [name, setName] = useState<string>('');

    const handleGoBack = () => {
        navigate('/friends');
    }

    useEffect(() => {
        if (interlocutorId === -1) {
            setName('Не выбран собеседник');
            return;
        }

        const CancelToken = axios.CancelToken.source();
        const url = `${getServerUrl()}/get-username/${interlocutorId}`;
        
        axios.get(url, { cancelToken: CancelToken.token })
            .then((res) => {
                setName(res.data);
            })
            .catch((error) => {
                if (axios.isCancel(error)) return;
                if (error.response?.status === 404) {
                    setName('Пользователь не найден');
                    return;
                }
                setName('Ошибка загрузки');
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
                <GetAvatar name={name || '?'}/>
                <h3>{name}</h3>
            </section>
            <Divider/>
        </>
    )
}