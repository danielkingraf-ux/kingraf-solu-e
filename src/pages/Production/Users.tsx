import React, { useState, useEffect } from 'react';
import { Search, Plus, X, Users as UsersIcon, Mail, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import './Stock.css';

interface ProdUser {
    id: string;
    email: string;
    created_at: string;
    user_metadata?: {
        full_name?: string;
        profile?: string;
    };
}

const Users: React.FC = () => {
    const [items, setItems] = useState<ProdUser[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    // Form State
    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        password: '',
        profile: 'Operador'
    });

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            // Buscar da tabela prod_usuarios (metadados locais)
            const { data, error } = await supabase
                .from('prod_usuarios')
                .select('*')
                .order('nome_completo', { ascending: true });

            if (error) throw error;
            if (data) {
                // Mapear para o formato esperado
                const mappedUsers = data.map((u: any) => ({
                    id: u.id,
                    email: u.email,
                    created_at: u.created_at,
                    user_metadata: {
                        full_name: u.nome_completo,
                        profile: u.perfil
                    }
                }));
                setItems(mappedUsers);
            }
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (formData.password.length < 6) {
            setError('A senha deve ter pelo menos 6 caracteres.');
            return;
        }

        try {
            setLoading(true);

            // 1. Criar usuário no Supabase Auth usando signUp
            console.log('Tentando criar usuário:', formData.email);
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    data: {
                        full_name: formData.fullName,
                        profile: formData.profile
                    }
                }
            });

            if (authError) {
                console.error('Erro no signUp:', authError);
                if (authError.message.includes('already registered')) {
                    setError('Este e-mail já está cadastrado no sistema.');
                } else {
                    setError(`Erro de Autenticação: ${authError.message}`);
                }
                return;
            }

            console.log('Usuário criado no Auth com sucesso:', authData.user?.id);

            // 2. Salvar metadados na tabela local prod_usuarios
            if (authData.user) {
                const { error: dbError } = await supabase
                    .from('prod_usuarios')
                    .insert([{
                        id: authData.user.id,
                        nome_completo: formData.fullName,
                        email: formData.email,
                        perfil: formData.profile
                    }]);

                if (dbError) {
                    console.error('Erro ao salvar metadados:', dbError);
                    setError(`O usuário foi criado, mas houve um erro ao salvar os dados adicionais: ${dbError.message}`);
                    return; // Interromper se não conseguir salvar no banco
                }
            } else {
                setError('O usuário não pôde ser criado. Verifique as configurações de Auth do Supabase.');
                return;
            }

            setSuccess(`✓ Convite enviado para ${formData.email}! O usuário deve verificar o e-mail para ativar a conta.`);
            setFormData({ fullName: '', email: '', password: '', profile: 'Operador' });
            fetchUsers();

            // Fechar modal após 4 segundos para dar tempo de ler
            setTimeout(() => {
                setIsModalOpen(false);
                setSuccess('');
            }, 4000);

        } catch (error: any) {
            console.error('Erro capturado no catch:', error);
            setError('Erro inesperado: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="stock-container">
            <div className="page-header">
                <h2><UsersIcon size={24} /> Gerenciar Usuários</h2>
                <div className="header-actions">
                    <div className="search-box">
                        <Search size={18} />
                        <input placeholder="Buscar usuário..." />
                    </div>
                    <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
                        <Plus size={18} />
                        Convidar Usuário
                    </button>
                </div>
            </div>

            {items.length === 0 && !loading && (
                <div style={{
                    textAlign: 'center',
                    padding: '60px 20px',
                    color: '#64748B'
                }}>
                    <UsersIcon size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                    <p>Nenhum usuário cadastrado ainda.</p>
                    <p style={{ fontSize: '14px' }}>Clique em "Convidar Usuário" para começar.</p>
                </div>
            )}

            <div className="stock-grid">
                {items.map(item => (
                    <div key={item.id} className="stock-card">
                        <div className="card-header">
                            <h3 style={{ margin: 0, color: '#F3F4F6' }}>
                                {item.user_metadata?.full_name || 'Sem nome'}
                            </h3>
                            <span className="status-badge received" style={{
                                background: item.user_metadata?.profile === 'Administrador'
                                    ? 'rgba(239, 68, 68, 0.2)'
                                    : 'rgba(59, 130, 246, 0.2)',
                                color: item.user_metadata?.profile === 'Administrador'
                                    ? '#F87171'
                                    : '#60A5FA'
                            }}>
                                {item.user_metadata?.profile || 'Operador'}
                            </span>
                        </div>
                        <div className="card-content">
                            <p style={{ color: '#9CA3AF', fontSize: '0.875rem', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Mail size={14} />
                                {item.email}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Convidar Novo Usuário</h3>
                            <button onClick={() => { setIsModalOpen(false); setError(''); setSuccess(''); }}>
                                <X size={20} />
                            </button>
                        </div>

                        {success && (
                            <div style={{
                                padding: '12px 16px',
                                backgroundColor: '#ECFDF5',
                                border: '1px solid #10B981',
                                borderRadius: '8px',
                                color: '#047857',
                                marginBottom: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <CheckCircle size={18} />
                                {success}
                            </div>
                        )}

                        {error && (
                            <div style={{
                                padding: '12px 16px',
                                backgroundColor: '#FEF2F2',
                                border: '1px solid #EF4444',
                                borderRadius: '8px',
                                color: '#DC2626',
                                marginBottom: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <AlertCircle size={18} />
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Nome Completo *</label>
                                <input
                                    required
                                    placeholder="Nome do usuário"
                                    value={formData.fullName}
                                    onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label>E-mail *</label>
                                <input
                                    type="email"
                                    required
                                    placeholder="email@exemplo.com"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label>Senha Inicial * <span style={{ fontSize: '11px', color: '#64748B' }}>(mínimo 6 caracteres)</span></label>
                                <input
                                    type="password"
                                    required
                                    minLength={6}
                                    placeholder="••••••••"
                                    value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                />
                            </div>

                            <div className="form-group">
                                <label>Perfil *</label>
                                <select
                                    value={formData.profile}
                                    onChange={e => setFormData({ ...formData, profile: e.target.value })}
                                    style={{
                                        padding: '0.75rem',
                                        borderRadius: '8px',
                                        border: '1px solid #E2E8F0',
                                        backgroundColor: '#F8FAFC',
                                        color: '#0F172A',
                                        fontSize: '14px'
                                    }}
                                >
                                    <option value="Operador">Operador</option>
                                    <option value="Supervisor">Supervisor</option>
                                    <option value="Administrador">Administrador</option>
                                </select>
                            </div>

                            <p style={{
                                fontSize: '12px',
                                color: '#64748B',
                                marginTop: '8px',
                                padding: '12px',
                                backgroundColor: '#F1F5F9',
                                borderRadius: '8px'
                            }}>
                                <Mail size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                                O usuário receberá um e-mail para confirmar o cadastro e ativar a conta.
                            </p>

                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="btn-cancel"
                                    onClick={() => { setIsModalOpen(false); setError(''); setSuccess(''); }}
                                >
                                    Cancelar
                                </button>
                                <button type="submit" className="btn-orange" disabled={loading || !!success}>
                                    {loading ? 'Enviando...' : 'Enviar Convite'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Users;

