// В FriendsList.tsx
import { useContext, useEffect, useState } from 'react';
import { UserInfoContext } from '../../App';
import axios from 'axios';
import { getServerUrl } from '../../config/serverConfig';
import { Button } from '@mui/material';  // Или ваш компонент друга
import GetAvatar from '../../features/getAvatarByName';
import { useNavigate } from 'react-router-dom';

type FriendType = { id: number; name: string; };

export default function FriendsList() {
    const user = useContext(UserInfoContext);
    const user_id = user.userInfo.user_id;
    const user_name = user.userInfo.name;  // Используйте для заголовка вместо "You"
    const [friends, setFriends] = useState<FriendType[]>([]);
    const navigate = useNavigate();

    useEffect(() => {
        axios.get(`${getServerUrl()}/users`)
            .then((response) => {
                const allUsers: FriendType[] = response.data;
                // Фильтр: Исключаем себя
                const filtered = allUsers.filter((u) => u.id !== user_id);
                setFriends(filtered);
            })
            .catch((error) => console.error(error));
    }, [user_id]);

    return (
        <div>
            <h3>{user_name}</h3>  {/* Вместо "You" - ваш реальный name */}
            {friends.map((friend) => (
                <Button key={friend.id} onClick={() => navigate(`/messenger/${friend.id}`)}>
                    <GetAvatar name={friend.name} />
                    {friend.name}
                </Button>
            ))}
        </div>
    );
}