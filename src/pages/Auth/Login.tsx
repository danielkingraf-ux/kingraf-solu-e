import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { Eye, EyeOff } from 'lucide-react';
import logoFull from '../../assets/logo/logo-full.png';
import './Login.css';

interface LoginProps {
    onLoginSuccess: () => void;
}

const MODULOS = [
    'Controle de revisão e qualidade',
    'Controle de caixas e estoque',
    'Emissão de etiquetas de caixa e palete',
    'Rastreio de palete entre setores',
];

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
            const { error } = await supabase.auth.signInWithPassword({ email, password });

            if (error) {
                if (error.message.includes('Invalid login credentials')) {
                    setError('E-mail ou senha incorretos. Confira e tente de novo.');
                } else {
                    setError(error.message);
                }
                return;
            }

            onLoginSuccess();
        } catch {
            setError('Sem conexão com o servidor. Confira a rede e tente de novo.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login">
            <aside className="login-marca">
                <img src={logoFull} alt="Kingraf" className="login-marca-logo" />

                <div className="login-marca-texto">
                    <span className="login-sobretitulo">Sistema de produção</span>
                    <h1>Do planejamento à expedição, cada etapa registrada.</h1>
                    <p>Plataforma interna da Kingraf Indústria Gráfica para o chão de fábrica.</p>

                    <ul className="login-modulos">
                        {MODULOS.map(m => <li key={m}>{m}</li>)}
                    </ul>
                </div>

                <span className="login-marca-rodape">Kingraf Indústria Gráfica · Curitiba, PR</span>
            </aside>

            <main className="login-area">
                <div className="login-form-box">
                    <img src={logoFull} alt="Kingraf" className="login-logo-mobile" />

                    <h2>Entrar</h2>
                    <p className="login-sub">Use o e-mail e a senha cadastrados pelo supervisor.</p>

                    <form onSubmit={handleLogin}>
                        <div className="login-campo">
                            <label htmlFor="login-email">E-mail</label>
                            <input
                                id="login-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="nome@kingraf.com.br"
                                required
                                autoComplete="email"
                                autoFocus
                            />
                        </div>

                        <div className="login-campo">
                            <label htmlFor="login-senha">Senha</label>
                            <div className="login-senha">
                                <input
                                    id="login-senha"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    className="login-ver-senha"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        {error && <div className="login-erro" role="alert">{error}</div>}

                        <button type="submit" className="login-entrar" disabled={loading}>
                            {loading ? 'Entrando...' : 'Entrar'}
                        </button>
                    </form>

                    <p className="login-ajuda">Esqueceu a senha? Fale com o supervisor de produção.</p>
                </div>

                <footer className="login-rodape">
                    <span>© 2026 Kingraf</span>
                    <a href="https://danielolliweb.com/" target="_blank" rel="noopener noreferrer">Desenvolvido por danielolliweb</a>
                </footer>
            </main>
        </div>
    );
};

export default Login;
