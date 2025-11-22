import { useEffect, useState, useContext } from "react";
import { Box, Button, CircularProgress, Typography, Avatar, IconButton } from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/Person";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useNavigate } from "react-router-dom";
import { UserInfoContext } from "../../App";
import axios from "axios";
import { getServerUrl } from "../../config/serverConfig";

type Friend = { id: number; name: string };

export default function MobileFriendsPage() {
    const navigate = useNavigate();
    const { userInfo, logout } = useContext(UserInfoContext);
    const [friends, setFriends] = useState<Friend[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const uid = userInfo?.user_id;
        if (!uid || uid === -1) {
            setIsLoading(false);
            return;
        }

        const cancelToken = axios.CancelToken.source();
        const url = `${getServerUrl()}/users`;

        axios.get(url, { cancelToken: cancelToken.token })
            .then((res) => {
                setFriends(
                    res.data
                        .map((u: any) => ({ name: u.name, id: u.id }))
                        .filter((f: Friend) => f.id !== uid)
                );
            })
            .catch((error) => {
                if (!axios.isCancel(error)) {
                    console.error('Failed to load users');
                }
            })
            .finally(() => setIsLoading(false));

        return () => cancelToken.cancel('cleanup');
    }, [userInfo?.user_id]);

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    return (
        <Box sx={{
            height: '100dvh',
            minHeight: '-webkit-fill-available',
            display: 'flex',
            flexDirection: 'column',
            background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)'
        }}>
            {/* Header */}
            <Box sx={{
                p: 2,
                pt: 'max(16px, env(safe-area-inset-top))',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'linear-gradient(180deg, rgba(22,33,62,1) 0%, rgba(26,26,46,0.95) 100%)',
                borderBottom: '1px solid rgba(76, 175, 80, 0.2)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar
                        sx={{
                            width: 40,
                            height: 40,
                            background: 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)',
                            fontSize: '1rem',
                            fontWeight: 'bold'
                        }}
                    >
                        {userInfo?.name?.[0]?.toUpperCase() || 'U'}
                    </Avatar>
                    <Box>
                        <Typography sx={{ fontWeight: 600, color: '#fff', fontSize: '1rem' }}>
                            {userInfo?.name || 'User'}
                        </Typography>
                        <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>
                            Контакты
                        </Typography>
                    </Box>
                </Box>
                <IconButton
                    onClick={handleLogout}
                    sx={{
                        color: '#EF5350',
                        backgroundColor: 'rgba(239, 83, 80, 0.1)',
                        '&:hover': { backgroundColor: 'rgba(239, 83, 80, 0.2)' }
                    }}
                >
                    <LogoutIcon />
                </IconButton>
            </Box>

            {/* Content */}
            <Box sx={{
                flex: 1,
                overflowY: 'auto',
                p: 1,
                WebkitOverflowScrolling: 'touch'
            }}>
                {isLoading ? (
                    <Box sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        height: '100%',
                        minHeight: 200
                    }}>
                        <CircularProgress color="secondary" />
                    </Box>
                ) : friends.length === 0 ? (
                    <Box sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        minHeight: 200,
                        gap: 2
                    }}>
                        <Box sx={{
                            width: 80,
                            height: 80,
                            borderRadius: '50%',
                            background: 'rgba(76, 175, 80, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <PersonIcon sx={{ fontSize: 40, color: 'rgba(76, 175, 80, 0.5)' }} />
                        </Box>
                        <Typography sx={{ color: 'rgba(255,255,255,0.5)' }}>
                            Нет контактов
                        </Typography>
                    </Box>
                ) : (
                    friends.map((friend) => (
                        <Box
                            key={friend.id}
                            onClick={() => navigate(`/messenger/${friend.id}`)}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.5,
                                p: 1.5,
                                mx: 0.5,
                                my: 0.5,
                                borderRadius: 2,
                                backgroundColor: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                '&:hover': {
                                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                                    borderColor: 'rgba(76, 175, 80, 0.3)',
                                    transform: 'translateX(4px)'
                                },
                                '&:active': {
                                    transform: 'scale(0.98)'
                                }
                            }}
                        >
                            <Avatar
                                sx={{
                                    width: 48,
                                    height: 48,
                                    background: 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)',
                                    fontSize: '1.1rem',
                                    fontWeight: 'bold',
                                    boxShadow: '0 2px 8px rgba(76, 175, 80, 0.3)'
                                }}
                            >
                                {friend.name[0]?.toUpperCase() || '?'}
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography
                                    sx={{
                                        fontWeight: 500,
                                        color: '#fff',
                                        fontSize: '1rem'
                                    }}
                                    noWrap
                                >
                                    {friend.name}
                                </Typography>
                                <Typography
                                    sx={{
                                        color: 'rgba(255,255,255,0.4)',
                                        fontSize: '0.8rem'
                                    }}
                                >
                                    Нажмите чтобы написать
                                </Typography>
                            </Box>
                            <ChevronRightIcon sx={{ color: 'rgba(255,255,255,0.3)' }} />
                        </Box>
                    ))
                )}
            </Box>
        </Box>
    );
}