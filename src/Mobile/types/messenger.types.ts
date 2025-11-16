export interface Message {
    id: number;
    text: string;
    author: number;
    message_type: string;
    is_read: boolean;
    created_at: string;
}

export interface WebSocketMessage {
    type: string;
    author: number;
    text?: string;
    offer?: RTCSessionDescriptionInit;
    answer?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
    video?: boolean;
    user_id1?: number;
    user_id2?: number;
    [key: string]: any;
}

export enum CallStatus {
    IDLE = 'idle',
    CALLING = 'calling',
    RINGING = 'ringing',
    CONNECTED = 'connected',
    FAILED = 'failed'
}

export interface UserProfile {
    id: number;
    name: string;
}

export interface TurnCredentials {
    username: string;
    password: string;
    ttl: number;
    realm: string;
    uris: string[];
}