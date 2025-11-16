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
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography sx={{ color: '#999' }}>
                    История пуста
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
                '&::-webkit-scrollbar-thumb': {
                    backgroundColor: '#888',
                    borderRadius: '4px'
                }
            }}
        >
            {messages.map((m, i) => (
                <Stack
                    key={i}
                    direction="row"
                    sx={{
                        mb: 1.5,
                        justifyContent: m.author === userId ? 'flex-end' : 'flex-start',
                        alignItems: 'flex-end',
                        gap: 0.5
                    }}
                >
                    <Box
                        sx={{
                            maxWidth: '75%',
                            p: 1.5,
                            borderRadius: 2,
                            backgroundColor: m.author === userId ? '#4CAF50' : '#424242',
                            color: '#fff',
                            wordWrap: 'break-word'
                        }}
                    >
                        <Typography variant="body2">
                            {m.text}
                        </Typography>
                    </Box>
                    {m.author === userId && (
                        m.is_read ? 
                            <DoneAllIcon sx={{ fontSize: 14, color: '#4CAF50' }} /> : 
                            <CheckIcon sx={{ fontSize: 14, color: '#999' }} />
                    )}
                </Stack>
            ))}
            <div ref={messagesEndRef} />
        </Box>
    );
};

export default MessageList;