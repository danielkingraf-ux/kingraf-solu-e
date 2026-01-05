import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { Lock, Mail, ArrowRight, Sparkles, Eye, EyeOff } from 'lucide-react';
import logoFull from '../../assets/logo/logo-full.png';
import './Login.css';

interface LoginProps {
    onLoginSuccess: () => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                if (error.message.includes('Invalid login credentials')) {
                    setError('E-mail ou senha incorretos.');
                } else {
                    setError(error.message);
                }
                return;
            }

            onLoginSuccess();
        } catch (err: any) {
            setError('Erro ao conectar. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            {/* Animated Background */}
            <div className="login-bg">
                <div className="login-bg-gradient"></div>
                <div className="login-bg-glow glow-1"></div>
                <div className="login-bg-glow glow-2"></div>
                <div className="login-bg-glow glow-3"></div>
                <div className="login-bg-grid"></div>
                <div className="login-bg-particles">
                    {[...Array(20)].map((_, i) => (
                        <div key={i} className="particle" style={{
                            left: `${Math.random() * 100}%`,
                            animationDelay: `${Math.random() * 5}s`,
                            animationDuration: `${15 + Math.random() * 10}s`
                        }}></div>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="login-content">
                {/* Logo Section */}
                <div className="login-logo-section">
                    <div className="logo-glow-ring"></div>
                    <img src={logoFull} alt="Kingraf" className="login-logo" />
                    <div className="logo-tagline">
                        <Sparkles size={14} />
                        <span>Plataforma Industrial Inteligente</span>
                    </div>
                </div>

                {/* Login Card */}
                <div className="login-card-modern">
                    <div className="card-header-bar">
                        <div className="bar-dot"></div>
                        <div className="bar-dot"></div>
                        <div className="bar-dot"></div>
                    </div>

                    <div className="login-card-inner">
                        <h2 className="login-title">Bem-vindo de volta</h2>
                        <p className="login-desc">Acesse sua conta para continuar</p>

                        <form className="login-form-modern" onSubmit={handleLogin}>
                            <div className="input-group">
                                <div className="input-icon">
                                    <Mail size={18} />
                                </div>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Seu e-mail"
                                    required
                                    autoComplete="email"
                                />
                                <div className="input-focus-line"></div>
                            </div>

                            <div className="input-group">
                                <div className="input-icon">
                                    <Lock size={18} />
                                </div>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Sua senha"
                                    required
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    className="toggle-password"
                                    onClick={() => setShowPassword(!showPassword)}
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                                <div className="input-focus-line"></div>
                            </div>

                            {error && (
                                <div className="login-error-modern">
                                    <span>{error}</span>
                                </div>
                            )}

                            <button type="submit" className="login-btn-modern" disabled={loading}>
                                <span>{loading ? 'Entrando...' : 'Entrar na Plataforma'}</span>
                                <ArrowRight size={18} className="btn-arrow" />
                                <div className="btn-shine"></div>
                            </button>
                        </form>
                    </div>
                </div>

                {/* Footer */}
                <div className="login-footer-modern">
                    <span>© 2026 Kingraf • Sistema de Produção Industrial</span>
                    <a href="https://danielolliweb.com/" target="_blank" rel="noopener noreferrer" className="dev-credit">
                        Desenvolvido por danielolliweb
                    </a>
                </div>
            </div>
        </div>
    );
};

export default Login;
