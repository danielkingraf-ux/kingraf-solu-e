import React, { useState, useEffect } from 'react';
import { Printer, X, Copy, Save, Search, Archive } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import './BoxLabel.css';

interface BoxLabelProps {
    onBack: () => void;
}

interface LabelData {
    cliente: string;
    produto: string;
    cli: string;
    quantidade: string;
    lote: string;
    opOf: string;
    dataAcabamento: string;
    validade: string;
    laudo: string;
    emissor: string;
    operador: string;
    hora: string;
}

const BoxLabel: React.FC<BoxLabelProps> = ({ onBack }) => {
    const [range, setRange] = useState({ start: 1, end: 8, total: 8 });
    const [validityMonths, setValidityMonths] = useState<string>('');
    const [isTimeManual, setIsTimeManual] = useState(false);
    const [activeTab, setActiveTab] = useState<'nova' | 'arquivo'>('nova');
    const [searchOP, setSearchOP] = useState('');
    const [archivedLabels, setArchivedLabels] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [labelData, setLabelData] = useState<LabelData>({
        cliente: '',
        produto: '',
        cli: '',
        quantidade: '',
        lote: '',
        opOf: '',
        dataAcabamento: new Date().toLocaleDateString('pt-BR'),
        validade: '',
        laudo: '',
        emissor: '',
        operador: '',
        hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    });

    // Update time automatically if not manual
    useEffect(() => {
        if (isTimeManual) return;

        const timer = setInterval(() => {
            const now = new Date();
            setLabelData(prev => ({
                ...prev,
                dataAcabamento: now.toLocaleDateString('pt-BR'),
                hora: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            }));
        }, 30000); // Check every 30 seconds

        return () => clearInterval(timer);
    }, [isTimeManual]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;

        if (name === 'hora' || name === 'dataAcabamento') {
            setIsTimeManual(true);
        }

        setLabelData(prev => ({ ...prev, [name]: value }));
    };

    const handleValidityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const months = e.target.value;
        setValidityMonths(months);

        if (months) {
            const [day, month, year] = labelData.dataAcabamento.split('/').map(Number);
            const date = new Date(year, month - 1, day);
            date.setMonth(date.getMonth() + parseInt(months));

            setLabelData(prev => ({
                ...prev,
                validade: date.toLocaleDateString('pt-BR')
            }));
        }
    };

    const handlePrint = () => {
        window.print();
    };

    // Save labels to database
    const handleSave = async () => {
        if (!labelData.opOf) {
            alert('Por favor, preencha o número da OP/OF antes de salvar.');
            return;
        }
        try {
            setLoading(true);
            const insertData = {
                op: labelData.opOf,
                cliente: labelData.cliente || null,
                produto: labelData.produto || null,
                cli: labelData.cli || null,
                quantidade: labelData.quantidade || null,
                lote: labelData.lote || null,
                data_acabamento: labelData.dataAcabamento || null,
                validade: labelData.validade || null,
                laudo: labelData.laudo || null,
                emissor: labelData.emissor || null,
                operador: labelData.operador || null,
                hora: labelData.hora || null,
                range_start: range.start,
                range_end: range.end,
                range_total: range.total
            };
            console.log('Salvando dados:', insertData);
            const { error } = await supabase.from('prod_etiquetas_caixa').insert(insertData);
            if (error) {
                console.error('Erro Supabase:', error);
                alert(`Erro: ${error.message || error.code || 'Erro desconhecido'}`);
                return;
            }
            alert('Etiquetas arquivadas com sucesso!');
        } catch (error: any) {
            console.error('Erro ao salvar:', error);
            alert(`Erro ao salvar: ${error?.message || 'Erro desconhecido'}`);
        } finally {
            setLoading(false);
        }
    };

    // Search archived labels by OP
    const handleSearch = async () => {
        try {
            setLoading(true);
            let query = supabase.from('prod_etiquetas_caixa').select('*').order('created_at', { ascending: false });
            if (searchOP) {
                query = query.ilike('op', `%${searchOP}%`);
            }
            const { data, error } = await query.limit(50);
            if (error) throw error;
            setArchivedLabels(data || []);
        } catch (error) {
            console.error('Erro ao buscar:', error);
        } finally {
            setLoading(false);
        }
    };

    // Load from archive into form
    const loadFromArchive = (item: any) => {
        setLabelData({
            cliente: item.cliente || '',
            produto: item.produto || '',
            cli: item.cli || '',
            quantidade: item.quantidade || '',
            lote: item.lote || '',
            opOf: item.op || '',
            dataAcabamento: item.data_acabamento || '',
            validade: item.validade || '',
            laudo: item.laudo || '',
            emissor: item.emissor || '',
            operador: item.operador || '',
            hora: item.hora || ''
        });
        setRange({
            start: item.range_start || 1,
            end: item.range_end || 8,
            total: item.range_total || 8
        });
        setActiveTab('nova');
    };

    // Load archived when switching to archive tab
    useEffect(() => {
        if (activeTab === 'arquivo') {
            handleSearch();
        }
    }, [activeTab]);

    const handleRangeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setRange(prev => ({ ...prev, [name]: parseInt(value) || 0 }));
    };

    // Generate array of labels based on range
    const start = Math.min(range.start, range.end);
    const end = Math.max(range.start, range.end);
    const labelsArray = Array.from({ length: Math.min(end - start + 1, 100) }, (_, i) => start + i);

    return (
        <div className="box-label-container">
            <aside className="box-label-sidebar">
                <div className="sidebar-header">
                    <button className="back-btn-icon" onClick={onBack} title="Voltar">
                        <X size={20} color="#FFFFFF" />
                    </button>
                    <h2>Etiqueta de Caixa</h2>
                </div>

                <div className="tabs-header">
                    <button
                        className={`tab-btn ${activeTab === 'nova' ? 'active' : ''}`}
                        onClick={() => setActiveTab('nova')}
                    >
                        Nova Etiqueta
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'arquivo' ? 'active' : ''}`}
                        onClick={() => setActiveTab('arquivo')}
                    >
                        <Archive size={14} /> Arquivo
                    </button>
                </div>

                {activeTab === 'nova' ? (
                    <div className="sidebar-content">
                        <div className="form-section">
                            <h3 className="section-title">Informações do Produto</h3>

                            <div className="form-group">
                                <label>Cliente</label>
                                <input
                                    name="cliente"
                                    value={labelData.cliente}
                                    onChange={handleChange}
                                    placeholder="Nome do cliente"
                                />
                            </div>

                            <div className="form-group">
                                <label>Produto</label>
                                <input
                                    name="produto"
                                    value={labelData.produto}
                                    onChange={handleChange}
                                    placeholder="Descrição do produto"
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>CLI (Código)</label>
                                    <input
                                        name="cli"
                                        value={labelData.cli}
                                        onChange={handleChange}
                                        placeholder="CLI"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Quantidade</label>
                                    <input
                                        name="quantidade"
                                        value={labelData.quantidade}
                                        onChange={handleChange}
                                        placeholder="0"
                                    />
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Lote</label>
                                    <input
                                        name="lote"
                                        value={labelData.lote}
                                        onChange={handleChange}
                                        placeholder="Nº Lote"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>OP/OF</label>
                                    <input
                                        name="opOf"
                                        value={labelData.opOf}
                                        onChange={handleChange}
                                        placeholder="Nº OP/OF"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="form-section">
                            <h3 className="section-title">Datas e Controle</h3>

                            <div className="form-group">
                                <label>Laudo</label>
                                <input
                                    name="laudo"
                                    value={labelData.laudo}
                                    onChange={handleChange}
                                    placeholder="Nº do Laudo"
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Validade (Meses)</label>
                                    <select
                                        className="registry-select"
                                        value={validityMonths}
                                        onChange={handleValidityChange}
                                    >
                                        <option value="">Manual...</option>
                                        <option value="1">1 Mês</option>
                                        <option value="3">3 Meses</option>
                                        <option value="6">6 Meses</option>
                                        <option value="12">12 Meses</option>
                                        <option value="24">24 Meses</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Validade (Data)</label>
                                    <input
                                        name="validade"
                                        value={labelData.validade}
                                        onChange={handleChange}
                                        placeholder="DD/MM/AAAA"
                                        className="highlight-input"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="form-section">
                            <h3 className="section-title">Traceabilidade</h3>

                            <div className="form-group">
                                <label>Emissor</label>
                                <input
                                    name="emissor"
                                    value={labelData.emissor}
                                    onChange={handleChange}
                                    placeholder="Nome do emissor"
                                />
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Operador</label>
                                    <input
                                        name="operador"
                                        value={labelData.operador}
                                        onChange={handleChange}
                                        placeholder="Nome do operador"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Hora</label>
                                    <input
                                        name="hora"
                                        value={labelData.hora}
                                        onChange={handleChange}
                                        placeholder="HH:MM"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="form-section">
                            <h3 className="section-title">Opções de Impressão</h3>

                            <div className="range-control">
                                <div className="form-group">
                                    <label>Início</label>
                                    <input
                                        type="number"
                                        name="start"
                                        value={range.start}
                                        onChange={handleRangeChange}
                                        min="1"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Fim</label>
                                    <input
                                        type="number"
                                        name="end"
                                        value={range.end}
                                        onChange={handleRangeChange}
                                        min="1"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Total</label>
                                    <input
                                        type="number"
                                        name="total"
                                        value={range.total}
                                        onChange={handleRangeChange}
                                        min="1"
                                    />
                                </div>
                            </div>
                            <p className="copies-hint">Máx. 8 etiquetas por página A4</p>
                        </div>
                    </div>
                ) : (
                    <div className="sidebar-content">
                        <div className="search-section">
                            <h3 className="section-title">Buscar por OP</h3>
                            <div className="search-row">
                                <input
                                    type="text"
                                    value={searchOP}
                                    onChange={(e) => setSearchOP(e.target.value)}
                                    placeholder="Digite o número da OP..."
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                />
                                <button className="search-btn" onClick={handleSearch}>
                                    <Search size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="archive-list">
                            {loading ? (
                                <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Carregando...</p>
                            ) : archivedLabels.length === 0 ? (
                                <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Nenhuma etiqueta encontrada.</p>
                            ) : (
                                archivedLabels.map((item: any) => (
                                    <div key={item.id} className="archive-item" onClick={() => loadFromArchive(item)}>
                                        <div className="archive-item-header">
                                            <strong>OP: {item.op}</strong>
                                            <span className="archive-date">{new Date(item.created_at).toLocaleDateString('pt-BR')}</span>
                                        </div>
                                        <div className="archive-item-body">
                                            <span>{item.cliente || 'Sem cliente'}</span>
                                            <span>{item.produto || 'Sem produto'}</span>
                                        </div>
                                        <div className="archive-item-footer">
                                            <span>Seq: {item.range_start} - {item.range_end}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                <div className="sidebar-footer">
                    {activeTab === 'nova' && (
                        <button className="save-btn" onClick={handleSave} disabled={loading}>
                            <Save size={20} />
                            {loading ? 'Salvando...' : 'Arquivar'}
                        </button>
                    )}
                    <button className="print-btn" onClick={handlePrint}>
                        <Printer size={20} />
                        Imprimir Etiquetas
                    </button>
                </div>
            </aside>

            <main className="box-label-preview-area">
                <div className="preview-header">
                    <Copy size={16} color="var(--kingraf-orange)" />
                    <span>Pré-visualização: {labelsArray.length} etiqueta(s) (Sequência: {start} a {end})</span>
                </div>

                <div className="a4-page-preview">
                    <div className="labels-grid" id="printable-labels">
                        {labelsArray.map((num) => (
                            <div key={num} className="box-label-item">
                                <div className="label-brand">
                                    <span className="brand-name">KINGRAF</span>
                                    <span className="brand-subtitle">Indústria Gráfica</span>
                                </div>

                                <div className="label-main-content">
                                    <div className="label-field-row">
                                        <div className="label-field full">
                                            <span className="field-label">CLIENTE</span>
                                            <span className="field-value">{labelData.cliente || '---'}</span>
                                        </div>
                                    </div>

                                    <div className="label-field-row">
                                        <div className="label-field full">
                                            <span className="field-label">PRODUTO</span>
                                            <span className="field-value">{labelData.produto || '---'}</span>
                                        </div>
                                    </div>

                                    <div className="label-field-row three-cols">
                                        <div className="label-field">
                                            <span className="field-label">CLI</span>
                                            <span className="field-value compact">{labelData.cli || '---'}</span>
                                        </div>
                                        <div className="label-field">
                                            <span className="field-label">QTD</span>
                                            <span className="field-value compact">{labelData.quantidade || '0'}</span>
                                        </div>
                                        <div className="label-field">
                                            <span className="field-label">LOTE</span>
                                            <span className="field-value compact">{labelData.lote || '---'}</span>
                                        </div>
                                    </div>

                                    <div className="label-field-row three-cols">
                                        <div className="label-field">
                                            <span className="field-label">OP/OF</span>
                                            <span className="field-value compact">{labelData.opOf || '---'}</span>
                                        </div>
                                        <div className="label-field">
                                            <span className="field-label">LAUDO</span>
                                            <span className="field-value compact">{labelData.laudo || '---'}</span>
                                        </div>
                                        <div className="label-field highlight">
                                            <span className="field-label">VALIDADE</span>
                                            <span className="field-value compact">{labelData.validade || '---'}</span>
                                        </div>
                                    </div>

                                    <div className="label-field-row two-cols">
                                        <div className="label-field">
                                            <span className="field-label">EMISSOR</span>
                                            <span className="field-value compact">{labelData.emissor || '---'}</span>
                                        </div>
                                        <div className="label-field">
                                            <span className="field-label">OPERADOR</span>
                                            <span className="field-value compact">{labelData.operador || '---'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="label-footer-info">
                                    <div className="sequence-display">
                                        ETIQUETA: <span className="sequence-number">{num}</span>
                                    </div>
                                    <div className="time-display">
                                        DATA/HORA: {labelData.dataAcabamento} {labelData.hora}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default BoxLabel;
