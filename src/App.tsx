import './Main.css';
import './App.css';
import { Routes, Route, Navigate, HashRouter } from 'react-router-dom';
import DesktopLoginPage from './Desktop/pages/LoginPage';
import DesktopMessengerPage from './Desktop/pages/MessengerPage';
import DefaultPage from './Desktop/pages/DefaultPage';
import MobileFriendsPage from './Mobile/pages/FriendsPage';
import MobileMessenger from './Mobile/components/Messenger';
import { ThemeProvider, createTheme } from '@mui/material';
import { createContext, useEffect, useState } from 'react';
import axios from 'axios';
import { getServerUrl, logServerConfig } from './config/serverConfig';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    secondary: { main: '#4CAF50' },
    warning: { main: '#8BC34A' },
  },
});

// Убираем дублирующее поле `id` — оставляем только `user_id`
export type UserInfoType = {
  user_id: number;
  phone: string;
  name: string;
  username?: string;
  password: string;
  is_activated: boolean;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
};

type UserInfoContextType = {
  userInfo: UserInfoType;
  setUserInfo: (user: UserInfoType) => void;
  logout: () => void;
};

// Создаём контекст с правильной типизацией
const UserInfoContext = createContext<UserInfoContextType>({
  userInfo: {
    user_id: -1,
    phone: '',
    name: '',
    password: '',
    is_activated: false,
    is_admin: false,
    created_at: '',
    updated_at: '',
  },
  // Заглушки с правильной сигнатурой
  setUserInfo: (user: UserInfoType) => {}, // ← принимает аргумент!
  logout: () => {},
});

function App() {
  const serverUrl = getServerUrl();
  axios.defaults.baseURL = serverUrl;

  // Инициализируем состояние с тем же типом, что и UserInfoType
  const [userInfo, setUserInfo] = useState<UserInfoType>({
    user_id: parseInt(localStorage.getItem('user_id') || '-1', 10),
    phone: localStorage.getItem('phone') || '',
    name: localStorage.getItem('name') || '',
    username: localStorage.getItem('username') || undefined,
    password: localStorage.getItem('password') || '',
    is_activated: JSON.parse(localStorage.getItem('is_activated') || 'false'),
    is_admin: JSON.parse(localStorage.getItem('is_admin') || 'false'),
    created_at: localStorage.getItem('created_at') || '',
    updated_at: localStorage.getItem('updated_at') || '',
  });

  const isLoggedIn = userInfo.user_id !== -1 && userInfo.phone !== '';

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
      updated_at: '',
    });
  };

  const updateUserInfo = (user: UserInfoType) => {
    localStorage.setItem('user_id', user.user_id.toString());
    localStorage.setItem('phone', user.phone);
    localStorage.setItem('name', user.name);
    if (user.username) localStorage.setItem('username', user.username);
    localStorage.setItem('password', user.password);
    localStorage.setItem('is_activated', String(user.is_activated));
    localStorage.setItem('is_admin', String(user.is_admin));
    localStorage.setItem('created_at', user.created_at);
    localStorage.setItem('updated_at', user.updated_at);
    setUserInfo(user);
  };

  useEffect(() => {
    logServerConfig();
  }, []);

  return (
    <ThemeProvider theme={darkTheme}>
      <UserInfoContext.Provider value={{ userInfo, setUserInfo: updateUserInfo, logout }}>
        <HashRouter>
          <Routes>
            <Route path="/" element={<DefaultPage />} />
            <Route path="/login" element={<DesktopLoginPage />} />
            <Route
              path="/messenger"
              element={isLoggedIn ? <DesktopMessengerPage /> : <Navigate to="/" replace />}
            />
            <Route
              path="/messenger/:id"
              element={isLoggedIn ? <DesktopMessengerPage /> : <Navigate to="/" replace />}
            />
            <Route
              path="/friends"
              element={isLoggedIn ? <MobileFriendsPage /> : <Navigate to="/" replace />}
            />
            <Route
              path="/m"
              element={isLoggedIn ? <MobileMessenger /> : <Navigate to="/" replace />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </UserInfoContext.Provider>
    </ThemeProvider>
  );
}

export default App;
export { UserInfoContext };