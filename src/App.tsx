import './Main.css';
import './App.css';
import {Routes, Route, BrowserRouter} from 'react-router-dom';
import DesktopLoginPage from './Desktop/pages/LoginPage';
import DesktopMessengerPage from './Desktop/pages/MessengerPage';
import { createContext, useEffect, useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material';
import axios from 'axios';
import DefaultPage from './Desktop/pages/DefaultPage';
import { BrowserView, MobileView } from 'react-device-detect';
import MobileFriendsPage from './Mobile/pages/FriendsPage';
import MobileMessenger from './Mobile/components/Messenger';
import { getServerUrl, logServerConfig } from './config/serverConfig';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    secondary: {
      main: '#4CAF50'
    },
    warning: {
      main: '#8BC34A'
    }
  },
})

type UserInfoType = {
  user_id: number;
  phone: string;
  name: string;
  password: string;
  is_activated: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

type UserInfoContextType = {
  userInfo: UserInfoType;
  setUserInfo: (user: UserInfoType) => void;
  logout: () => void;
}

const UserInfoContext = createContext<UserInfoContextType>(
  {
    userInfo: {
      user_id: -1,
      phone: '',
      name: '',
      password: '',
      is_activated: false,
      is_admin: false,
      created_at: '',
      updated_at: ''
    },
    setUserInfo: (user: UserInfoType) => {},
    logout: () => {}
  }
)

function App() {

  const serverUrl = getServerUrl();
  axios.defaults.baseURL = serverUrl;

  const [userInfo, setUserInfo] = useState<UserInfoType>({
    user_id: parseInt(localStorage.getItem('user_id') || '-1'),
    phone: localStorage.getItem('phone') || '',
    name: localStorage.getItem('name') || '',
    password: localStorage.getItem('password') || '',
    is_activated: JSON.parse(localStorage.getItem('is_activated') || 'false'),
    is_admin: JSON.parse(localStorage.getItem('is_admin') || 'false'),
    created_at: localStorage.getItem('created_at') || '',
    updated_at: localStorage.getItem('updated_at') || ''
  });

  // Проверяем, зарегистрирован ли пользователь
  const isLoggedIn = userInfo.user_id !== -1 && userInfo.phone !== '';

  // Функция для выхода
  const logout = () => {
    localStorage.clear();
    setUserInfo({
      user_id: -1,
      phone: '',
      name: '',
      password: '',
      is_activated: false,
      is_admin: false,
      created_at: '',
      updated_at: ''
    });
  };

  return (
    <ThemeProvider theme={darkTheme}>
      <UserInfoContext.Provider value={{userInfo, setUserInfo, logout}}>
        <BrowserView>
          <BrowserRouter>
            <Routes>
              <Route path='/' element={isLoggedIn ? <DefaultPage/> : <DesktopLoginPage/>} />
              <Route path='/messenger/:id' element={isLoggedIn ? <DesktopMessengerPage/> : <DesktopLoginPage/>} />
              <Route path='/login' element={<DesktopLoginPage/>} />
            </Routes>
          </BrowserRouter>
        </BrowserView>
        <MobileView className='mobile'>
          <BrowserRouter>
            <Routes>
              <Route path='/' element={isLoggedIn ? <DefaultPage/> : <DesktopLoginPage/>} />
              <Route path='/messenger/:id?' element={isLoggedIn ? <MobileMessenger /> : <DesktopLoginPage/>} />
              <Route path='/friends' element={isLoggedIn ? <MobileFriendsPage /> : <DesktopLoginPage/>} />
              <Route path='/login' element={<DesktopLoginPage/>} />
            </Routes>
          </BrowserRouter>
        </MobileView>
      </UserInfoContext.Provider>
    </ThemeProvider>
  );
}

export default App;

export {UserInfoContext};