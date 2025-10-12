import { useState, MouseEvent, useRef, useContext } from "react";
import { styled } from '@mui/system';
import { Button, IconButton, InputAdornment, TextField, Alert, Snackbar } from "@mui/material";
import './LoginPage.css';
import { VisibilityOff, Visibility } from "@mui/icons-material";
import { UserInfoContext } from "../../App";
import { useNavigate } from "react-router-dom";
import { isMobile } from "react-device-detect";
import { authAPI, RegisterRequest, LoginRequest } from "../../services/api";

const Btn = styled(Button)({
    textTransform: 'none',
})

const StyledA = styled('a')({
    '&:visited': {
        color: '#8BC34A'
    },
    color: '#8BC34A',
    textDecoration: 'underline',
    cursor: 'pointer'
})

type State = 'login' | 'register';

type FormError = {
    username: Boolean;
    password: Boolean;
    name: Boolean;
    usernameDesc: string;
    passwordDesc: string;
    nameDesc: string;
}

export default function DesktopLoginPage() {

    const navigate = useNavigate();

    const {setUserInfo} = useContext(UserInfoContext);

    const passwordRef = useRef<HTMLInputElement>(null);
    const usernameRef = useRef<HTMLInputElement>(null);
    const nameRef = useRef<HTMLInputElement>(null);

    const [curState, setCurState] = useState<State>('login');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

    const handleClickShowPassword = () => setShowPassword((show) => !show);

    const [formError, setFormError] = useState<FormError>({
        username: false,
        password: false,
        name: false,
        usernameDesc: '',
        passwordDesc: '',
        nameDesc: ''
    })


    const handleMouseDownPassword = (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
    };

    const validateForm = (isRegister: boolean = false) => {
        let curError: FormError = {
            username: false,
            password: false,
            name: false,
            usernameDesc: '',
            passwordDesc: '',
            nameDesc: ''
        };

        const username = usernameRef.current?.value || '';
        const password = passwordRef.current?.value || '';
        const name = nameRef.current?.value || '';

        // Валидация phone
        if (username.length < 10) {
            curError.username = true;
            curError.usernameDesc = 'Номер телефона должен быть не менее 10 цифр';
        } else if (!/^[0-9+\-\s()]+$/.test(username)) {
            curError.username = true;
            curError.usernameDesc = 'Номер телефона может содержать только цифры и символы +-()';
        }

        // Валидация пароля
        if (password.length < 6) {
            curError.password = true;
            curError.passwordDesc = 'Пароль должен быть не менее 6 символов';
        }

        // Валидация имени (только для регистрации)
        if (isRegister) {
            if (name.length < 2) {
                curError.name = true;
                curError.nameDesc = 'Имя должно быть не менее 2 символов';
            } else if (name.length > 50) {
                curError.name = true;
                curError.nameDesc = 'Имя должно быть не более 50 символов';
            }
        }

        setFormError(curError);
        return !curError.username && !curError.password && (!isRegister || !curError.name);
    }

    const handleLogin = async () => {
        if (!passwordRef.current || !usernameRef.current) return;
        if (!validateForm(false)) return;

        setLoading(true);
        try {
            const loginData: LoginRequest = {
                phone: usernameRef.current.value,
                password: passwordRef.current.value
            };

            const user = await authAPI.login(loginData);
            
            setUserInfo({
                user_id: user.id,
                phone: user.phone,
                name: user.name,
                password: '',
                is_activated: false,
                is_admin: false,
                created_at: '',
                updated_at: ''
            });
            
            localStorage.setItem('user_id', String(user.id));
            localStorage.setItem('user_phone', user.phone);
            localStorage.setItem('user_name', user.name);

            setSnackbar({
                open: true,
                message: 'Успешный вход!',
                severity: 'success'
            });

            if (isMobile) {
                navigate('/friends');
            } else {
                navigate('/messenger/-1');
            }
        } catch (error: any) {
            console.error('Login error:', error);
            setSnackbar({
                open: true,
                message: error.response?.data?.detail || 'Ошибка входа',
                severity: 'error'
            });
            setFormError({
                username: true,
                password: true,
                name: false,
                usernameDesc: 'Неверные данные',
                passwordDesc: 'Неверные данные',
                nameDesc: ''
            });
        } finally {
            setLoading(false);
        }
    }

    const handleRegister = async () => {
        if (!passwordRef.current || !usernameRef.current || !nameRef.current) return;
        if (!validateForm(true)) return;

        setLoading(true);
        try {
            const registerData: RegisterRequest = {
                phone: usernameRef.current.value,
                name: nameRef.current.value,
                password: passwordRef.current.value,
            };

            await authAPI.register(registerData);
            
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
            console.error('Register error:', error);
            
            // Обрабатываем ошибки валидации
            let errorMessage = 'Ошибка регистрации';
            let fieldErrors = {
                username: false,
                password: false,
                name: false,
                usernameDesc: '',
                passwordDesc: '',
                nameDesc: ''
            };

            if (error.response?.data?.detail) {
                if (typeof error.response.data.detail === 'string') {
                    errorMessage = error.response.data.detail;
                    fieldErrors.username = true;
                    fieldErrors.usernameDesc = errorMessage;
                } else if (Array.isArray(error.response.data.detail)) {
                    // Обрабатываем массив ошибок валидации
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
    }


    return (
        <>
            <section id="login">
                {
                    curState === 'login' &&
                    <>
                        <h2 className="ta-center">
                            Вход
                        </h2>
                        <TextField
                        label="Номер телефона"
                        error={formError.username.valueOf()}
                        helperText={formError.usernameDesc}
                        inputRef={usernameRef}
                        color="secondary"
                        disabled={loading}
                        />
                    <TextField
                    label="Пароль"
                    error={formError.password.valueOf()}
                    helperText={formError.passwordDesc}
                    inputRef={passwordRef}
                    color="secondary"
                    disabled={loading}
                    InputProps={
                        {
                            type: showPassword ? 'text' : 'password',
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                    aria-label="toggle password visibility"
                                    onClick={handleClickShowPassword}
                                    onMouseDown={handleMouseDownPassword}
                                    edge="end"
                                    disabled={loading}
                                    >
                                    {showPassword ? <VisibilityOff /> : <Visibility />}
                                    </IconButton>
                                </InputAdornment>
                            )
                        }
                    }
                    />
                    <Btn
                    variant="contained"
                    onClick={handleLogin}
                    color="secondary"
                    disabled={loading}
                    style={
                        {
                            color: 'white'
                        }
                    }
                    >
                        {loading ? 'Вход...' : 'Войти'}
                    </Btn>
                    <p className="ta-center">
                        Ещё нет аккаунта?  &nbsp;
                        <StyledA
                        className="us-none"
                        onClick={() => setCurState('register')}
                        >
                            Зарегистрироваться
                        </StyledA>
                    </p>
                </> 
            }

            {
                curState === 'register' &&
                <>
                    <h2 className="ta-center">
                        Регистрация
                    </h2>
                        <TextField
                        label="Номер телефона"
                        error={formError.username.valueOf()}
                        helperText={formError.usernameDesc}
                        inputRef={usernameRef}
                        color="secondary"
                        disabled={loading}
                        />
                    <TextField
                    label="Имя"
                    error={formError.name.valueOf()}
                    helperText={formError.nameDesc}
                    inputRef={nameRef}
                    color="secondary"
                    disabled={loading}
                    />
                    <TextField
                    label="Пароль"
                    error={formError.password.valueOf()}
                    helperText={formError.passwordDesc}
                    inputRef={passwordRef}
                    color="secondary"
                    disabled={loading}
                    InputProps={
                        {
                            type: showPassword ? 'text' : 'password',
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                    aria-label="toggle password visibility"
                                    onClick={handleClickShowPassword}
                                    onMouseDown={handleMouseDownPassword}
                                    edge="end"
                                    disabled={loading}
                                    >
                                    {showPassword ? <VisibilityOff /> : <Visibility />}
                                    </IconButton>
                                </InputAdornment>
                            )
                        }
                    }
                    />
                    <Btn
                    variant="contained"
                    onClick={handleRegister}
                    color="secondary"
                    disabled={loading}
                    style={
                        {
                            color: 'white'
                        }
                    }
                    >
                        {loading ? 'Регистрация...' : 'Зарегистрироваться'}
                    </Btn>
                    <p className="ta-center us-none">
                        Уже есть аккаунт?  &nbsp;
                        <StyledA
                        className="us-none"
                        onClick={() => setCurState('login')}
                        >
                            Войти
                        </StyledA>
                    </p>
                </>
            }

        </section>
        
        <Snackbar
            open={snackbar.open}
            autoHideDuration={6000}
            onClose={() => setSnackbar({ ...snackbar, open: false })}
        >
            <Alert 
                onClose={() => setSnackbar({ ...snackbar, open: false })} 
                severity={snackbar.severity}
            >
                {snackbar.message}
            </Alert>
            </Snackbar>
        </>
    );
}
