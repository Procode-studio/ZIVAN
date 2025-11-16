import { useState, useEffect } from 'react';
import axios from 'axios';
import { getServerUrl } from '../../config/serverConfig';

export const useInterlocutor = (interlocutorId: number) => {
    const [name, setName] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!Number.isFinite(interlocutorId) || interlocutorId === -1) {
            setName('');
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const controller = new AbortController();

        axios.get(`${getServerUrl()}/users/${interlocutorId}`, {
            signal: controller.signal,
            timeout: 5000
        })
            .then(res => {
                if (res.data?.name && typeof res.data.name === 'string') {
                    setName(res.data.name.trim() || `User #${interlocutorId}`);
                } else {
                    setName(`User #${interlocutorId}`);
                }
            })
            .catch(err => {
                if (!axios.isCancel(err)) {
                    console.error('[Profile] Failed to load:', err);
                }
                setName(`User #${interlocutorId}`);
            })
            .finally(() => {
                setIsLoading(false);
            });

        return () => controller.abort();
    }, [interlocutorId]);

    return { name, isLoading };
};