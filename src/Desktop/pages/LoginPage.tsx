import React, { useRef, useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    TextField,
    Button,
    Typography,
    Paper,
    IconButton,
    InputAdornment,
    Alert,
    Snackbar,
    CircularProgress,
    useTheme,
    alpha,
    useMediaQuery
} from '@mui/material';
import {
    Visibility,
    VisibilityOff,
    Person,
    Phone,
    Lock
} from '@mui/icons-material';
import { authAPI, LoginRequest, RegisterRequest } from '../../services/api';
import { UserInfoContext } from '../../App';

interface FormErrors {
    username: boolean;
    password: boolean;
    name: boolean;
    usernameDesc: string;
    passwordDesc: string;
    nameDesc: string;
}

interface SnackbarState {
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'warning' | 'info';
}

export default function LoginPage() {
    const theme = useTheme();
    const navigate = useNavigate();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    
    // ВАЖНО: Используем контекст для обновления состояния пользователя
    const { setUserInfo } = useContext(UserInfoContext);
    
    const [curState, setCurState] = useState<'login' | 'register'>('login');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [formError, setFormError] = useState<FormErrors>({
        username: false,
        password: false,
        name: false,
        usernameDesc: '',
        passwordDesc: '',
        nameDesc: ''
    });
    const [snackbar, setSnackbar] = useState<SnackbarState>({
        open: false,
        message: '',
        severity: 'info'
    });

    const usernameRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const nameRef = useRef<HTMLInputElement>(null);

    const validateForm = (isRegister: boolean): boolean => {
        let isValid = true;
        const errors = { ...formError };

        // Валидация телефона
        if (!usernameRef.current?.value || usernameRef.current.value.length < 10) {
            errors.username = true;
            errors.usernameDesc = 'Введите корректный номер телефона';
            isValid = false;
        } else {
            errors.username = false;
            errors.usernameDesc = '';
        }

        // Валидация пароля
        if (!passwordRef.current?.value || passwordRef.current.value.length < 6) {
            errors.password = true;
            errors.passwordDesc = 'Пароль должен содержать минимум 6 символов';
            isValid = false;
        } else {
            errors.password = false;
            errors.passwordDesc = '';
        }

        // Валидация имени (только для регистрации)
        if (isRegister) {
            if (!nameRef.current?.value || nameRef.current.value.length < 2) {
                errors.name = true;
                errors.nameDesc = 'Имя должно содержать минимум 2 символа';
                isValid = false;
            } else {
                errors.name = false;
                errors.nameDesc = '';
            }
        }

        setFormError(errors);
        return isValid;
    };

    const handleLogin = async () => {
        if (!passwordRef.current || !usernameRef.current) return;
        if (!validateForm(false)) return;

        setLoading(true);
        try {
            console.log('🔐 Attempting login...');
            
            const loginData: LoginRequest = {
                phone: usernameRef.current.value,
                password: passwordRef.current.value
            };

            const user = await authAPI.login(loginData);
            
            console.log('✅ Login successful:', user);

            // Создаем полный объект пользователя
            const userInfo = {
                user_id: user.id,
                phone: user.phone,
                name: user.name,
                password: passwordRef.current.value, // Сохраняем для авто-логина
                is_activated: true,
                is_admin: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            // КРИТИЧЕСКИ ВАЖНО: Обновляем контекст (это также сохранит в localStorage)
            setUserInfo(userInfo);

            console.log('💾 User info updated in context');

            setSnackbar({
                open: true,
                message: 'Успешный вход!',
                severity: 'success'
            });
            
            // Небольшая задержка для отображения сообщения
            setTimeout(() => {
                console.log('🚀 Navigating to messenger...');
                if (isMobile) {
                    navigate('/friends');
                } else {
                    navigate('/messenger/-1');
                }
            }, 500);
        } catch (error: any) {
            console.error('❌ Login error:', error);
            
            let errorMessage = 'Ошибка входа';
            let fieldErrors = { ...formError };

            if (error.message) {
                errorMessage = error.message;
                fieldErrors.usernameDesc = error.message;
                fieldErrors.passwordDesc = error.message;
            } else if (error.response?.data?.detail) {
                errorMessage = error.response.data.detail;
                fieldErrors.usernameDesc = errorMessage;
                fieldErrors.passwordDesc = errorMessage;
            }
            
            setFormError(fieldErrors);
            setSnackbar({
                open: true,
                message: errorMessage,
                severity: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async () => {
        if (!passwordRef.current || !usernameRef.current || !nameRef.current) return;
        if (!validateForm(true)) return;

        setLoading(true);
        try {
            console.log('📝 Attempting registration...');
            
            const registerData: RegisterRequest = {
                phone: usernameRef.current.value,
                name: nameRef.current.value,
                password: passwordRef.current.value,
            };

            await authAPI.register(registerData);
            
            console.log('✅ Registration successful');
            
            setSnackbar({
                open: true,
                message: 'Регистрация успешна! Теперь можете войти.',
                severity: 'success'
            });
            
            setCurState('login');
            setFormError({
                username: false,
                password: false,
                name: false,
                usernameDesc: '',
                passwordDesc: '',
                nameDesc: ''
            });
        } catch (error: any) {
            console.error('❌ Register error:', error);
            
            let errorMessage = 'Ошибка регистрации';
            let fieldErrors = { ...formError };

            if (error.message) {
                errorMessage = error.message;
                fieldErrors.username = true;
                fieldErrors.usernameDesc = errorMessage;
            } else if (error.response?.data?.detail) {
                if (typeof error.response.data.detail === 'string') {
                    errorMessage = error.response.data.detail;
                    fieldErrors.username = true;
                    fieldErrors.usernameDesc = errorMessage;
                } else if (Array.isArray(error.response.data.detail)) {
                    error.response.data.detail.forEach((err: any) => {
                        if (err.loc && err.loc.includes('username')) {
                            fieldErrors.username = true;
                            fieldErrors.usernameDesc = err.msg || 'Ошибка в username';
                        } else if (err.loc && err.loc.includes('password')) {
                            fieldErrors.password = true;
                            fieldErrors.passwordDesc = err.msg || 'Ошибка в пароле';
                        } else if (err.loc && err.loc.includes('name')) {
                            fieldErrors.name = true;
                            fieldErrors.nameDesc = err.msg || 'Ошибка в имени';
                        }
                    });
                    errorMessage = 'Ошибки валидации';
                }
            }
            
            setFormError(fieldErrors);
            setSnackbar({
                open: true,
                message: errorMessage,
                severity: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (curState === 'login') {
            handleLogin();
        } else {
            handleRegister();
        }
    };

    const togglePasswordVisibility = () => {
        setShowPassword(!showPassword);
    };

    const switchMode = () => {
        setCurState(curState === 'login' ? 'register' : 'login');
        setFormError({
            username: false,
            password: false,
            name: false,
            usernameDesc: '',
            passwordDesc: '',
            nameDesc: ''
        });
    };

    useEffect(() => {
        // Очистка формы при смене режима
        if (usernameRef.current) usernameRef.current.value = '';
        if (passwordRef.current) passwordRef.current.value = '';
        if (nameRef.current) nameRef.current.value = '';
    }, [curState]);

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.1)} 0%, ${alpha(theme.palette.secondary.main, 0.1)} 100%)`,
                p: 2
            }}
        >
            <Paper
                elevation={10}
                sx={{
                    p: 4,
                    width: '100%',
                    maxWidth: 400,
                    borderRadius: 2
                }}
            >
                <Box sx={{ textAlign: 'center', mb: 4 }}>
                    <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
                        {curState === 'login' ? 'Вход' : 'Регистрация'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {curState === 'login' 
                            ? 'Войдите в свой аккаунт для продолжения'
                            : 'Создайте новый аккаунт'
                        }
                    </Typography>
                </Box>

                <form onSubmit={handleSubmit}>
                    <TextField
                        inputRef={usernameRef}
                        fullWidth
                        label="Номер телефона"
                        type="tel"
                        margin="normal"
                        error={formError.username}
                        helperText={formError.usernameDesc}
                        disabled={loading}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Phone color={formError.username ? 'error' : 'action'} />
                                </InputAdornment>
                            ),
                        }}
                        sx={{ mb: 2 }}
                    />

                    {curState === 'register' && (
                        <TextField
                            inputRef={nameRef}
                            fullWidth
                            label="Имя"
                            margin="normal"
                            error={formError.name}
                            helperText={formError.nameDesc}
                            disabled={loading}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Person color={formError.name ? 'error' : 'action'} />
                                    </InputAdornment>
                                ),
                            }}
                            sx={{ mb: 2 }}
                        />
                    )}

                    <TextField
                        inputRef={passwordRef}
                        fullWidth
                        label="Пароль"
                        type={showPassword ? 'text' : 'password'}
                        margin="normal"
                        error={formError.password}
                        helperText={formError.passwordDesc}
                        disabled={loading}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Lock color={formError.password ? 'error' : 'action'} />
                                </InputAdornment>
                            ),
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        onClick={togglePasswordVisibility}
                                        edge="end"
                                        disabled={loading}
                                    >
                                        {showPassword ? <VisibilityOff /> : <Visibility />}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                        sx={{ mb: 3 }}
                    />

                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        size="large"
                        disabled={loading}
                        sx={{ mb: 2, py: 1.5 }}
                    >
                        {loading ? (
                            <CircularProgress size={24} color="inherit" />
                        ) : (
                            curState === 'login' ? 'Войти' : 'Зарегистрироваться'
                        )}
                    </Button>

                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                            {curState === 'login' ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}{' '}
                            <Button
                                onClick={switchMode}
                                type="button"
                                disabled={loading}
                                sx={{ 
                                    textTransform: 'none',
                                    p: 0,
                                    minWidth: 'auto',
                                    fontWeight: 'bold'
                                }}
                            >
                                {curState === 'login' ? 'Зарегистрироваться' : 'Войти'}
                            </Button>
                        </Typography>
                    </Box>
                </form>
            </Paper>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={6000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                    severity={snackbar.severity}
                    sx={{ width: '100%' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
}