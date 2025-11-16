import { Paper, TextField, IconButton } from "@mui/material";
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
        <Paper 
            elevation={4}
            sx={{
                p: 1.5,
                display: 'flex',
                gap: 1,
                alignItems: 'flex-end',
                borderRadius: 0,
                flexShrink: 0,
                backgroundColor: '#1e1e1e',
                borderTop: '1px solid #333',
                position: 'relative',
                zIndex: 5
            }}
        >
            <TextField
                fullWidth
                color="secondary"
                multiline
                maxRows={3}
                placeholder="Написать..."
                inputRef={inputRef}
                disabled={disabled}
                variant="outlined"
                size="small"
                onKeyPress={handleKeyPress}
                sx={{
                    '& .MuiOutlinedInput-root': {
                        color: '#fff',
                        backgroundColor: '#2a2a2a',
                        '& fieldset': {
                            borderColor: '#444'
                        },
                        '&:hover fieldset': {
                            borderColor: '#666'
                        },
                        '&.Mui-focused fieldset': {
                            borderColor: '#4CAF50'
                        }
                    }
                }}
            />
            <IconButton
                onClick={handleSend}
                disabled={disabled}
                color="secondary"
                sx={{ 
                    backgroundColor: '#4CAF50',
                    color: '#fff',
                    '&:hover': {
                        backgroundColor: '#45a049'
                    },
                    '&:disabled': {
                        backgroundColor: '#333'
                    },
                    flexShrink: 0
                }}
            >
                <SendIcon />
            </IconButton>
        </Paper>
    );
};

export default MessageInput;