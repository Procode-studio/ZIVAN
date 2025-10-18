import { useEffect, useState, useContext } from "react";
import { Button, CircularProgress, Divider } from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import { useNavigate } from "react-router-dom";
import { UserInfoContext } from "../../App";
import axios from "axios";
import { getServerUrl } from "../../config/serverConfig";
import MobileFriend from "../components/Friend";

type Friend = { id: number; name: string };

export default function MobileFriendsPage() {
    const navigate = useNavigate();
    const { userInfo, logout } = useContext(UserInfoContext);
    const [friends, setFriends] = useState<Friend[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const uid = userInfo?.user_id;
        if (!uid || uid === -1) {
            setIsLoading(false);
            return;
        }

        const cancelToken = axios.CancelToken.source();
        const url = `${getServerUrl()}/users`;

        axios.get(url, { cancelToken: cancelToken.token })
            .then((res) => {
                setFriends(
                    res.data
                        .map((u: any) => ({ name: u.name, id: u.id }))
                        .filter((f: Friend) => f.id !== uid)
                );
            })
            .catch((error) => {
                if (!axios.isCancel(error)) {
                    console.error('Failed to load users');
                }
            })
            .finally(() => setIsLoading(false));

        return () => cancelToken.cancel('cleanup');
    }, [userInfo?.user_id]);

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    return (
        <div id='friends'>
            <section style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                padding: '12px 16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <h3 style={{ margin: 0 }}>Контакты</h3>
                </div>
                <Button 
                    onClick={handleLogout} 
                    startIcon={<LogoutIcon />}
                    color="error"
                    size="small"
                >
                    Выйти
                </Button>
            </section>
            <Divider />
            
            {isLoading ? (
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    padding: 48 
                }}>
                    <CircularProgress color="secondary" />
                </div>
            ) : friends.length === 0 ? (
                <div style={{ 
                    textAlign: 'center', 
                    padding: 48,
                    color: '#999'
                }}>
                    Нет доступных контактов
                </div>
            ) : (
                friends.map((friend) => (
                    <MobileFriend 
                        key={friend.id} 
                        name={friend.name} 
                        id={friend.id} 
                    />
                ))
            )}
        </div>
    );
}