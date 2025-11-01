import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Divider, IconButton, Box, Avatar, Typography, Skeleton } from "@mui/material";
import { useNavigate } from "react-router-dom";
import GetAvatar from '../../features/getAvatarByName';
import { useState, useEffect } from "react";
import axios from 'axios';
import { getServerUrl } from '../../config/serverConfig';

interface Props {
    interlocutorId: number;
    showButton?: boolean;
}

export default function InterlocutorProfile({ interlocutorId, showButton = true }: Props) {
    const navigate = useNavigate();
    const [name, setName] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);

    const handleGoBack = () => {
        navigate(-1);
    };

    useEffect(() => {
        // Валидация ID
        if (!Number.isFinite(interlocutorId) || interlocutorId === -1) {
            setName('Собеседник не выбран');
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const controller = new AbortController();
        let isMounted = true;

        const loadProfile = async () => {
            try {
                // Сначала пробуем основной endpoint
                const response = await axios.get(`${getServerUrl()}/users/${interlocutorId}`, {
                    signal: controller.signal,
                    timeout: 5000
                });

                if (isMounted) {
                    if (response.data?.name && typeof response.data.name === 'string') {
                        setName(response.data.name.trim() || `User #${interlocutorId}`);
                    } else {
                        setName(`User #${interlocutorId}`);
                    }
                    setIsLoading(false);
                }
            } catch (error) {
                if (isMounted) {
                    // Если основной endpoint не сработал, возвращаем fallback
                    if (axios.isCancel(error)) {
                        console.log('[Profile] Request cancelled');
                    } else {
                        console.error('[Profile] Failed to load:', error);
                    }
                    setName(`User #${interlocutorId}`);
                    setIsLoading(false);
                }
            }
        };

        loadProfile();

        return () => {
            isMounted = false;
            controller.abort();
        };
    }, [interlocutorId]);

    if (isLoading) {
        return (
            <>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5 }}>
                    {showButton && <Skeleton variant="circular" width={40} height={40} />}
                    <Box sx={{ flex: 1 }}>
                        <Skeleton variant="text" width="60%" />
                        <Skeleton variant="text" width="40%" />
                    </Box>
                </Box>
                <Divider />
            </>
        );
    }

    return (
        <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5 }}>
                {showButton && (
                    <IconButton onClick={handleGoBack} size="small">
                        <ArrowBackIcon />
                    </IconButton>
                )}
                <GetAvatar name={name || '?'} />
                <Typography variant="h6" sx={{ fontWeight: 'bold', m: 0 }}>
                    {name}
                </Typography>
            </Box>
            <Divider />
        </>
    );
}