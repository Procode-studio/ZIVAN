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
        navigate(-1);
    }

    useEffect(() => {
        if (interlocutorId === -1) {
            setName('Не выбран собеседник');
            return;
        }

        const CancelToken = axios.CancelToken.source();
        
        // Сначала пробуем получить из /users/{id}
        axios.get(`${getServerUrl()}/users/${interlocutorId}`, { cancelToken: CancelToken.token })
            .then((res) => {
                setName(res.data.name);
            })
            .catch((error) => {
                if (axios.isCancel(error)) return;
                
                // Если не получилось, пробуем /get-username/{id}
                axios.get(`${getServerUrl()}/get-username/${interlocutorId}`, { cancelToken: CancelToken.token })
                    .then((res) => {
                        setName(res.data);
                    })
                    .catch((err) => {
                        if (axios.isCancel(err)) return;
                        setName('Пользователь #' + interlocutorId);
                    });
            });
        
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