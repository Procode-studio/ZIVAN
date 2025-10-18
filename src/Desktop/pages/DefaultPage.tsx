import CheckAuth from "../features/checkAuth";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function DefaultPage() {

    const navigate = useNavigate();

    useEffect(() => {
        navigate('/messenger');
    }, [navigate]);

    CheckAuth();

    return null;
}