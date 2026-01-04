import React, { useState, useEffect } from 'react';
import { Printer, X, LayoutTemplate, QrCode, Layers, Info, Search, Edit2, Package } from 'lucide-react';
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
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState<any[]>([]);

    // Form State
    const [labelData, setLabelData] = useState({
        op: '',
        client: '',
        product: '',
        sku: '',
        quantity: '',
        boxNumber: '1/10',
        date: new Date().toLocaleDateString('pt-BR'),
        especifico: {
            lote: '',
            peso: '',
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
            const { data, error } = await supabase
                .from('prod_etiquetas_historico')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setHistory(data || []);
        } catch (error) {
            console.error('Erro ao buscar histórico:', error);
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
        if (['lote', 'peso', 'destino', 'obs', 'operador', 'qtdCaixas', 'qtdPorCaixa'].includes(name)) {
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
        try {
            // 1. Abrir diálogo de impressão do sistema
            window.print();

            // 2. Salvar no histórico para auditoria/rastreabilidade
            const { error } = await supabase
                .from('prod_etiquetas_historico')
                .insert([{
                    tipo: labelType,
                    op: labelData.op,
                    cliente: labelType === 'info' ? '' : labelData.client,
                    produto: labelType === 'info' ? '' : labelData.product,
                    sku: labelData.sku,
                    quantidade: labelData.quantity,
                    volume: labelData.boxNumber,
                    data: labelData.date,
                    info_extra: labelData.especifico
                }]);

            if (error) {
                console.error('Erro ao salvar no histórico:', error);
            }
        } catch (err) {
            console.error('Falha no processo de impressão/registro:', err);
        }
    };

    const loadFromHistory = (item: any) => {
        setLabelType(item.tipo);
        setLabelData({
            op: item.op || '',
            client: item.cliente || '',
            product: item.produto || '',
            sku: item.sku || '',
            quantity: item.quantidade || '',
            boxNumber: item.volume || '',
            date: item.data || '',
            especifico: item.info_extra || { lote: '', peso: '', destino: '', obs: '' }
        });
        setActiveTab('new');
    };

    if (showBoxLabel) {
        return <BoxLabel onBack={() => setShowBoxLabel(false)} />;
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
                        onClick={() => setActiveTab('new')}
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
                                onClick={() => setLabelType('pallet')}
                            >
                                <Layers size={18} />
                                <span>Pallet</span>
                            </button>
                            <button
                                className={`model-option ${labelType === 'info' ? 'active' : ''}`}
                                onClick={() => setLabelType('info')}
                            >
                                <Info size={18} />
                                <span>Infor</span>
                            </button>
                            <button
                                className="model-option"
                                onClick={() => setShowBoxLabel(true)}
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
                                    <div className="form-group animate-fade-in-up delay-400">
                                        <label>Lote</label>
                                        <input name="lote" value={labelData.especifico.lote} onChange={handleChange} />
                                    </div>
                                    <div className="form-group animate-fade-in-up delay-400">
                                        <label>Peso Total</label>
                                        <input name="peso" value={labelData.especifico.peso} onChange={handleChange} />
                                    </div>
                                </div>
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

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div className="form-group animate-fade-in-up delay-500">
                                <label>SKU / Código</label>
                                <input name="sku" value={labelData.sku} onChange={handleChange} />
                            </div>
                            <div className="form-group animate-fade-in-up delay-500">
                                <label>Quantidade</label>
                                <input name="quantity" value={labelData.quantity} onChange={handleChange} />
                            </div>
                        </div>

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
                        <div className="form-group animate-fade-in-up">
                            <label>Pesquisar no Histórico</label>
                            <div style={{ position: 'relative' }}>
                                <input placeholder="Buscar por OP ou Cliente..." />
                                <Search size={16} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                            </div>
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
                {activeTab === 'new' ? (
                    <>
                        <div className="preview-header animate-fade-in-up">
                            <LayoutTemplate size={16} color="var(--kingraf-orange)" />
                            <span>Visualização: Etiquetas para {labelType.charAt(0).toUpperCase() + labelType.slice(1)}</span>
                        </div>

                        <div className={`label-mockup animate-scale-in model-${labelType}`} id="printable-label">
                            <div className="label-header">
                                <span className="label-title">Kingraf</span>
                                <span className="label-subtitle">
                                    {labelType === 'pallet' ? 'Controle de Paletização' : 'Identificação Geral'}
                                </span>
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
                                        <label>{labelType === 'pallet' ? 'LOTE' : 'OP'}</label>
                                        <div className="value">{labelType === 'pallet' ? (labelData.especifico.lote || '0000') : (labelData.op || '000000')}</div>
                                    </div>
                                    <div className="label-field" style={{ flex: 1 }}>
                                        <label>HORA</label>
                                        <div className="value">{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '25px' }}>
                                    <div className="label-field" style={{ flex: 1 }}>
                                        <label>{labelType === 'pallet' ? 'TOTAL PALLET' : 'QUANTIDADE'}</label>
                                        <div className="value" style={{ fontSize: '2.4rem' }}>{labelType === 'pallet' ? totalPallet() : (labelData.quantity || '0')}</div>
                                    </div>
                                    <div className="label-field" style={{ flex: 1 }}>
                                        <label>{labelType === 'pallet' ? 'CAIXAS' : 'DATA'}</label>
                                        <div className="value">{labelType === 'pallet' ? (labelData.especifico.qtdCaixas || '0') : labelData.date}</div>
                                    </div>
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
                                    <div className="value" style={{ fontSize: '1.8rem' }}>{labelData.boxNumber}</div>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="history-container animate-fade-in-up">
                        <div className="history-card">
                            <table className="history-table">
                                <thead>
                                    <tr>
                                        <th>Tipo</th>
                                        <th>OP / Ref</th>
                                        <th>Cliente / Destino</th>
                                        <th>Qtd</th>
                                        <th>Data</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={6} style={{ textAlign: 'center' }}>Carregando dados...</td></tr>
                                    ) : history.length === 0 ? (
                                        <tr><td colSpan={6} style={{ textAlign: 'center' }}>Nenhuma etiqueta encontrada.</td></tr>
                                    ) : (
                                        history.map((item: any) => (
                                            <tr key={item.id}>
                                                <td><span className={`label-type-tag tag-${item.tipo}`}>{item.tipo}</span></td>
                                                <td><strong>{item.op || item.sku}</strong></td>
                                                <td>{item.cliente || item.info_extra?.destino}</td>
                                                <td>{item.quantidade}</td>
                                                <td>{new Date(item.created_at).toLocaleDateString()}</td>
                                                <td style={{ display: 'flex', gap: '8px' }}>
                                                    <button className="action-btn-sm" onClick={() => loadFromHistory(item)} title="Editar/Re-imprimir">
                                                        <Edit2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>
        </div >
    );
};

export default LabelPrinter;
