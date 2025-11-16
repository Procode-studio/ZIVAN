import { Dialog, DialogContent, Avatar, Typography, Box, Fab } from "@mui/material";
import PhoneIcon from '@mui/icons-material/Phone';
import CallEndIcon from '@mui/icons-material/CallEnd';

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
                    backgroundColor: '#1e1e1e',
                    backgroundImage: 'none'
                }
            }}
        >
            <DialogContent sx={{ textAlign: 'center', py: 4 }}>
                <Avatar sx={{ width: 80, height: 80, margin: '0 auto 16px', bgcolor: '#4CAF50' }}>
                    {interlocutorName[0]?.toUpperCase()}
                </Avatar>
                <Typography variant="h6" gutterBottom color="white">
                    {interlocutorName}
                </Typography>
                <Typography variant="body2" color="grey.400" gutterBottom>
                    {isVideoCall ? 'Видео звонок' : 'Аудио звонок'}
                </Typography>
                <Box sx={{ display: 'flex', gap: 3, justifyContent: 'center', mt: 3 }}>
                    <Fab color="error" onClick={onDecline} size="large">
                        <CallEndIcon />
                    </Fab>
                    <Fab color="success" onClick={onAccept} size="large">
                        <PhoneIcon />
                    </Fab>
                </Box>
            </DialogContent>
        </Dialog>
    );
};

export default IncomingCallDialog;