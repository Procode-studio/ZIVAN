import { Button } from "@mui/material";
import { FriendType } from "my-types/Friend";
import { useNavigate } from "react-router-dom";
import { useContext } from "react";
import GetAvatar from "../../features/getAvatarByName";

export default function MobileFriend({name, id}: FriendType) {

    const navigate = useNavigate();

    const changeCompanion = () => {
        if(id === -2) {
            return;
        }
        // console.log(id);
        navigate(`/messenger/${id}`);

    }

    return (
        <span>
            <Button className="friend" onClick={changeCompanion}
            style={{justifyContent: "flex-start"}}
            startIcon={<GetAvatar name={name}/>}
            >
                {name}
            </Button>
        </span>
    )
}