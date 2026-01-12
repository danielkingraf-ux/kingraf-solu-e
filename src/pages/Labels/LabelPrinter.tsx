import React, { useEffect, useState } from 'react';
import { Printer, X, LayoutTemplate, QrCode, Layers, Info, Search, Edit2, Package, Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import './LabelPrinter.css';
import BoxLabel from './BoxLabel';

interface LabelPrinterProps {
    onBack: () => void;
}

const LabelPrinter: React.FC<LabelPrinterProps> = ({ onBack }) => {
    // UI State
    const [activeTab, setActiveTab] = useState<'new' | 'library'>('new');
    const [labelType, setLabelType] = useState<'pallet' | 'info'>('pallet');
    const [showBoxLabel, setShowBoxLabel] = useState(false);
    const [boxEditItem, setBoxEditItem] = useState<any | null>(null);
    const [savedId, setSavedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [libraryTab, setLibraryTab] = useState<'pallet' | 'info' | 'caixa'>('pallet');

    // Form State
    const [labelData, setLabelData] = useState({
        op: '',
        client: '',
        product: '',
        boxNumber: '1/10',
        date: new Date().toLocaleDateString('pt-BR'),
        especifico: {
            lote: '',
            destino: '',
            obs: '',
            operador: '',
            qtdCaixas: '',
            qtdPorCaixa: ''
        }
    });

    // Calculate total pallet quantity
    const totalPallet = () => {
        const caixas = parseInt(labelData.especifico.qtdCaixas) || 0;
        const porCaixa = parseInt(labelData.especifico.qtdPorCaixa) || 0;
        return caixas * porCaixa;
    };

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const [historicoResult, caixaResult] = await Promise.all([
                supabase
                    .from('prod_etiquetas_historico')
                    .select('*')
                    .order('created_at', { ascending: false }),
                supabase
                    .from('prod_etiquetas_caixa')
                    .select('*')
                    .order('created_at', { ascending: false })
            ]);

            if (historicoResult.error) throw historicoResult.error;
            if (caixaResult.error) throw caixaResult.error;

            const historicoItems = (historicoResult.data || []).map((item: any) => ({
                ...item,
                source: 'historico',
                raw: item
            }));

            const caixaItems = (caixaResult.data || []).map((item: any) => ({
                id: item.id,
                tipo: 'caixa',
                op: item.op,
                cliente: item.cliente,
                quantidade: item.quantidade,
                created_at: item.created_at,
                info_extra: {
                    lote: item.lote,
                    cli: item.cli,
                    laudo: item.laudo,
                    data_acabamento: item.data_acabamento,
                    validade: item.validade,
                    emissor: item.emissor,
                    operador: item.operador,
                    hora: item.hora,
                    range_start: item.range_start,
                    range_end: item.range_end,
                    range_total: item.range_total
                },
                source: 'caixa',
                raw: item
            }));

            const merged = [...historicoItems, ...caixaItems].sort(
                (a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
            );
            setHistory(merged);
        } catch (error) {
            console.error('Erro ao buscar historico:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'library') {
            fetchHistory();
        }
    }, [activeTab]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        if (['lote', 'destino', 'obs', 'operador', 'qtdCaixas', 'qtdPorCaixa'].includes(name)) {
            setLabelData((prev: any) => ({
                ...prev,
                especifico: { ...prev.especifico, [name]: value }
            }));
        } else {
            setLabelData((prev: any) => ({
                ...prev,
                [name]: value
            }));
        }
    };

    const handlePrint = async () => {
        if (!labelData.op) {
            alert('Por favor, preencha a OP antes de salvar.');
            return;
        }

        const quantidade = labelType === 'pallet'
            ? String(totalPallet())
            : null;

        try {
            // 1. Salvar no historico para auditoria/rastreabilidade
            const payload = {
                tipo: labelType,
                op: labelData.op,
                cliente: labelType === 'info' ? '' : labelData.client,
                produto: labelType === 'info' ? '' : labelData.product,
                quantidade,
                volume: labelData.boxNumber,
                data: labelData.date,
                info_extra: labelData.especifico
            };

            let error;
            let insertedId: string | undefined;
            if (savedId) {
                const result = await supabase
                    .from('prod_etiquetas_historico')
                    .update(payload)
                    .eq('id', savedId);
                error = result.error;
            } else {
                const result = await supabase
                    .from('prod_etiquetas_historico')
                    .insert([payload])
                    .select('id');
                error = result.error;
                insertedId = result.data?.[0]?.id;
            }

            if (!savedId && insertedId) {
                setSavedId(insertedId);
            }

            if (error) {
                console.error('Erro ao salvar no historico:', error);
                alert(`Erro ao salvar a etiqueta: ${error.message || error.code || 'Erro desconhecido'}`);
                return;
            }

            // 2. Abrir dialogo de impressao do sistema
            window.print();
        } catch (err: any) {
            console.error('Falha no processo de impressao/registro:', err);
            alert(`Erro ao salvar a etiqueta: ${err?.message || 'Erro desconhecido'}`);
        }
    };

    const loadFromHistory = (item: any, forEdit = false) => {
        setLabelType(item.tipo);
        setLabelData({
            op: item.op || '',
            client: item.cliente || '',
            product: item.produto || '',
            boxNumber: item.volume || '',
            date: item.data || '',
            especifico: item.info_extra || { lote: '', destino: '', obs: '' }
        });
        setSavedId(forEdit ? item.id : null);
        setActiveTab('new');
    };

    const handleEdit = (item: any) => {
        if (item.source === 'caixa') {
            setBoxEditItem(item.raw);
            setShowBoxLabel(true);
            return;
        }
        loadFromHistory(item.raw || item, true);
    };

    const handleDelete = async (item: any) => {
        if (!confirm('Tem certeza que deseja excluir esta etiqueta?')) return;
        try {
            const table = item.source === 'caixa' ? 'prod_etiquetas_caixa' : 'prod_etiquetas_historico';
            const { error } = await supabase
                .from(table)
                .delete()
                .eq('id', item.id);
            if (error) throw error;
            setHistory(prev => prev.filter(entry => !(entry.id === item.id && entry.source === item.source)));
            alert('Etiqueta excluida com sucesso!');
        } catch (error) {
            console.error('Erro ao excluir:', error);
            alert('Erro ao excluir a etiqueta.');
        }
    };

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const typeHistory = history.filter((item: any) => item.tipo === libraryTab);
    const filteredHistory = normalizedSearch
        ? typeHistory.filter((item: any) => {
            const haystack = [
                item.tipo,
                item.op,
                item.cliente,
                item.info_extra?.destino
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            return haystack.includes(normalizedSearch);
        })
        : typeHistory;

    if (showBoxLabel) {
        return (
            <BoxLabel
                onBack={() => {
                    setShowBoxLabel(false);
                    setBoxEditItem(null);
                }}
                initialItem={boxEditItem || undefined}
            />
        );
    }

    // Pallet and Info labels both render in the main mockup view

    return (
        <div className="label-printer-container">
            <aside className="label-sidebar animate-slide-in-right">
                <div className="sidebar-header">
                    <button className="back-btn-icon" onClick={onBack} title="Voltar">
                        <X size={20} color="#FFFFFF" />
                    </button>
                    <h2>Etiquetas</h2>
                </div>

                <div className="tabs-header">
                    <button
                        className={`tab-btn ${activeTab === 'new' ? 'active' : ''}`}
                        onClick={() => {
                            setSavedId(null);
                            setActiveTab('new');
                        }}
                    >
                        Nova Etiqueta
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'library' ? 'active' : ''}`}
                        onClick={() => setActiveTab('library')}
                    >
                        Biblioteca
                    </button>
                </div>

                {activeTab === 'new' ? (
                    <div className="sidebar-content">
                        <div className="model-selector animate-fade-in-up" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                            <button
                                className={`model-option ${labelType === 'pallet' ? 'active' : ''}`}
                                onClick={() => {
                                    setSavedId(null);
                                    setLabelType('pallet');
                                }}
                            >
                                <Layers size={18} />
                                <span>Pallet</span>
                            </button>
                            <button
                                className={`model-option ${labelType === 'info' ? 'active' : ''}`}
                                onClick={() => {
                                    setSavedId(null);
                                    setLabelType('info');
                                }}
                            >
                                <Info size={18} />
                                <span>Infor</span>
                            </button>
                            <button
                                className="model-option"
                                onClick={() => {
                                    setSavedId(null);
                                    setShowBoxLabel(true);
                                }}
                            >
                                <Package size={18} />
                                <span>8x Caixa</span>
                            </button>
                        </div>

                        <div className="form-group animate-fade-in-up delay-100">
                            <label>Ordem de Produção (OP)</label>
                            <input name="op" value={labelData.op} onChange={handleChange} placeholder="Ex: 123456" />
                        </div>

                        {labelType !== 'info' && (
                            <>
                                <div className="form-group animate-fade-in-up delay-200">
                                    <label>Cliente</label>
                                    <input name="client" value={labelData.client} onChange={handleChange} />
                                </div>
                                <div className="form-group animate-fade-in-up delay-300">
                                    <label>Produto</label>
                                    <input name="product" value={labelData.product} onChange={handleChange} />
                                </div>
                            </>
                        )}

                        {labelType === 'pallet' && (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div className="form-group animate-fade-in-up delay-450">
                                        <label>Qtd. Caixas</label>
                                        <input type="number" name="qtdCaixas" value={labelData.especifico.qtdCaixas} onChange={handleChange} placeholder="Nº de caixas" />
                                    </div>
                                    <div className="form-group animate-fade-in-up delay-450">
                                        <label>Qtd. por Caixa</label>
                                        <input type="number" name="qtdPorCaixa" value={labelData.especifico.qtdPorCaixa} onChange={handleChange} placeholder="Unidades" />
                                    </div>
                                </div>
                                <div className="form-group animate-fade-in-up delay-480" style={{ background: 'rgba(255, 92, 0, 0.1)', padding: '12px', borderRadius: '12px', textAlign: 'center' }}>
                                    <label style={{ color: 'var(--kingraf-orange)' }}>Total no Pallet</label>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#FFF' }}>{totalPallet()} unidades</div>
                                </div>
                                <div className="form-group animate-fade-in-up delay-500">
                                    <label>Operador</label>
                                    <input name="operador" value={labelData.especifico.operador} onChange={handleChange} placeholder="Nome do operador" />
                                </div>
                            </>
                        )}

                        {labelType === 'info' && (
                            <div className="form-group animate-fade-in-up delay-200">
                                <label>Destino / Setor</label>
                                <input name="destino" value={labelData.especifico.destino} onChange={handleChange} />
                            </div>
                        )}

                        {labelType === 'info' && (
                            <div className="form-group animate-fade-in-up delay-600">
                                <label>Observações</label>
                                <input name="obs" value={labelData.especifico.obs} onChange={handleChange} />
                            </div>
                        )}

                        <div className="form-group animate-fade-in-up delay-600">
                            <label>Numeração / Volume</label>
                            <input name="boxNumber" value={labelData.boxNumber} onChange={handleChange} />
                        </div>


                    </div>
                ) : (
                    <div className="sidebar-content">
                        <div className="tabs-header">
                            <button
                                className={`tab-btn ${libraryTab === 'pallet' ? 'active' : ''}`}
                                onClick={() => setLibraryTab('pallet')}
                            >
                                Pallet
                            </button>
                            <button
                                className={`tab-btn ${libraryTab === 'info' ? 'active' : ''}`}
                                onClick={() => setLibraryTab('info')}
                            >
                                Infor
                            </button>
                            <button
                                className={`tab-btn ${libraryTab === 'caixa' ? 'active' : ''}`}
                                onClick={() => setLibraryTab('caixa')}
                            >
                                Caixa
                            </button>
                        </div>

                        <div className="search-section">
                            <h3 className="section-title">Buscar</h3>
                            <div className="search-row">
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="Buscar por OP, cliente ou destino..."
                                    onKeyDown={(e) => e.key === 'Enter' && fetchHistory()}
                                />
                                <button className="search-btn" onClick={fetchHistory} title="Atualizar lista">
                                    <Search size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="archive-list">
                            {loading ? (
                                <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</p>
                            ) : filteredHistory.length === 0 ? (
                                <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Nenhuma etiqueta encontrada.</p>
                            ) : (
                                filteredHistory.map((item: any) => {
                                    const reference = item.op || item.volume || '---';
                                    const description = item.cliente || item.info_extra?.destino || 'Sem cliente/destino';
                                    const detail = item.tipo === 'caixa'
                                        ? `Seq: ${item.info_extra?.range_start || '-'} - ${item.info_extra?.range_end || '-'}`
                                        : `Volume: ${item.volume || '---'}`;

                                    return (
                                        <div key={`${item.source}-${item.id}`} className="archive-item" onClick={() => handleEdit(item)}>
                                            <div className="archive-item-header">
                                                <div className="archive-item-title">
                                                    <strong>OP: {reference}</strong>
                                                    <span className={`label-type-tag tag-${item.tipo}`}>{item.tipo}</span>
                                                </div>
                                                <div className="archive-item-meta">
                                                    <span className="archive-date">{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                                                    <div className="archive-item-actions">
                                                        <button
                                                            className="action-btn-sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleEdit(item);
                                                            }}
                                                            title="Editar/Re-imprimir"
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        <button
                                                            className="action-btn-sm delete"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDelete(item);
                                                            }}
                                                            title="Excluir"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="archive-item-body">
                                                <span>{description}</span>
                                                <span>{item.produto || 'Sem produto'}</span>
                                            </div>
                                            <div className="archive-item-footer">
                                                <span>{detail}</span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                <div className="sidebar-footer">
                    <button className="print-btn" onClick={activeTab === 'new' ? handlePrint : fetchHistory}>
                        <Printer size={20} />
                        {activeTab === 'new' ? 'Imprimir e Salvar' : 'Atualizar Lista'}
                    </button>
                </div>
            </aside>

            <main className="label-preview-area">
                <div className="preview-header animate-fade-in-up">
                    <LayoutTemplate size={16} color="var(--kingraf-orange)" />
                    <span>Visualização: Etiquetas para {labelType.charAt(0).toUpperCase() + labelType.slice(1)}</span>
                </div>

                <div className={`label-mockup a4-page-preview animate-scale-in model-${labelType}`} id="printable-label">
                    <div className="label-header">
                        <div className="label-brand-box">
                            <span className="label-title">Kingraf</span>
                            <span className="label-subtitle">
                                {labelType === 'pallet' ? 'Controle de Paletização' : 'Identificação Geral'}
                            </span>
                        </div>
                        <div className="qr-placeholder">
                            <QrCode size={40} strokeWidth={2.5} />
                        </div>
                    </div>

                    <div className="label-content">
                        {labelType === 'info' ? (
                            <>
                                <div className="label-field large">
                                    <label>DESTINO / SETOR</label>
                                    <div className="value">{labelData.especifico.destino || 'SETOR DE LOGÍSTICA'}</div>
                                </div>
                                <div className="label-field large">
                                    <label>CONTEÚDO / OBS</label>
                                    <div className="value">{labelData.especifico.obs || 'INFORMAÇÃO DE CONTROLE'}</div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="label-field large">
                                    <label>CLIENTE</label>
                                    <div className="value">{labelData.client || 'CLIENTE MODELO LTDA'}</div>
                                </div>
                                <div className="label-field large">
                                    <label>PRODUTO</label>
                                    <div className="value">{labelData.product || 'CAIXA DE PAPELÃO PADRÃO'}</div>
                                </div>
                            </>
                        )}

                        <div style={{ display: 'flex', gap: '25px' }}>
                            <div className="label-field" style={{ flex: 1 }}>
                                <label>OP / ORDEM</label>
                                <div className="value">{labelData.op || '000000'}</div>
                            </div>
                            {labelType === 'pallet' && (
                                <div className="label-field" style={{ flex: 1 }}>
                                    <label>LOTE</label>
                                    <div className="value">{labelData.especifico.lote || '0000'}</div>
                                </div>
                            )}
                            <div className="label-field" style={{ flex: 0.8 }}>
                                <label>HORA</label>
                                <div className="value">{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '25px', justifyContent: labelType === 'pallet' ? 'flex-start' : 'center' }}>
                            {labelType === 'pallet' && (
                                <div className="label-field" style={{ flex: 1 }}>
                                    <label>TOTAL PALLET</label>
                                    <div className="value" style={{ fontSize: '3.4rem' }}>{totalPallet()}</div>
                                </div>
                            )}
                            <div className="label-field" style={labelType === 'pallet' ? { flex: 1 } : { width: '60%', textAlign: 'center' }}>
                                <label>{labelType === 'pallet' ? 'CAIXAS' : 'DATA'}</label>
                                <div className="value" style={{ fontSize: '3.4rem' }}>{labelType === 'pallet' ? (labelData.especifico.qtdCaixas || '0') : labelData.date}</div>
                            </div>
                            {labelType === 'pallet' && (
                                <div className="label-field" style={{ flex: 1 }}>
                                    <label>QTD POR CAIXA</label>
                                    <div className="value" style={{ fontSize: '3.4rem' }}>{labelData.especifico.qtdPorCaixa || '0'}</div>
                                </div>
                            )}
                        </div>

                        {labelType === 'pallet' && (
                            <div style={{ display: 'flex', gap: '25px' }}>
                                <div className="label-field" style={{ flex: 1 }}>
                                    <label>OPERADOR</label>
                                    <div className="value">{labelData.especifico.operador || '---'}</div>
                                </div>
                                <div className="label-field" style={{ flex: 1 }}>
                                    <label>DATA</label>
                                    <div className="value">{labelData.date}</div>
                                </div>
                            </div>
                        )}

                        <div className="label-field" style={{ flex: 1 }}>
                            <label>VOLUME / SEQUÊNCIA</label>
                            <div className="value" style={{ fontSize: '3.4rem' }}>{labelData.boxNumber}</div>
                        </div>
                    </div>
                </div>
            </main>
        </div >
    );
};

export default LabelPrinter;
