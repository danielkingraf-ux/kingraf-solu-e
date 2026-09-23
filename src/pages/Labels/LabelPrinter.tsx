import React, { useEffect, useState } from 'react';
import { Printer, X, LayoutTemplate, QrCode, Layers, Info, Search, Edit2, Package, Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import './LabelPrinter.css';
import BoxLabel from './BoxLabel';
import {
    calcular, buscarPlano, salvarPlano, inteiro, quebrado, paletesInteiros,
    type PlanoOP
} from './planoPalete';
import { buscarDadosOP, codigosComEtiqueta, volumeDoPalete, type DadosOP } from './opRastreio';
import { SITUACAO_LABEL } from '../Rastreio/api';
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
            qtdCaixas: '',
            qtdPorCaixa: '',
            // A conta da OP: quanto a OP pede e quanto o corte e vinco rodou.
            // So alimentam a conferencia da tela — nao saem impressos.
            quantidadeOP: '',
            folhasVinco: '',
            bocas: '',
            // Codigo do palete da colagem no rastreio (ex.: 20418-COL-003).
            // E dele que sai o numero do volume.
            rastPalete: ''
        }
    });
    const [planoErro, setPlanoErro] = useState<string | null>(null);
    const { modal: modalLiberacao, pedirLiberacao } = useLiberacao();

    // Calculate total pallet quantity
    const totalPallet = () => {
        const caixas = parseInt(labelData.especifico.qtdCaixas) || 0;
        const porCaixa = parseInt(labelData.especifico.qtdPorCaixa) || 0;
        return caixas * porCaixa;
    };

    // O que a OP pede x o que o vinco rodou. Ver planoPalete.ts.
    // "Qtd. Caixas" deste formulario e quantas caixas cabem no palete, que e
    // o divisor de caixas para paletes na conta.
    const plano: PlanoOP = {
        quantidadeOP: labelData.especifico.quantidadeOP,
        folhasVinco: labelData.especifico.folhasVinco,
        bocas: labelData.especifico.bocas,
        quantidadePorCaixa: labelData.especifico.qtdPorCaixa,
        caixasPorPallet: labelData.especifico.qtdCaixas
    };
    const conta = calcular(plano);
    const paletesDaOP = paletesInteiros(conta.op.paletes);

    // A OP no rastreio (XML do Metrics + paletes da colagem). Ver opRastreio.ts.
    // null = OP ainda nao lida, ou nao importada no rastreio.
    const [dadosOP, setDadosOP] = useState<DadosOP | null>(null);
    const [rastreioAviso, setRastreioAviso] = useState<string | null>(null);
    const paleteColagem = dadosOP?.paletesColagem.find(p => p.codigo === labelData.especifico.rastPalete) ?? null;
    // Com palete da colagem escolhido, o volume e dele e nao se digita.
    // Sem ele (OP fora do rastreio, colagem que ainda nao cria palete la),
    // volta o campo digitado de antes.
    const volume = labelType === 'pallet' && paleteColagem
        ? volumeDoPalete(paleteColagem.numero, paletesDaOP)
        : labelData.boxNumber;

    const setEspecifico = (campos: Partial<typeof labelData.especifico>) =>
        setLabelData(prev => ({ ...prev, especifico: { ...prev.especifico, ...campos } }));

    // Escolher o palete da colagem traz o modelo dele para o campo Produto.
    const escolherPaleteColagem = (codigo: string, dados = dadosOP) => {
        const palete = dados?.paletesColagem.find(p => p.codigo === codigo);
        const modelo = palete?.produtoId ? dados?.modelos.find(m => m.id === palete.produtoId) : null;
        setLabelData(prev => ({
            ...prev,
            product: modelo ? modelo.descricao : prev.product,
            especifico: { ...prev.especifico, rastPalete: codigo }
        }));
    };

    /**
     * Le a OP no rastreio. `preencher` completa os campos vazios com o XML;
     * `escolherProximo` sugere o primeiro palete da colagem que ainda nao tem
     * etiqueta. O que ja esta digitado na tela nunca e sobrescrito.
     */
    const carregarOP = async (op: string, preencher: boolean, escolherProximo: boolean) => {
        setRastreioAviso(null);
        try {
            const dados = await buscarDadosOP(op);
            setDadosOP(dados);
            if (!dados) {
                setRastreioAviso('Esta OP não está no rastreio (XML não importado). Numeração e dados ficam digitados.');
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

            if (escolherProximo && dados.paletesColagem.length) {
                const jaImpressos = await codigosComEtiqueta(op);
                const proximo = dados.paletesColagem.find(p => !jaImpressos.has(p.codigo));
                if (proximo) escolherPaleteColagem(proximo.codigo, dados);
            }
        } catch (erro) {
            console.error('Nao foi possivel ler a OP no rastreio:', erro);
            setDadosOP(null);
            setRastreioAviso('Não foi possível ler esta OP no rastreio. Numeração e dados ficam digitados.');
        }
    };

    // Ao sair da OP, traz o que o rastreio sabe dela e o plano que ficou
    // guardado: o 2o palete da mesma OP abre preenchido. O que ja foi digitado
    // na tela tem preferencia.
    const handleOPBlur = async () => {
        const op = labelData.op.trim().toUpperCase();
        if (!op) return;
        await carregarOP(op, true, !labelData.especifico.rastPalete);
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
                    qtdCaixas: prev.especifico.qtdCaixas || guardado.caixasPorPallet
                }
            }));
        } catch (erro) {
            console.error('Nao foi possivel ler o plano da OP:', erro);
            setPlanoErro('Nao foi possivel ler o plano guardado desta OP.');
        }
    };

    // Palete impresso, vem o proximo da mesma OP: mantem o que foi digitado,
    // solta a etiqueta (a proxima impressao vira etiqueta nova) e sugere o
    // proximo palete da colagem sem etiqueta.
    const proximoPalete = () => {
        setSavedId(null);
        setEspecifico({ rastPalete: '' });
        carregarOP(labelData.op, false, true);
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
             'quantidadeOP', 'folhasVinco', 'bocas'].includes(name)) {
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
                setEspecifico({ rastPalete: '' });
            }
        }
    };

    const handlePrint = async () => {
        if (!labelData.op) {
            alert('Por favor, preencha a OP antes de salvar.');
            return;
        }

        // Etiqueta nova para um palete que ja tem etiqueta: duas etiquetas no
        // chao para o mesmo palete. Reimprimir a mesma etiqueta nao pergunta.
        if (!savedId && labelType === 'pallet' && paleteColagem) {
            try {
                const jaImpressos = await codigosComEtiqueta(labelData.op);
                if (jaImpressos.has(paleteColagem.codigo) &&
                    !confirm(`O palete ${paleteColagem.codigo} já tem etiqueta. Imprimir outra mesmo assim?`)) {
                    return;
                }
            } catch (erro) {
                console.error('Nao foi possivel conferir etiquetas do palete:', erro);
            }
        }

        // Palete acima dos previstos pela OP + 10%: so com supervisor. Vale
        // para etiqueta nova; reimprimir a mesma etiqueta nao emite palete.
        let liberacaoId: string | null = null;
        if (!savedId && labelType === 'pallet') {
            const numero = paleteColagem?.numero ?? parseInt(volume, 10);
            if (Number.isFinite(numero) && acimaDoPrevisto(paletesDaOP, numero)) {
                liberacaoId = await pedirLiberacao({
                    tipo: 'palete_etiqueta',
                    op: labelData.op,
                    previsto: paletesDaOP,
                    emitido: numero,
                    unidade: 'paletes',
                    referencia: paleteColagem?.codigo ?? volume,
                    titulo: `Este é o palete ${numero}, e a OP prevê ${paletesDaOP}. Passou mais de 10% do previsto.`
                });
                if (!liberacaoId) return;
            }
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
                volume,
                data: labelData.date,
                info_extra: liberacaoId
                    ? { ...labelData.especifico, liberacaoId }
                    : labelData.especifico
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

            // 2. Guardar o plano da OP para o proximo palete ja vir
            //    preenchido. E conveniencia: se falhar, a etiqueta ja esta
            //    salva e a impressao segue.
            if (labelType === 'pallet' && labelData.op) {
                try {
                    await salvarPlano(labelData.op, plano);
                } catch (erro) {
                    console.error('Nao foi possivel guardar o plano da OP:', erro);
                }
            }

            // 3. Abrir dialogo de impressao do sistema
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
            // Etiqueta antiga nao tem os campos da conta da OP. Sem estes
            // vazios os <input> viriam com undefined e o React trocaria campo
            // controlado por nao-controlado no meio do caminho.
            especifico: {
                lote: '', destino: '', obs: '', operador: '',
                qtdCaixas: '', qtdPorCaixa: '',
                quantidadeOP: '', folhasVinco: '', bocas: '', rastPalete: '',
                ...(item.info_extra || {}),
                // Usar como modelo nao pode herdar o palete da colagem: seria
                // imprimir duas etiquetas para o mesmo palete.
                ...(forEdit ? {} : { rastPalete: '' })
            }
        });
        setSavedId(forEdit ? item.id : null);
        setDadosOP(null);
        setRastreioAviso(null);
        setActiveTab('new');

        // Reabrir mantem o palete da colagem gravado na etiqueta; so a
        // contagem e relida. Etiqueta antiga (sem palete) segue com o volume
        // que foi digitado.
        if (item.tipo === 'pallet' && item.op) carregarOP(item.op, false, !forEdit);
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

                                {/* A conta da OP. Nao sai impressa: serve para
                                    conferir se o vinco rodou o bastante e para
                                    saber quantos paletes a OP ainda vai render. */}
                                <div className="conta-op animate-fade-in-up delay-500">
                                    <div className="conta-titulo">Conta da OP</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                        <div className="form-group">
                                            <label>Quantidade da OP</label>
                                            <input name="quantidadeOP" inputMode="numeric" value={labelData.especifico.quantidadeOP} onChange={handleChange} placeholder="Ex: 1.481.900" />
                                        </div>
                                        <div className="form-group">
                                            <label>Bocas</label>
                                            <input name="bocas" inputMode="numeric" value={labelData.especifico.bocas} onChange={handleChange} placeholder="Peças/folha" />
                                        </div>
                                    </div>
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
                                    <small className="conta-ajuda">
                                        Esta conta não sai impressa.
                                        {conta.op.paletes !== null && paletesDaOP !== null &&
                                            ` ${quebrado(conta.op.paletes)} significa ${paletesDaOP} paletes, com o último incompleto.`}
                                    </small>
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

                        {labelType === 'pallet' && dadosOP && (
                            // O palete e o da colagem no rastreio: o numero e a
                            // contagem sao os mesmos do fechamento da OP.
                            <div className="paletes-op animate-fade-in-up delay-600">
                                <div className="conta-titulo">Palete da colagem · OP {dadosOP.numeroOp}</div>

                                {dadosOP.paletesColagem.length > 0 ? (
                                    <div className="form-group">
                                        <select
                                            className="paletes-select"
                                            value={labelData.especifico.rastPalete}
                                            onChange={e => escolherPaleteColagem(e.target.value)}
                                        >
                                            <option value="">Escolha o palete…</option>
                                            {dadosOP.paletesColagem.map(p => (
                                                <option key={p.id} value={p.codigo}>
                                                    {p.codigo} · {inteiro(p.quantidade)} {p.unidade} · {SITUACAO_LABEL[p.situacao]}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <p className="conta-veredito neutro">
                                        Nenhum palete da colagem desta OP no rastreio. Crie em Rastreio → Novo palete (setor Colagem) para o número sair sozinho; até lá, digite o volume abaixo.
                                    </p>
                                )}

                                {paleteColagem && <div className="paletes-numero">{volume}</div>}

                                <div className="conta-linha">
                                    <span>Saíram da colagem</span>
                                    <b>
                                        {dadosOP.sairamColagem}
                                        {paletesDaOP !== null && ` de ${paletesDaOP}`} paletes
                                    </b>
                                </div>
                                <div className="conta-linha">
                                    <span>Chegaram na expedição</span>
                                    <b>{dadosOP.chegaramExpedicao} paletes</b>
                                </div>

                                {paleteColagem && paletesDaOP !== null && paleteColagem.numero > paletesDaOP && (
                                    <p className="conta-veredito neutro">
                                        Passou dos {paletesDaOP} paletes previstos pela OP (sobra do vinco). O total da etiqueta acompanha o número.
                                    </p>
                                )}
                                {paleteColagem && paletesDaOP === null && (
                                    <small className="conta-ajuda">
                                        Preencha a conta da OP para a etiqueta sair com o total (ex.: 3/56).
                                    </small>
                                )}
                                {dadosOP.modelos.length > 1 && (
                                    <small className="conta-ajuda">
                                        OP com {dadosOP.modelos.length} modelos: a quantidade da OP é a soma deles, porque a numeração dos paletes é da OP inteira.
                                    </small>
                                )}

                                {savedId && paleteColagem && (
                                    <button type="button" className="btn-usar-total" onClick={proximoPalete}>
                                        Fazer o próximo palete desta OP
                                    </button>
                                )}
                            </div>
                        )}

                        {labelType === 'pallet' && rastreioAviso && (
                            <p className="conta-veredito neutro">{rastreioAviso}</p>
                        )}

                        {!(labelType === 'pallet' && paleteColagem) && (
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
