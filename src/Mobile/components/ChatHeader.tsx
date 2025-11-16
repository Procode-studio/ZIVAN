import { Paper, Box, IconButton, Avatar, Typography, Chip, Fab } from "@mui/material";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PhoneIcon from '@mui/icons-material/Phone';
import VideocamIcon from '@mui/icons-material/Videocam';
import CallEndIcon from '@mui/icons-material/CallEnd';
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
        if (interlocutorOnline) return 'В сети';
        return 'Не в сети';
    };

    const getStatusColor = () => {
        if (callStatus === CallStatus.CALLING || callStatus === CallStatus.RINGING) return 'warning';
        if (callStatus === CallStatus.CONNECTED) return 'error';
        if (interlocutorOnline) return 'success';
        return 'default';
    };

    return (
        <Paper sx={{ 
            p: 1.5, 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            borderRadius: 0,
            flexShrink: 0,
            zIndex: 10
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
                <IconButton onClick={() => navigate('/friends')} size="small" sx={{ flexShrink: 0 }}>
                    <ArrowBackIcon />
                </IconButton>
                <Avatar sx={{ width: 36, height: 36, flexShrink: 0 }}>
                    {interlocutorName[0]?.toUpperCase() || '?'}
                </Avatar>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold', fontSize: '0.9rem' }} noWrap>
                        {interlocutorName}
                    </Typography>
                    <Chip
                        label={getStatusText()}
                        color={getStatusColor()}
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                </Box>
            </Box>
            {callStatus === CallStatus.IDLE ? (
                <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                    <IconButton 
                        onClick={onStartAudioCall} 
                        color="primary"
                        size="small"
                    >
                        <PhoneIcon fontSize="small" />
                    </IconButton>
                    <IconButton 
                        onClick={onStartVideoCall} 
                        color="primary"
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
                    sx={{ flexShrink: 0 }}
                >
                    <CallEndIcon fontSize="small" />
                </Fab>
            )}
        </Paper>
    );
};

export default ChatHeader;