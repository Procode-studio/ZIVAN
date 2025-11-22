import { Dialog, DialogContent, Avatar, Typography, Box, Fab } from "@mui/material";
import PhoneIcon from '@mui/icons-material/Phone';
import CallEndIcon from '@mui/icons-material/CallEnd';
import VideocamIcon from '@mui/icons-material/Videocam';

interface IncomingCallDialogProps {
    open: boolean;
    interlocutorName: string;
    isVideoCall: boolean;
    onAccept: () => void;
    onDecline: () => void;
}

const IncomingCallDialog = ({
    open,
    interlocutorName,
    isVideoCall,
    onAccept,
    onDecline
}: IncomingCallDialogProps) => {
    return (
        <Dialog
            open={open}
            onClose={onDecline}
            maxWidth="xs"
            fullWidth
            PaperProps={{
                sx: {
                    background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
                    backgroundImage: 'none',
                    borderRadius: 3,
                    border: '1px solid rgba(76, 175, 80, 0.2)'
                }
            }}
        >
            <DialogContent sx={{ textAlign: 'center', py: 5 }}>
                {/* Пульсирующий круг */}
                <Box sx={{
                    position: 'relative',
                    display: 'inline-block',
                    mb: 2,
                    '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: -10,
                        left: -10,
                        right: -10,
                        bottom: -10,
                        borderRadius: '50%',
                        border: '2px solid rgba(76, 175, 80, 0.3)',
                        animation: 'pulse-ring 1.5s ease-out infinite'
                    },
                    '@keyframes pulse-ring': {
                        '0%': { transform: 'scale(0.9)', opacity: 1 },
                        '100%': { transform: 'scale(1.3)', opacity: 0 }
                    }
                }}>
                    <Avatar
                        sx={{
                            width: 90,
                            height: 90,
                            background: 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)',
                            fontSize: '2rem',
                            fontWeight: 'bold',
                            boxShadow: '0 4px 20px rgba(76, 175, 80, 0.4)'
                        }}
                    >
                        {interlocutorName[0]?.toUpperCase()}
                    </Avatar>
                </Box>

                <Typography
                    variant="h5"
                    sx={{
                        color: '#fff',
                        fontWeight: 600,
                        mb: 1
                    }}
                >
                    {interlocutorName}
                </Typography>

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 3 }}>
                    {isVideoCall ? <VideocamIcon sx={{ color: '#4CAF50', fontSize: 20 }} /> : <PhoneIcon sx={{ color: '#4CAF50', fontSize: 20 }} />}
                    <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem' }}>
                        Входящий {isVideoCall ? 'видео' : 'аудио'} звонок
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                    <Box sx={{ textAlign: 'center' }}>
                        <Fab
                            onClick={onDecline}
                            sx={{
                                background: 'linear-gradient(135deg, #EF5350 0%, #C62828 100%)',
                                boxShadow: '0 4px 15px rgba(239, 83, 80, 0.4)',
                                '&:hover': {
                                    background: 'linear-gradient(135deg, #F44336 0%, #D32F2F 100%)',
                                }
                            }}
                            size="large"
                        >
                            <CallEndIcon />
                        </Fab>
                        <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', mt: 1 }}>
                            Отклонить
                        </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                        <Fab
                            onClick={onAccept}
                            sx={{
                                background: 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)',
                                boxShadow: '0 4px 15px rgba(76, 175, 80, 0.4)',
                                '&:hover': {
                                    background: 'linear-gradient(135deg, #66BB6A 0%, #43A047 100%)',
                                }
                            }}
                            size="large"
                        >
                            <PhoneIcon />
                        </Fab>
                        <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', mt: 1 }}>
                            Ответить
                        </Typography>
                    </Box>
                </Box>
            </DialogContent>
        </Dialog>
    );
};

export default IncomingCallDialog;