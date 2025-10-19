import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isMobile } from 'react-device-detect';

export default function DefaultPage() {
    const navigate = useNavigate();

    useEffect(() => {
        if (isMobile) {
            navigate('/friends');
        } else {
            navigate('/messenger/-1');
        }
    }, [navigate]);

    return null;
}