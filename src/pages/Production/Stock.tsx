import React, { useState, useEffect } from 'react';
import { Search, Plus, X, Package } from 'lucide-react';
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
    const [loading, setLoading] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        op: '',
        boxType: '',
        quantity: 0,
        entryDate: new Date().toISOString().split('T')[0],
        releaseDate: '',
        isReleased: false,
        isGlued: false,
        notes: ''
    });

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

            const { error } = await supabase.from('prod_estoque').insert([payload]);
            if (error) throw error;

            alert('Item adicionado ao estoque com sucesso!');
            setIsModalOpen(false);
            fetchStock();
            // Reset form
            setFormData({
                op: '',
                boxType: '',
                quantity: 0,
                entryDate: new Date().toISOString().split('T')[0],
                releaseDate: '',
                isReleased: false,
                isGlued: false,
                notes: ''
            });

        } catch (error: any) {
            alert('Erro ao salvar: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="stock-container">
            <div className="page-header">
                <h2><Package size={24} /> Controle de Estoque</h2>
                <div className="header-actions">
                    <div className="search-box">
                        <Search size={18} />
                        <input placeholder="Buscar OP, Tipo de Caixa..." />
                    </div>
                    <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
                        <Plus size={18} />
                        Adicionar ao Estoque
                    </button>
                </div>
            </div>

            <div className="stock-table-wrapper">
                <table className="compact-table">
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
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td colSpan={8} className="text-secondary">Carregando...</td>
                            </tr>
                        )}
                        {!loading && items.length === 0 && (
                            <tr>
                                <td colSpan={8} className="text-secondary">Nenhum item encontrado.</td>
                            </tr>
                        )}
                        {!loading && items.map(item => (
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
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Adicionar ao Estoque</h3>
                            <button onClick={() => setIsModalOpen(false)}><X size={20} /></button>
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
                                <button type="button" className="btn-cancel" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn-orange" disabled={loading}>
                                    {loading ? 'Adicionando...' : 'Adicionar'}
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
