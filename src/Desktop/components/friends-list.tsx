import { useContext, useEffect, useState } from 'react';
import { UserInfoContext } from '../../App';
import axios from 'axios';
import { getServerUrl } from '../../config/serverConfig';
import { Button, Divider, Box, Typography, CircularProgress, Avatar, Chip } from '@mui/material';
import GetAvatar from '../../features/getAvatarByName';
import { useNavigate } from 'react-router-dom';
import LogoutIcon from '@mui/icons-material/Logout';

interface Friend {
    id: number;
    name: string;
}

export default function FriendsList() {
    const { userInfo, logout } = useContext(UserInfoContext);
    const user_id = userInfo?.user_id;
    const user_name = userInfo?.name;
    const [friends, setFriends] = useState<Friend[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        // Валидация
        if (!user_id || user_id === -1) {
            setIsLoading(false);
            setError('Пользователь не авторизован');
            return;
        }

        setIsLoading(true);
        setError(null);
        const controller = new AbortController();
        let isMounted = true;

        const loadFriends = async () => {
            try {
                const response = await axios.get(`${getServerUrl()}/users`, {
                    signal: controller.signal,
                    timeout: 10000
                });

                if (isMounted) {
                    // Валидация и фильтрация
                    if (Array.isArray(response.data)) {
                        const filtered = response.data
                            .filter((u: any) => {
                                return (
                                    u && 
                                    typeof u.id === 'number' && 
                                    u.id !== user_id &&
                                    typeof u.name === 'string'
                                );
                            })
                            .map((u: any) => ({
                                id: u.id,
                                name: (u.name || `User #${u.id}`).trim()
                            }));
                        
                        setFriends(filtered);
                    } else {
                        setError('Неверный формат данных с сервера');
                    }
                    setIsLoading(false);
                }
            } catch (error) {
                if (isMounted) {
                    if (axios.isCancel(error)) {
                        console.log('[Friends] Request cancelled');
                    } else {
                        console.error('[Friends] Failed to load:', error);
                        setError('Не удалось загрузить контакты');
                    }
                    setIsLoading(false);
                }
            }
        };

        loadFriends();

        return () => {
            isMounted = false;
            controller.abort();
        };
    }, [user_id]);

    const handleLogout = () => {
        try {
            logout();
            navigate('/login');
        } catch (err) {
            console.error('[Logout] Error:', err);
            alert('Ошибка при выходе');
        }
    };

    const navigateToMessenger = (friendId: number) => {
        if (!Number.isFinite(friendId) || friendId === -1) {
            alert('Ошибка: неверный ID контакта');
            return;
        }
        navigate(`/messenger/${friendId}`);
    };

    return (
        <div style={{
            minWidth: '280px',
            maxWidth: '320px',
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            backgroundColor: '#1e1e1e'
        }}>
            {/* HEADER С ПРОФИЛЕМ */}
            <div style={{
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <GetAvatar name={user_name || 'U'} />
                    <Typography sx={{ m: 0, fontSize: '14px', fontWeight: 'bold' }}>
                        {user_name || 'User'}
                    </Typography>
                </div>
                <Button
                    onClick={handleLogout}
                    color="error"
                    size="small"
                    startIcon={<LogoutIcon />}
                    sx={{ textTransform: 'none' }}
                >
                    Выход
                </Button>
            </div>

            <Divider />

            {/* СПИСОК ДРУЗЕЙ */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '8px 0'
            }}>
                {isLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                        <CircularProgress color="secondary" size={32} />
                    </Box>
                ) : error ? (
                    <Box sx={{ p: 2, textAlign: 'center', color: '#f44336' }}>
                        <Typography variant="body2">{error}</Typography>
                    </Box>
                ) : friends.length === 0 ? (
                    <div style={{
                        padding: '20px',
                        textAlign: 'center',
                        color: '#999'
                    }}>
                        Нет доступных контактов
                    </div>
                ) : (
                    friends.map((friend) => (
                        <Button
                            key={friend.id}
                            className="friend"
                            onClick={() => navigateToMessenger(friend.id)}
                            style={{
                                justifyContent: 'flex-start',
                                width: '100%',
                                padding: '12px 16px',
                                textTransform: 'none',
                                color: 'inherit',
                                fontSize: '14px'
                            }}
                            startIcon={<GetAvatar name={friend.name} />}
                        >
                            <div style={{
                                textAlign: 'left',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1
                            }}>
                                {friend.name}
                            </div>
                        </Button>
                    ))
                )}
            </div>
        </div>
    );
}