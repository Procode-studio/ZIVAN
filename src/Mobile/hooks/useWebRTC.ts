import { useState, useRef, useCallback, useEffect } from 'react';
import { getTurnServers, validateIceServers } from '../../config/turnConfig';

export enum CallStatus {
    IDLE = 'idle',
    CALLING = 'calling',
    RINGING = 'ringing',
    CONNECTED = 'connected',
    FAILED = 'failed'
}

interface UseWebRTCProps {
    userId: number;
    sendWsMessage: (msg: any) => boolean;
    sendWsMessageAsync?: (msg: any, maxWait?: number) => Promise<boolean>;
}

export const useWebRTC = ({ userId, sendWsMessage, sendWsMessageAsync }: UseWebRTCProps) => {
    const [callStatus, setCallStatus] = useState<CallStatus>(CallStatus.IDLE);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [callDuration, setCallDuration] = useState(0);
    const [incomingCallVideo, setIncomingCallVideo] = useState(false);
    const [iceServers, setIceServers] = useState<RTCIceServer[]>([]);

    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
    const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const remoteDescSetRef = useRef(false);
    const hangupProcessingRef = useRef(false);
    const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);

    // Load TURN servers
    useEffect(() => {
        const loadTurn = async () => {
            try {
                const servers = await getTurnServers();
                const validated = validateIceServers(servers);
                setIceServers(validated);
            } catch (err) {
                console.error('[WebRTC] Failed to load TURN');
                setIceServers([{ urls: 'stun:stun.l.google.com:19302' }]);
            }
        };
        loadTurn();
    }, []);

    // Call timer
    useEffect(() => {
        if (callStatus === CallStatus.CONNECTED) {
            setCallDuration(0);
            callTimerRef.current = setInterval(() => {
                setCallDuration(d => d + 1);
            }, 1000);
        } else {
            if (callTimerRef.current) {
                clearInterval(callTimerRef.current);
                callTimerRef.current = null;
            }
            if (callStatus === CallStatus.IDLE) {
                setCallDuration(0);
            }
        }
        return () => {
            if (callTimerRef.current) {
                clearInterval(callTimerRef.current);
            }
        };
    }, [callStatus]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            // Останавливаем все треки при размонтировании
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => {
                    track.stop();
                });
                localStreamRef.current = null;
            }
            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
                peerConnectionRef.current = null;
            }
        };
    }, []);

    // Функция остановки всех media треков
    const stopAllTracks = useCallback(() => {
        console.log('[WebRTC] Stopping all tracks');

        // Останавливаем через ref
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                console.log('[WebRTC] Stopping track:', track.kind);
                track.stop();
            });
            localStreamRef.current = null;
        }

        // Также проверяем state
        if (localStream) {
            localStream.getTracks().forEach(track => {
                track.stop();
            });
        }

        setLocalStream(null);
        setRemoteStream(null);
    }, [localStream]);

    const createPeerConnection = useCallback(() => {
        try {
            const validIceServers = iceServers?.length ? iceServers.filter(server => {
                if (!server.urls) return false;
                const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
                return urls.every(url => typeof url === 'string' && /^(stun|turns?):/.test(url));
            }) : [];

            const config: RTCConfiguration = {
                iceServers: validIceServers.length > 0 ? validIceServers : [
                    { urls: 'stun:stun.l.google.com:19302' }
                ],
                iceCandidatePoolSize: 10,
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require',
                iceTransportPolicy: 'all'
            };

            console.log('[RTC] Creating PeerConnection');
            const pc = new RTCPeerConnection(config);

            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    console.log('[RTC] Sending ICE candidate');
                    sendWsMessage({
                        type: 'ice-candidate',
                        candidate: e.candidate.toJSON(),
                        author: userId
                    });
                }
            };

            pc.ontrack = (e) => {
                console.log('[RTC] Received remote track:', e.track.kind);
                if (e.streams && e.streams[0]) {
                    setRemoteStream(e.streams[0]);
                }
            };

            pc.onconnectionstatechange = () => {
                console.log('[RTC] Connection state:', pc.connectionState);
                if (pc.connectionState === 'connected') {
                    setCallStatus(CallStatus.CONNECTED);
                } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                    console.log('[RTC] Connection failed/disconnected');
                    hangup();
                }
            };

            pc.oniceconnectionstatechange = () => {
                console.log('[RTC] ICE connection state:', pc.iceConnectionState);
                if (pc.iceConnectionState === 'failed') {
                    pc.restartIce();
                }
            };

            peerConnectionRef.current = pc;
            remoteDescSetRef.current = false;
            return pc;
        } catch (err) {
            console.error('[WebRTC] Failed to create PC:', err);
            throw err;
        }
    }, [iceServers, userId, sendWsMessage]);

    const hangup = useCallback(() => {
        if (hangupProcessingRef.current) return;
        hangupProcessingRef.current = true;

        console.log('[Call] Hanging up');

        // Закрываем PeerConnection
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        // Останавливаем все треки
        stopAllTracks();

        // Сброс состояния
        setCallStatus(CallStatus.IDLE);
        setIsVideoEnabled(false);
        setIsAudioEnabled(true);
        remoteDescSetRef.current = false;
        pendingCandidatesRef.current = [];
        pendingOfferRef.current = null;

        // Отправляем hangup
        sendWsMessage({
            type: 'hangup',
            author: userId
        });

        setTimeout(() => {
            hangupProcessingRef.current = false;
        }, 500);
    }, [userId, sendWsMessage, stopAllTracks]);

    const startCall = useCallback(async (withVideo: boolean) => {
        try {
            console.log('[Call] Starting call, video:', withVideo);
            setCallStatus(CallStatus.CALLING);

            const constraints = withVideo ? {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 },
                    facingMode: 'user'
                }
            } : {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                },
                video: false
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            localStreamRef.current = stream;
            setLocalStream(stream);
            setIsVideoEnabled(withVideo);
            setIsAudioEnabled(true);

            stream.getTracks().forEach(track => {
                console.log('[RTC] Adding local track:', track.kind);
            });

            const pc = createPeerConnection();
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            await pc.setLocalDescription(offer);

            console.log('[Call] Sending offer');
            const sent = sendWsMessage({
                type: 'offer',
                offer: pc.localDescription!.toJSON(),
                author: userId,
                video: withVideo
            });

            if (!sent) {
                throw new Error('Failed to send offer');
            }
        } catch (err) {
            console.error('[WebRTC] Start call failed:', err);
            setCallStatus(CallStatus.FAILED);
            stopAllTracks();
            alert('Не удалось начать звонок');
            setTimeout(() => setCallStatus(CallStatus.IDLE), 2000);
        }
    }, [userId, createPeerConnection, sendWsMessage, stopAllTracks]);

    const answerCall = useCallback(async (offer: RTCSessionDescriptionInit, withVideo: boolean) => {
        try {
            console.log('[Call] Answering call, video:', withVideo);

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: withVideo
            });
            localStreamRef.current = stream;
            setLocalStream(stream);
            setIsVideoEnabled(withVideo);
            setIsAudioEnabled(true);
            setCallStatus(CallStatus.CONNECTED);

            const pc = createPeerConnection();
            stream.getTracks().forEach(track => {
                console.log('[RTC] Adding local track:', track.kind);
                pc.addTrack(track, stream);
            });

            console.log('[Call] Setting remote description (offer)');
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            remoteDescSetRef.current = true;

            // Добавляем отложенные кандидаты
            if (pendingCandidatesRef.current.length > 0) {
                console.log('[Call] Adding', pendingCandidatesRef.current.length, 'pending candidates');
                for (const c of pendingCandidatesRef.current) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(c));
                    } catch (e) {
                        console.error('[WebRTC] Failed to add candidate:', e);
                    }
                }
                pendingCandidatesRef.current = [];
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            console.log('[Call] Sending answer');

            // Используем асинхронную отправку с ожиданием
            const message = {
                type: 'answer',
                answer: pc.localDescription!.toJSON(),
                author: userId
            };

            let sent = false;
            if (sendWsMessageAsync) {
                sent = await sendWsMessageAsync(message, 5000);
            } else {
                // Fallback: пробуем несколько раз
                for (let i = 0; i < 30; i++) {
                    sent = sendWsMessage(message);
                    if (sent) break;
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }

            if (!sent) {
                throw new Error('Failed to send answer');
            }
        } catch (err) {
            console.error('[WebRTC] Answer call failed:', err);
            setCallStatus(CallStatus.FAILED);
            stopAllTracks();
            alert('Не удалось ответить на звонок');
            setTimeout(() => setCallStatus(CallStatus.IDLE), 2000);
        }
    }, [userId, createPeerConnection, sendWsMessage, sendWsMessageAsync, stopAllTracks]);

    const toggleAudio = useCallback(() => {
        const stream = localStreamRef.current || localStream;
        if (!stream) return;

        const track = stream.getAudioTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            setIsAudioEnabled(track.enabled);
        }
    }, [localStream]);

    const toggleVideo = useCallback(() => {
        const stream = localStreamRef.current || localStream;
        if (!stream) return;

        const track = stream.getVideoTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            setIsVideoEnabled(track.enabled);
        }
    }, [localStream]);

    const handleSignalingMessage = useCallback((data: any) => {
        const { type, author } = data;
        if (author === userId) return;

        switch (type) {
            case 'offer':
                console.log('[Call] Received offer');
                pendingOfferRef.current = data.offer;
                setIncomingCallVideo(data.video || false);
                setCallStatus(CallStatus.RINGING);
                break;

            case 'answer':
                console.log('[Call] Received answer');
                if (peerConnectionRef.current && data.answer) {
                    peerConnectionRef.current.setRemoteDescription(
                        new RTCSessionDescription(data.answer)
                    ).then(() => {
                        console.log('[RTC] Remote description set (answer)');
                        remoteDescSetRef.current = true;
                        if (pendingCandidatesRef.current.length > 0) {
                            console.log('[RTC] Adding', pendingCandidatesRef.current.length, 'pending candidates');
                            pendingCandidatesRef.current.forEach(async (c) => {
                                try {
                                    await peerConnectionRef.current!.addIceCandidate(new RTCIceCandidate(c));
                                } catch (e) {
                                    console.error('[RTC] Failed to add candidate:', e);
                                }
                            });
                            pendingCandidatesRef.current = [];
                        }
                    }).catch(err => console.error('[WebRTC] Set remote desc failed:', err));
                }
                break;

            case 'ice-candidate':
                console.log('[Call] Received ICE candidate');
                if (peerConnectionRef.current && data.candidate) {
                    if (remoteDescSetRef.current) {
                        peerConnectionRef.current.addIceCandidate(
                            new RTCIceCandidate(data.candidate)
                        ).catch(err => console.error('[WebRTC] Add candidate failed:', err));
                    } else {
                        console.log('[RTC] Queueing ICE candidate');
                        pendingCandidatesRef.current.push(data.candidate);
                    }
                }
                break;

            case 'hangup':
                console.log('[Call] Received hangup');
                hangup();
                break;
        }
    }, [userId, hangup]);

    const declineCall = useCallback(() => {
        console.log('[Call] Declining call');
        pendingOfferRef.current = null;
        setCallStatus(CallStatus.IDLE);
        sendWsMessage({
            type: 'hangup',
            author: userId
        });
    }, [userId, sendWsMessage]);

    return {
        callStatus,
        isVideoEnabled,
        isAudioEnabled,
        localStream,
        remoteStream,
        callDuration,
        incomingCallVideo,
        pendingOfferRef,
        startCall,
        answerCall,
        hangup,
        toggleAudio,
        toggleVideo,
        handleSignalingMessage,
        declineCall
    };
};
