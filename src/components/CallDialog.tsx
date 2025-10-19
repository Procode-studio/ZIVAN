import { Dialog, DialogContent, Avatar, Box, Typography, Fab } from "@mui/material";
import { useRef, useEffect, useState } from "react";
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';

interface CallDialogProps {
    open: boolean;
    interlocutorName: string;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    isVideoEnabled: boolean;
    isAudioEnabled: boolean;
    onToggleVideo: () => void;
    onToggleAudio: () => void;
    onHangup: () => void;
}

export default function CallDialog({
    open,
    interlocutorName,
    localStream,
    remoteStream,
    isVideoEnabled,
    isAudioEnabled,
    onToggleVideo,
    onToggleAudio,
    onHangup
}: CallDialogProps) {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const [hasRemoteVideo, setHasRemoteVideo] = useState(false);

    // Обновление local video
    useEffect(() => {
        if (localVideoRef.current && localStream) {
            localVideoRef.current.srcObject = localStream;
            localVideoRef.current.play().catch(e => console.error('Local play error:', e));
        }
    }, [localStream]);

    // Обновление remote video
    useEffect(() => {
        if (remoteVideoRef.current && remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch(e => console.error('Remote play error:', e));
            
            // Проверяем есть ли видео трек
            const videoTrack = remoteStream.getVideoTracks()[0];
            setHasRemoteVideo(videoTrack && videoTrack.enabled);
            
            // Следим за изменениями треков
            remoteStream.addEventListener('addtrack', () => {
                const vt = remoteStream.getVideoTracks()[0];
                setHasRemoteVideo(vt && vt.enabled);
            });
        }
    }, [remoteStream]);

    return (
        <Dialog 
            open={open} 
            onClose={onHangup}
            fullScreen
            PaperProps={{
                sx: { backgroundColor: '#1a1a1a' }
            }}
        >
            <DialogContent sx={{ 
                p: 0, 
                position: 'relative', 
                height: '100vh', 
                display: 'flex', 
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {/* Remote video/avatar */}
                <Box sx={{ 
                    flex: 1, 
                    position: 'relative', 
                    backgroundColor: '#000', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
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
                        <>
                            <Box sx={{ 
                                display: 'flex', 
                                flexDirection: 'column',
                                alignItems: 'center', 
                                justifyContent: 'center',
                                gap: 2,
                                zIndex: 1
                            }}>
                                <Avatar sx={{ width: 120, height: 120 }}>
                                    {interlocutorName[0]?.toUpperCase()}
                                </Avatar>
                                <Typography variant="h5" color="white">
                                    {interlocutorName}
                                </Typography>
                                <Typography variant="body2" color="grey.400">
                                    {remoteStream ? 'Аудио звонок' : 'Соединение...'}
                                </Typography>
                            </Box>
                            {/* Скрытое видео для аудио */}
                            <video 
                                ref={remoteVideoRef} 
                                autoPlay 
                                playsInline
                                style={{ display: 'none' }} 
                            />
                        </>
                    )}
                </Box>

                {/* Local video preview */}
                {isVideoEnabled && localStream && (
                    <Box sx={{ 
                        position: 'absolute', 
                        top: 20, 
                        right: 20, 
                        width: { xs: 120, sm: 160, md: 200 },
                        height: { xs: 160, sm: 213, md: 267 },
                        borderRadius: 2,
                        overflow: 'hidden',
                        border: '3px solid #4CAF50',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                        backgroundColor: '#000',
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
                                transform: 'scaleX(-1)' // Зеркалим для селфи эффекта
                            }} 
                        />
                    </Box>
                )}

                {/* Controls */}
                <Box sx={{ 
                    p: { xs: 2, sm: 3 }, 
                    display: 'flex', 
                    justifyContent: 'center', 
                    gap: { xs: 1.5, sm: 2 },
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    borderTop: '1px solid rgba(255,255,255,0.1)'
                }}>
                    <Fab 
                        color={isAudioEnabled ? "default" : "error"} 
                        onClick={onToggleAudio}
                        size="large"
                        sx={{ 
                            backgroundColor: isAudioEnabled ? '#2c2c2c' : undefined,
                            '&:hover': {
                                backgroundColor: isAudioEnabled ? '#3c3c3c' : undefined
                            }
                        }}
                    >
                        {isAudioEnabled ? <MicIcon /> : <MicOffIcon />}
                    </Fab>
                    
                    <Fab 
                        color={isVideoEnabled ? "default" : "error"} 
                        onClick={onToggleVideo}
                        size="large"
                        sx={{ 
                            backgroundColor: isVideoEnabled ? '#2c2c2c' : undefined,
                            '&:hover': {
                                backgroundColor: isVideoEnabled ? '#3c3c3c' : undefined
                            }
                        }}
                    >
                        {isVideoEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
                    </Fab>
                    
                    <Fab 
                        color="error" 
                        onClick={onHangup} 
                        size="large"
                        sx={{
                            backgroundColor: '#f44336',
                            '&:hover': {
                                backgroundColor: '#d32f2f'
                            }
                        }}
                    >
                        <CallEndIcon />
                    </Fab>
                </Box>
            </DialogContent>
        </Dialog>
    );
}