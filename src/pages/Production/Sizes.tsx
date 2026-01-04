import React, { useState, useEffect } from 'react';
import { Search, Plus, X, Box, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import './Stock.css'; // Reusing base styles from Stock

interface BoxSize {
    id: string;
    numero_caixa: string;
    descricao: string;
    ativo: boolean;
}

const Sizes: React.FC = () => {
    const [items, setItems] = useState<BoxSize[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        boxNumber: '',
        description: '',
        active: true
    });

    useEffect(() => {
        fetchSizes();
    }, []);

    const fetchSizes = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('prod_tamanhos')
                .select('*')
                .order('numero_caixa', { ascending: true });

            if (error) throw error;
            if (data) setItems(data);
        } catch (error) {
            console.error('Error fetching sizes:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            const payload = {
                numero_caixa: formData.boxNumber,
                descricao: formData.description,
                ativo: formData.active
            };

            if (editingId) {
                const { error } = await supabase
                    .from('prod_tamanhos')
                    .update(payload)
                    .eq('id', editingId);
                if (error) throw error;
                alert('Tamanho atualizado com sucesso!');
            } else {
                const { error } = await supabase
                    .from('prod_tamanhos')
                    .insert([payload]);
                if (error) throw error;
                alert('Tamanho cadastrado com sucesso!');
            }

            closeModal();
            fetchSizes();
        } catch (error: any) {
            alert('Erro ao salvar: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (item: BoxSize) => {
        setEditingId(item.id);
        setFormData({
            boxNumber: item.numero_caixa,
            description: item.descricao || '',
            active: item.ativo
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string, number: string) => {
        if (!window.confirm(`Tem certeza que deseja excluir a Caixa ${number}?`)) return;

        try {
            setLoading(true);
            const { error } = await supabase
                .from('prod_tamanhos')
                .delete()
                .eq('id', id);

            if (error) throw error;
            alert('Tamanho excluído com sucesso!');
            fetchSizes();
        } catch (error: any) {
            alert('Erro ao excluir: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingId(null);
        setFormData({ boxNumber: '', description: '', active: true });
    };

    const [searchTerm, setSearchTerm] = useState('');

    const filteredItems = items.filter(item =>
        item.numero_caixa.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.descricao && item.descricao.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="stock-container">
            <div className="page-header">
                <h2><Box size={24} /> Gerenciar Tamanhos</h2>
                <div className="header-actions">
                    <div className="search-box">
                        <Search size={18} />
                        <input
                            placeholder="Buscar por número ou descrição..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
                        <Plus size={18} />
                        Novo Tamanho
                    </button>
                </div>
            </div>

            <div className="premium-card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="compact-table">
                    <thead>
                        <tr>
                            <th style={{ width: '120px' }}>Número</th>
                            <th>Descrição</th>
                            <th style={{ width: '100px', textAlign: 'center' }}>Status</th>
                            <th style={{ width: '80px', textAlign: 'center' }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredItems.length > 0 ? (
                            filteredItems.map(item => (
                                <tr key={item.id}>
                                    <td className="font-bold text-primary">{item.numero_caixa}</td>
                                    <td className="text-secondary">{item.descricao || '-'}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span className={`status-badge-compact ${item.ativo ? 'active' : 'inactive'}`}>
                                            {item.ativo ? 'Ativo' : 'Inativo'}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                            <button
                                                className="action-icon-btn"
                                                title="Editar"
                                                onClick={() => handleEdit(item)}
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                className="action-icon-btn"
                                                title="Excluir"
                                                style={{ color: 'var(--danger)' }}
                                                onClick={() => handleDelete(item.id, item.numero_caixa)}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                    Nenhuma caixa encontrada para "{searchTerm}"
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>{editingId ? 'Editar Tamanho de Caixa' : 'Novo Tamanho de Caixa'}</h3>
                            <button onClick={closeModal}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Número da Caixa *</label>
                                <input
                                    required
                                    placeholder="Ex: 7, 66, 146, 50B"
                                    value={formData.boxNumber}
                                    onChange={e => setFormData({ ...formData, boxNumber: e.target.value })}
                                    className="input-orange-focus"
                                />
                            </div>

                            <div className="form-group">
                                <label>Descrição</label>
                                <textarea
                                    rows={3}
                                    placeholder="Descrição opcional..."
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            <div className="toggle-group" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label>Status Ativo</label>
                                <label className="switch-label">
                                    <input
                                        type="checkbox"
                                        checked={formData.active}
                                        onChange={e => setFormData({ ...formData, active: e.target.checked })}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={closeModal}>Cancelar</button>
                                <button type="submit" className="btn-orange" disabled={loading}>
                                    {loading ? 'Salvando...' : (editingId ? 'Salvar Alterações' : 'Cadastrar')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Sizes;
