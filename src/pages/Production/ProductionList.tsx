import React, { useState, useEffect } from 'react';
import { Search, Filter, ClipboardList, Loader2, Image, X } from 'lucide-react';
import './ProductionList.css';
import { supabase } from '../../supabaseClient';

// Data type based on Supabase table
interface ProductionRecord {
    id: string;
    op: string;
    cliente: string;
    produto: string;
    sku: string;
    tipo_caixa: string;
    total_macos: number;
    total_itens: number;
    foto_url: string | null;
    created_at: string;
}

const ProductionList: React.FC = () => {
    const [records, setRecords] = useState<ProductionRecord[]>([]);
    const [filteredRecords, setFilteredRecords] = useState<ProductionRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [skuFilter, setSkuFilter] = useState('');
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    useEffect(() => {
        fetchRecords();
    }, []);

    useEffect(() => {
        filterRecords();
    }, [searchTerm, skuFilter, records]);

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
                setFilteredRecords(data as ProductionRecord[]);
            }
        } catch (error) {
            console.error('Erro ao buscar registros:', error);
        } finally {
            setLoading(false);
        }
    };

    const filterRecords = () => {
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

        setFilteredRecords(filtered);
    };

    const clearFilters = () => {
        setSearchTerm('');
        setSkuFilter('');
        setShowFilters(false);
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
                                <th>Foto</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRecords.length === 0 ? (
                                <tr>
                                    <td colSpan={10}>Nenhum registro encontrado.</td>
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
                                        <td>
                                            {record.foto_url ? (
                                                <button
                                                    className="photo-btn"
                                                    onClick={() => setSelectedImage(record.foto_url)}
                                                    title="Ver foto"
                                                >
                                                    <Image size={18} />
                                                </button>
                                            ) : (
                                                <span className="no-photo">-</span>
                                            )}
                                        </td>
                                        <td><span className="status-badge success">Concluído</span></td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Image Modal */}
            {selectedImage && (
                <div className="image-modal-overlay" onClick={() => setSelectedImage(null)}>
                    <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="close-modal" onClick={() => setSelectedImage(null)}>
                            <X size={24} />
                        </button>
                        <img src={selectedImage} alt="Foto da disposição" />
                    </div>
                </div>
            )}
        </div>
    );
};


export default ProductionList;
