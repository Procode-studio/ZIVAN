import './friends-list.css';
import { FriendType } from "../types/Friend";
import { useEffect, useState } from 'react';
import MobileFriend from './Friend';
import { Button, Divider } from '@mui/material';
import { useContext } from "react";
import { UserInfoContext } from "../../App";
import axios from 'axios';
import LogoutIcon from '@mui/icons-material/Logout';
import { useNavigate } from "react-router-dom";

type UserType = {
    id: number;
    name: string;
}

export default function FriendsList() {

    const navigate = useNavigate();

    const userInfo = useContext(UserInfoContext);

    const [friends, setFriends] = useState<FriendType[]>([]);

    useEffect(
        () => {
            const cancelToken = axios.CancelToken.source();
            const url = '/users';
            axios.get(url, {
                cancelToken: cancelToken.token
            })
            .then((res) => {
                const data: UserType[] = res.data;
                setFriends(data.map((user) => ({
                    name: user.name,
                    id: user.id,
                    username: '',  // Дефолт (опционально)
                    is_online: false,  // Дефолт
                    last_seen: ''  // Дефолт
                })).filter((friend) => friend.id !== userInfo.userInfo.id));
            })
            .catch((error) => {
                if (!axios.isCancel(error)) {
                    console.error('Failed to load friends:', error);
                }
            })
            return () => {
                cancelToken.cancel();
            }
        },
        [userInfo.userInfo.id]
    )

    const handleLogout = () => {
        localStorage.clear();
        navigate('/login');
    }

    const username = localStorage.getItem('user_name') || '';

    return (
        <div id='friends'>
            <section>
                <MobileFriend name={username || 'You'} id={-2} />
                <Button color="error" className='d-flex g-5' onClick={handleLogout}>
                    Выйти
                    <LogoutIcon style={{ fontSize: '18px' }}/>
                </Button>
            </section>
            <Divider />
            {
                friends.map((friend, index) =>
                    <MobileFriend key={index} name={friend.name} id={friend.id} />
                )
            }
        </div>
    )
}