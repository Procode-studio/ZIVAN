import { useContext, useEffect, useState } from 'react';
import { UserInfoContext } from '../../App';
import axios from 'axios';
import { getServerUrl } from '../../config/serverConfig';
import { Button, Divider } from '@mui/material';
import GetAvatar from '../../features/getAvatarByName';
import { useNavigate } from 'react-router-dom';
import LogoutIcon from '@mui/icons-material/Logout';

type FriendType = { id: number; name: string };

export default function FriendsList() {
    const { userInfo, logout } = useContext(UserInfoContext);
    const user_id = userInfo.user_id;
    const user_name = userInfo.name;
    const [friends, setFriends] = useState<FriendType[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        if (!user_id || user_id === -1) return;

        const cancelToken = axios.CancelToken.source();
        
        axios.get(`${getServerUrl()}/users`, { cancelToken: cancelToken.token })
            .then((response) => {
                const allUsers: FriendType[] = response.data;
                const filtered = allUsers.filter((u) => u.id !== user_id);
                setFriends(filtered);
            })
            .catch((error) => {
                if (!axios.isCancel(error)) {
                    console.error('Failed to load users');
                }
            });

        return () => {
            cancelToken.cancel('cleanup');
        };
    }, [user_id]);

    const handleLogout = () => {
        logout();
        navigate('/login');
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
            {/* Header с профилем */}
            <div style={{ 
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <GetAvatar name={user_name || 'U'} />
                    <h3 style={{ margin: 0, fontSize: '16px' }}>{user_name}</h3>
                </div>
                <Button 
                    onClick={handleLogout}
                    color="error"
                    size="small"
                    startIcon={<LogoutIcon />}
                >
                    Выйти
                </Button>
            </div>
            
            <Divider />
            
            {/* Список друзей */}
            <div style={{ 
                flex: 1, 
                overflowY: 'auto',
                padding: '8px 0'
            }}>
                {friends.length === 0 ? (
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
                            onClick={() => navigate(`/messenger/${friend.id}`)} 
                            style={{
                                justifyContent: 'flex-start',
                                width: '100%',
                                padding: '12px 16px',
                                textTransform: 'none'
                            }} 
                            startIcon={<GetAvatar name={friend.name}/>}
                        >
                            {friend.name}
                        </Button>
                    ))
                )}
            </div>
        </div>
    );
}