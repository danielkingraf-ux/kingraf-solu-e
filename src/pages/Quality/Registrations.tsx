import React, { useState, useEffect } from 'react';
import {
    Users,
    Building2,
    AlertCircle,
    Search,
    Plus,
    X,
    Edit2,
    Trash2,
    UserCheck
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import '../Production/Stock.css'; // Reusing Stock styles

type TabType = 'revisores' | 'setores' | 'operadores' | 'desvios';

interface BaseItem {
    id: string;
    nome: string;
    ativo: boolean;
}

interface TipoDesvio extends BaseItem {
    descricao?: string;
}

const Registrations: React.FC = () => {
    const [activeTab, setActiveTab] = useState<TabType>('revisores');
    const [items, setItems] = useState<BaseItem[] | TipoDesvio[]>([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<BaseItem | TipoDesvio | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Form state
    const [formData, setFormData] = useState({
        nome: '',
        descricao: '',
        ativo: true
    });

    const tabConfig = {
        revisores: { table: 'qual_revisores', label: 'Revisores', icon: <Users size={20} /> },
        setores: { table: 'qual_setores', label: 'Setores', icon: <Building2 size={20} /> },
        operadores: { table: 'qual_operadores', label: 'Operadores', icon: <UserCheck size={20} /> },
        desvios: { table: 'qual_tipos_desvios', label: 'Tipos de Desvios', icon: <AlertCircle size={20} /> }
    };

    useEffect(() => {
        fetchItems();
    }, [activeTab]);

    const fetchItems = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from(tabConfig[activeTab].table)
                .select('*')
                .order('nome', { ascending: true });

            if (error) throw error;
            setItems(data || []);
        } catch (error) {
            console.error('Error fetching items:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const payload: any = {
                nome: formData.nome,
                ativo: formData.ativo
            };

            if (activeTab === 'desvios') {
                payload.descricao = formData.descricao;
            }

            if (editingItem) {
                const { error } = await supabase
                    .from(tabConfig[activeTab].table)
                    .update(payload)
                    .eq('id', editingItem.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from(tabConfig[activeTab].table)
                    .insert([payload]);
                if (error) throw error;
            }

            setIsModalOpen(false);
            setEditingItem(null);
            setFormData({ nome: '', descricao: '', ativo: true });
            fetchItems();
        } catch (error: any) {
            alert('Erro: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (item: BaseItem | TipoDesvio) => {
        setEditingItem(item);
        setFormData({
            nome: item.nome,
            descricao: (item as TipoDesvio).descricao || '',
            ativo: item.ativo
        });
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Deseja realmente excluir este item?')) return;

        try {
            const { error } = await supabase
                .from(tabConfig[activeTab].table)
                .delete()
                .eq('id', id);

            if (error) throw error;
            fetchItems();
        } catch (error: any) {
            alert('Erro ao excluir: ' + error.message);
        }
    };

    const filteredItems = items.filter(item =>
        item.nome.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="stock-container">
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
                {Object.entries(tabConfig).map(([key, config]) => (
                    <button
                        key={key}
                        onClick={() => setActiveTab(key as TabType)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '12px 20px',
                            borderRadius: '12px',
                            border: '1px solid',
                            borderColor: activeTab === key ? 'var(--kingraf-orange)' : '#E2E8F0',
                            backgroundColor: activeTab === key ? 'var(--kingraf-orange-alpha)' : '#FFFFFF',
                            color: activeTab === key ? 'var(--kingraf-orange)' : '#64748B',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        {config.icon}
                        {config.label}
                    </button>
                ))}
            </div>

            {/* Header */}
            <div className="page-header">
                <h2>{tabConfig[activeTab].icon} {tabConfig[activeTab].label}</h2>
                <div className="header-actions">
                    <div className="search-box">
                        <Search size={18} />
                        <input
                            placeholder="Buscar..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        className="btn-primary"
                        onClick={() => {
                            setEditingItem(null);
                            setFormData({ nome: '', descricao: '', ativo: true });
                            setIsModalOpen(true);
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '12px 20px',
                            backgroundColor: 'var(--kingraf-orange)',
                            color: 'white',
                            borderRadius: '12px',
                            fontWeight: 700,
                            border: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <Plus size={18} />
                        Novo
                    </button>
                </div>
            </div>

            {/* Grid */}
            <div className="stock-grid">
                {loading ? (
                    <div style={{ gridColumn: '1/-1', padding: '2rem', textAlign: 'center', color: '#64748B' }}>
                        Carregando...
                    </div>
                ) : filteredItems.length === 0 ? (
                    <div style={{ gridColumn: '1/-1', padding: '2rem', textAlign: 'center', color: '#64748B' }}>
                        Nenhum item encontrado.
                    </div>
                ) : (
                    filteredItems.map(item => (
                        <div key={item.id} className="stock-card">
                            <div className="card-header">
                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{item.nome}</h3>
                                <span
                                    className="status-badge"
                                    style={{
                                        backgroundColor: item.ativo ? '#ECFDF5' : '#FEF2F2',
                                        color: item.ativo ? '#059669' : '#DC2626'
                                    }}
                                >
                                    {item.ativo ? 'Ativo' : 'Inativo'}
                                </span>
                            </div>
                            {activeTab === 'desvios' && (item as TipoDesvio).descricao && (
                                <div className="card-content">
                                    <p style={{ color: '#64748B', fontSize: '14px', margin: 0 }}>
                                        {(item as TipoDesvio).descricao}
                                    </p>
                                </div>
                            )}
                            <div className="card-footer" style={{ justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => handleEdit(item)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '8px 12px',
                                        border: '1px solid #E2E8F0',
                                        borderRadius: '8px',
                                        backgroundColor: '#F8FAFC',
                                        color: '#3B82F6',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        fontSize: '13px'
                                    }}
                                >
                                    <Edit2 size={14} /> Editar
                                </button>
                                <button
                                    onClick={() => handleDelete(item.id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '8px 12px',
                                        border: '1px solid #FEE2E2',
                                        borderRadius: '8px',
                                        backgroundColor: '#FEF2F2',
                                        color: '#DC2626',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        fontSize: '13px'
                                    }}
                                >
                                    <Trash2 size={14} /> Excluir
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>{editingItem ? 'Editar' : 'Novo'} {tabConfig[activeTab].label.slice(0, -1)}</h3>
                            <button onClick={() => setIsModalOpen(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label>Nome *</label>
                                <input
                                    required
                                    placeholder="Digite o nome"
                                    value={formData.nome}
                                    onChange={e => setFormData({ ...formData, nome: e.target.value })}
                                />
                            </div>

                            {activeTab === 'desvios' && (
                                <div className="form-group">
                                    <label>Descrição</label>
                                    <textarea
                                        placeholder="Descrição opcional"
                                        value={formData.descricao}
                                        onChange={e => setFormData({ ...formData, descricao: e.target.value })}
                                        rows={3}
                                        style={{
                                            padding: '12px 16px',
                                            border: '1px solid #D1D5DB',
                                            borderRadius: '12px',
                                            backgroundColor: '#F8FAFC',
                                            color: '#0F172A',
                                            fontSize: '14px',
                                            fontWeight: 500,
                                            resize: 'vertical'
                                        }}
                                    />
                                </div>
                            )}

                            <div className="toggle-group">
                                <label className="switch-label">
                                    <input
                                        type="checkbox"
                                        checked={formData.ativo}
                                        onChange={e => setFormData({ ...formData, ativo: e.target.checked })}
                                    />
                                    <span className="toggle-slider"></span>
                                    Ativo
                                </label>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={() => setIsModalOpen(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn-orange" disabled={loading}>
                                    {loading ? 'Salvando...' : (editingItem ? 'Salvar Alterações' : 'Cadastrar')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Registrations;
