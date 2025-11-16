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
}

export const useWebRTC = ({ userId, sendWsMessage }: UseWebRTCProps) => {
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

    // Load TURN servers
    useEffect(() => {
        const loadTurn = async () => {
            try {
                const servers = await getTurnServers();
                const validated = validateIceServers(servers);
                setIceServers(validated);
            } catch (err) {
                console.error('[WebRTC] Failed to load TURN:', err);
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
            setCallDuration(0);
        }
        return () => {
            if (callTimerRef.current) {
                clearInterval(callTimerRef.current);
            }
        };
    }, [callStatus]);

    const createPeerConnection = useCallback(() => {
        try {
            const config: RTCConfiguration = {
                iceServers: iceServers?.length ? iceServers : [
                    { urls: 'stun:stun.l.google.com:19302' }
                ],
                iceCandidatePoolSize: 10,
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require',
                iceTransportPolicy: 'all'
            };

            const pc = new RTCPeerConnection(config);

            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    sendWsMessage({
                        type: 'ice-candidate',
                        candidate: e.candidate.toJSON(),
                        author: userId
                    });
                }
            };

            pc.ontrack = (e) => {
                if (e.streams && e.streams[0]) {
                    setRemoteStream(e.streams[0]);
                }
            };

            pc.onconnectionstatechange = () => {
                if (pc.connectionState === 'connected') {
                    setCallStatus(CallStatus.CONNECTED);
                } else if (pc.connectionState === 'failed') {
                    alert('Не удалось установить соединение');
                    hangup();
                }
            };

            pc.oniceconnectionstatechange = () => {
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

    const startCall = useCallback(async (withVideo: boolean) => {
        try {
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
                    frameRate: { ideal: 30 }
                }
            } : {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true
                },
                video: false
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            setLocalStream(stream);
            setIsVideoEnabled(withVideo);
            setIsAudioEnabled(true);

            const pc = createPeerConnection();
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            await pc.setLocalDescription(offer);

            sendWsMessage({
                type: 'offer',
                offer: pc.localDescription!.toJSON(),
                author: userId,
                video: withVideo
            });
        } catch (err) {
            console.error('[WebRTC] Start call failed:', err);
            setCallStatus(CallStatus.FAILED);
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
                setLocalStream(null);
            }
            alert('Не удалось начать звонок');
            setTimeout(() => setCallStatus(CallStatus.IDLE), 2000);
        }
    }, [userId, createPeerConnection, sendWsMessage, localStream]);

    const answerCall = useCallback(async (offer: RTCSessionDescriptionInit, withVideo: boolean) => {
        try {
            setCallStatus(CallStatus.CONNECTED);

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: withVideo
            });
            setLocalStream(stream);
            setIsVideoEnabled(withVideo);
            setIsAudioEnabled(true);

            const pc = createPeerConnection();
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            remoteDescSetRef.current = true;

            if (pendingCandidatesRef.current.length > 0) {
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

            sendWsMessage({
                type: 'answer',
                answer: pc.localDescription!.toJSON(),
                author: userId
            });
        } catch (err) {
            console.error('[WebRTC] Answer call failed:', err);
            setCallStatus(CallStatus.FAILED);
            alert('Не удалось ответить на звонок');
            setTimeout(() => setCallStatus(CallStatus.IDLE), 2000);
        }
    }, [userId, createPeerConnection, sendWsMessage]);

    const hangup = useCallback(() => {
        if (hangupProcessingRef.current) return;
        hangupProcessingRef.current = true;

        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            setLocalStream(null);
        }
        setRemoteStream(null);
        setCallStatus(CallStatus.IDLE);
        setIsVideoEnabled(false);
        setIsAudioEnabled(true);
        remoteDescSetRef.current = false;
        pendingCandidatesRef.current = [];
        pendingOfferRef.current = null;

        sendWsMessage({
            type: 'hangup',
            author: userId
        });

        setTimeout(() => {
            hangupProcessingRef.current = false;
        }, 1000);
    }, [userId, localStream, sendWsMessage]);

    const toggleAudio = useCallback(() => {
        if (!localStream) return;
        const track = localStream.getAudioTracks()[0];
        if (track) {
            track.enabled = !track.enabled;
            setIsAudioEnabled(track.enabled);
        }
    }, [localStream]);

    const toggleVideo = useCallback(() => {
        if (!localStream) return;
        const track = localStream.getVideoTracks()[0];
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
                pendingOfferRef.current = data.offer;
                setIncomingCallVideo(data.video || false);
                setCallStatus(CallStatus.RINGING);
                break;

            case 'answer':
                if (peerConnectionRef.current && data.answer) {
                    peerConnectionRef.current.setRemoteDescription(
                        new RTCSessionDescription(data.answer)
                    ).then(() => {
                        remoteDescSetRef.current = true;
                        if (pendingCandidatesRef.current.length > 0) {
                            pendingCandidatesRef.current.forEach(async (c) => {
                                try {
                                    await peerConnectionRef.current!.addIceCandidate(new RTCIceCandidate(c));
                                } catch (e) {}
                            });
                            pendingCandidatesRef.current = [];
                        }
                    }).catch(err => console.error('[WebRTC] Set remote desc failed:', err));
                }
                break;

            case 'ice-candidate':
                if (peerConnectionRef.current && data.candidate) {
                    if (remoteDescSetRef.current) {
                        peerConnectionRef.current.addIceCandidate(
                            new RTCIceCandidate(data.candidate)
                        ).catch(err => console.error('[WebRTC] Add candidate failed:', err));
                    } else {
                        pendingCandidatesRef.current.push(data.candidate);
                    }
                }
                break;

            case 'hangup':
                hangup();
                break;
        }
    }, [userId, hangup]);

    const declineCall = useCallback(() => {
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