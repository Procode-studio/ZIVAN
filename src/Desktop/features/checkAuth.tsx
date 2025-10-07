import { useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { UserInfoContext } from "../../App";

export default function CheckAuth() {

    const navigate = useNavigate();
    const userInfo = useContext(UserInfoContext);

    useEffect(() => {
        if(userInfo.userInfo.id === -1) {
            navigate('/login');
        }
        else {
            navigate(`/messenger/-1`);
        }
    },
    [])

}