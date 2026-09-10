import React, { useState, useEffect } from 'react';
import { Printer, X, Copy, Save, Search, Archive, Plus, Loader2, Trash2, Eraser, ListChecks, Download } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { buscarDadosOP, obterLoteDaOP, gerarNovoLaudo, anoDoLaudo, formatarLaudo, normalizarOP, normalizarModelo, type Laudo, type LinhaConferencia, buscarConferencia } from './lotesLaudos';
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
    /** Ano de emissao do laudo. Impresso junto: laudo/ano-0. */
    laudoAno: string;
    /** Codigo do modelo (KING). Junto com a OP, define o lote e os laudos. */
    numeroInterno: string;
    /** Sobra daquele par OP+modelo: lote proprio, e sem laudo. */
    sobra: boolean;
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
    // A conferencia abre em popup: relatorio nao cabe na barra de 400px.
    const [conferenciaAberta, setConferenciaAberta] = useState(false);
    const [conferencia, setConferencia] = useState<LinhaConferencia[]>([]);
    const [buscaConferencia, setBuscaConferencia] = useState('');
    const [carregandoConf, setCarregandoConf] = useState(false);
    const [searchOP, setSearchOP] = useState('');
    const [archivedLabels, setArchivedLabels] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [savedId, setSavedId] = useState<string | null>(null);
    // Assinatura do que foi arquivado por ultimo. Enquanto ela nao mudar,
    // imprimir de novo nao arquiva de novo.
    const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
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
        laudoAno: '',
        numeroInterno: '',
        sobra: false,
        emissor: '',
        operador: '',
        hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    });

    // Relogio automatico ate a etiqueta ser arquivada. Depois disso ele para:
    // se continuasse andando, a etiqueta impressa mostraria uma hora diferente
    // da que ficou no arquivo — e cada impressao viraria uma alteracao.
    useEffect(() => {
        if (isTimeManual || savedId) return;

        const timer = setInterval(() => {
            const now = new Date();
            setLabelData(prev => ({
                ...prev,
                dataAcabamento: now.toLocaleDateString('pt-BR'),
                hora: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            }));
        }, 30000); // Check every 30 seconds

        return () => clearInterval(timer);
    }, [isTimeManual, savedId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;

        if (name === 'hora' || name === 'dataAcabamento') {
            setIsTimeManual(true);
        }

        setLabelData(prev => ({ ...prev, [name]: value }));
    };

    // Lote e laudo pertencem ao par OP + MODELO (o codigo KING): a mesma OP
    // pode carregar modelos diferentes, e cada um tem lote e laudos proprios.
    // Por isso a carga so acontece com os dois campos preenchidos, e roda ao
    // sair de qualquer um deles.
    // sobraOverride existe porque o checkbox precisa recarregar com o valor
    // novo, antes do setState ter sido aplicado ao closure.
    const carregarParOpModelo = async (sobraOverride?: boolean) => {
        const op = normalizarOP(labelData.opOf);
        const modelo = normalizarModelo(labelData.numeroInterno);
        const sobra = sobraOverride ?? labelData.sobra;

        if (!op || !modelo) {
            // Sem o par completo nao da para saber a qual lote isto pertence.
            setLaudos([]);
            setLaudoId(null);
            setLabelData(prev => ({ ...prev, lote: '', laudo: '', laudoAno: '' }));
            return;
        }

        setOpBusy(true);
        setOpErro(null);
        try {
            const dados = await buscarDadosOP(op, modelo, sobra);
            const lote = dados
                ? dados.lote
                : await obterLoteDaOP(op, modelo, sobra, labelData.cliente, labelData.produto);

            // Na sobra so o LOTE muda. O laudo e sempre o da 1a entrega da
            // producao normal daquele mesmo par — ele nao acompanha as
            // entregas seguintes. Por isso a busca extra com sobra = false.
            let listaLaudos = dados?.laudos ?? [];
            if (sobra) {
                const normal = await buscarDadosOP(op, modelo, false);
                const primeira = (normal?.laudos ?? [])[0] ?? null;
                listaLaudos = primeira ? [primeira] : [];
            }

            // Sobra: a 1a entrega. Producao: a ultima, que e a que se imprime.
            const atual = sobra
                ? (listaLaudos[0] ?? null)
                : (listaLaudos[listaLaudos.length - 1] ?? null);

            setLaudos(listaLaudos);
            setLaudoId(atual?.id ?? null);
            setLabelData(prev => ({
                ...prev,
                opOf: op,
                numeroInterno: modelo,
                lote: String(lote),
                laudo: atual ? String(atual.laudo) : '',
                laudoAno: atual ? anoDoLaudo(atual.created_at) : '',
                cliente: prev.cliente || dados?.cliente || '',
                produto: prev.produto || dados?.produto || ''
            }));
        } catch (error) {
            console.error('Erro ao carregar lote/laudo do par OP+modelo:', error);
            setOpErro(mensagemErro(error, 'Nao foi possivel carregar o lote desta OP/modelo.'));
        } finally {
            setOpBusy(false);
        }
    };

    // Abre uma nova entrega da OP. Consome um numero de laudo — usar apenas
    // quando for de fato uma remessa nova, nao para reimprimir.
    const handleNovoLaudo = async () => {
        const op = normalizarOP(labelData.opOf);
        const modelo = normalizarModelo(labelData.numeroInterno);
        if (!op) {
            alert('Preencha a OP/OF antes de gerar o laudo.');
            return;
        }
        if (!modelo) {
            alert('Preencha o KING (codigo do modelo) antes de gerar o laudo.\n\nCada modelo da OP tem o seu proprio laudo.');
            return;
        }
        if (labelData.sobra) {
            alert('A sobra usa o laudo da 1a entrega, nao gera laudo proprio.\n\nPara abrir uma entrega nova, desmarque "Sobra".');
            return;
        }
        const entrega = laudos.length + 1;
        if (!confirm(`Gerar o laudo da ${entrega}a entrega do modelo ${modelo} na OP ${op}?\n\nIsso consome um numero novo e nao pode ser desfeito.`)) {
            return;
        }

        setOpBusy(true);
        setOpErro(null);
        try {
            const novo = await gerarNovoLaudo(op, modelo, labelData.quantidade, labelData.cliente, labelData.produto);
            setLaudos(prev => [...prev, novo]);
            setLaudoId(novo.id);
            setLabelData(prev => ({
                ...prev,
                lote: String(novo.lote),
                laudo: String(novo.laudo),
                laudoAno: anoDoLaudo(novo.created_at)
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
        setLabelData(prev => ({
            ...prev,
            laudo: escolhido ? String(escolhido.laudo) : '',
            laudoAno: escolhido ? anoDoLaudo(escolhido.created_at) : ''
        }));
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
        // Arquiva so se algo mudou; reimpressao identica nao gera registro novo.
        const saved = await handleSave({ aoImprimir: true });
        if (!saved) return;
        window.print();
    };

    // O que de fato vai para o banco. Serve tambem de assinatura da etiqueta:
    // se este objeto nao mudou, nao ha o que arquivar de novo.
    const montarPayload = (
        dados: LabelData,
        faixa: typeof range,
        idLaudo: string | null
    ) => ({
        op: dados.opOf,
        cliente: dados.cliente || null,
        produto: dados.produto || null,
        cli: dados.cli || null,
        quantidade: dados.quantidade || null,
        lote: dados.lote || null,
        data_acabamento: dados.dataAcabamento || null,
        validade: dados.validade || null,
        // Grava o laudo cru; o ano e o sufixo -0 sao formato de impressao.
        laudo: dados.laudo || null,
        numero_interno: dados.numeroInterno.trim() || null,
        sobra: dados.sobra,
        emissor: dados.emissor || null,
        operador: dados.operador || null,
        hora: dados.hora || null,
        range_start: faixa.start,
        range_end: faixa.end,
        range_total: faixa.total,
        laudo_id: idLaudo
    });

    // Save labels to database
    const handleSave = async ({ aoImprimir = false } = {}): Promise<boolean> => {
        if (loading) return false;
        if (!labelData.opOf) {
            alert('Por favor, preencha o numero da OP/OF antes de salvar.');
            return false;
        }
        if (!labelData.lote) {
            alert('Este par OP + modelo ainda nao tem lote. Preencha a OP e o KING e saia do campo.');
            return false;
        }
        if (labelData.sobra && !labelData.laudo) {
            alert('Este modelo ainda nao tem a 1a entrega, e a sobra imprime o laudo dela.\n\nDesmarque "Sobra", gere a 1a entrega, e volte.');
            return false;
        }
        if (!labelData.laudo) {
            alert('Este modelo ainda nao tem laudo. Clique em "Nova entrega" para gerar o laudo desta remessa.');
            return false;
        }
        const insertData = montarPayload(labelData, range, laudoId);
        const assinatura = JSON.stringify(insertData);

        // Ja arquivada e nada mudou: nao toca no banco.
        if (savedId && assinatura === savedSnapshot) {
            if (!aoImprimir) {
                alert('Nada mudou desde o ultimo arquivamento.');
            }
            return true;
        }

        try {
            setLoading(true);
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
            setSavedSnapshot(assinatura);
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

    // Zera o formulario para a proxima etiqueta, sem tocar em nada do banco:
    // lote e laudo ja emitidos continuam la, presos ao par OP+modelo.
    const handleLimpar = () => {
        if (!confirm('Limpar o formulario para uma nova etiqueta?\n\nOs numeros ja gerados nao sao apagados — eles ficam guardados na OP.')) {
            return;
        }

        const agora = new Date();
        setLabelData({
            cliente: '',
            produto: '',
            cli: '',
            quantidade: '',
            lote: '',
            opOf: '',
            dataAcabamento: agora.toLocaleDateString('pt-BR'),
            validade: '',
            laudo: '',
            laudoAno: '',
            numeroInterno: '',
            sobra: false,
            emissor: '',
            operador: '',
            hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        });
        setLaudos([]);
        setLaudoId(null);
        setValidityMonths('');
        setOpErro(null);
        setRange({ start: 1, end: 8, total: 8 });
        // Sem isso a proxima gravacao atualizaria a etiqueta anterior em vez
        // de criar uma nova.
        setSavedId(null);
        setSavedSnapshot(null);
        // Volta a acompanhar o relogio ate esta nova etiqueta ser arquivada.
        setIsTimeManual(false);
    };

    // Apaga uma etiqueta do arquivo. Nao mexe em lote nem laudo: os numeros
    // ja foram emitidos e continuam presos a OP, so o registro da impressao sai.
    const handleExcluir = async (item: any, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`Apagar esta etiqueta arquivada da OP ${item.op}?\n\nO lote e o laudo da OP nao sao afetados.`)) {
            return;
        }
        try {
            setLoading(true);
            const { error } = await supabase.from('prod_etiquetas_caixa').delete().eq('id', item.id);
            if (error) throw error;
            setArchivedLabels(prev => prev.filter(l => l.id !== item.id));
            // Se a etiqueta aberta no formulario era essa, ela nao existe mais.
            if (savedId === item.id) {
                setSavedId(null);
                setSavedSnapshot(null);
            }
        } catch (error: any) {
            console.error('Erro ao excluir:', error);
            alert(`Nao foi possivel excluir: ${error?.message || 'erro desconhecido'}`);
        } finally {
            setLoading(false);
        }
    };

    // Load from archive into form
    const loadFromArchive = (item: any, forEdit = false) => {
        const dados: LabelData = {
            cliente: item.cliente || '',
            produto: item.produto || '',
            cli: item.cli || '',
            quantidade: item.quantidade || '',
            lote: item.lote || '',
            opOf: item.op || '',
            dataAcabamento: item.data_acabamento || '',
            validade: item.validade || '',
            laudo: item.laudo || '',
            // Sem o laudo em maos ainda: o ano da etiqueta serve de aproximacao
            // e e corrigido logo abaixo, quando as entregas da OP chegarem.
            laudoAno: anoDoLaudo(item.created_at),
            numeroInterno: item.numero_interno || '',
            sobra: Boolean(item.sobra),
            emissor: item.emissor || '',
            operador: item.operador || '',
            hora: item.hora || ''
        };
        const faixa = {
            start: item.range_start || 1,
            end: item.range_end || 8,
            total: item.range_total || 8
        };
        const idLaudo = item.laudo_id || null;

        setLabelData(dados);
        setRange(faixa);
        setSavedId(forEdit ? item.id : null);
        // Abrindo para editar, a etiqueta ja esta arquivada como esta: reimprimir
        // sem mexer em nada nao deve gravar de novo.
        setSavedSnapshot(forEdit ? JSON.stringify(montarPayload(dados, faixa, idLaudo)) : null);
        setLaudoId(idLaudo);
        setIsTimeManual(true);
        setActiveTab('nova');

        // Recarrega as entregas do par OP+modelo para o seletor de laudo,
        // sem alocar nada.
        if (item.op) {
            buscarDadosOP(item.op, item.numero_interno || '')
                .then(dados => {
                    const lista = dados?.laudos ?? [];
                    setLaudos(lista);
                    const usado = lista.find(l => l.id === item.laudo_id);
                    if (usado) {
                        setLabelData(prev => ({ ...prev, laudoAno: anoDoLaudo(usado.created_at) }));
                    }
                })
                .catch(err => console.error('Erro ao carregar laudos da OP:', err));
        }
    };

    // Conferencia: lista os lotes emitidos com os laudos de cada um. So leitura.
    // Usa loading proprio para nao disputar o spinner com o Arquivar.
    const handleBuscarConferencia = async () => {
        try {
            setCarregandoConf(true);
            setConferencia(await buscarConferencia(buscaConferencia));
        } catch (error) {
            console.error('Erro ao carregar conferencia:', error);
            alert(mensagemErro(error, 'Nao foi possivel carregar a conferencia.'));
        } finally {
            setCarregandoConf(false);
        }
    };

    const abrirConferencia = () => {
        setConferenciaAberta(true);
        handleBuscarConferencia();
    };

    /**
     * Baixa a conferencia como CSV.
     * Separador ';' e BOM no inicio porque o Excel em portugues abre o arquivo
     * assim sem pedir importacao e sem quebrar os acentos.
     */
    const baixarConferencia = () => {
        if (conferencia.length === 0) return;

        const cabecalho = ['LOTE', 'TIPO', 'OP', 'MODELO (KING)', 'CLIENTE', 'PRODUTO', 'LAUDOS', 'DATA'];
        const linhas = conferencia.map(l => [
            String(l.lote),
            l.sobra ? 'SOBRA' : 'NORMAL',
            l.op,
            l.modelo,
            l.cliente ?? '',
            l.produto ?? '',
            l.laudos.map(x => formatarLaudo(x.laudo, anoDoLaudo(x.created_at))).join(' | '),
            new Date(l.created_at).toLocaleDateString('pt-BR')
        ]);

        const csv = '﻿' + [cabecalho, ...linhas]
            .map(linha => linha.map(campo => `"${campo.replace(/"/g, '""')}"`).join(';'))
            .join('\r\n');

        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `conferencia-lotes-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    // Load archived when switching to archive tab
    useEffect(() => {
        if (activeTab === 'arquivo') {
            handleSearch();
        }
    }, [activeTab]);

    // Esc fecha o popup, como em qualquer janela.
    useEffect(() => {
        if (!conferenciaAberta) return;
        const aoTeclar = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setConferenciaAberta(false);
        };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, [conferenciaAberta]);

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

    // Ano impresso ao lado da OP. Sai da data de acabamento da PROPRIA
    // etiqueta, nao do relogio: reimprimir hoje uma etiqueta arquivada de
    // outro ano tem que sair com o ano dela. Se a data estiver fora do
    // formato dd/mm/aaaa, cai no ano do laudo e, por ultimo, no ano atual.
    const anoDaEtiqueta = (() => {
        const doCampo = labelData.dataAcabamento.split('/')[2];
        if (/^\d{4}$/.test(doCampo ?? '')) return doCampo;
        return labelData.laudoAno || anoDoLaudo();
    })();

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
                    <button className="tab-btn" onClick={abrirConferencia}>
                        <ListChecks size={14} /> Lotes
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
                                        onBlur={() => carregarParOpModelo()}
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
                                        placeholder="Gerado por OP + modelo"
                                        title="O lote e gerado pelo sistema e fica preso ao par OP + modelo"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Nº Interno</label>
                                <div className="prefixo-row">
                                    <span className="prefixo-fixo">KING</span>
                                    <input
                                        name="numeroInterno"
                                        value={labelData.numeroInterno}
                                        onChange={handleChange}
                                        onBlur={() => carregarParOpModelo()}
                                        placeholder="Código do modelo"
                                    />
                                </div>
                                <small className="campo-ajuda">
                                    Código do modelo. O lote e o laudo pertencem ao par OP + modelo:
                                    modelos diferentes na mesma OP têm números diferentes.
                                </small>
                            </div>

                            <div className="form-group">
                                <label className="check-linha">
                                    <input
                                        type="checkbox"
                                        checked={labelData.sobra}
                                        onChange={(e) => {
                                            const marcado = e.target.checked;
                                            setLabelData(prev => ({ ...prev, sobra: marcado }));
                                            carregarParOpModelo(marcado);
                                        }}
                                    />
                                    Sobra
                                </label>
                                <small className="campo-ajuda">
                                    Material de sobra deste mesmo par OP + modelo. Só o lote muda:
                                    ela recebe um lote separado, mas imprime o laudo da 1ª entrega.
                                </small>
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
                                    {labelData.sobra
                                        ? 'Sobra: o laudo é sempre o da 1ª entrega, e não muda.'
                                        : 'Reimpressão: escolha a entrega existente. O botão só para remessa nova.'}
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
                                            <button
                                                type="button"
                                                className="archive-delete-btn"
                                                onClick={(e) => handleExcluir(item, e)}
                                                disabled={loading}
                                                title="Apagar esta etiqueta do arquivo"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                <div className="sidebar-footer">
                    {activeTab === 'nova' && (
                        <>
                            <button className="limpar-btn" onClick={handleLimpar} disabled={loading}>
                                <Eraser size={18} />
                                Limpar
                            </button>
                            <button className="save-btn" onClick={() => handleSave()} disabled={loading}>
                                <Save size={20} />
                                {loading ? 'Salvando...' : (savedId ? 'Atualizar' : 'Arquivar')}
                            </button>
                        </>
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
                                {/* Layout espelhado da etiqueta em uso (rotulo a esquerda,
                                    valor recuado). A metade direita, do OP/OF para baixo, e
                                    zona proibida: ali o papel ja vem com a arte impressa
                                    ("VAL. 1 ANO APOS DATA DE FABRICACAO" e a nota da ISO). */}
                                <div className="etq-marca">
                                    <span className="etq-marca-nome">KINGRAF</span>
                                    <span className="etq-marca-sub">Indústria Gráfica</span>
                                </div>

                                <div className="etq-corpo">
                                    <div className="etq-linha">
                                        <span className="etq-rot">CLIENTE</span>
                                        <span className="etq-val">{labelData.cliente || '---'}</span>
                                    </div>

                                    <div className="etq-linha">
                                        <span className="etq-rot">PRODUTO</span>
                                        <span className="etq-val">{labelData.produto || '---'}</span>
                                    </div>

                                    <div className="etq-linha dupla">
                                        <span className="etq-rot">CLI</span>
                                        <span className="etq-val">{labelData.cli || '---'}</span>
                                        <span className="etq-rot">KING</span>
                                        <span className="etq-val">{labelData.numeroInterno.trim() || '---'}</span>
                                    </div>

                                    <div className="etq-linha dupla">
                                        <span className="etq-rot">QTDADE</span>
                                        <span className="etq-val forte">{labelData.quantidade || '---'}</span>
                                        <span className="etq-rot">LOTE</span>
                                        <span className="etq-val">{labelData.lote || '---'}</span>
                                    </div>

                                    {/* Daqui para baixo, so a metade esquerda. */}
                                    <div className="etq-linha curta">
                                        <span className="etq-rot">OP/OF</span>
                                        <span className="etq-val">
                                            {labelData.opOf ? `${labelData.opOf}/${anoDaEtiqueta}` : '---'}
                                        </span>
                                    </div>

                                    <div className="etq-linha curta">
                                        <span className="etq-rot">DATA ACAB.</span>
                                        <span className="etq-val">{labelData.dataAcabamento || '---'}</span>
                                    </div>

                                    <div className="etq-linha curta laudo">
                                        <span className="etq-rot">LAUDO</span>
                                        <span className="etq-val">
                                            {formatarLaudo(labelData.laudo, labelData.laudoAno) || '---'}
                                        </span>
                                    </div>

                                    <div className="etq-linha curta">
                                        <span className="etq-rot">EMISSOR</span>
                                        <span className="etq-val">{labelData.emissor || '---'}</span>
                                    </div>

                                    <div className="etq-linha curta">
                                        <span className="etq-rot">OPERADOR</span>
                                        <span className="etq-val">{labelData.operador || '---'}</span>
                                    </div>

                                    <div className="etq-rodape">
                                        <div className="etq-carimbo">
                                            {labelData.dataAcabamento} {labelData.hora}
                                            <span className="etq-sequencia">ETIQUETA {num}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </main>

            {conferenciaAberta && (
                // Clique no fundo fecha; no conteudo, nao — dai o stopPropagation.
                <div className="conf-overlay" onClick={() => setConferenciaAberta(false)}>
                    <div className="conf-janela" onClick={(e) => e.stopPropagation()}>
                        <header className="conf-cabecalho">
                            <div className="conf-titulo">
                                <ListChecks size={18} color="var(--kingraf-orange)" />
                                <h2>Conferência de Lotes</h2>
                                <span className="conf-contagem">
                                    {conferencia.length} {conferencia.length === 1 ? 'lote' : 'lotes'}
                                </span>
                            </div>

                            <div className="conf-acoes">
                                <div className="search-row conf-busca">
                                    <input
                                        type="text"
                                        value={buscaConferencia}
                                        onChange={(e) => setBuscaConferencia(e.target.value)}
                                        placeholder="OP, modelo, lote ou laudo..."
                                        onKeyDown={(e) => e.key === 'Enter' && handleBuscarConferencia()}
                                    />
                                    <button className="search-btn" onClick={handleBuscarConferencia}>
                                        <Search size={18} />
                                    </button>
                                </div>
                                <button
                                    className="conf-baixar"
                                    onClick={baixarConferencia}
                                    disabled={conferencia.length === 0}
                                    title="Baixar como CSV, abre direto no Excel"
                                >
                                    <Download size={16} /> Baixar CSV
                                </button>
                                <button
                                    className="back-btn-icon"
                                    onClick={() => setConferenciaAberta(false)}
                                    title="Fechar (Esc)"
                                >
                                    <X size={20} color="#FFFFFF" />
                                </button>
                            </div>
                        </header>

                        <div className="conf-corpo">
                            {carregandoConf ? (
                                <p className="conf-vazio">Carregando...</p>
                            ) : conferencia.length === 0 ? (
                                <p className="conf-vazio">Nenhum lote encontrado.</p>
                            ) : (
                                <table className="conf-tabela">
                                    <thead>
                                        <tr>
                                            <th>Lote</th>
                                            <th>Tipo</th>
                                            <th>OP</th>
                                            <th>Modelo (KING)</th>
                                            <th>Cliente</th>
                                            <th>Produto</th>
                                            <th>Laudos</th>
                                            <th>Data</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {conferencia.map((linha) => (
                                            <tr key={`${linha.op}|${linha.modelo}|${linha.sobra}`}>
                                                <td className="conf-td-lote">{linha.lote}</td>
                                                <td>
                                                    {linha.sobra
                                                        ? <span className="conf-tag-sobra">SOBRA</span>
                                                        : <span className="conf-tag-normal">Normal</span>}
                                                </td>
                                                <td>{linha.op}</td>
                                                <td>{linha.modelo || '—'}</td>
                                                <td>{linha.cliente || '—'}</td>
                                                <td>{linha.produto || '—'}</td>
                                                <td>
                                                    {linha.laudos.length === 0 ? (
                                                        <span className="conf-sem-laudo">
                                                            {linha.sobra ? '1ª entrega ainda não gerada' : 'Sem entrega'}
                                                        </span>
                                                    ) : (
                                                        <div className="conf-laudos">
                                                            {linha.laudos.map(l => (
                                                                <span key={l.laudo} className="conf-laudo">
                                                                    {l.sequencia}ª · {formatarLaudo(l.laudo, anoDoLaudo(l.created_at))}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                                <td>{new Date(linha.created_at).toLocaleDateString('pt-BR')}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <footer className="conf-rodape">
                            Somente leitura — nada nesta janela gera ou altera número.
                            Mostrando os 50 lotes mais recentes; use a busca para ir além.
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BoxLabel;
