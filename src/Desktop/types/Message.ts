type MessageType = {
    id: number;
    text: string;
    author?: number;  // Добавил для consistency (было user_id)
    message_type: string;
    file_url?: string;
    is_read: boolean;
    created_at: string;
    // Новые поля для WebRTC
    type?: 'message' | 'offer' | 'answer' | 'ice-candidate' | 'hangup';
    offer?: RTCSessionDescriptionInit;
    answer?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
    video?: boolean;
}

type MessageResponseType = {
    id: number;
    user_id1: number;
    user_id2: number;
    text: string;
    author: number;
    message_type: string;
    file_url?: string;
    is_read: boolean;
    created_at: string;
}

type SendMessageType = {
    user_id1: number;
    user_id2: number;
    text: string;
    author: number;
    message_type?: string;
    file_url?: string;
    // Новые поля для WebRTC (опционально, для signaling)
    type?: 'message' | 'offer' | 'answer' | 'ice-candidate' | 'hangup';
    offer?: RTCSessionDescriptionInit;
    answer?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
    video?: boolean;
}

export type {MessageType, MessageResponseType, SendMessageType};