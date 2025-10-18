import { useContext, useEffect, useState } from 'react';
import { UserInfoContext } from '../../App';
import axios from 'axios';
import { getServerUrl } from '../../config/serverConfig';
import { Button } from '@mui/material';
import GetAvatar from '../../features/getAvatarByName';
import { useNavigate } from 'react-router-dom';

type FriendType = { id: number; name: string; /* other fields */ };

export default function FriendsList() {
    const user = useContext(UserInfoContext);
    const user_id = user.userInfo.user_id;
    const user_name = user.userInfo.name;  // Ваше имя вместо "You"
    const [friends, setFriends] = useState<FriendType[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        axios.get(`${getServerUrl()}/users`)
            .then((response) => {
                const allUsers: FriendType[] = response.data;
                // Фильтр: исключаем себя
                const filtered = allUsers.filter((u) => u.id !== user_id);
                setFriends(filtered);
            })
            .catch((error) => console.error(error));
    }, [user_id]);

    return (
        <div>
            <h3>{user_name}</h3>  {/* Ваше имя вместо "You" */}
            {friends.map((friend) => (
                <Button key={friend.id} className="friend" onClick={() => navigate(`/messenger/${friend.id}`)} style={{justifyContent: "flex-start"}} startIcon={<GetAvatar name={friend.name}/>}>
                    {friend.name}
                </Button>
            ))}
        </div>
    );
}