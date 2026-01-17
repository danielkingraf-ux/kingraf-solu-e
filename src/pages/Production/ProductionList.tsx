import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, ClipboardList, Loader2, X, Pencil, Trash2, Eye } from 'lucide-react';
import './ProductionList.css';
import { supabase } from '../../supabaseClient';

// Data type based on Supabase table
interface ProductionRecord {
    id: string;
    op: string;
    cliente: string;
    produto: string;
    sku: string;
    unidades: number | null;
    tipo_caixa: string;
    qtd_fileiras: number | null;
    qtd_macos_fileira: number | null;
    qtd_por_maco: number | null;
    altura: number | null;
    total_macos: number;
    total_itens: number;
    foto_url: string | null;
    created_at: string;
    observacao?: string | null;
}

const ProductionList: React.FC = () => {
    const [records, setRecords] = useState<ProductionRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [skuFilter, setSkuFilter] = useState('');
    const [viewRecord, setViewRecord] = useState<ProductionRecord | null>(null);
    const [selectedPhoto, setSelectedPhoto] = useState<{
        url: string;
        observacao?: string | null;
        op: string;
        cliente: string;
        produto: string;
        created_at: string;
    } | null>(null);
    const buildInitialEditForm = () => ({
        op: '',
        cliente: '',
        produto: '',
        sku: '',
        unidades: '',
        tipo_caixa: '',
        qtd_fileiras: 0,
        qtd_macos_fileira: 0,
        qtd_por_maco: 0,
        altura: 0,
        observacao: ''
    });
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [editingRecord, setEditingRecord] = useState<ProductionRecord | null>(null);
    const [editForm, setEditForm] = useState(buildInitialEditForm());
    const [savingEdit, setSavingEdit] = useState(false);
    const parseDecimalInput = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const normalized = trimmed.replace(',', '.');
        const numberValue = Number(normalized);
        return Number.isFinite(numberValue) ? numberValue : null;
    };
    const totalMacos = (editForm.qtd_fileiras || 0) * (editForm.qtd_macos_fileira || 0);
    const extraUnits = parseDecimalInput(editForm.unidades) ?? 0;
    const totalItens = totalMacos * (editForm.qtd_por_maco || 0) * (editForm.altura || 0) + extraUnits;

    useEffect(() => {
        fetchRecords();
    }, []);

    const fetchRecords = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('producao_caixas')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (data) {
                setRecords(data as ProductionRecord[]);
            }
        } catch (error) {
            console.error('Erro ao buscar registros:', error);
        } finally {
            setLoading(false);
        }
    };

    // Aplicar filtros usando useMemo
    const filteredRecords = useMemo(() => {
        let filtered = records;

        // Filter by search term (OP, Cliente, Produto)
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(r =>
                r.op?.toLowerCase().includes(term) ||
                r.cliente?.toLowerCase().includes(term) ||
                r.produto?.toLowerCase().includes(term)
            );
        }

        // Filter by SKU
        if (skuFilter) {
            const sku = skuFilter.toLowerCase();
            filtered = filtered.filter(r => r.sku?.toLowerCase().includes(sku));
        }

        return filtered;
    }, [records, searchTerm, skuFilter]);

    const clearFilters = () => {
        setSearchTerm('');
        setSkuFilter('');
        setShowFilters(false);
    };

    const openEditModal = (record: ProductionRecord) => {
        setEditingRecord(record);
        setEditForm({
            op: record.op || '',
            cliente: record.cliente || '',
            produto: record.produto || '',
            sku: record.sku || '',
            unidades: record.unidades !== null && record.unidades !== undefined
                ? String(record.unidades).replace('.', ',')
                : '',
            tipo_caixa: record.tipo_caixa || '',
            qtd_fileiras: record.qtd_fileiras ?? 0,
            qtd_macos_fileira: record.qtd_macos_fileira ?? 0,
            qtd_por_maco: record.qtd_por_maco ?? 0,
            altura: record.altura ?? 0,
            observacao: record.observacao || ''
        });
        setIsEditOpen(true);
    };

    const closeEditModal = () => {
        setIsEditOpen(false);
        setEditingRecord(null);
        setEditForm(buildInitialEditForm());
    };

    const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        const isNumber = ['qtd_fileiras', 'qtd_macos_fileira', 'qtd_por_maco', 'altura'].includes(name);
        setEditForm(prev => ({
            ...prev,
            [name]: isNumber ? Number(value) : value
        }));
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingRecord) return;

        try {
            setSavingEdit(true);
            const payload = {
                op: editForm.op,
                cliente: editForm.cliente,
                produto: editForm.produto,
                sku: editForm.sku,
                unidades: parseDecimalInput(editForm.unidades),
                tipo_caixa: editForm.tipo_caixa,
                qtd_fileiras: editForm.qtd_fileiras,
                qtd_macos_fileira: editForm.qtd_macos_fileira,
                qtd_por_maco: editForm.qtd_por_maco,
                altura: editForm.altura,
                total_macos: totalMacos,
                total_itens: totalItens,
                observacao: editForm.observacao
            };

            const { error } = await supabase
                .from('producao_caixas')
                .update(payload)
                .eq('id', editingRecord.id);

            if (error) throw error;

            alert('Registro atualizado com sucesso!');
            closeEditModal();
            fetchRecords();
        } catch (error: any) {
            alert('Erro ao atualizar: ' + error.message);
        } finally {
            setSavingEdit(false);
        }
    };

    const handleDelete = async (record: ProductionRecord) => {
        if (!window.confirm(`Deseja excluir o registro da OP ${record.op}?`)) return;

        try {
            const { error } = await supabase
                .from('producao_caixas')
                .delete()
                .eq('id', record.id);

            if (error) throw error;

            alert('Registro excluido com sucesso!');
            fetchRecords();
        } catch (error: any) {
            alert('Erro ao excluir: ' + error.message);
        }
    };

    return (
        <div className="prod-list-container">
            <div className="list-header">
                <h2><ClipboardList size={24} /> Registros de Produção</h2>
                <div className="list-actions">
                    <div className="search-box">
                        <Search size={18} />
                        <input
                            placeholder="Buscar por OP, Cliente, Produto..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        className={`filter-btn ${showFilters ? 'active' : ''}`}
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        <Filter size={18} />
                        Filtrar
                    </button>
                    <button className="filter-btn" onClick={fetchRecords} title="Atualizar">
                        <Loader2 size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Filters Panel */}
            {showFilters && (
                <div className="filters-panel">
                    <div className="filter-group">
                        <label>Código Interno do Produto (SKU)</label>
                        <input
                            placeholder="Ex: SKU-001, COD-12345"
                            value={skuFilter}
                            onChange={(e) => setSkuFilter(e.target.value)}
                        />
                    </div>
                    <div className="filter-actions">
                        <button className="btn-clear" onClick={clearFilters}>
                            <X size={16} /> Limpar Filtros
                        </button>
                    </div>
                </div>
            )}

            <div className="table-container">
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>Carregando registros...</div>
                ) : (
                    <table className="prod-table">
                        <thead>
                            <tr>
                                <th>Data/Hora</th>
                                <th>OP</th>
                                <th>Cliente</th>
                                <th>Produto</th>
                                <th>SKU</th>
                                <th>Caixa</th>
                                <th>Maços</th>
                                <th>Itens</th>
                                <th>Observacao</th>
                                <th>Foto</th>
                                <th>Status</th>
                                <th className="actions-col">Acoes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRecords.length === 0 ? (
                                <tr>
                                    <td colSpan={12}>Nenhum registro encontrado.</td>
                                </tr>
                            ) : (
                                filteredRecords.map(record => (
                                    <tr key={record.id}>
                                        <td>{new Date(record.created_at).toLocaleTimeString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                                        <td className="font-mono">{record.op}</td>
                                        <td>{record.cliente}</td>
                                        <td>{record.produto}</td>
                                        <td className="font-mono">{record.sku || '-'}</td>
                                        <td>{record.tipo_caixa || '-'}</td>
                                        <td>{record.total_macos}</td>
                                        <td>{record.total_itens?.toLocaleString()}</td>
                                        <td className="obs-cell" title={record.observacao || undefined}>
                                            {record.observacao?.trim() ? record.observacao : '-'}
                                        </td>
                                        <td>
                                            {record.foto_url ? (
                                                <button
                                                    className="photo-btn with-preview"
                                                    onClick={() => setSelectedPhoto({
                                                        url: record.foto_url as string,
                                                        observacao: record.observacao,
                                                        op: record.op,
                                                        cliente: record.cliente,
                                                        produto: record.produto,
                                                        created_at: record.created_at
                                                    })}
                                                    title="Ver foto"
                                                >
                                                    <img
                                                        src={record.foto_url}
                                                        alt={`Foto do registro da OP ${record.op}`}
                                                        loading="lazy"
                                                    />
                                                    <span>Ver</span>
                                                </button>
                                            ) : (
                                                <span className="no-photo">Sem foto</span>
                                            )}
                                        </td>
                                        <td><span className="status-badge success">Concluido</span></td>
                                        <td className="actions-col">
                                            <div className="prod-row-actions">
                                                <button
                                                    className="action-icon-btn"
                                                    title="Visualizar"
                                                    onClick={() => setViewRecord(record)}
                                                >
                                                    <Eye size={16} />
                                                </button>
                                                <button
                                                    className="action-icon-btn"
                                                    title="Editar"
                                                    onClick={() => openEditModal(record)}
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                <button
                                                    className="action-icon-btn danger"
                                                    title="Excluir"
                                                    onClick={() => handleDelete(record)}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {viewRecord && (
                <div className="modal-overlay">
                    <div className="modal-content view-modal">
                        <div className="modal-header">
                            <h3>Visualizar Registro</h3>
                            <button onClick={() => setViewRecord(null)}><X size={20} /></button>
                        </div>

                        <div className="view-grid">
                            <div className="view-field">
                                <span className="meta-label">Data/Hora</span>
                                <span className="meta-value">
                                    {new Date(viewRecord.created_at).toLocaleString('pt-BR')}
                                </span>
                            </div>
                            <div className="view-field">
                                <span className="meta-label">OP</span>
                                <span className="meta-value">{viewRecord.op}</span>
                            </div>
                            <div className="view-field">
                                <span className="meta-label">Cliente</span>
                                <span className="meta-value">{viewRecord.cliente}</span>
                            </div>
                            <div className="view-field">
                                <span className="meta-label">Produto</span>
                                <span className="meta-value">{viewRecord.produto}</span>
                            </div>
                            <div className="view-field">
                                <span className="meta-label">SKU</span>
                                <span className="meta-value">{viewRecord.sku || '-'}</span>
                            </div>
                            <div className="view-field">
                                <span className="meta-label">Tipo de Caixa</span>
                                <span className="meta-value">{viewRecord.tipo_caixa || '-'}</span>
                            </div>
                            <div className="view-field">
                                <span className="meta-label">Maços</span>
                                <span className="meta-value">{viewRecord.total_macos}</span>
                            </div>
                            <div className="view-field">
                                <span className="meta-label">Itens</span>
                                <span className="meta-value">{viewRecord.total_itens?.toLocaleString()}</span>
                            </div>
                            <div className="view-field">
                                <span className="meta-label">Unidades extras</span>
                                <span className="meta-value">{viewRecord.unidades ?? '-'}</span>
                            </div>
                            <div className="view-field">
                                <span className="meta-label">Fileiras</span>
                                <span className="meta-value">{viewRecord.qtd_fileiras ?? '-'}</span>
                            </div>
                            <div className="view-field">
                                <span className="meta-label">Maços/Fileira</span>
                                <span className="meta-value">{viewRecord.qtd_macos_fileira ?? '-'}</span>
                            </div>
                            <div className="view-field">
                                <span className="meta-label">Qtd/Maço</span>
                                <span className="meta-value">{viewRecord.qtd_por_maco ?? '-'}</span>
                            </div>
                            <div className="view-field">
                                <span className="meta-label">Altura</span>
                                <span className="meta-value">{viewRecord.altura ?? '-'}</span>
                            </div>
                        </div>

                        <div className="view-observacao">
                            <span className="meta-label">Observacao</span>
                            <p>{viewRecord.observacao?.trim() ? viewRecord.observacao : 'Sem observacao'}</p>
                        </div>

                        <div className="view-photo-block">
                            <div className="view-photo-header">
                                <span className="meta-label">Foto</span>
                                {viewRecord.foto_url && (
                                    <button
                                        className="btn-orange"
                                        onClick={() => {
                                            setViewRecord(null);
                                            setSelectedPhoto({
                                                url: viewRecord.foto_url as string,
                                                observacao: viewRecord.observacao,
                                                op: viewRecord.op,
                                                cliente: viewRecord.cliente,
                                                produto: viewRecord.produto,
                                                created_at: viewRecord.created_at
                                            });
                                        }}
                                    >
                                        Ampliar
                                    </button>
                                )}
                            </div>
                            {viewRecord.foto_url ? (
                                <div className="view-photo-wrapper">
                                    <img src={viewRecord.foto_url} alt={`Foto da OP ${viewRecord.op}`} loading="lazy" />
                                </div>
                            ) : (
                                <div className="view-photo-placeholder">Sem foto anexada</div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isEditOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>Editar Registro</h3>
                            <button onClick={closeEditModal}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleUpdate}>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>OP *</label>
                                    <input
                                        name="op"
                                        required
                                        value={editForm.op}
                                        onChange={handleEditChange}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Cliente *</label>
                                    <input
                                        name="cliente"
                                        required
                                        value={editForm.cliente}
                                        onChange={handleEditChange}
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Produto *</label>
                                    <input
                                        name="produto"
                                        required
                                        value={editForm.produto}
                                        onChange={handleEditChange}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>SKU</label>
                                    <input
                                        name="sku"
                                        value={editForm.sku}
                                        onChange={handleEditChange}
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Tipo de Caixa</label>
                                    <input
                                        name="tipo_caixa"
                                        value={editForm.tipo_caixa}
                                        onChange={handleEditChange}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Fileiras</label>
                                    <input
                                        type="number"
                                        name="qtd_fileiras"
                                        value={editForm.qtd_fileiras}
                                        onChange={handleEditChange}
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Macos/Fileira</label>
                                    <input
                                        type="number"
                                        name="qtd_macos_fileira"
                                        value={editForm.qtd_macos_fileira}
                                        onChange={handleEditChange}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Qtd/Maco</label>
                                    <input
                                        type="number"
                                        name="qtd_por_maco"
                                        value={editForm.qtd_por_maco}
                                        onChange={handleEditChange}
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Altura</label>
                                    <input
                                        type="number"
                                        name="altura"
                                        value={editForm.altura}
                                        onChange={handleEditChange}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Total Macos</label>
                                    <input
                                        readOnly
                                        value={totalMacos}
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Unidades extras</label>
                                    <input
                                        name="unidades"
                                        placeholder="Ex: 25,5"
                                        value={editForm.unidades}
                                        onChange={handleEditChange}
                                        inputMode="decimal"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Total Itens</label>
                                    <input
                                        readOnly
                                        value={totalItens}
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Observacao</label>
                                    <textarea
                                        name="observacao"
                                        rows={3}
                                        value={editForm.observacao}
                                        onChange={handleEditChange}
                                    />
                                </div>
                            </div>

                            <div className="modal-actions">
                                <button type="button" className="btn-cancel" onClick={closeEditModal}>Cancelar</button>
                                <button type="submit" className="btn-orange" disabled={savingEdit}>
                                    {savingEdit ? 'Salvando...' : 'Salvar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Image Modal */}
            {selectedPhoto && (
                <div className="image-modal-overlay" onClick={() => setSelectedPhoto(null)}>
                    <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="close-modal" onClick={() => setSelectedPhoto(null)}>
                            <X size={24} />
                        </button>
                        <img
                            src={selectedPhoto.url}
                            alt={`Foto do registro da OP ${selectedPhoto.op}`}
                            loading="lazy"
                        />
                        <div className="photo-meta">
                            <div>
                                <span className="meta-label">OP</span>
                                <span className="meta-value">{selectedPhoto.op}</span>
                            </div>
                            <div>
                                <span className="meta-label">Produto</span>
                                <span className="meta-value">{selectedPhoto.produto}</span>
                            </div>
                            <div>
                                <span className="meta-label">Cliente</span>
                                <span className="meta-value">{selectedPhoto.cliente}</span>
                            </div>
                            <div>
                                <span className="meta-label">Data</span>
                                <span className="meta-value">
                                    {new Date(selectedPhoto.created_at).toLocaleString('pt-BR')}
                                </span>
                            </div>
                        </div>
                        {selectedPhoto.observacao?.trim() && (
                            <div className="photo-observacao">
                                <span className="meta-label">Observacao</span>
                                <p>{selectedPhoto.observacao}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};


export default ProductionList;
