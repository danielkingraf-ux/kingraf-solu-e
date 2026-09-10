import React, { useState, useEffect } from 'react';
import { Printer, X, Copy, Save, Search, Archive, Plus, Loader2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { buscarDadosOP, obterLoteDaOP, gerarNovoLaudo, type Laudo } from './lotesLaudos';
import './BoxLabel.css';

interface BoxLabelProps {
    onBack: () => void;
    initialItem?: any;
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

const mensagemErro = (erro: unknown, padrao: string) =>
    erro instanceof Error && erro.message ? erro.message : padrao;

const BoxLabel: React.FC<BoxLabelProps> = ({ onBack, initialItem }) => {
    const [range, setRange] = useState({ start: 1, end: 8, total: 8 });
    const [validityMonths, setValidityMonths] = useState<string>('');
    const [isTimeManual, setIsTimeManual] = useState(false);
    const [activeTab, setActiveTab] = useState<'nova' | 'arquivo'>('nova');
    const [searchOP, setSearchOP] = useState('');
    const [archivedLabels, setArchivedLabels] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [savedId, setSavedId] = useState<string | null>(null);
    // Lote e laudo vem do banco, nunca digitados: ver lotesLaudos.ts
    const [laudos, setLaudos] = useState<Laudo[]>([]);
    const [laudoId, setLaudoId] = useState<string | null>(null);
    const [opBusy, setOpBusy] = useState(false);
    const [opErro, setOpErro] = useState<string | null>(null);
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

    // Ao sair do campo OP: puxa o lote da OP (alocando na primeira vez) e
    // lista as entregas ja abertas, para reimpressao nao consumir laudo novo.
    const handleOPBlur = async () => {
        const op = labelData.opOf.trim().toUpperCase();
        if (!op) return;

        setOpBusy(true);
        setOpErro(null);
        try {
            const dados = await buscarDadosOP(op);
            const lote = dados
                ? dados.lote
                : await obterLoteDaOP(op, labelData.cliente, labelData.produto);
            const listaLaudos = dados?.laudos ?? [];

            // A ultima entrega e a que costuma estar sendo impressa.
            const atual = listaLaudos[listaLaudos.length - 1] ?? null;

            setLaudos(listaLaudos);
            setLaudoId(atual?.id ?? null);
            setLabelData(prev => ({
                ...prev,
                opOf: op,
                lote: String(lote),
                laudo: atual ? String(atual.laudo) : '',
                cliente: prev.cliente || dados?.cliente || '',
                produto: prev.produto || dados?.produto || ''
            }));
        } catch (error) {
            console.error('Erro ao carregar lote/laudo da OP:', error);
            setOpErro(mensagemErro(error, 'Nao foi possivel carregar o lote desta OP.'));
        } finally {
            setOpBusy(false);
        }
    };

    // Abre uma nova entrega da OP. Consome um numero de laudo — usar apenas
    // quando for de fato uma remessa nova, nao para reimprimir.
    const handleNovoLaudo = async () => {
        const op = labelData.opOf.trim().toUpperCase();
        if (!op) {
            alert('Preencha a OP/OF antes de gerar o laudo.');
            return;
        }
        const entrega = laudos.length + 1;
        if (!confirm(`Gerar o laudo da ${entrega}a entrega da OP ${op}?\n\nIsso consome um numero novo e nao pode ser desfeito.`)) {
            return;
        }

        setOpBusy(true);
        setOpErro(null);
        try {
            const novo = await gerarNovoLaudo(op, labelData.quantidade, labelData.cliente, labelData.produto);
            setLaudos(prev => [...prev, novo]);
            setLaudoId(novo.id);
            setLabelData(prev => ({
                ...prev,
                lote: String(novo.lote),
                laudo: String(novo.laudo)
            }));
        } catch (error) {
            console.error('Erro ao gerar laudo:', error);
            setOpErro(mensagemErro(error, 'Nao foi possivel gerar o laudo.'));
        } finally {
            setOpBusy(false);
        }
    };

    // Troca a entrega selecionada (reimpressao) sem gerar numero novo.
    const handleSelecionarLaudo = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const id = e.target.value;
        const escolhido = laudos.find(l => l.id === id) || null;
        setLaudoId(escolhido?.id ?? null);
        setLabelData(prev => ({ ...prev, laudo: escolhido ? String(escolhido.laudo) : '' }));
    };

    const handleValidityChange =(e: React.ChangeEvent<HTMLSelectElement>) => {
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

    const handlePrint = async () => {
        const saved = await handleSave();
        if (!saved) return;
        window.print();
    };

    // Save labels to database
    const handleSave = async (): Promise<boolean> => {
        if (loading) return false;
        if (!labelData.opOf) {
            alert('Por favor, preencha o numero da OP/OF antes de salvar.');
            return false;
        }
        if (!labelData.lote) {
            alert('Esta OP ainda nao tem lote. Saia do campo OP/OF para que o lote seja gerado.');
            return false;
        }
        if (!labelData.laudo) {
            alert('Esta OP ainda nao tem laudo. Clique em "Nova entrega" para gerar o laudo desta remessa.');
            return false;
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
                range_total: range.total,
                laudo_id: laudoId
            };
            console.log('Salvando dados:', insertData);
            let error;
            let insertedId: string | undefined;
            if (savedId) {
                const result = await supabase.from('prod_etiquetas_caixa').update(insertData).eq('id', savedId);
                error = result.error;
            } else {
                const result = await supabase.from('prod_etiquetas_caixa').insert(insertData).select('id');
                error = result.error;
                insertedId = result.data?.[0]?.id;
            }
            if (error) {
                console.error('Erro Supabase:', error);
                alert(`Erro: ${error.message || error.code || 'Erro desconhecido'}`);
                return false;
            }
            if (!savedId && insertedId) {
                setSavedId(insertedId);
            }
            alert(savedId ? 'Etiqueta atualizada com sucesso!' : 'Etiquetas arquivadas com sucesso!');
            return true;
        } catch (error: any) {
            console.error('Erro ao salvar:', error);
            alert(`Erro ao salvar: ${error?.message || 'Erro desconhecido'}`);
            return false;
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
    const loadFromArchive = (item: any, forEdit = false) => {
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
        setSavedId(forEdit ? item.id : null);
        setLaudoId(item.laudo_id || null);
        setIsTimeManual(true);
        setActiveTab('nova');

        // Recarrega as entregas da OP para o seletor de laudo, sem alocar nada.
        if (item.op) {
            buscarDadosOP(item.op)
                .then(dados => setLaudos(dados?.laudos ?? []))
                .catch(err => console.error('Erro ao carregar laudos da OP:', err));
        }
    };

    // Load archived when switching to archive tab
    useEffect(() => {
        if (activeTab === 'arquivo') {
            handleSearch();
        }
    }, [activeTab]);

    useEffect(() => {
        if (initialItem) {
            loadFromArchive(initialItem, true);
        }
    }, [initialItem]);

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
                                    <label>OP/OF</label>
                                    <input
                                        name="opOf"
                                        value={labelData.opOf}
                                        onChange={handleChange}
                                        onBlur={handleOPBlur}
                                        placeholder="Nº OP/OF"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>
                                        Lote {opBusy && <Loader2 size={12} className="spin-inline" />}
                                    </label>
                                    <input
                                        name="lote"
                                        value={labelData.lote}
                                        readOnly
                                        className="campo-gerado"
                                        placeholder="Gerado pela OP"
                                        title="O lote e gerado pelo sistema e fica preso a esta OP"
                                    />
                                </div>
                            </div>

                            {opErro && <p className="campo-erro">{opErro}</p>}
                        </div>

                        <div className="form-section">
                            <h3 className="section-title">Datas e Controle</h3>

                            <div className="form-group">
                                <label>Laudo (entrega)</label>
                                <div className="laudo-row">
                                    <select
                                        className="registry-select"
                                        value={laudoId ?? ''}
                                        onChange={handleSelecionarLaudo}
                                        disabled={laudos.length === 0}
                                    >
                                        {laudos.length === 0 && (
                                            <option value="">Nenhuma entrega nesta OP</option>
                                        )}
                                        {laudos.map(l => (
                                            <option key={l.id} value={l.id}>
                                                {l.sequencia}ª entrega — laudo {l.laudo}
                                                {l.quantidade ? ` (${l.quantidade})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        className="btn-novo-laudo"
                                        onClick={handleNovoLaudo}
                                        disabled={opBusy || !labelData.opOf}
                                        title="Gera o laudo de uma nova remessa desta OP"
                                    >
                                        <Plus size={14} /> Nova entrega
                                    </button>
                                </div>
                                <small className="campo-ajuda">
                                    Reimpressão: escolha a entrega existente. O botão só para remessa nova.
                                </small>
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
                            {loading ? 'Salvando...' : (savedId ? 'Atualizar' : 'Arquivar')}
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
