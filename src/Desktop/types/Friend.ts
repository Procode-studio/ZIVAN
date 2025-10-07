type FriendType = {
    id: number;
    username?: string;  // Опционально (фикс для friends-list)
    name: string;
    email?: string;
    phone?: string;
    avatar_url?: string;
    is_online?: boolean;  // Опционально
    last_seen?: string;   // Опционально
}

type UserType = {
    id: number;
    username?: string;
    name: string;
    email?: string;
    phone?: string;
    avatar_url?: string;
    is_online?: boolean;
    last_seen?: string;
}

export type {FriendType, UserType};