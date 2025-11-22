import { Box, IconButton, Avatar, Typography, Fab } from "@mui/material";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PhoneIcon from '@mui/icons-material/Phone';
import VideocamIcon from '@mui/icons-material/Videocam';
import CallEndIcon from '@mui/icons-material/CallEnd';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { useNavigate } from "react-router-dom";
import { CallStatus } from "../hooks/useWebRTC";

interface ChatHeaderProps {
    interlocutorName: string;
    callStatus: CallStatus;
    callDuration: number;
    interlocutorOnline: boolean;
    onStartAudioCall: () => void;
    onStartVideoCall: () => void;
    onHangup: () => void;
}

const ChatHeader = ({
    interlocutorName,
    callStatus,
    callDuration,
    interlocutorOnline,
    onStartAudioCall,
    onStartVideoCall,
    onHangup
}: ChatHeaderProps) => {
    const navigate = useNavigate();

    const getStatusText = () => {
        if (callStatus === CallStatus.CALLING) return 'Вызов...';
        if (callStatus === CallStatus.RINGING) return 'Входящий вызов';
        if (callStatus === CallStatus.CONNECTED) {
            const mins = Math.floor(callDuration / 60);
            const secs = callDuration % 60;
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        if (interlocutorOnline) return 'в сети';
        return 'не в сети';
    };

    const getStatusColor = () => {
        if (callStatus === CallStatus.CALLING || callStatus === CallStatus.RINGING) return '#FFA726';
        if (callStatus === CallStatus.CONNECTED) return '#EF5350';
        if (interlocutorOnline) return '#4CAF50';
        return '#757575';
    };

    return (
        <Box sx={{
            p: 1.5,
            pt: 'max(12px, env(safe-area-inset-top))',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
            zIndex: 10,
            background: 'linear-gradient(180deg, rgba(22,33,62,1) 0%, rgba(26,26,46,0.95) 100%)',
            borderBottom: '1px solid rgba(76, 175, 80, 0.2)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
                <IconButton
                    onClick={() => navigate('/friends')}
                    size="small"
                    sx={{
                        flexShrink: 0,
                        color: '#fff',
                        '&:hover': { backgroundColor: 'rgba(76, 175, 80, 0.2)' }
                    }}
                >
                    <ArrowBackIcon />
                </IconButton>
                <Box sx={{ position: 'relative' }}>
                    <Avatar
                        sx={{
                            width: 42,
                            height: 42,
                            flexShrink: 0,
                            background: 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)',
                            fontSize: '1.1rem',
                            fontWeight: 'bold',
                            boxShadow: '0 2px 10px rgba(76, 175, 80, 0.3)'
                        }}
                    >
                        {interlocutorName[0]?.toUpperCase() || '?'}
                    </Avatar>
                    {interlocutorOnline && callStatus === CallStatus.IDLE && (
                        <Box
                            sx={{
                                position: 'absolute',
                                bottom: 0,
                                right: 0,
                                width: 12,
                                height: 12,
                                backgroundColor: '#4CAF50',
                                borderRadius: '50%',
                                border: '2px solid #1a1a2e',
                                boxShadow: '0 0 8px #4CAF50'
                            }}
                        />
                    )}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography
                        variant="subtitle1"
                        sx={{
                            fontWeight: 600,
                            fontSize: '1rem',
                            color: '#fff',
                            letterSpacing: '0.3px'
                        }}
                        noWrap
                    >
                        {interlocutorName}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <FiberManualRecordIcon
                            sx={{
                                fontSize: 8,
                                color: getStatusColor(),
                                animation: callStatus === CallStatus.CALLING ? 'pulse 1.5s infinite' : 'none',
                                '@keyframes pulse': {
                                    '0%, 100%': { opacity: 1 },
                                    '50%': { opacity: 0.4 }
                                }
                            }}
                        />
                        <Typography
                            variant="caption"
                            sx={{
                                color: getStatusColor(),
                                fontSize: '0.75rem',
                                fontWeight: 500
                            }}
                        >
                            {getStatusText()}
                        </Typography>
                    </Box>
                </Box>
            </Box>
            {callStatus === CallStatus.IDLE ? (
                <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                    <IconButton
                        onClick={onStartAudioCall}
                        sx={{
                            color: '#4CAF50',
                            backgroundColor: 'rgba(76, 175, 80, 0.15)',
                            '&:hover': {
                                backgroundColor: 'rgba(76, 175, 80, 0.3)',
                                transform: 'scale(1.1)'
                            },
                            transition: 'all 0.2s ease'
                        }}
                        size="small"
                    >
                        <PhoneIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                        onClick={onStartVideoCall}
                        sx={{
                            color: '#4CAF50',
                            backgroundColor: 'rgba(76, 175, 80, 0.15)',
                            '&:hover': {
                                backgroundColor: 'rgba(76, 175, 80, 0.3)',
                                transform: 'scale(1.1)'
                            },
                            transition: 'all 0.2s ease'
                        }}
                        size="small"
                    >
                        <VideocamIcon fontSize="small" />
                    </IconButton>
                </Box>
            ) : callStatus !== CallStatus.RINGING && (
                <Fab
                    color="error"
                    size="small"
                    onClick={onHangup}
                    sx={{
                        flexShrink: 0,
                        boxShadow: '0 4px 15px rgba(239, 83, 80, 0.4)'
                    }}
                >
                    <CallEndIcon fontSize="small" />
                </Fab>
            )}
        </Box>
    );
};

export default ChatHeader;