import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Printer, X, LayoutTemplate, QrCode, Layers, Info, Search, Edit2, Package, Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import './LabelPrinter.css';
import BoxLabel from './BoxLabel';
import {
    calcular, buscarPlano, salvarPlano, inteiro, quebrado, paletesInteiros,
    dividirEmCaixas, buscarExpedidos, volumeDoPalete,
    type PlanoOP, type PaletesExpedidos
} from './planoPalete';
import { buscarDadosOP, type DadosOP } from './opRastreio';
import { acimaDoPrevisto, useLiberacao } from '../Rastreio/liberacao';

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
            // Caixas NESTE palete. O ultimo palete da OP costuma ter menos.
            qtdCaixas: '',
            qtdPorCaixa: '',
            // Unidades da caixa incompleta deste palete (a "sobra" da divisao:
            // 15.000 a 1.600 = 9 cheias + 1 com 600). Vazio = todas cheias.
            ultimaCaixa: '',
            // A conta da OP: quanto a OP pede, como embala e quanto o corte e
            // vinco rodou. So alimentam a conferencia da tela.
            quantidadeOP: '',
            caixasPorPalete: '',
            folhasVinco: '',
            bocas: '',
            // Numero deste palete na OP, dado na impressao. Vazio = ainda nao
            // impresso (ou etiqueta de antes do piloto).
            paleteNumero: ''
        }
    });
    const [planoErro, setPlanoErro] = useState<string | null>(null);
    const { modal: modalLiberacao, pedirLiberacao } = useLiberacao();

    const inteiroDe = (v: string) => parseInt(String(v).replace(/\./g, ''), 10) || 0;

    // Unidades neste palete. Com caixa incompleta: (caixas - 1) cheias + ela.
    const totalPallet = () => {
        const caixas = inteiroDe(labelData.especifico.qtdCaixas);
        const porCaixa = inteiroDe(labelData.especifico.qtdPorCaixa);
        const ultima = inteiroDe(labelData.especifico.ultimaCaixa);
        if (caixas > 0 && ultima > 0) return (caixas - 1) * porCaixa + ultima;
        return caixas * porCaixa;
    };

    // O que a OP pede x o que o vinco rodou. Ver planoPalete.ts. O divisor de
    // caixas para paletes e o padrao do palete cheio; etiqueta antiga so tem
    // "Qtd. Caixas", que era usado para isso.
    const plano: PlanoOP = {
        quantidadeOP: labelData.especifico.quantidadeOP,
        folhasVinco: labelData.especifico.folhasVinco,
        bocas: labelData.especifico.bocas,
        quantidadePorCaixa: labelData.especifico.qtdPorCaixa,
        caixasPorPallet: labelData.especifico.caixasPorPalete || labelData.especifico.qtdCaixas
    };
    const conta = calcular(plano);
    const divisao = dividirEmCaixas(plano);
    const paletesDaOP = divisao?.paletes ?? paletesInteiros(conta.op.paletes);

    // XML da OP no rastreio: so preenche campos. Ver opRastreio.ts.
    const [dadosOP, setDadosOP] = useState<DadosOP | null>(null);
    const [rastreioAviso, setRastreioAviso] = useState<string | null>(null);

    // Piloto colagem -> expedicao: etiqueta de palete impressa = palete que
    // foi para a expedicao. O numero e a sequencia das etiquetas da OP.
    const [expedidos, setExpedidos] = useState<PaletesExpedidos | null>(null);
    const numeroGravado = parseInt(labelData.especifico.paleteNumero, 10) || null;
    // Reaberta sem numero = etiqueta de antes do piloto: volume digitado.
    const legado = labelType === 'pallet' && !!savedId && numeroGravado === null;
    const numeracaoAutomatica = labelType === 'pallet' && !legado;
    const numeroExibido = numeroGravado ?? (expedidos ? expedidos.ultimo + 1 : 1);
    const volume = numeracaoAutomatica
        ? volumeDoPalete(numeroExibido, paletesDaOP)
        : labelData.boxNumber;

    const setEspecifico = (campos: Partial<typeof labelData.especifico>) =>
        setLabelData(prev => ({ ...prev, especifico: { ...prev.especifico, ...campos } }));

    const atualizarExpedidos = async (op: string) => {
        try {
            setExpedidos(await buscarExpedidos(op));
        } catch (erro) {
            console.error('Nao foi possivel ler os paletes expedidos:', erro);
            setExpedidos(null);
        }
    };

    // Ultimo palete da OP: ja vem com as caixas que faltam e a caixa
    // incompleta. Uma vez por OP + numero, para nao brigar com quem corrige.
    const autoUltimo = useRef('');
    useEffect(() => {
        // Sem o padrao do palete cheio, "Qtd. Caixas" e o proprio divisor da
        // conta: mexer nele mudaria o numero de paletes.
        if (!numeracaoAutomatica || numeroGravado !== null || !divisao || !expedidos
            || !labelData.especifico.caixasPorPalete) return;
        const chave = `${labelData.op}|${numeroExibido}|${divisao.paletes}`;
        if (numeroExibido !== divisao.paletes || autoUltimo.current === chave) return;
        autoUltimo.current = chave;
        setEspecifico({
            qtdCaixas: String(divisao.caixasUltimoPalete),
            ultimaCaixa: divisao.sobra > 0 ? String(divisao.sobra) : ''
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [numeracaoAutomatica, numeroGravado, numeroExibido, divisao?.paletes, expedidos]);

    /**
     * Le a OP no rastreio e completa os campos vazios com o XML. O que ja esta
     * digitado na tela nunca e sobrescrito.
     */
    const carregarOP = async (op: string, preencher: boolean) => {
        setRastreioAviso(null);
        atualizarExpedidos(op);
        try {
            const dados = await buscarDadosOP(op);
            setDadosOP(dados);
            if (!dados) {
                setRastreioAviso('Esta OP não está no rastreio (XML não importado): cliente, produto e quantidade ficam digitados.');
                return;
            }

            if (preencher) {
                const unicoModelo = dados.modelos.length === 1 ? dados.modelos[0].descricao : '';
                const txt = (n: number | null) => (n === null ? '' : String(n));
                setLabelData(prev => ({
                    ...prev,
                    client: prev.client || dados.cliente || '',
                    product: prev.product || unicoModelo,
                    especifico: {
                        ...prev.especifico,
                        quantidadeOP: prev.especifico.quantidadeOP || txt(dados.quantidadeTotal),
                        bocas: prev.especifico.bocas || txt(dados.bocas)
                    }
                }));
            }
        } catch (erro) {
            console.error('Nao foi possivel ler a OP no rastreio:', erro);
            setDadosOP(null);
            setRastreioAviso('Não foi possível ler esta OP no rastreio: cliente, produto e quantidade ficam digitados.');
        }
    };

    // Ao sair da OP, traz o que o rastreio sabe dela e o plano que ficou
    // guardado: o 2o palete da mesma OP abre preenchido. O que ja foi digitado
    // na tela tem preferencia.
    const handleOPBlur = async () => {
        const op = labelData.op.trim().toUpperCase();
        if (!op) return;
        await carregarOP(op, true);
        try {
            setPlanoErro(null);
            const guardado = await buscarPlano(op);
            if (!guardado) return;
            setLabelData(prev => ({
                ...prev,
                op,
                especifico: {
                    ...prev.especifico,
                    quantidadeOP: prev.especifico.quantidadeOP || guardado.quantidadeOP,
                    folhasVinco: prev.especifico.folhasVinco || guardado.folhasVinco,
                    bocas: prev.especifico.bocas || guardado.bocas,
                    qtdPorCaixa: prev.especifico.qtdPorCaixa || guardado.quantidadePorCaixa,
                    caixasPorPalete: prev.especifico.caixasPorPalete || guardado.caixasPorPallet,
                    // Palete comum vai cheio; o ultimo o efeito acima ajusta.
                    qtdCaixas: prev.especifico.qtdCaixas || guardado.caixasPorPallet
                }
            }));
        } catch (erro) {
            console.error('Nao foi possivel ler o plano da OP:', erro);
            setPlanoErro('Nao foi possivel ler o plano guardado desta OP.');
        }
    };

    // Palete impresso, vem o proximo da mesma OP: mantem o que foi digitado e
    // solta a etiqueta (a proxima impressao vira etiqueta e palete novos).
    const proximoPalete = () => {
        setSavedId(null);
        setEspecifico({
            paleteNumero: '',
            qtdCaixas: labelData.especifico.caixasPorPalete || labelData.especifico.qtdCaixas,
            ultimaCaixa: ''
        });
        atualizarExpedidos(labelData.op);
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
        if (['lote', 'destino', 'obs', 'operador', 'qtdCaixas', 'qtdPorCaixa',
             'quantidadeOP', 'folhasVinco', 'bocas', 'ultimaCaixa', 'caixasPorPalete'].includes(name)) {
            setLabelData((prev: any) => ({
                ...prev,
                especifico: { ...prev.especifico, [name]: value }
            }));
        } else {
            setLabelData((prev: any) => ({
                ...prev,
                [name]: value
            }));
            // Outra OP: o palete e a contagem da anterior nao valem mais.
            // Voltam quando o campo perder o foco (handleOPBlur).
            if (name === 'op') {
                setDadosOP(null);
                setRastreioAviso(null);
                setExpedidos(null);
            }
        }
    };

    const handlePrint = async () => {
        if (!labelData.op) {
            alert('Por favor, preencha a OP antes de salvar.');
            return;
        }
        const op = labelData.op.trim().toUpperCase();
        // Etiqueta de palete nova = um palete a mais que saiu da colagem.
        // Reimprimir a mesma etiqueta nao conta de novo.
        const novoPalete = !savedId && numeracaoAutomatica;

        // O numero da tela pode estar velho (outra estacao imprimiu no meio):
        // vale o que o banco disser agora.
        let numero: number | null = numeroGravado;
        if (novoPalete) {
            try {
                const atual = await buscarExpedidos(op);
                setExpedidos(atual);
                numero = atual.ultimo + 1;
            } catch (erro) {
                console.error('Nao foi possivel ler os paletes da OP:', erro);
                alert('Não foi possível ler os paletes desta OP. Nada foi impresso; tente de novo.');
                return;
            }
        }

        // Palete acima dos previstos pela OP + 10%: so com supervisor.
        let liberacaoId: string | null = null;
        if (novoPalete && numero !== null && acimaDoPrevisto(paletesDaOP, numero)) {
            liberacaoId = await pedirLiberacao({
                tipo: 'palete_etiqueta',
                op,
                previsto: paletesDaOP,
                emitido: numero,
                unidade: 'paletes',
                referencia: volumeDoPalete(numero, paletesDaOP),
                titulo: `Este é o palete ${numero}, e a OP prevê ${paletesDaOP}. Passou mais de 10% do previsto.`
            });
            if (!liberacaoId) return;
        }

        const quantidade = labelType === 'pallet'
            ? String(totalPallet())
            : null;

        const montarPayload = (n: number | null) => ({
            tipo: labelType,
            op,
            cliente: labelType === 'info' ? '' : labelData.client,
            produto: labelType === 'info' ? '' : labelData.product,
            quantidade,
            volume: numeracaoAutomatica && n !== null ? volumeDoPalete(n, paletesDaOP) : volume,
            data: labelData.date,
            info_extra: {
                ...labelData.especifico,
                ...(numeracaoAutomatica && n !== null ? { paleteNumero: n } : {}),
                ...(liberacaoId ? { liberacaoId } : {})
            }
        });

        try {
            // 1. Salvar no historico. Para palete, e isto que conta a saida.
            let error;
            let etiquetaId = savedId;
            if (savedId) {
                ({ error } = await supabase
                    .from('prod_etiquetas_historico')
                    .update(montarPayload(numero))
                    .eq('id', savedId));
            } else {
                let result = await supabase
                    .from('prod_etiquetas_historico')
                    .insert([montarPayload(numero)])
                    .select('id');
                // 23505: outra estacao gravou este numero no meio. Pega o
                // proximo e tenta uma vez mais.
                if (result.error?.code === '23505' && novoPalete) {
                    numero = (await buscarExpedidos(op)).ultimo + 1;
                    result = await supabase
                        .from('prod_etiquetas_historico')
                        .insert([montarPayload(numero)])
                        .select('id');
                }
                error = result.error;
                etiquetaId = result.data?.[0]?.id ?? null;
            }

            if (error) {
                console.error('Erro ao salvar no historico:', error);
                alert(`Erro ao salvar a etiqueta: ${error.message || error.code || 'Erro desconhecido'}`);
                return;
            }

            // flushSync: a etiqueta precisa estar com o numero certo na tela
            // antes do window.print() tirar a foto dela.
            flushSync(() => {
                setSavedId(etiquetaId);
                setLabelData(prev => ({
                    ...prev,
                    op,
                    especifico: {
                        ...prev.especifico,
                        paleteNumero: numeracaoAutomatica && numero !== null ? String(numero) : prev.especifico.paleteNumero
                    }
                }));
            });

            // 2. Guardar o plano da OP para o proximo palete ja vir
            //    preenchido. E conveniencia: se falhar, a etiqueta ja esta
            //    salva e a impressao segue.
            if (labelType === 'pallet') {
                try {
                    await salvarPlano(op, plano);
                } catch (erro) {
                    console.error('Nao foi possivel guardar o plano da OP:', erro);
                }
            }

            // 3. Abrir dialogo de impressao do sistema
            window.print();
            if (novoPalete) atualizarExpedidos(op);
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
            // Etiqueta antiga nao tem os campos novos. Sem estes vazios os
            // <input> viriam com undefined e o React trocaria campo
            // controlado por nao-controlado no meio do caminho.
            especifico: {
                lote: '', destino: '', obs: '', operador: '',
                qtdCaixas: '', qtdPorCaixa: '', ultimaCaixa: '',
                quantidadeOP: '', caixasPorPalete: '', folhasVinco: '', bocas: '',
                ...(item.info_extra || {}),
                // Usar como modelo e palete NOVO: nao herda o numero nem a
                // liberacao da etiqueta de origem.
                ...(forEdit ? {} : { liberacaoId: undefined }),
                paleteNumero: forEdit && item.info_extra?.paleteNumero ? String(item.info_extra.paleteNumero) : ''
            }
        });
        setSavedId(forEdit ? item.id : null);
        setDadosOP(null);
        setRastreioAviso(null);
        setExpedidos(null);
        setActiveTab('new');

        if (item.tipo === 'pallet' && item.op) carregarOP(item.op, false);
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
            {modalLiberacao}
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
                            <input name="op" value={labelData.op} onChange={handleChange} onBlur={handleOPBlur} placeholder="Ex: 123456" />
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
                                <div className="form-group animate-fade-in-up delay-400">
                                    <label>Lote</label>
                                    <input name="lote" value={labelData.especifico.lote} onChange={handleChange} placeholder="Numero do lote" />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                                    <div className="form-group animate-fade-in-up delay-450">
                                        <label>Caixas neste palete</label>
                                        <input type="number" name="qtdCaixas" value={labelData.especifico.qtdCaixas} onChange={handleChange} placeholder="Nº de caixas" />
                                    </div>
                                    <div className="form-group animate-fade-in-up delay-450">
                                        <label>Qtd. por Caixa</label>
                                        <input type="number" name="qtdPorCaixa" value={labelData.especifico.qtdPorCaixa} onChange={handleChange} placeholder="Unidades" />
                                    </div>
                                    <div className="form-group animate-fade-in-up delay-450">
                                        <label>Caixa incompleta</label>
                                        <input type="number" name="ultimaCaixa" value={labelData.especifico.ultimaCaixa} onChange={handleChange} placeholder="Unidades (se houver)" />
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

                                {/* A conta da OP. Nao sai impressa: serve para
                                    conferir se o vinco rodou o bastante e para
                                    saber quantos paletes a OP ainda vai render. */}
                                <div className="conta-op animate-fade-in-up delay-500">
                                    <div className="conta-titulo">Conta da OP</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                                        <div className="form-group">
                                            <label>Quantidade da OP</label>
                                            <input name="quantidadeOP" inputMode="numeric" value={labelData.especifico.quantidadeOP} onChange={handleChange} placeholder="Ex: 15.000" />
                                        </div>
                                        <div className="form-group">
                                            <label>Caixas por palete</label>
                                            <input name="caixasPorPalete" inputMode="numeric" value={labelData.especifico.caixasPorPalete} onChange={handleChange} placeholder="Palete cheio" />
                                        </div>
                                        <div className="form-group">
                                            <label>Bocas</label>
                                            <input name="bocas" inputMode="numeric" value={labelData.especifico.bocas} onChange={handleChange} placeholder="Peças/folha" />
                                        </div>
                                    </div>

                                    {/* A divisao em caixas: o que o operador precisa
                                        saber para montar o ultimo palete. */}
                                    {divisao && (
                                        <div className="conta-caixas">
                                            <b>{inteiro(inteiroDe(labelData.especifico.quantidadeOP))} ÷ {inteiro(inteiroDe(labelData.especifico.qtdPorCaixa))}</b>
                                            {' = '}
                                            <b>{divisao.caixasCheias} caixas cheias</b>
                                            {divisao.sobra > 0 && <> + <b className="sobra">1 caixa com {inteiro(divisao.sobra)}</b></>}
                                            <span>
                                                {divisao.caixasTotais} caixas em {divisao.paletes} palete(s)
                                                {divisao.paletes > 1 && `; o último leva ${divisao.caixasUltimoPalete} caixa(s)`}
                                                {divisao.sobra > 0 && ', com a incompleta'}.
                                            </span>
                                        </div>
                                    )}
                                    <div className="form-group">
                                        <label>Folhas rodadas no corte e vinco</label>
                                        <input name="folhasVinco" inputMode="numeric" value={labelData.especifico.folhasVinco} onChange={handleChange} placeholder="Ex: 63.000" />
                                        <small className="conta-ajuda">Folhas × bocas = peças que existem de verdade no chão.</small>
                                    </div>

                                    <div className="conta-tabela">
                                        <div className="conta-col">
                                            <div className="conta-cabeca">A OP PEDE</div>
                                            <div className="conta-linha"><span>Peças</span><b>{inteiro(conta.op.pecas)}</b></div>
                                            <div className="conta-linha"><span>Caixas</span><b>{quebrado(conta.op.caixas)}</b></div>
                                            <div className="conta-linha destaque"><span>Paletes</span><b>{quebrado(conta.op.paletes)}</b></div>
                                        </div>
                                        <div className="conta-col">
                                            <div className="conta-cabeca">O VINCO RODOU</div>
                                            <div className="conta-linha"><span>Peças</span><b>{inteiro(conta.vinco.pecas)}</b></div>
                                            <div className="conta-linha"><span>Caixas</span><b>{quebrado(conta.vinco.caixas)}</b></div>
                                            <div className="conta-linha destaque"><span>Paletes</span><b>{quebrado(conta.vinco.paletes)}</b></div>
                                        </div>
                                    </div>

                                    {conta.fecha === null ? (
                                        <p className="conta-veredito neutro">
                                            Preencha a quantidade da OP, as bocas e as folhas do vinco para a conta sair.
                                        </p>
                                    ) : conta.fecha ? (
                                        <p className="conta-veredito ok">
                                            Sobra de {inteiro(conta.diferenca)} peças — o vinco passou da OP.
                                        </p>
                                    ) : (
                                        <p className="conta-veredito falta">
                                            {conta.diferenca === 0
                                                ? 'O vinco empatou com a OP. Empatar não fecha: entre o vinco e a expedição sempre se perde peça.'
                                                : `Faltam ${inteiro(conta.diferenca === null ? null : -conta.diferenca)} peças.`}
                                            {conta.folhasParaFechar !== null &&
                                                ` Só para empatar com a OP o vinco precisa de ${inteiro(conta.folhasParaFechar)} folhas — e tem que rodar mais que isso.`}
                                        </p>
                                    )}

                                    {planoErro && <p className="conta-veredito falta">{planoErro}</p>}
                                    <small className="conta-ajuda">Esta conta não sai impressa.</small>
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

                        {numeracaoAutomatica && (
                            // Piloto: etiqueta de palete impressa = palete que
                            // saiu da colagem para a expedicao.
                            <div className="paletes-op animate-fade-in-up delay-600">
                                <div className="conta-titulo">
                                    {numeroGravado !== null ? 'Este palete' : 'Próximo palete'}
                                    {labelData.op ? ` · OP ${labelData.op.trim().toUpperCase()}` : ''}
                                </div>
                                <div className="paletes-numero">{volume}</div>

                                <div className="conta-linha">
                                    <span>Já foram para a expedição</span>
                                    <b>
                                        {expedidos === null ? '—' : expedidos.quantidade}
                                        {paletesDaOP !== null && ` de ${paletesDaOP}`} paletes
                                    </b>
                                </div>
                                <div className="conta-linha">
                                    <span>Unidades expedidas</span>
                                    <b>
                                        {expedidos === null ? '—' : inteiro(expedidos.pecas)}
                                        {conta.op.pecas !== null && ` de ${inteiro(conta.op.pecas)}`}
                                    </b>
                                </div>

                                {divisao && numeroExibido === divisao.paletes && numeroGravado === null && (
                                    <p className="conta-veredito ok">
                                        Último palete da OP: {divisao.caixasUltimoPalete} caixa(s)
                                        {divisao.sobra > 0 && `, uma delas com ${inteiro(divisao.sobra)}`}.
                                    </p>
                                )}
                                {paletesDaOP !== null && numeroExibido > paletesDaOP && (
                                    <p className="conta-veredito neutro">
                                        Passou dos {paletesDaOP} paletes previstos pela OP. O total da etiqueta acompanha o número.
                                    </p>
                                )}
                                {paletesDaOP === null && (
                                    <small className="conta-ajuda">
                                        Preencha a conta da OP para a etiqueta sair com o total (ex.: 3/10).
                                    </small>
                                )}
                                {dadosOP && dadosOP.modelos.length > 1 && (
                                    <small className="conta-ajuda">
                                        OP com {dadosOP.modelos.length} modelos: a quantidade da OP é a soma deles, porque a numeração dos paletes é da OP inteira.
                                    </small>
                                )}

                                {savedId && numeroGravado !== null && (
                                    <button type="button" className="btn-usar-total" onClick={proximoPalete}>
                                        Fazer o próximo palete desta OP
                                    </button>
                                )}
                                <small className="conta-ajuda">
                                    Imprimir conta o palete como enviado para a expedição. Reimprimir esta etiqueta não conta de novo.
                                </small>
                            </div>
                        )}

                        {labelType === 'pallet' && rastreioAviso && (
                            <p className="conta-veredito neutro">{rastreioAviso}</p>
                        )}

                        {!numeracaoAutomatica && (
                            <div className="form-group animate-fade-in-up delay-600">
                                <label>Numeração / Volume</label>
                                <input name="boxNumber" value={labelData.boxNumber} onChange={handleChange} />
                            </div>
                        )}


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
                                    {/* Sai impresso: quem abre o palete precisa
                                        saber que uma caixa nao esta cheia. */}
                                    {inteiroDe(labelData.especifico.ultimaCaixa) > 0 && (
                                        <div className="value" style={{ fontSize: '1.6rem' }}>
                                            1 CX COM {inteiro(inteiroDe(labelData.especifico.ultimaCaixa))}
                                        </div>
                                    )}
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
                            <div className="value" style={{ fontSize: '3.4rem' }}>{volume}</div>
                        </div>
                    </div>
                </div>
            </main>
        </div >
    );
};

export default LabelPrinter;
