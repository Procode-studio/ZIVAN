import { IconButton, Tooltip } from "@mui/material";
import RefreshIcon from '@mui/icons-material/Refresh';

interface ReloadButtonProps {
    title?: string;
    size?: "small" | "medium" | "large";
}

export default function ReloadButton({ title = "Перезагрузить страницу", size = "medium" }: ReloadButtonProps) {
    const handleReload = () => {
        window.location.reload();
    };

    return (
        <Tooltip title={title}>
            <IconButton 
                onClick={handleReload} 
                color="secondary" 
                size={size}
                sx={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    '&:hover': {
                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    }
                }}
            >
                <RefreshIcon />
            </IconButton>
        </Tooltip>
    );
}