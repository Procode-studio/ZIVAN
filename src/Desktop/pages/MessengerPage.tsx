import { Divider } from "@mui/material";
import { createContext } from "react";
import { useParams } from "react-router-dom";
import FriendsList from "../components/friends-list";
import Messenger from "../components/Messenger";
import CheckAuth from "../features/checkAuth";

const MessengerInterlocutorId = createContext<number>(-1);

export default function DesktopMessengerPage() {

    CheckAuth();

    const {id} = useParams();

    return (
        <MessengerInterlocutorId.Provider value={parseInt(id || '-1')}>
            <div className="d-flex"
            style={
                {
                    width: '100%',
                }
            }
            >
                <FriendsList/>
                <Divider orientation="vertical" flexItem/>
                <Messenger/>
            </div>
        </MessengerInterlocutorId.Provider>
    )
}

export {MessengerInterlocutorId};