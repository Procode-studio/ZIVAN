import { Dialog, DialogContent, Box, Avatar, Typography, Fab } from "@mui/material";
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import { useRef, useEffect } from "react";
import { CallStatus } from "../hooks/useWebRTC";

interface CallDialogProps {
    open: boolean;
    callStatus: CallStatus;
    interlocutorName: string;
    callDuration: number;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    isVideoEnabled: boolean;
    isAudioEnabled: boolean;
    onHangup: () => void;
    onToggleAudio: () => void;
    onToggleVideo: () => void;
}

const CallDialog = ({
    open,
    callStatus,
    interlocutorName,
    callDuration,
    localStream,
    remoteStream,
    isVideoEnabled,
    isAudioEnabled,
    onHangup,
    onToggleAudio,
    onToggleVideo
}: CallDialogProps) => {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
        }
    }, [localStream]);

    useEffect(() => {
        if (remoteStream) {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStream;
                remoteVideoRef.current.play().catch(() => {});
            }
            if (remoteAudioRef.current) {
                remoteAudioRef.current.srcObject = remoteStream;
                remoteAudioRef.current.muted = false;
                remoteAudioRef.current.play().catch(() => {});
            }
        }
    }, [remoteStream]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const hasRemoteVideo = remoteStream && 
        remoteStream.getVideoTracks().length > 0 && 
        remoteStream.getVideoTracks()[0].enabled;

    const hasLocalVideo = localStream && localStream.getVideoTracks().length > 0;

    return (
        <Dialog
            open={open}
            onClose={onHangup}
            fullScreen
            PaperProps={{
                sx: {
                    backgroundColor: '#000',
                    margin: 0,
                    borderRadius: 0
                }
            }}
        >
            <DialogContent sx={{ 
                p: 0, 
                height: '100vh',
                width: '100vw',
                display: 'flex', 
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Remote video or avatar */}
                <Box sx={{ 
                    flex: 1, 
                    position: 'relative', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    backgroundColor: '#1a1a1a',
                    overflow: 'hidden'
                }}>
                    {hasRemoteVideo ? (
                        <video
                            ref={remoteVideoRef}
                            autoPlay
                            playsInline
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover'
                            }}
                        />
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <Avatar sx={{ width: 100, height: 100, bgcolor: '#4CAF50', fontSize: 40 }}>
                                {interlocutorName[0]?.toUpperCase()}
                            </Avatar>
                            <Typography variant="h5" color="white">
                                {interlocutorName}
                            </Typography>
                            {callStatus === CallStatus.CALLING && (
                                <Typography variant="body1" color="grey.400">
                                    Вызов...
                                </Typography>
                            )}
                            {callStatus === CallStatus.CONNECTED && (
                                <Typography variant="h6" color="grey.300">
                                    {formatTime(callDuration)}
                                </Typography>
                            )}
                        </Box>
                    )}

                    {/* Local video preview */}
                    {isVideoEnabled && hasLocalVideo && (
                        <Box sx={{
                            position: 'absolute',
                            top: 16,
                            right: 16,
                            width: 100,
                            height: 140,
                            borderRadius: 2,
                            overflow: 'hidden',
                            border: '2px solid #4CAF50',
                            backgroundColor: '#222',
                            boxShadow: 3,
                            zIndex: 10
                        }}>
                            <video
                                ref={localVideoRef}
                                autoPlay
                                muted
                                playsInline
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    transform: 'scaleX(-1)'
                                }}
                            />
                        </Box>
                    )}
                </Box>

                {/* Controls */}
                <Box sx={{ 
                    p: 3,
                    pb: 5,
                    display: 'flex', 
                    gap: 2, 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    backgroundColor: 'rgba(0,0,0,0.95)',
                    position: 'relative',
                    zIndex: 20
                }}>
                    <Fab
                        size="large"
                        color={isAudioEnabled ? 'default' : 'error'}
                        onClick={onToggleAudio}
                        sx={{ bgcolor: isAudioEnabled ? '#424242' : undefined }}
                    >
                        {isAudioEnabled ? <MicIcon /> : <MicOffIcon />}
                    </Fab>
                    {hasLocalVideo && (
                        <Fab
                            size="large"
                            color={isVideoEnabled ? 'default' : 'error'}
                            onClick={onToggleVideo}
                            sx={{ bgcolor: isVideoEnabled ? '#424242' : undefined }}
                        >
                            {isVideoEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
                        </Fab>
                    )}
                    <Fab
                        size="large"
                        color="error"
                        onClick={onHangup}
                    >
                        <CallEndIcon />
                    </Fab>
                </Box>

                {/* Hidden audio element for remote audio */}
                <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
            </DialogContent>
        </Dialog>
    );
};

export default CallDialog;