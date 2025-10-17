import { FriendType } from "../../Desktop/types/Friend";
import { useEffect, useState, useContext } from "react";
import MobileFriend from "../components/Friend";
import { Button, CircularProgress, Divider } from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import { useNavigate } from "react-router-dom";
import { UserInfoContext } from "../../App";
import axios from "axios";
import { getServerUrl } from "../../config/serverConfig";

type UserType = {
    id: number;
    username: string;
};

export default function MobileFriendsPage() {
    const navigate = useNavigate();
    const userInfo = useContext(UserInfoContext);

    const [friends, setFriends] = useState<FriendType[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!userInfo?.userInfo?.id) return;

        const cancelToken = axios.CancelToken.source();
        const url = `${getServerUrl()}/users`;

        axios.get<UserType[]>(url, { cancelToken: cancelToken.token })
            .then((res) => {
                setFriends(
                    res.data
                        .map((u) => ({ name: u.username, id: u.id }))
                        .filter((f) => f.id !== userInfo.userInfo.id)
                );
            })
            .catch(console.error)
            .finally(() => setIsLoading(false));

        return () => cancelToken.cancel();
    }, [userInfo?.userInfo?.id]);

    const handleLogout = () => {
        localStorage.clear();
        navigate("/login");
    };

    return (
        <div id="friends">
            <section>
                <MobileFriend
                    name={userInfo.userInfo.username || "a"}
                    id={-1}
                />
                <Button color="error" className="d-flex g-5" onClick={handleLogout}>
                    Выйти
                    <LogoutIcon sx={{ fontSize: 18 }} />
                </Button>
            </section>
            <Divider />
            {isLoading ? (
                <center style={{ width: "100%", height: "100%" }}>
                    <CircularProgress color="secondary" />
                </center>
            ) : (
                friends.map((friend) => (
                    <MobileFriend key={friend.id} name={friend.name} id={friend.id} />
                ))
            )}
        </div>
    );
}
