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
                    background: 'linear-gradient(180deg, #0a0a15 0%, #1a1a2e 100%)',
                    margin: 0,
                    borderRadius: 0
                }
            }}
        >
            <DialogContent sx={{
                p: 0,
                height: '100vh',
                width: '100%',
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
                    background: 'linear-gradient(180deg, #0a0a15 0%, #1a1a2e 100%)',
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
                                objectFit: 'contain'
                            }}
                        />
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                            <Box sx={{
                                position: 'relative',
                                '&::before': callStatus === CallStatus.CALLING ? {
                                    content: '""',
                                    position: 'absolute',
                                    top: -20,
                                    left: -20,
                                    right: -20,
                                    bottom: -20,
                                    borderRadius: '50%',
                                    border: '3px solid rgba(76, 175, 80, 0.3)',
                                    animation: 'pulse-call 2s ease-out infinite'
                                } : {},
                                '@keyframes pulse-call': {
                                    '0%': { transform: 'scale(0.9)', opacity: 1 },
                                    '100%': { transform: 'scale(1.5)', opacity: 0 }
                                }
                            }}>
                                <Avatar
                                    sx={{
                                        width: 150,
                                        height: 150,
                                        background: 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)',
                                        fontSize: '3.5rem',
                                        fontWeight: 'bold',
                                        boxShadow: '0 10px 40px rgba(76, 175, 80, 0.4)'
                                    }}
                                >
                                    {interlocutorName[0]?.toUpperCase()}
                                </Avatar>
                            </Box>
                            <Typography
                                variant="h4"
                                sx={{
                                    color: '#fff',
                                    fontWeight: 600,
                                    textShadow: '0 2px 10px rgba(0,0,0,0.5)'
                                }}
                            >
                                {interlocutorName}
                            </Typography>
                            {callStatus === CallStatus.CALLING && (
                                <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.2rem' }}>
                                    Вызов...
                                </Typography>
                            )}
                            {callStatus === CallStatus.CONNECTED && (
                                <Typography
                                    sx={{
                                        color: '#4CAF50',
                                        fontSize: '2rem',
                                        fontWeight: 500,
                                        fontFamily: 'monospace'
                                    }}
                                >
                                    {formatTime(callDuration)}
                                </Typography>
                            )}
                        </Box>
                    )}

                    {/* Local video preview */}
                    {isVideoEnabled && hasLocalVideo && (
                        <Box sx={{
                            position: 'absolute',
                            top: 30,
                            right: 30,
                            width: 240,
                            height: 180,
                            borderRadius: 3,
                            overflow: 'hidden',
                            border: '3px solid rgba(76, 175, 80, 0.5)',
                            backgroundColor: '#111',
                            boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
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
                    p: 4,
                    display: 'flex',
                    gap: 3,
                    justifyContent: 'center',
                    alignItems: 'center',
                    background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.95) 100%)',
                    position: 'relative',
                    zIndex: 20
                }}>
                    <Box sx={{ textAlign: 'center' }}>
                        <Fab
                            size="large"
                            onClick={onToggleAudio}
                            sx={{
                                width: 70,
                                height: 70,
                                background: isAudioEnabled
                                    ? 'rgba(255,255,255,0.15)'
                                    : 'linear-gradient(135deg, #EF5350 0%, #C62828 100%)',
                                color: '#fff',
                                boxShadow: isAudioEnabled
                                    ? '0 6px 20px rgba(0,0,0,0.3)'
                                    : '0 6px 20px rgba(239, 83, 80, 0.5)',
                                '&:hover': {
                                    background: isAudioEnabled
                                        ? 'rgba(255,255,255,0.25)'
                                        : 'linear-gradient(135deg, #F44336 0%, #D32F2F 100%)',
                                    transform: 'scale(1.05)'
                                },
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {isAudioEnabled ? <MicIcon sx={{ fontSize: 32 }} /> : <MicOffIcon sx={{ fontSize: 32 }} />}
                        </Fab>
                        <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', mt: 1 }}>
                            {isAudioEnabled ? 'Микрофон' : 'Выключен'}
                        </Typography>
                    </Box>

                    {hasLocalVideo && (
                        <Box sx={{ textAlign: 'center' }}>
                            <Fab
                                size="large"
                                onClick={onToggleVideo}
                                sx={{
                                    width: 70,
                                    height: 70,
                                    background: isVideoEnabled
                                        ? 'rgba(255,255,255,0.15)'
                                        : 'linear-gradient(135deg, #EF5350 0%, #C62828 100%)',
                                    color: '#fff',
                                    boxShadow: isVideoEnabled
                                        ? '0 6px 20px rgba(0,0,0,0.3)'
                                        : '0 6px 20px rgba(239, 83, 80, 0.5)',
                                    '&:hover': {
                                        background: isVideoEnabled
                                            ? 'rgba(255,255,255,0.25)'
                                            : 'linear-gradient(135deg, #F44336 0%, #D32F2F 100%)',
                                        transform: 'scale(1.05)'
                                    },
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {isVideoEnabled ? <VideocamIcon sx={{ fontSize: 32 }} /> : <VideocamOffIcon sx={{ fontSize: 32 }} />}
                            </Fab>
                            <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', mt: 1 }}>
                                {isVideoEnabled ? 'Камера' : 'Выключена'}
                            </Typography>
                        </Box>
                    )}

                    <Box sx={{ textAlign: 'center' }}>
                        <Fab
                            size="large"
                            onClick={onHangup}
                            sx={{
                                width: 70,
                                height: 70,
                                background: 'linear-gradient(135deg, #EF5350 0%, #C62828 100%)',
                                color: '#fff',
                                boxShadow: '0 8px 30px rgba(239, 83, 80, 0.6)',
                                '&:hover': {
                                    background: 'linear-gradient(135deg, #F44336 0%, #D32F2F 100%)',
                                    transform: 'scale(1.05)'
                                },
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <CallEndIcon sx={{ fontSize: 32 }} />
                        </Fab>
                        <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', mt: 1 }}>
                            Завершить
                        </Typography>
                    </Box>
                </Box>

                {/* Hidden audio element */}
                <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />
            </DialogContent>
        </Dialog>
    );
};

export default CallDialog;
