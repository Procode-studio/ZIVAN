import { Box, CircularProgress, Typography } from "@mui/material";
import { useContext, useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { UserInfoContext } from "../../App";
import { getServerUrl } from "../../config/serverConfig";
import { useMessages } from "../hooks/useMessages";
import { useWebSocket } from "../hooks/useWebSocket";
import { useWebRTC, CallStatus } from "../hooks/useWebRTC";
import ChatHeader from "../components/ChatHeader";
import MessageList from "../components/MessageList";
import MessageInput from "../components/MessageInput";
import CallDialog from "../components/CallDialog";
import IncomingCallDialog from "../components/IncomingCallDialog";

export default function MobileMessenger() {
    const { id } = useParams();
    const user = useContext(UserInfoContext);
    const userId = user.userInfo.user_id;
    const interlocutorId = parseInt(id || '-1');
    const [interlocutorName, setInterlocutorName] = useState('');

    // Load interlocutor profile
    useEffect(() => {
        if (interlocutorId === -1) {
            setInterlocutorName('');
            return;
        }
        
        const controller = new AbortController();
        axios.get(`${getServerUrl()}/users/${interlocutorId}`, {
            signal: controller.signal
        })
            .then(res => {
                if (res.data?.name) {
                    setInterlocutorName(res.data.name);
                }
            })
            .catch(err => {
                if (!axios.isCancel(err)) {
                    console.error('[Profile] Failed to load:', err);
                    setInterlocutorName(`User #${interlocutorId}`);
                }
            });
        
        return () => controller.abort();
    }, [interlocutorId]);

    // Messages hook
    const { 
        messages, 
        isLoading: messagesLoading, 
        messagesEndRef, 
        addMessage, 
        markAsRead 
    } = useMessages(userId, interlocutorId);

    // WebSocket message handler
    const handleWebSocketMessage = useCallback((data: any) => {
        const { type, author } = data;

        if (type === 'message') {
            addMessage({
                id: Date.now(),
                text: data.text,
                author: data.author,
                message_type: 'text',
                is_read: data.author === userId,
                created_at: new Date().toISOString()
            });
            
            if (author !== userId && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'read', author: userId }));
            }
        } else if (type === 'read') {
            markAsRead();
        } else {
            // Handle WebRTC signaling
            handleSignalingMessage(data);
        }
    }, [userId, addMessage, markAsRead]);

    // WebSocket hook
    const { 
        isConnected: wsConnected, 
        interlocutorOnline, 
        sendMessage: sendWsMessage,
        wsRef 
    } = useWebSocket({
        userId,
        interlocutorId,
        onMessage: handleWebSocketMessage
    });

    // WebRTC hook
    const {
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
    } = useWebRTC({
        userId,
        sendWsMessage
    });

    // Send text message
    const handleSendMessage = useCallback((text: string) => {
        if (interlocutorId === -1) return;
        
        const id1 = Math.min(userId, interlocutorId);
        const id2 = Math.max(userId, interlocutorId);
        
        sendWsMessage({
            type: 'message',
            user_id1: id1,
            user_id2: id2,
            text,
            author: userId
        });
    }, [userId, interlocutorId, sendWsMessage]);

    // Call handlers
    const handleStartAudioCall = useCallback(() => {
        startCall(false);
    }, [startCall]);

    const handleStartVideoCall = useCallback(() => {
        startCall(true);
    }, [startCall]);

    const handleAnswerCall = useCallback(() => {
        if (pendingOfferRef.current) {
            answerCall(pendingOfferRef.current, incomingCallVideo);
        }
    }, [answerCall, incomingCallVideo, pendingOfferRef]);

    // Loading state
    if (messagesLoading) {
        return (
            <Box sx={{ 
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#212121'
            }}>
                <CircularProgress color="secondary" />
            </Box>
        );
    }

    // No interlocutor selected
    if (interlocutorId === -1) {
        return (
            <Box sx={{ 
                height: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#212121'
            }}>
                <Typography sx={{ color: '#999' }}>
                    Выберите собеседника
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ 
            height: '100vh',
            width: '100vw',
            display: 'flex', 
            flexDirection: 'column',
            position: 'fixed',
            top: 0,
            left: 0,
            overflow: 'hidden',
            backgroundColor: '#212121'
        }}>
            {/* Header */}
            <ChatHeader
                interlocutorName={interlocutorName}
                callStatus={callStatus}
                callDuration={callDuration}
                interlocutorOnline={interlocutorOnline}
                onStartAudioCall={handleStartAudioCall}
                onStartVideoCall={handleStartVideoCall}
                onHangup={hangup}
            />

            {/* Messages */}
            <MessageList
                messages={messages}
                userId={userId}
                messagesEndRef={messagesEndRef}
            />

            {/* Input */}
            <MessageInput
                onSendMessage={handleSendMessage}
                disabled={interlocutorId === -1}
            />

            {/* Active call dialog */}
            <CallDialog
                open={callStatus === CallStatus.CALLING || callStatus === CallStatus.CONNECTED}
                callStatus={callStatus}
                interlocutorName={interlocutorName}
                callDuration={callDuration}
                localStream={localStream}
                remoteStream={remoteStream}
                isVideoEnabled={isVideoEnabled}
                isAudioEnabled={isAudioEnabled}
                onHangup={hangup}
                onToggleAudio={toggleAudio}
                onToggleVideo={toggleVideo}
            />

            {/* Incoming call dialog */}
            <IncomingCallDialog
                open={callStatus === CallStatus.RINGING}
                interlocutorName={interlocutorName}
                isVideoCall={incomingCallVideo}
                onAccept={handleAnswerCall}
                onDecline={declineCall}
            />
        </Box>
    );
}