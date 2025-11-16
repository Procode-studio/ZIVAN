import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { getServerUrl } from '../../config/serverConfig';

export interface Message {
    id: number;
    text: string;
    author: number;
    message_type: string;
    is_read: boolean;
    created_at: string;
}

export const useMessages = (userId: number, interlocutorId: number) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = useCallback(() => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }, []);

    const loadMessages = useCallback(async () => {
        if (interlocutorId === -1) {
            setMessages([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const controller = new AbortController();
        const id1 = Math.min(userId, interlocutorId);
        const id2 = Math.max(userId, interlocutorId);

        try {
            const res = await axios.get(`${getServerUrl()}/messages/${id1}/${id2}`, {
                signal: controller.signal
            });

            const data = (res.data || []).map((m: any) => ({
                id: m.id,
                text: m.text,
                author: m.author,
                message_type: 'text',
                is_read: m.author === userId,
                created_at: m.created_at || new Date().toISOString()
            }));

            setMessages(data);
            scrollToBottom();
        } catch (err) {
            if (!axios.isCancel(err)) {
                console.error('[Messages] Failed to load:', err);
            }
        } finally {
            setIsLoading(false);
        }

        return () => controller.abort();
    }, [userId, interlocutorId, scrollToBottom]);

    const addMessage = useCallback((message: Message) => {
        setMessages(prev => [...prev, message]);
        scrollToBottom();
    }, [scrollToBottom]);

    const markAsRead = useCallback(() => {
        setMessages(prev => prev.map(m => 
            m.author === userId ? { ...m, is_read: true } : m
        ));
    }, [userId]);

    useEffect(() => {
        loadMessages();
    }, [loadMessages]);

    return {
        messages,
        isLoading,
        messagesEndRef,
        addMessage,
        markAsRead,
        scrollToBottom
    };
};