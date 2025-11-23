import { useContext, useEffect, useState } from 'react';
import { UserInfoContext } from '../../App';
import axios from 'axios';
import { getServerUrl } from '../../config/serverConfig';
import {
    Box,
    Typography,
    CircularProgress,
    Avatar,
    IconButton,
    Menu,
    MenuItem,
    ListItemIcon,
    ListItemText,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import LogoutIcon from '@mui/icons-material/Logout';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteIcon from '@mui/icons-material/Delete';

// Унифицированные цвета (те же что в Messenger)
const theme = {
    bg: {
        primary: '#0f0f1a',
        secondary: '#1a1a2e',
        tertiary: '#16213e',
        hover: 'rgba(76, 175, 80, 0.1)'
    },
    text: {
        primary: '#ffffff',
        secondary: 'rgba(255,255,255,0.7)',
        muted: 'rgba(255,255,255,0.5)'
    },
    accent: '#4CAF50',
    border: 'rgba(76, 175, 80, 0.2)',
    error: '#f44336'
};

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
    const { id } = useParams();
    const selectedId = id ? parseInt(id) : -1;

    // Меню и диалоги
    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
    const [menuFriendId, setMenuFriendId] = useState<number | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [friendToDelete, setFriendToDelete] = useState<Friend | null>(null);

    useEffect(() => {
        if (!user_id || user_id === -1) {
            setIsLoading(false);
            setError('Пользователь не авторизован');
            return;
        }

        setIsLoading(true);
        setError(null);
        const controller = new AbortController();

        const loadFriends = async () => {
            try {
                const response = await axios.get(`${getServerUrl()}/users`, {
                    signal: controller.signal,
                    timeout: 10000
                });

                if (Array.isArray(response.data)) {
                    const filtered = response.data
                        .filter((u: any) => u && typeof u.id === 'number' && u.id !== user_id && typeof u.name === 'string')
                        .map((u: any) => ({ id: u.id, name: (u.name || `User #${u.id}`).trim() }));
                    setFriends(filtered);
                } else {
                    setError('Неверный формат данных');
                }
                setIsLoading(false);
            } catch (err) {
                if (!axios.isCancel(err)) {
                    setError('Не удалось загрузить контакты');
                }
                setIsLoading(false);
            }
        };

        loadFriends();
        return () => controller.abort();
    }, [user_id]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const navigateToMessenger = (friendId: number) => {
        navigate(`/messenger/${friendId}`);
    };

    const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, friend: Friend) => {
        event.stopPropagation();
        setMenuAnchor(event.currentTarget);
        setMenuFriendId(friend.id);
    };

    const handleMenuClose = () => {
        setMenuAnchor(null);
        setMenuFriendId(null);
    };

    const handleDeleteClick = () => {
        const friend = friends.find(f => f.id === menuFriendId);
        if (friend) {
            setFriendToDelete(friend);
            setDeleteDialogOpen(true);
        }
        handleMenuClose();
    };

    const handleDeleteConfirm = async () => {
        if (!friendToDelete) return;

        try {
            const id1 = Math.min(user_id, friendToDelete.id);
            const id2 = Math.max(user_id, friendToDelete.id);

            await axios.delete(`${getServerUrl()}/messages/${id1}/${id2}`);

            // Если удаляем текущий чат, переходим на главную
            if (selectedId === friendToDelete.id) {
                navigate('/');
            }
        } catch (err) {
            console.error('[Delete] Error:', err);
        }

        setDeleteDialogOpen(false);
        setFriendToDelete(null);
    };

    return (
        <Box sx={{
            width: 280,
            minWidth: 280,
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            background: theme.bg.primary,
            borderRight: `1px solid ${theme.border}`
        }}>
            {/* Header */}
            <Box sx={{
                p: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: `1px solid ${theme.border}`
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar sx={{ width: 36, height: 36, bgcolor: theme.accent, fontSize: '0.9rem' }}>
                        {user_name?.[0]?.toUpperCase() || 'U'}
                    </Avatar>
                    <Typography sx={{ color: theme.text.primary, fontWeight: 500, fontSize: '0.95rem' }}>
                        {user_name || 'User'}
                    </Typography>
                </Box>
                <IconButton onClick={handleLogout} sx={{ color: theme.error }} size="small">
                    <LogoutIcon fontSize="small" />
                </IconButton>
            </Box>

            {/* Friends list */}
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
                {isLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <CircularProgress sx={{ color: theme.accent }} size={28} />
                    </Box>
                ) : error ? (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                        <Typography sx={{ color: theme.error, fontSize: '0.85rem' }}>{error}</Typography>
                    </Box>
                ) : friends.length === 0 ? (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                        <Typography sx={{ color: theme.text.muted, fontSize: '0.9rem' }}>
                            Нет контактов
                        </Typography>
                    </Box>
                ) : (
                    friends.map((friend) => (
                        <Box
                            key={friend.id}
                            onClick={() => navigateToMessenger(friend.id)}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.5,
                                p: '12px 16px',
                                cursor: 'pointer',
                                bgcolor: selectedId === friend.id ? theme.bg.hover : 'transparent',
                                borderLeft: selectedId === friend.id ? `3px solid ${theme.accent}` : '3px solid transparent',
                                '&:hover': {
                                    bgcolor: theme.bg.hover,
                                    '& .menu-btn': { opacity: 1 }
                                },
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Avatar sx={{ width: 40, height: 40, bgcolor: theme.accent, fontSize: '0.95rem' }}>
                                {friend.name[0]?.toUpperCase()}
                            </Avatar>
                            <Typography sx={{
                                flex: 1,
                                color: theme.text.primary,
                                fontSize: '0.9rem',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}>
                                {friend.name}
                            </Typography>
                            <IconButton
                                className="menu-btn"
                                onClick={(e) => handleMenuOpen(e, friend)}
                                sx={{
                                    opacity: 0,
                                    color: theme.text.muted,
                                    p: 0.5,
                                    '&:hover': { color: theme.text.primary }
                                }}
                                size="small"
                            >
                                <MoreVertIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    ))
                )}
            </Box>

            {/* Context menu */}
            <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={handleMenuClose}
                PaperProps={{
                    sx: {
                        bgcolor: theme.bg.secondary,
                        border: `1px solid ${theme.border}`,
                        minWidth: 160
                    }
                }}
            >
                <MenuItem onClick={handleDeleteClick} sx={{ color: theme.error }}>
                    <ListItemIcon>
                        <DeleteIcon fontSize="small" sx={{ color: theme.error }} />
                    </ListItemIcon>
                    <ListItemText>Удалить чат</ListItemText>
                </MenuItem>
            </Menu>

            {/* Delete confirmation dialog */}
            <Dialog
                open={deleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
                PaperProps={{
                    sx: {
                        bgcolor: theme.bg.secondary,
                        border: `1px solid ${theme.border}`,
                        minWidth: 320
                    }
                }}
            >
                <DialogTitle sx={{ color: theme.text.primary }}>
                    Удалить чат?
                </DialogTitle>
                <DialogContent>
                    <Typography sx={{ color: theme.text.secondary }}>
                        Вся история переписки с {friendToDelete?.name} будет удалена.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setDeleteDialogOpen(false)} sx={{ color: theme.text.muted }}>
                        Отмена
                    </Button>
                    <Button onClick={handleDeleteConfirm} sx={{ color: theme.error }}>
                        Удалить
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
