import React, { useState, useEffect } from 'react';
import { Search, Plus, X, Users as UsersIcon, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import './Stock.css'; // Reusing base styles from Stock

interface ProdUser {
    id: string;
    nome_completo: string;
    email: string;
    perfil: string;
}

const Users: React.FC = () => {
    const [items, setItems] = useState<ProdUser[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    // UI State
    const [showPassword, setShowPassword] = useState(false);

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
            const { data, error } = await supabase
                .from('prod_usuarios')
                .select('*')
                .order('nome_completo', { ascending: true });

            if (error) throw error;
            if (data) setItems(data);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            const payload = {
                nome_completo: formData.fullName,
                email: formData.email,
                senha_hash: formData.password, // NOTA: Em app real, nunca salvar senha crua. Usar Supabase Auth.
                perfil: formData.profile
            };

            const { error } = await supabase.from('prod_usuarios').insert([payload]);
            if (error) throw error;

            alert('Usuário cadastrado com sucesso!');
            setIsModalOpen(false);
            fetchUsers();
            setFormData({ fullName: '', email: '', password: '', profile: 'Operador' });

        } catch (error: any) {
            alert('Erro ao salvar: ' + error.message);
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
                        Novo Usuário
                    </button>
                </div>
            </div>

            <div className="stock-grid">
                {items.map(item => (
                    <div key={item.id} className="stock-card">
                        <div className="card-header">
                            <h3 style={{ margin: 0, color: '#F3F4F6' }}>{item.nome_completo}</h3>
                            <span className="status-badge received" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60A5FA' }}>
                                {item.perfil}
                            </span>
                        </div>
                        <div className="card-content">
                            <p style={{ color: '#9CA3AF', fontSize: '0.875rem', margin: 0 }}>
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
                            <h3>Novo Usuário</h3>
                            <button onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                        </div>
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
                                <label>Senha *</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        required
                                        value={formData.password}
                                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                                        style={{ width: '100%', paddingRight: '2.5rem' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        style={{
                                            position: 'absolute',
                                            right: '0.5rem',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            background: 'none',
                                            border: 'none',
                                            color: '#6B7280',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Perfil *</label>
                                <select
                                    value={formData.profile}
                                    onChange={e => setFormData({ ...formData, profile: e.target.value })}
                                    style={{
                                        padding: '0.5rem',
                                        borderRadius: '0.375rem',
                                        border: '1px solid #F97316', // Orange border as seen in screenshot
                                        backgroundColor: '#F3F4F6',
                                        color: '#111827'
                                    }}
                                >
                                    <option value="Operador">Operador</option>
                                    <option value="Administrador">Administrador</option>
                                    <option value="Supervisor">Supervisor</option>
                                </select>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn-orange" disabled={loading}>
                                    {loading ? 'Cadastrando...' : 'Cadastrar'}
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
