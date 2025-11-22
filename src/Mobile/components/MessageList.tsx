import { Box, Typography, Stack } from "@mui/material";
import CheckIcon from '@mui/icons-material/Check';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { Message } from "../hooks/useMessages";

interface MessageListProps {
    messages: Message[];
    userId: number;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

const MessageList = ({ messages, userId, messagesEndRef }: MessageListProps) => {
    if (messages.length === 0) {
        return (
            <Box sx={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 2
            }}>
                <Box
                    sx={{
                        width: 80,
                        height: 80,
                        borderRadius: '50%',
                        background: 'rgba(76, 175, 80, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <Typography sx={{ fontSize: 40 }}>💬</Typography>
                </Box>
                <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.95rem' }}>
                    Начните общение!
                </Typography>
            </Box>
        );
    }

    return (
        <Box
            sx={{
                flex: 1,
                overflowY: 'auto',
                overflowX: 'hidden',
                p: 2,
                WebkitOverflowScrolling: 'touch',
                '&::-webkit-scrollbar': {
                    width: '4px'
                },
                '&::-webkit-scrollbar-track': {
                    backgroundColor: 'transparent'
                },
                '&::-webkit-scrollbar-thumb': {
                    backgroundColor: 'rgba(76, 175, 80, 0.3)',
                    borderRadius: '4px',
                    '&:hover': {
                        backgroundColor: 'rgba(76, 175, 80, 0.5)'
                    }
                }
            }}
        >
            {messages.map((m, i) => {
                const isMe = m.author === userId;
                return (
                    <Stack
                        key={i}
                        direction="row"
                        sx={{
                            mb: 1.5,
                            justifyContent: isMe ? 'flex-end' : 'flex-start',
                            alignItems: 'flex-end',
                            gap: 0.5
                        }}
                    >
                        <Box
                            sx={{
                                maxWidth: '78%',
                                p: '10px 14px',
                                borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                background: isMe
                                    ? 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)'
                                    : 'rgba(255,255,255,0.08)',
                                color: '#fff',
                                wordWrap: 'break-word',
                                boxShadow: isMe
                                    ? '0 2px 12px rgba(76, 175, 80, 0.3)'
                                    : '0 2px 8px rgba(0,0,0,0.2)',
                                border: isMe ? 'none' : '1px solid rgba(255,255,255,0.08)'
                            }}
                        >
                            <Typography
                                variant="body2"
                                sx={{
                                    fontSize: '0.95rem',
                                    lineHeight: 1.4,
                                    letterSpacing: '0.2px'
                                }}
                            >
                                {m.text}
                            </Typography>
                        </Box>
                        {isMe && (
                            m.is_read ?
                                <DoneAllIcon sx={{ fontSize: 16, color: '#4CAF50', filter: 'drop-shadow(0 0 4px rgba(76, 175, 80, 0.5))' }} /> :
                                <CheckIcon sx={{ fontSize: 16, color: 'rgba(255,255,255,0.4)' }} />
                        )}
                    </Stack>
                );
            })}
            <div ref={messagesEndRef} />
        </Box>
    );
};

export default MessageList;