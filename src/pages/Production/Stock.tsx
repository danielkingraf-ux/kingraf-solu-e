import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, X, Package, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import './Stock.css';

interface StockItem {
    id: string;
    op: string;
    tipo_caixa: string;
    quantidade: number;
    data_entrada: string;
    data_liberacao: string | null;
    liberada_producao: boolean;
    op_colada: boolean;
    observacoes: string;
}

const Stock: React.FC = () => {
    const [items, setItems] = useState<StockItem[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<StockItem | null>(null);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Form State
    const buildInitialFormData = () => ({
        op: '',
        boxType: '',
        quantity: 0,
        entryDate: new Date().toISOString().split('T')[0],
        releaseDate: '',
        isReleased: false,
        isGlued: false,
        notes: ''
    });
    const [formData, setFormData] = useState(buildInitialFormData());

    useEffect(() => {
        fetchStock();
    }, []);

    const fetchStock = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('prod_estoque')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) setItems(data);
        } catch (error) {
            console.error('Error fetching stock:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDateInput = (dateStr: string | null) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) return '';
        return date.toISOString().split('T')[0];
    };

    const openAddModal = () => {
        setEditingItem(null);
        setFormData(buildInitialFormData());
        setIsModalOpen(true);
    };

    const openEditModal = (item: StockItem) => {
        setEditingItem(item);
        setFormData({
            op: item.op || '',
            boxType: item.tipo_caixa || '',
            quantity: item.quantidade || 0,
            entryDate: formatDateInput(item.data_entrada),
            releaseDate: formatDateInput(item.data_liberacao),
            isReleased: item.liberada_producao,
            isGlued: item.op_colada,
            notes: item.observacoes || ''
        });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingItem(null);
        setFormData(buildInitialFormData());
    };

    const handleDelete = async (item: StockItem) => {
        if (!window.confirm(`Deseja excluir a OP ${item.op} do estoque?`)) return;

        try {
            setLoading(true);
            const { error } = await supabase
                .from('prod_estoque')
                .delete()
                .eq('id', item.id);

            if (error) throw error;
            alert('Item removido do estoque com sucesso!');
            fetchStock();
        } catch (error: any) {
            alert('Erro ao excluir: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            const payload = {
                op: formData.op,
                tipo_caixa: formData.boxType,
                quantidade: formData.quantity,
                data_entrada: formData.entryDate,
                data_liberacao: formData.releaseDate || null,
                liberada_producao: formData.isReleased,
                op_colada: formData.isGlued,
                observacoes: formData.notes
            };

            if (editingItem) {
                const { error } = await supabase
                    .from('prod_estoque')
                    .update(payload)
                    .eq('id', editingItem.id);
                if (error) throw error;
                alert('Item atualizado com sucesso!');
            } else {
                const { error } = await supabase.from('prod_estoque').insert([payload]);
                if (error) throw error;
                alert('Item adicionado ao estoque com sucesso!');
            }

            setIsModalOpen(false);
            setEditingItem(null);
            setFormData(buildInitialFormData());
            fetchStock();

        } catch (error: any) {
            alert('Erro ao salvar: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    // Aplicar filtros usando useMemo
    const filteredItems = useMemo(() => {
        if (!searchTerm) return items;
        
        const term = searchTerm.toLowerCase();
        return items.filter(item =>
            item.op?.toLowerCase().includes(term) ||
            item.tipo_caixa?.toLowerCase().includes(term)
        );
    }, [items, searchTerm]);

    return (
        <div className="stock-container">
            <div className="page-header">
                <h2><Package size={24} /> Controle de Estoque</h2>
                <div className="header-actions">
                    <div className="search-box">
                        <Search size={18} />
                        <input 
                            placeholder="Buscar OP, Tipo de Caixa..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button className="btn-primary" onClick={openAddModal}>
                        <Plus size={18} />
                        Adicionar ao Estoque
                    </button>
                </div>
            </div>

            <div className="stock-table-wrapper">
                <table className="compact-table stock-table">
                    <thead>
                        <tr>
                            <th>OP</th>
                            <th>Tipo de Caixa</th>
                            <th>Quantidade</th>
                            <th>Entrada</th>
                            <th>Liberacao</th>
                            <th>Status</th>
                            <th>Colada</th>
                            <th>Observacoes</th>
                            <th>Acoes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan={9} className="text-secondary">Carregando...</td>
                            </tr>
                        )}
                        {!loading && filteredItems.length === 0 && (
                            <tr>
                                <td colSpan={9} className="text-secondary">Nenhum item encontrado.</td>
                            </tr>
                        )}
                        {!loading && filteredItems.map(item => (
                            <tr key={item.id}>
                                <td className="font-bold text-primary">{item.op}</td>
                                <td>{item.tipo_caixa || '-'}</td>
                                <td className="font-bold text-primary">{item.quantidade.toLocaleString()}</td>
                                <td>{new Date(item.data_entrada).toLocaleDateString('pt-BR')}</td>
                                <td>{item.data_liberacao ? new Date(item.data_liberacao).toLocaleDateString('pt-BR') : '-'}</td>
                                <td>
                                    <span className={`status-badge-compact ${item.liberada_producao ? 'active' : 'inactive'}`}>
                                        {item.liberada_producao ? 'Liberada' : 'Pendente'}
                                    </span>
                                </td>
                                <td>{item.op_colada ? 'Sim' : 'Nao'}</td>
                                <td>{item.observacoes || '-'}</td>
                                <td>
                                    <div className="stock-row-actions">
                                        <button
                                            className="action-icon-btn"
                                            title="Editar"
                                            onClick={() => openEditModal(item)}
                                        >
                                            <Pencil size={16} />
                                        </button>
                                        <button
                                            className="action-icon-btn danger"
                                            title="Excluir"
                                            onClick={() => handleDelete(item)}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="stock-list">
                {loading && (
                    <div className="stock-list-empty text-secondary">Carregando...</div>
                )}
                {!loading && filteredItems.length === 0 && (
                    <div className="stock-list-empty text-secondary">Nenhum item encontrado.</div>
                )}
                {!loading && filteredItems.map(item => (
                    <div key={item.id} className="stock-list-item">
                        <div className="stock-list-header">
                            <div className="stock-list-title">
                                <span className="stock-list-label">OP</span>
                                <span className="stock-list-value font-bold text-primary">{item.op}</span>
                            </div>
                            <span className={`status-badge-compact ${item.liberada_producao ? 'active' : 'inactive'}`}>
                                {item.liberada_producao ? 'Liberada' : 'Pendente'}
                            </span>
                        </div>
                        <div className="stock-list-grid">
                            <div className="stock-list-field">
                                <span className="stock-list-label">Tipo</span>
                                <span className="stock-list-value">{item.tipo_caixa || '-'}</span>
                            </div>
                            <div className="stock-list-field">
                                <span className="stock-list-label">Quantidade</span>
                                <span className="stock-list-value font-bold text-primary">{item.quantidade.toLocaleString()}</span>
                            </div>
                            <div className="stock-list-field">
                                <span className="stock-list-label">Entrada</span>
                                <span className="stock-list-value">{new Date(item.data_entrada).toLocaleDateString('pt-BR')}</span>
                            </div>
                            <div className="stock-list-field">
                                <span className="stock-list-label">Liberacao</span>
                                <span className="stock-list-value">{item.data_liberacao ? new Date(item.data_liberacao).toLocaleDateString('pt-BR') : '-'}</span>
                            </div>
                            <div className="stock-list-field">
                                <span className="stock-list-label">Colada</span>
                                <span className="stock-list-value">{item.op_colada ? 'Sim' : 'Nao'}</span>
                            </div>
                            <div className="stock-list-field">
                                <span className="stock-list-label">Observacoes</span>
                                <span className="stock-list-value">{item.observacoes || '-'}</span>
                            </div>
                        </div>
                        <div className="stock-row-actions">
                            <button
                                className="action-icon-btn"
                                title="Editar"
                                onClick={() => openEditModal(item)}
                            >
                                <Pencil size={16} />
                            </button>
                            <button
                                className="action-icon-btn danger"
                                title="Excluir"
                                onClick={() => handleDelete(item)}
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>{editingItem ? 'Editar Item do Estoque' : 'Adicionar ao Estoque'}</h3>
                            <button onClick={closeModal}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Número da OP *</label>
                                    <input
                                        required
                                        value={formData.op}
                                        onChange={e => setFormData({ ...formData, op: e.target.value })}
                                        className="input-orange-focus"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Tipo de Caixa</label>
                                    <input
                                        placeholder="Ex: 50B, 66, 146"
                                        value={formData.boxType}
                                        onChange={e => setFormData({ ...formData, boxType: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Quantidade *</label>
                                    <input
                                        type="number"
                                        required
                                        value={formData.quantity}
                                        onChange={e => setFormData({ ...formData, quantity: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Data de Entrada *</label>
                                    <input
                                        type="date"
                                        required
                                        value={formData.entryDate}
                                        onChange={e => setFormData({ ...formData, entryDate: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Data de Liberação</label>
                                <input
                                    type="date"
                                    value={formData.releaseDate}
                                    onChange={e => setFormData({ ...formData, releaseDate: e.target.value })}
                                />
                            </div>

                            <div className="toggle-group">
                                <label className="switch-label">
                                    <input
                                        type="checkbox"
                                        checked={formData.isReleased}
                                        onChange={e => setFormData({ ...formData, isReleased: e.target.checked })}
                                    />
                                    <span className="toggle-slider"></span>
                                    <span>Liberada para Produção</span>
                                </label>
                            </div>

                            <div className="toggle-group">
                                <label className="switch-label">
                                    <input
                                        type="checkbox"
                                        checked={formData.isGlued}
                                        onChange={e => setFormData({ ...formData, isGlued: e.target.checked })}
                                    />
                                    <span className="toggle-slider"></span>
                                    <span>OP Colada</span>
                                </label>
                            </div>

                            <div className="form-group">
                                <label>Observações</label>
                                <textarea
                                    rows={3}
                                    value={formData.notes}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                />
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={closeModal}>Cancelar</button>
                                <button type="submit" className="btn-orange" disabled={loading}>
                                    {loading ? (editingItem ? 'Salvando...' : 'Adicionando...') : (editingItem ? 'Salvar' : 'Adicionar')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Stock;
