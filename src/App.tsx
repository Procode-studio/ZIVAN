import './Main.css';
import './App.css';
import {
  Routes,
  Route,
  BrowserRouter,
  Navigate,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import DesktopLoginPage from './Desktop/pages/LoginPage';
import DesktopMessengerPage from './Desktop/pages/MessengerPage';
import { createContext, useEffect, useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material';
import axios from 'axios';
import DefaultPage from './Desktop/pages/DefaultPage';
import MobileFriendsPage from './Mobile/pages/FriendsPage';
import MobileMessenger from './Mobile/components/Messenger';
import { getServerUrl, logServerConfig } from './config/serverConfig';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    secondary: { main: '#4CAF50' },
    warning: { main: '#8BC34A' },
  },
});

type UserInfoType = {
  user_id: number;
  id?: number;
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
  setUserInfo: () => {},
  logout: () => {},
});

function RootRouter({ isLoggedIn }: { isLoggedIn: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Определяем, был ли реальный reload страницы
    const navEntry = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    const isReload =
      navEntry?.type === 'reload' ||
      ((performance as any).navigation?.type === 1);

    // Всегда уходим на "/" при перезагрузке
    if (isReload) {
      navigate('/', { replace: true });
      return;
    }

    // Защита от URL вида /messenger/-1
    if (location.pathname.startsWith('/messenger/-1')) {
      navigate('/', { replace: true });
    }
  }, [location.pathname, navigate]);

  return (
    <Routes>
      <Route path="/" element={<DefaultPage />} />
      <Route path="/login" element={<DesktopLoginPage />} />

      {/* Защищённые маршруты */}
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

      {/* Любые неизвестные пути — на корень */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  const serverUrl = getServerUrl();
  axios.defaults.baseURL = serverUrl;

  const [userInfo, setUserInfo] = useState<UserInfoType>({
    user_id: parseInt(localStorage.getItem('user_id') || '-1', 10),
    id: parseInt(localStorage.getItem('user_id') || '-1', 10),
    phone: localStorage.getItem('phone') || '',
    name: localStorage.getItem('name') || '',
    username: localStorage.getItem('name') || '',
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
    localStorage.setItem('password', user.password);
    localStorage.setItem('is_activated', JSON.stringify(user.is_activated));
    localStorage.setItem('is_admin', JSON.stringify(user.is_admin));
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
        <BrowserRouter>
          <RootRouter isLoggedIn={isLoggedIn} />
        </BrowserRouter>
      </UserInfoContext.Provider>
    </ThemeProvider>
  );
}

export default App;
export { UserInfoContext };