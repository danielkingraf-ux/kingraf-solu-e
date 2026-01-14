import React, { useState, useEffect } from 'react';
import {
    ClipboardCheck,
    Clock,
    Save,
    Plus,
    Trash2,
    X,
    Users,
    AlertCircle,
    Camera
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import '../Production/Stock.css';

interface Revisor {
    id: string;
    nome: string;
}

interface Setor {
    id: string;
    nome: string;
}

interface Operador {
    id: string;
    nome: string;
}

interface TipoDesvio {
    id: string;
    nome: string;
}

interface TempoItem {
    id?: string;
    data_inicio: string;
    data_fim: string | null;
}

interface DesvioItem {
    tipo_desvio_id: string;
    quantidade: number;
    observacao: string;
    foto_file?: File | null;
    foto_preview?: string;
}

// Helper para obter datetime-local no fuso horário local
const getLocalDateTimeString = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localDate = new Date(now.getTime() - offset * 60 * 1000);
    return localDate.toISOString().slice(0, 16);
};

const NewRevision: React.FC = () => {
    // Dados de referência
    const [revisores, setRevisores] = useState<Revisor[]>([]);
    const [setores, setSetores] = useState<Setor[]>([]);
    const [operadores, setOperadores] = useState<Operador[]>([]);
    const [tiposDesvio, setTiposDesvio] = useState<TipoDesvio[]>([]);

    // Estado do formulário
    const [revisaId, setRevisaoId] = useState<string | null>(null);
    const [activeOp, setActiveOp] = useState('');
    const [op, setOp] = useState('');
    const [selectedSetores, setSelectedSetores] = useState<string[]>([]);
    const [selectedOperadores, setSelectedOperadores] = useState<string[]>([]);
    const [selectedRevisores, setSelectedRevisores] = useState<string[]>([]);
    const [dataInicio, setDataInicio] = useState('');
    const [dataFim, setDataFim] = useState('');
    const [quantidadeRevisada, setQuantidadeRevisada] = useState(0);
    const [quantidadeAprovada, setQuantidadeAprovada] = useState(0);
    const [quantidadeReprovada, setQuantidadeReprovada] = useState(0);
    const [acumuladoRevisada, setAcumuladoRevisada] = useState(0);
    const [acumuladoAprovada, setAcumuladoAprovada] = useState(0);
    const [observacaoGeral, setObservacaoGeral] = useState('');
    const [desvios, setDesvios] = useState<DesvioItem[]>([]);
    const [temposAnteriores, setTemposAnteriores] = useState<TempoItem[]>([]);
    const [periodosPendentes, setPeriodosPendentes] = useState<TempoItem[]>([]);

    const [loading, setLoading] = useState(false);
    const [showRevisorModal, setShowRevisorModal] = useState(false);
    const [showOperadorModal, setShowOperadorModal] = useState(false);
    const [showSetorModal, setShowSetorModal] = useState(false);

    useEffect(() => {
        carregarDadosReferencia();
        setDataInicio(getLocalDateTimeString());

        // Suporte para carregar OP da URL (ex: ?op=123)
        const params = new URLSearchParams(window.location.search);
        const opParam = params.get('op');
        if (opParam) {
            setOp(opParam);
            buscarOpAtiva(opParam);
        }
    }, []);

    // Busca revisão ativa ao mudar a OP
    const buscarOpAtiva = async (numeroOp: string) => {
        const opValue = numeroOp.trim();
        if (!opValue || (revisaId && activeOp === opValue)) return;

        try {
            const { data: revisao, error: _error } = await supabase
                .from('qual_revisoes')
                .select(`
                    *,
                    revisores:qual_revisao_revisores(revisor_id),
                    tempos:qual_revisao_tempos(*),
                    operadores:qual_revisao_operadores(operador_id),
                    setores:qual_revisao_setores(setor_id)
                `)
                .eq('op', opValue)
                .eq('status', 'em_andamento')
                .maybeSingle();

            if (revisao) {
                setRevisaoId(revisao.id);
                setActiveOp(revisao.op || opValue);
                const setorIds = (revisao.setores || [])
                    .map((item: any) => item.setor_id)
                    .filter(Boolean);
                const operadorIds = (revisao.operadores || [])
                    .map((item: any) => item.operador_id)
                    .filter(Boolean);
                setSelectedSetores(
                    setorIds.length > 0
                        ? setorIds
                        : revisao.setor_origem_id
                            ? [revisao.setor_origem_id]
                            : []
                );
                setSelectedOperadores(
                    operadorIds.length > 0
                        ? operadorIds
                        : revisao.operador_id
                            ? [revisao.operador_id]
                            : []
                );
                setAcumuladoRevisada(revisao.quantidade_revisada || 0);
                setAcumuladoAprovada(revisao.quantidade_aprovada || 0);
                setObservacaoGeral(revisao.observacao_geral || '');
                setTemposAnteriores(revisao.tempos || []);
                setPeriodosPendentes([]);
                setDataInicio(getLocalDateTimeString());
                setDataFim('');
                setQuantidadeRevisada(0);
                setQuantidadeAprovada(0);
                setQuantidadeReprovada(0);
                setDesvios([]);

                if (revisao.revisores) {
                    setSelectedRevisores(revisao.revisores.map((r: any) => r.revisor_id));
                }
            } else if (revisaId && activeOp && activeOp !== opValue) {
                resetForm(true);
                setOp(opValue);
            }
        } catch (err) {
            console.error('Erro ao buscar OP ativa:', err);
        }
    };

    // Cálculo automático de reprovadas
    useEffect(() => {
        const reprovadas = Math.max(0, quantidadeRevisada - quantidadeAprovada);
        setQuantidadeReprovada(reprovadas);
    }, [quantidadeRevisada, quantidadeAprovada]);

    const carregarDadosReferencia = async () => {
        try {
            const [revisoresRes, setoresRes, desviosRes, operadoresRes] = await Promise.all([
                supabase.from('qual_revisores').select('*').eq('ativo', true).order('nome'),
                supabase.from('qual_setores').select('*').eq('ativo', true).order('nome'),
                supabase.from('qual_tipos_desvios').select('*').eq('ativo', true).order('nome'),
                supabase.from('qual_operadores').select('*').eq('ativo', true).order('nome')
            ]);

            if (revisoresRes.data) setRevisores(revisoresRes.data);
            if (setoresRes.data) setSetores(setoresRes.data);
            if (desviosRes.data) setTiposDesvio(desviosRes.data);
            if (operadoresRes.data) setOperadores(operadoresRes.data);
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
        }
    };

    const adicionarDesvio = () => {
        setDesvios([...desvios, { tipo_desvio_id: '', quantidade: 0, observacao: '' }]);
    };

    const removerDesvio = (index: number) => {
        setDesvios(desvios.filter((_, i) => i !== index));
    };

    const atualizarDesvio = (index: number, campo: keyof DesvioItem, valor: any) => {
        const novosDesvios = [...desvios];
        novosDesvios[index] = { ...novosDesvios[index], [campo]: valor };
        setDesvios(novosDesvios);
    };

    const toggleRevisor = (id: string) => {
        if (selectedRevisores.includes(id)) {
            setSelectedRevisores(selectedRevisores.filter(r => r !== id));
        } else {
            setSelectedRevisores([...selectedRevisores, id]);
        }
    };

    const toggleOperador = (id: string) => {
        if (selectedOperadores.includes(id)) {
            setSelectedOperadores(selectedOperadores.filter(o => o !== id));
        } else {
            setSelectedOperadores([...selectedOperadores, id]);
        }
    };

    const toggleSetor = (id: string) => {
        if (selectedSetores.includes(id)) {
            setSelectedSetores(selectedSetores.filter(s => s !== id));
        } else {
            setSelectedSetores([...selectedSetores, id]);
        }
    };

    const calcularMinutosPeriodo = (inicio: string, fim?: string | null) => {
        const inicioMs = new Date(inicio).getTime();
        if (!Number.isFinite(inicioMs)) return 0;
        const fimMs = fim ? new Date(fim).getTime() : Date.now();
        if (!Number.isFinite(fimMs)) return 0;
        return Math.max(0, Math.floor((fimMs - inicioMs) / (1000 * 60)));
    };

    const formatarHoras = (minutosTotal: number = 0) => {
        if (minutosTotal <= 0) return '0h';
        const horas = Math.floor(minutosTotal / 60);
        const minutos = minutosTotal % 60;
        return `${horas}h ${minutos}min`;
    };

    const formatarDataHora = (dataStr: string) => {
        const data = new Date(dataStr);
        if (Number.isNaN(data.getTime())) return '-';
        return data.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const adicionarPeriodo = () => {
        if (!dataInicio) {
            alert('Informe a data/hora de inicio.');
            return;
        }
        if (!dataFim) {
            alert('Informe a data/hora de termino para adicionar outro periodo.');
            return;
        }

        const inicioMs = new Date(dataInicio).getTime();
        const fimMs = new Date(dataFim).getTime();
        if (!Number.isFinite(inicioMs) || !Number.isFinite(fimMs)) {
            alert('Datas invalidas no periodo.');
            return;
        }
        if (fimMs < inicioMs) {
            alert('A data/hora de termino nao pode ser menor que a de inicio.');
            return;
        }

        setPeriodosPendentes(prev => ([
            ...prev,
            {
                data_inicio: dataInicio,
                data_fim: dataFim
            }
        ]));
        setDataInicio(getLocalDateTimeString());
        setDataFim('');
    };

    const removerPeriodoPendente = (index: number) => {
        setPeriodosPendentes(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = async (finalizar: boolean = false) => {
        if (!op || selectedSetores.length === 0 || selectedRevisores.length === 0 || !dataInicio) {
            alert('Por favor, preencha OP, Setores, Revisores e Data de inicio.');
            return;
        }

        if (selectedOperadores.length === 0) {
            alert('Por favor, selecione operador(es) antes de salvar.');
            return;
        }

        const opValue = op.trim();
        if (revisaId && activeOp && opValue !== activeOp) {
            alert('A OP foi alterada. Recarregue a OP antes de salvar.');
            return;
        }

        if (quantidadeRevisada < 0 || quantidadeAprovada < 0) {
            alert('As quantidades nao podem ser negativas.');
            return;
        }

        if (quantidadeAprovada > quantidadeRevisada) {
            alert('A quantidade aprovada nao pode ser maior que a revisada.');
            return;
        }

        const dataFimValue = dataFim || getLocalDateTimeString();
        const inicioMs = new Date(dataInicio).getTime();
        const fimMs = new Date(dataFimValue).getTime();
        if (Number.isFinite(inicioMs) && Number.isFinite(fimMs) && fimMs < inicioMs) {
            alert('A data/hora de termino nao pode ser menor que a de inicio.');
            return;
        }

        setLoading(true);
        try {
            // 1. Criar ou Atualizar a revisão
            const totalRevisada = acumuladoRevisada + quantidadeRevisada;
            const totalAprovada = acumuladoAprovada + quantidadeAprovada;
            const primarySetorId = selectedSetores[0] || null;
            const primaryOperadorId = selectedOperadores[0] || null;
            const revisionData = {
                op,
                setor_origem_id: primarySetorId,
                operador_id: primaryOperadorId,
                quantidade_revisada: totalRevisada,
                quantidade_aprovada: totalAprovada,
                quantidade_reprovada: Math.max(0, totalRevisada - totalAprovada),
                observacao_geral: observacaoGeral,
                status: finalizar ? 'finalizada' : 'em_andamento'
            };

            let currentRevisaoId = revisaId;

            if (currentRevisaoId) {
                const { error: updateError } = await supabase
                    .from('qual_revisoes')
                    .update(revisionData)
                    .eq('id', currentRevisaoId);
                if (updateError) throw updateError;
            } else {
                const { data: newRev, error: insertError } = await supabase
                    .from('qual_revisoes')
                    .insert([revisionData])
                    .select()
                    .single();
                if (insertError) throw insertError;
                currentRevisaoId = newRev.id;
                setRevisaoId(newRev.id);
                setActiveOp(op);
            }

            // 2. Salvar o período de tempo
            const periodosParaSalvar: TempoItem[] = [
                ...periodosPendentes,
                { data_inicio: dataInicio, data_fim: dataFimValue }
            ];
            const { error: tempoError } = await supabase
                .from('qual_revisao_tempos')
                .insert(periodosParaSalvar.map(periodo => ({
                    revisao_id: currentRevisaoId,
                    data_inicio: periodo.data_inicio,
                    data_fim: periodo.data_fim
                })));
            if (tempoError) throw tempoError;

            // 3. Vincular revisores (apenas se for nova revisão)
            const { error: deleteRevisoresError } = await supabase
                .from('qual_revisao_revisores')
                .delete()
                .eq('revisao_id', currentRevisaoId);
            if (deleteRevisoresError) throw deleteRevisoresError;

            const revisoresPayload = selectedRevisores.map(rid => ({
                revisao_id: currentRevisaoId,
                revisor_id: rid
            }));
            const { error: revError } = await supabase
                .from('qual_revisao_revisores')
                .insert(revisoresPayload);
            if (revError) throw revError;

            const { error: deleteOperadoresError } = await supabase
                .from('qual_revisao_operadores')
                .delete()
                .eq('revisao_id', currentRevisaoId);
            if (deleteOperadoresError) throw deleteOperadoresError;

            if (selectedOperadores.length > 0) {
                const operadoresPayload = selectedOperadores.map(operadorId => ({
                    revisao_id: currentRevisaoId,
                    operador_id: operadorId
                }));
                const { error: operError } = await supabase
                    .from('qual_revisao_operadores')
                    .insert(operadoresPayload);
                if (operError) throw operError;
            }

            const { error: deleteSetoresError } = await supabase
                .from('qual_revisao_setores')
                .delete()
                .eq('revisao_id', currentRevisaoId);
            if (deleteSetoresError) throw deleteSetoresError;

            if (selectedSetores.length > 0) {
                const setoresPayload = selectedSetores.map(setorId => ({
                    revisao_id: currentRevisaoId,
                    setor_id: setorId
                }));
                const { error: setorError } = await supabase
                    .from('qual_revisao_setores')
                    .insert(setoresPayload);
                if (setorError) throw setorError;
            }

            // 4. Inserir desvios (com upload de fotos)
            if (desvios.length > 0) {
                const desviosValidos = desvios.filter(d => d.tipo_desvio_id && d.quantidade > 0);

                for (const desvio of desviosValidos) {
                    let fotoUrl = null;

                    // Upload da foto se existir
                    if (desvio.foto_file) {
                        const fileName = `${currentRevisaoId}/${Date.now()}_${desvio.foto_file.name}`;
                        const { data: uploadData, error: uploadError } = await supabase.storage
                            .from('quality-photos')
                            .upload(fileName, desvio.foto_file);

                        if (!uploadError && uploadData) {
                            const { data: publicUrlData } = supabase.storage
                                .from('quality-photos')
                                .getPublicUrl(uploadData.path);
                            fotoUrl = publicUrlData.publicUrl;
                        }
                    }

                    const { error: desvioError } = await supabase
                        .from('qual_revisao_desvios')
                        .insert([{
                            revisao_id: currentRevisaoId,
                            tipo_desvio_id: desvio.tipo_desvio_id,
                            quantidade: desvio.quantidade,
                            observacao: desvio.observacao,
                            foto_url: fotoUrl
                        }]);
                    if (desvioError) throw desvioError;
                }
            }

            if (finalizar) {
                alert('Revisao finalizada com sucesso!');
                resetForm();
            } else {
                alert('Progresso salvo!');
                // Atualiza o acumulado local para permitir continuar na mesma tela
                setAcumuladoRevisada(prev => prev + quantidadeRevisada);
                setAcumuladoAprovada(prev => prev + quantidadeAprovada);

                // Prepara para novo período
                setDataInicio(getLocalDateTimeString());
                setDataFim('');
                setQuantidadeRevisada(0);
                setQuantidadeAprovada(0);
                setDesvios([]);
                // Recarrega tempos para mostrar o histórico atualizado
                const { data: novosTempos } = await supabase
                    .from('qual_revisao_tempos')
                    .select('*')
                    .eq('revisao_id', currentRevisaoId)
                    .order('created_at', { ascending: true });
                if (novosTempos) setTemposAnteriores(novosTempos);
            }

        } catch (error: any) {
            alert('Erro ao salvar: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = (keepOp: boolean = false) => {
        setRevisaoId(null);
        if (!keepOp) {
            setOp('');
        }
        setActiveOp('');
        setSelectedSetores([]);
        setSelectedOperadores([]);
        setSelectedRevisores([]);
        setDataInicio(getLocalDateTimeString());
        setDataFim('');
        setQuantidadeRevisada(0);
        setQuantidadeAprovada(0);
        setQuantidadeReprovada(0);
        setAcumuladoRevisada(0);
        setAcumuladoAprovada(0);
        setObservacaoGeral('');
        setDesvios([]);
        setTemposAnteriores([]);
        setPeriodosPendentes([]);
    };

    const periodosParaTotal: TempoItem[] = [
        ...temposAnteriores,
        ...periodosPendentes,
        ...(dataInicio ? [{ data_inicio: dataInicio, data_fim: dataFim || null }] : [])
    ];
    const totalMinutos = periodosParaTotal.reduce(
        (acc, periodo) => acc + calcularMinutosPeriodo(periodo.data_inicio, periodo.data_fim),
        0
    );
    const mostrarTempoTotal = Boolean(op || temposAnteriores.length > 0 || periodosPendentes.length > 0);

    return (
        <div className="stock-container">
            <div className="page-header">
                <h2><ClipboardCheck size={24} /> Nova Revisão</h2>
            </div>

            <form onSubmit={(e) => e.preventDefault()}>
                {/* Resumo de Acumulados (Se houver revisão em andamento) */}
                {revisaId && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '16px',
                        marginBottom: '24px',
                        padding: '16px',
                        backgroundColor: 'var(--kingraf-orange-alpha)',
                        borderRadius: '16px',
                        border: '1px solid var(--kingraf-orange)'
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--kingraf-orange)' }}>JÁ REVISADO</div>
                            <div style={{ fontSize: '20px', fontWeight: 800 }}>{acumuladoRevisada.toLocaleString()}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: '#10B981' }}>JÁ APROVADO</div>
                            <div style={{ fontSize: '20px', fontWeight: 800 }}>{acumuladoAprovada.toLocaleString()}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: '#EF4444' }}>JÁ REPROVADO</div>
                            <div style={{ fontSize: '20px', fontWeight: 800 }}>{(acumuladoRevisada - acumuladoAprovada).toLocaleString()}</div>
                        </div>
                    </div>
                )}

                {/* Seção: Dados da OP */}
                <div className="stock-card" style={{ marginBottom: '24px' }}>
                    <div className="card-header">
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Dados da Ordem de Produção</h3>
                    </div>
                    <div className="card-content">
                        <div className="form-row">
                            <div className="form-group">
                                <label>Número da OP *</label>
                                <input
                                    required
                                    placeholder="Ex: 18984"
                                    value={op}
                                    onChange={e => setOp(e.target.value)}
                                    onBlur={() => buscarOpAtiva(op)}
                                />
                            </div>
                            <div className="form-group">
                                <label>Setores (causadores) *</label>
                                <button
                                    type="button"
                                    onClick={() => setShowSetorModal(true)}
                                    style={{
                                        padding: '12px 16px',
                                        border: '1px solid #D1D5DB',
                                        borderRadius: '12px',
                                        backgroundColor: '#F8FAFC',
                                        color: selectedSetores.length > 0 ? '#0F172A' : '#94A3B8',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        textAlign: 'left',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {selectedSetores.length > 0
                                        ? `${selectedSetores.length} setor(es) selecionado(s)`
                                        : 'Clique para selecionar setores'}
                                </button>
                            </div>
                            <div className="form-group">
                                <label>Operadores (causadores) *</label>
                                <button
                                    type="button"
                                    onClick={() => setShowOperadorModal(true)}
                                    style={{
                                        padding: '12px 16px',
                                        border: '1px solid #D1D5DB',
                                        borderRadius: '12px',
                                        backgroundColor: '#F8FAFC',
                                        color: selectedOperadores.length > 0 ? '#0F172A' : '#94A3B8',
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        textAlign: 'left',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {selectedOperadores.length > 0
                                        ? `${selectedOperadores.length} operador(es) selecionado(s)`
                                        : 'Clique para selecionar operadores'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Seção: Equipe e Tempo */}
                <div className="stock-card" style={{ marginBottom: '24px' }}>
                    <div className="card-header">
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                            <Users size={18} style={{ marginRight: '8px' }} />
                            Equipe e Período
                        </h3>
                        {mostrarTempoTotal && (
                            <div style={{
                                padding: '6px 12px',
                                borderRadius: '999px',
                                backgroundColor: '#EFF6FF',
                                border: '1px solid #DBEAFE',
                                color: '#1D4ED8',
                                fontSize: '12px',
                                fontWeight: 700
                            }}>
                                Tempo total: {formatarHoras(totalMinutos)}
                            </div>
                        )}
                    </div>
                    <div className="card-content">
                        <div className="form-group">
                            <label>Revisores *</label>
                            <button
                                type="button"
                                onClick={() => setShowRevisorModal(true)}
                                style={{
                                    padding: '12px 16px',
                                    border: '1px solid #D1D5DB',
                                    borderRadius: '12px',
                                    backgroundColor: '#F8FAFC',
                                    color: selectedRevisores.length > 0 ? '#0F172A' : '#94A3B8',
                                    fontSize: '14px',
                                    fontWeight: 500,
                                    textAlign: 'left',
                                    cursor: 'pointer'
                                }}
                            >
                                {selectedRevisores.length > 0
                                    ? `${selectedRevisores.length} revisor(es) selecionado(s)`
                                    : 'Clique para selecionar revisores'}
                            </button>
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label><Clock size={14} /> Data/Hora Início *</label>
                                <input
                                    type="datetime-local"
                                    required
                                    value={dataInicio}
                                    onChange={e => setDataInicio(e.target.value)}
                                    style={{
                                        padding: '12px 16px',
                                        border: '1px solid #D1D5DB',
                                        borderRadius: '12px',
                                        backgroundColor: '#F8FAFC',
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        color: '#0F172A'
                                    }}
                                />
                            </div>
                            <div className="form-group">
                                <label><Clock size={14} /> Data/Hora Término</label>
                                <input
                                    type="datetime-local"
                                    value={dataFim}
                                    onChange={e => setDataFim(e.target.value)}
                                    style={{
                                        padding: '12px 16px',
                                        border: '1px solid #D1D5DB',
                                        borderRadius: '12px',
                                        backgroundColor: '#F8FAFC',
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        color: '#0F172A'
                                    }}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                            <button
                                type="button"
                                onClick={adicionarPeriodo}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 14px',
                                    backgroundColor: 'var(--kingraf-orange-alpha)',
                                    color: 'var(--kingraf-orange)',
                                    border: '1px solid var(--kingraf-orange)',
                                    borderRadius: '8px',
                                    fontWeight: 600,
                                    fontSize: '13px',
                                    cursor: 'pointer'
                                }}
                            >
                                <Plus size={16} /> Adicionar periodo
                            </button>
                        </div>
                        {(temposAnteriores.length > 0 || periodosPendentes.length > 0) && (
                            <div style={{ marginTop: '16px' }}>
                                <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748B', marginBottom: '8px' }}>
                                    Periodos adicionados
                                </div>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1.2fr 1.2fr 0.7fr 0.7fr 40px',
                                    gap: '8px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    color: '#94A3B8',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    marginBottom: '6px'
                                }}>
                                    <span>Inicio</span>
                                    <span>Termino</span>
                                    <span>Duracao</span>
                                    <span>Status</span>
                                    <span></span>
                                </div>
                                {temposAnteriores.map((periodo, index) => (
                                    <div
                                        key={`saved-${periodo.id || index}`}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '1.2fr 1.2fr 0.7fr 0.7fr 40px',
                                            gap: '8px',
                                            alignItems: 'center',
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            border: '1px solid #E2E8F0',
                                            backgroundColor: '#F8FAFC',
                                            marginBottom: '8px'
                                        }}
                                    >
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                                            {formatarDataHora(periodo.data_inicio)}
                                        </div>
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                                            {periodo.data_fim ? formatarDataHora(periodo.data_fim) : 'Em andamento'}
                                        </div>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1D4ED8' }}>
                                            {formatarHoras(calcularMinutosPeriodo(periodo.data_inicio, periodo.data_fim))}
                                        </div>
                                        <div>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: '4px 10px',
                                                borderRadius: '999px',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                backgroundColor: '#ECFDF5',
                                                color: '#059669',
                                                border: '1px solid #D1FAE5'
                                            }}>
                                                Registrado
                                            </span>
                                        </div>
                                        <div></div>
                                    </div>
                                ))}
                                {periodosPendentes.map((periodo, index) => (
                                    <div
                                        key={`pending-${index}`}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '1.2fr 1.2fr 0.7fr 0.7fr 40px',
                                            gap: '8px',
                                            alignItems: 'center',
                                            padding: '10px 12px',
                                            borderRadius: '10px',
                                            border: '1px solid #FED7AA',
                                            backgroundColor: '#FFF7ED',
                                            marginBottom: '8px'
                                        }}
                                    >
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                                            {formatarDataHora(periodo.data_inicio)}
                                        </div>
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                                            {periodo.data_fim ? formatarDataHora(periodo.data_fim) : 'Em andamento'}
                                        </div>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#C2410C' }}>
                                            {formatarHoras(calcularMinutosPeriodo(periodo.data_inicio, periodo.data_fim))}
                                        </div>
                                        <div>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: '4px 10px',
                                                borderRadius: '999px',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                backgroundColor: '#FFEDD5',
                                                color: '#C2410C',
                                                border: '1px solid #FDBA74'
                                            }}>
                                                Pendente
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <button
                                                type="button"
                                                onClick={() => removerPeriodoPendente(index)}
                                                style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #FEE2E2',
                                                    backgroundColor: '#FEF2F2',
                                                    color: '#EF4444',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center'
                                                }}
                                                title="Remover periodo"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Seção: Quantidades */}
                <div className="stock-card" style={{ marginBottom: '24px' }}>
                    <div className="card-header">
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Quantidades</h3>
                    </div>
                    <div className="card-content">
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                            <div className="form-group">
                                <label>Quantidade Revisada</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={quantidadeRevisada}
                                    onChange={e => setQuantidadeRevisada(Number(e.target.value))}
                                />
                            </div>
                            <div className="form-group">
                                <label>Quantidade Aprovada</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={quantidadeAprovada}
                                    onChange={e => setQuantidadeAprovada(Number(e.target.value))}
                                    style={{ borderColor: '#10B981' }}
                                />
                            </div>
                            <div className="form-group">
                                <label>Quantidade Reprovada (Auto)</label>
                                <input
                                    type="number"
                                    readOnly
                                    value={quantidadeReprovada}
                                    style={{
                                        borderColor: '#EF4444',
                                        backgroundColor: '#FEF2F2',
                                        cursor: 'not-allowed'
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Seção: Desvios */}
                <div className="stock-card" style={{ marginBottom: '24px' }}>
                    <div className="card-header">
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                            <AlertCircle size={18} style={{ marginRight: '8px' }} />
                            Desvios Encontrados
                        </h3>
                        <button
                            type="button"
                            onClick={adicionarDesvio}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 14px',
                                backgroundColor: 'var(--kingraf-orange-alpha)',
                                color: 'var(--kingraf-orange)',
                                border: '1px solid var(--kingraf-orange)',
                                borderRadius: '8px',
                                fontWeight: 600,
                                fontSize: '13px',
                                cursor: 'pointer'
                            }}
                        >
                            <Plus size={16} /> Adicionar Desvio
                        </button>
                    </div>
                    <div className="card-content">
                        {desvios.length === 0 ? (
                            <p style={{ color: '#64748B', textAlign: 'center', padding: '20px' }}>
                                Nenhum desvio registrado. Clique em "Adicionar Desvio" para incluir.
                            </p>
                        ) : (
                            desvios.map((desvio, index) => (
                                <div
                                    key={index}
                                    style={{
                                        marginBottom: '16px',
                                        padding: '16px',
                                        backgroundColor: '#F8FAFC',
                                        borderRadius: '12px',
                                        border: '1px solid #E2E8F0'
                                    }}
                                >
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 3fr auto', gap: '12px', alignItems: 'end' }}>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label>Tipo de Desvio</label>
                                            <select
                                                value={desvio.tipo_desvio_id}
                                                onChange={e => atualizarDesvio(index, 'tipo_desvio_id', e.target.value)}
                                                style={{
                                                    padding: '10px 12px',
                                                    border: '1px solid #D1D5DB',
                                                    borderRadius: '8px',
                                                    backgroundColor: '#FFFFFF',
                                                    color: '#0F172A',
                                                    fontSize: '14px'
                                                }}
                                            >
                                                <option value="">Selecione</option>
                                                {tiposDesvio.map(t => (
                                                    <option key={t.id} value={t.id}>{t.nome}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label>Quantidade</label>
                                            <input
                                                type="number"
                                                min="0"
                                                value={desvio.quantidade}
                                                onChange={e => atualizarDesvio(index, 'quantidade', Number(e.target.value))}
                                                style={{ padding: '10px 12px' }}
                                            />
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0 }}>
                                            <label>Observação</label>
                                            <input
                                                placeholder="Detalhes do desvio"
                                                value={desvio.observacao}
                                                onChange={e => atualizarDesvio(index, 'observacao', e.target.value)}
                                                style={{ padding: '10px 12px' }}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removerDesvio(index)}
                                            style={{
                                                padding: '10px',
                                                backgroundColor: '#FEF2F2',
                                                border: '1px solid #FEE2E2',
                                                borderRadius: '8px',
                                                color: '#DC2626',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>

                                    {/* Linha de Upload de Foto */}
                                    <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                        <label
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                padding: '8px 16px',
                                                backgroundColor: '#EFF6FF',
                                                border: '1px solid #DBEAFE',
                                                borderRadius: '8px',
                                                color: '#2563EB',
                                                fontWeight: 600,
                                                fontSize: '13px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <Camera size={16} />
                                            {desvio.foto_preview ? 'Alterar Foto' : 'Adicionar Foto'}
                                            <input
                                                type="file"
                                                accept="image/*"
                                                style={{ display: 'none' }}
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        const preview = URL.createObjectURL(file);
                                                        atualizarDesvio(index, 'foto_file', file);
                                                        atualizarDesvio(index, 'foto_preview', preview);
                                                    }
                                                }}
                                            />
                                        </label>
                                        {desvio.foto_preview && (
                                            <img
                                                src={desvio.foto_preview}
                                                alt="Preview"
                                                style={{
                                                    width: '60px',
                                                    height: '60px',
                                                    objectFit: 'cover',
                                                    borderRadius: '8px',
                                                    border: '2px solid var(--kingraf-orange)'
                                                }}
                                            />
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Seção: Observações */}
                <div className="stock-card" style={{ marginBottom: '24px' }}>
                    <div className="card-header">
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Observações Gerais</h3>
                    </div>
                    <div className="card-content">
                        <div className="form-group">
                            <textarea
                                placeholder="Notas adicionais sobre a revisão..."
                                value={observacaoGeral}
                                onChange={e => setObservacaoGeral(e.target.value)}
                                rows={4}
                                style={{
                                    width: '100%',
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
                    </div>
                </div>

                {/* Botões de Ação */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginTop: '32px' }}>
                    <button
                        type="button"
                        className="btn-orange"
                        disabled={loading}
                        onClick={() => handleSave(false)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '14px 28px',
                            backgroundColor: 'transparent',
                            color: 'var(--kingraf-orange)',
                            border: '2px solid var(--kingraf-orange)'
                        }}
                    >
                        <Save size={18} />
                        {loading ? 'Salvando...' : 'Salvar Revisão'}
                    </button>

                    <button
                        type="button"
                        className="btn-orange"
                        disabled={loading}
                        onClick={() => handleSave(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 28px' }}
                    >
                        <ClipboardCheck size={18} />
                        {loading ? 'Processando...' : 'Finalizar Revisão'}
                    </button>
                </div>
            </form>

            {/* Modal de Seleção de Revisores */}
            {showRevisorModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '420px' }}>
                        <div className="modal-header">
                            <h3>Selecionar Revisores</h3>
                            <button onClick={() => setShowRevisorModal(false)}><X size={20} /></button>
                        </div>
                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            {revisores.map(r => (
                                <label
                                    key={r.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '12px 16px',
                                        marginBottom: '8px',
                                        backgroundColor: selectedRevisores.includes(r.id) ? 'var(--kingraf-orange-alpha)' : '#F8FAFC',
                                        border: selectedRevisores.includes(r.id) ? '1px solid var(--kingraf-orange)' : '1px solid #E2E8F0',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedRevisores.includes(r.id)}
                                        onChange={() => toggleRevisor(r.id)}
                                        style={{ display: 'none' }}
                                    />
                                    <div
                                        style={{
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '6px',
                                            border: selectedRevisores.includes(r.id) ? '2px solid var(--kingraf-orange)' : '2px solid #CBD5E1',
                                            backgroundColor: selectedRevisores.includes(r.id) ? 'var(--kingraf-orange)' : 'transparent',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        {selectedRevisores.includes(r.id) && (
                                            <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
                                                <path d="M1 5L5 9L13 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        )}
                                    </div>
                                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{r.nome}</span>
                                </label>
                            ))}
                        </div>
                        <div className="modal-actions">
                            <button
                                type="button"
                                className="btn-orange"
                                onClick={() => setShowRevisorModal(false)}
                            >
                                Confirmar ({selectedRevisores.length})
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showOperadorModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '420px' }}>
                        <div className="modal-header">
                            <h3>Selecionar Operadores</h3>
                            <button onClick={() => setShowOperadorModal(false)}><X size={20} /></button>
                        </div>
                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            {operadores.map(o => (
                                <label
                                    key={o.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '12px 16px',
                                        marginBottom: '8px',
                                        backgroundColor: selectedOperadores.includes(o.id) ? 'var(--kingraf-orange-alpha)' : '#F8FAFC',
                                        border: selectedOperadores.includes(o.id) ? '1px solid var(--kingraf-orange)' : '1px solid #E2E8F0',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedOperadores.includes(o.id)}
                                        onChange={() => toggleOperador(o.id)}
                                        style={{ display: 'none' }}
                                    />
                                    <div
                                        style={{
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '6px',
                                            border: selectedOperadores.includes(o.id) ? '2px solid var(--kingraf-orange)' : '2px solid #CBD5E1',
                                            backgroundColor: selectedOperadores.includes(o.id) ? 'var(--kingraf-orange)' : 'transparent',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        {selectedOperadores.includes(o.id) && (
                                            <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
                                                <path d="M1 5L5 9L13 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        )}
                                    </div>
                                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{o.nome}</span>
                                </label>
                            ))}
                        </div>
                        <div className="modal-actions">
                            <button
                                type="button"
                                className="btn-orange"
                                onClick={() => setShowOperadorModal(false)}
                            >
                                Confirmar ({selectedOperadores.length})
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showSetorModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '420px' }}>
                        <div className="modal-header">
                            <h3>Selecionar Setores</h3>
                            <button onClick={() => setShowSetorModal(false)}><X size={20} /></button>
                        </div>
                        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                            {setores.map(s => (
                                <label
                                    key={s.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '12px 16px',
                                        marginBottom: '8px',
                                        backgroundColor: selectedSetores.includes(s.id) ? 'var(--kingraf-orange-alpha)' : '#F8FAFC',
                                        border: selectedSetores.includes(s.id) ? '1px solid var(--kingraf-orange)' : '1px solid #E2E8F0',
                                        borderRadius: '10px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedSetores.includes(s.id)}
                                        onChange={() => toggleSetor(s.id)}
                                        style={{ display: 'none' }}
                                    />
                                    <div
                                        style={{
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '6px',
                                            border: selectedSetores.includes(s.id) ? '2px solid var(--kingraf-orange)' : '2px solid #CBD5E1',
                                            backgroundColor: selectedSetores.includes(s.id) ? 'var(--kingraf-orange)' : 'transparent',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        {selectedSetores.includes(s.id) && (
                                            <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
                                                <path d="M1 5L5 9L13 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        )}
                                    </div>
                                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{s.nome}</span>
                                </label>
                            ))}
                        </div>
                        <div className="modal-actions">
                            <button
                                type="button"
                                className="btn-orange"
                                onClick={() => setShowSetorModal(false)}
                            >
                                Confirmar ({selectedSetores.length})
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NewRevision;
