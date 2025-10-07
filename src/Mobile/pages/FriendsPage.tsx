import { FriendType } from "../../Desktop/types/Friend";
import { useEffect, useState } from 'react';
import Friend from '../../Desktop/components/Friend';
import { Button, CircularProgress, Divider } from '@mui/material';
import { useContext } from "react";
import { UserInfoContext } from "../../App";
import axios from 'axios';
import LogoutIcon from '@mui/icons-material/Logout';
import { useNavigate } from "react-router-dom";
import MobileFriend from '../components/Friend';

type UserType = {
    id: number;
    username: string;
}

export default function MobileFriendsPage() {
    const navigate = useNavigate();

    const userInfo = useContext(UserInfoContext);

    const [friends, setFriends] = useState<FriendType[]>([]);

    const [isLoading, setIsLoading] = useState(true);

    useEffect(
        () => {
            console.log(userInfo);
            const cancelToket = axios.CancelToken.source();
            const url = 'users';
            axios.get(url, {
                cancelToken: cancelToket.token
            })
            .then((res) => {
                const data : UserType[] = res.data;
                setFriends(data.map((user) => {
                    return {
                        name: user.username,
                        id: user.id
                    }
                }).filter((friend) => friend.id !== userInfo.userInfo.id));
                setIsLoading(false);
            })
            .catch((error) => {
                console.log(error);
            })
            return () => {
                cancelToket.cancel();
            }
        },
        [userInfo.userInfo.id]
    )

    const handleLogout = () => {
        localStorage.clear();
        navigate('/login');
    }

    return (
        <div id='friends'>
            <section>
                <MobileFriend name={userInfo.userInfo.name || 'a'} id={-1}/>
                <Button color="error" className='d-flex g-5' onClick={handleLogout}>
                    Выйти
                    <LogoutIcon style={
                        {
                            fontSize: '18px'
                        }
                    }/>
                </Button>
            </section>
            <Divider />
            {
                isLoading && 
                <center style={{width: '100%', height: '100%'}}>
                    <CircularProgress color="secondary"/>
                </center>
            }
            {
                friends.map((friend, index) => 
                    <MobileFriend key={index} name={friend.name} id={friend.id}/>
                )
            }
        </div>
    )
}