import { useState, useRef, useCallback } from 'react';

interface UseWebRTCProps {
    userId: number;
    iceServers: RTCIceServer[];
    socket: WebSocket | null;
}

export function useWebRTC({ userId, iceServers, socket }: UseWebRTCProps) {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [isVideoEnabled, setIsVideoEnabled] = useState(false);
    const [isAudioEnabled, setIsAudioEnabled] = useState(true);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

    const createPeerConnection = useCallback(() => {
        const config: RTCConfiguration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                ...iceServers
            ],
            iceCandidatePoolSize: 10
        };

        const pc = new RTCPeerConnection(config);

        pc.onicecandidate = (event) => {
            if (event.candidate && socket?.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: event.candidate.toJSON(),
                    author: userId
                }));
            }
        };

        pc.ontrack = (event) => {
            console.log('Track received:', event.track.kind, event.track.enabled);
            if (event.streams && event.streams[0]) {
                setRemoteStream(event.streams[0]);
            }
        };

        pc.oniceconnectionstatechange = () => {
            console.log('ICE state:', pc.iceConnectionState);
        };

        peerConnectionRef.current = pc;
        return pc;
    }, [userId, iceServers, socket]);

    const startCall = useCallback(async (video: boolean) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            throw new Error('Socket not ready');
        }

        try {
            // Получаем медиа поток
            const stream = await navigator.mediaDevices.getUserMedia({
                video: video ? { width: 1280, height: 720 } : false,
                audio: { echoCancellation: true, noiseSuppression: true }
            });

            setLocalStream(stream);
            setIsVideoEnabled(video);
            setIsAudioEnabled(true);

            // Создаем соединение
            const pc = createPeerConnection();

            // Добавляем все треки
            stream.getTracks().forEach(track => {
                console.log('Adding track:', track.kind, track.enabled, track.readyState);
                pc.addTrack(track, stream);
            });

            // Создаем offer
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });
            await pc.setLocalDescription(offer);

            // Отправляем offer
            socket.send(JSON.stringify({
                type: 'offer',
                offer: offer,
                author: userId,
                video: video
            }));

            return true;
        } catch (error) {
            console.error('Start call error:', error);
            throw error;
        }
    }, [socket, userId, createPeerConnection]);

    const answerCall = useCallback(async (offer: RTCSessionDescriptionInit, video: boolean) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            throw new Error('Socket not ready');
        }

        try {
            // Получаем медиа поток
            const stream = await navigator.mediaDevices.getUserMedia({
                video: video ? { width: 1280, height: 720 } : false,
                audio: { echoCancellation: true, noiseSuppression: true }
            });

            setLocalStream(stream);
            setIsVideoEnabled(video);
            setIsAudioEnabled(true);

            // Создаем соединение
            const pc = createPeerConnection();

            // Добавляем треки ПЕРЕД setRemoteDescription
            stream.getTracks().forEach(track => {
                console.log('Adding track for answer:', track.kind, track.enabled, track.readyState);
                pc.addTrack(track, stream);
            });

            // Устанавливаем remote description
            await pc.setRemoteDescription(new RTCSessionDescription(offer));

            // Создаем answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // Отправляем answer
            socket.send(JSON.stringify({
                type: 'answer',
                answer: answer,
                author: userId
            }));

            return true;
        } catch (error) {
            console.error('Answer call error:', error);
            throw error;
        }
    }, [socket, userId, createPeerConnection]);

    const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
        if (peerConnectionRef.current) {
            try {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
            } catch (error) {
                console.error('Set remote description error:', error);
            }
        }
    }, []);

    const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
        if (peerConnectionRef.current) {
            try {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (error) {
                console.error('Add ICE candidate error:', error);
            }
        }
    }, []);

    const toggleVideo = useCallback(() => {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                setIsVideoEnabled(videoTrack.enabled);
            }
        }
    }, [localStream]);

    const toggleAudio = useCallback(() => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsAudioEnabled(audioTrack.enabled);
            }
        }
    }, [localStream]);

    const cleanup = useCallback(() => {
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        if (localStream) {
            localStream.getTracks().forEach(track => {
                track.stop();
            });
            setLocalStream(null);
        }

        setRemoteStream(null);
        setIsVideoEnabled(false);
        setIsAudioEnabled(true);
    }, [localStream]);

    return {
        localStream,
        remoteStream,
        isVideoEnabled,
        isAudioEnabled,
        startCall,
        answerCall,
        handleAnswer,
        handleIceCandidate,
        toggleVideo,
        toggleAudio,
        cleanup
    };
}