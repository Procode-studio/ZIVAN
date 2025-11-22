import { Box, TextField, IconButton } from "@mui/material";
import SendIcon from '@mui/icons-material/Send';
import { useRef, useCallback } from "react";

interface MessageInputProps {
    onSendMessage: (text: string) => void;
    disabled?: boolean;
}

const MessageInput = ({ onSendMessage, disabled = false }: MessageInputProps) => {
    const inputRef = useRef<HTMLInputElement>(null);

    const handleSend = useCallback(() => {
        if (!inputRef.current) return;
        const text = inputRef.current.value.trim();
        if (!text) return;

        onSendMessage(text);
        inputRef.current.value = '';
    }, [onSendMessage]);

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <Box
            sx={{
                p: 1.5,
                pb: 2,
                display: 'flex',
                gap: 1.5,
                alignItems: 'flex-end',
                flexShrink: 0,
                background: 'linear-gradient(180deg, rgba(26,26,46,0.95) 0%, rgba(22,33,62,1) 100%)',
                borderTop: '1px solid rgba(76, 175, 80, 0.3)',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
                // Важно для iOS Safari
                paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            }}
        >
            <TextField
                fullWidth
                color="secondary"
                multiline
                maxRows={4}
                placeholder="Сообщение..."
                inputRef={inputRef}
                disabled={disabled}
                variant="outlined"
                size="small"
                onKeyPress={handleKeyPress}
                sx={{
                    '& .MuiOutlinedInput-root': {
                        color: '#fff',
                        backgroundColor: 'rgba(255,255,255,0.08)',
                        borderRadius: '20px',
                        fontSize: '15px',
                        '& fieldset': {
                            borderColor: 'rgba(76, 175, 80, 0.3)',
                            borderWidth: '1px'
                        },
                        '&:hover fieldset': {
                            borderColor: 'rgba(76, 175, 80, 0.5)'
                        },
                        '&.Mui-focused fieldset': {
                            borderColor: '#4CAF50',
                            borderWidth: '2px'
                        }
                    },
                    '& .MuiOutlinedInput-input': {
                        padding: '10px 16px',
                        '&::placeholder': {
                            color: 'rgba(255,255,255,0.5)',
                            opacity: 1
                        }
                    }
                }}
            />
            <IconButton
                onClick={handleSend}
                disabled={disabled}
                sx={{
                    width: 44,
                    height: 44,
                    background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
                    color: '#fff',
                    boxShadow: '0 4px 15px rgba(76, 175, 80, 0.4)',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                        background: 'linear-gradient(135deg, #5CBF60 0%, #4CAF50 100%)',
                        transform: 'scale(1.05)',
                        boxShadow: '0 6px 20px rgba(76, 175, 80, 0.5)'
                    },
                    '&:active': {
                        transform: 'scale(0.95)'
                    },
                    '&:disabled': {
                        background: 'rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.3)',
                        boxShadow: 'none'
                    },
                    flexShrink: 0
                }}
            >
                <SendIcon sx={{ fontSize: 22 }} />
            </IconButton>
        </Box>
    );
};

export default MessageInput;