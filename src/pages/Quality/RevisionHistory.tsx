import React, { useState, useEffect } from 'react';
import {
    ClipboardList,
    Search,
    Eye,
    X,
    AlertCircle,
    Users,
    Trash2,
    Pencil
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import '../Production/Stock.css';

interface Revisao {
    id: string;
    op: string;
    setor_origem: { nome: string } | null;
    operador: { nome: string } | null;
    quantidade_revisada: number;
    quantidade_aprovada: number;
    quantidade_reprovada: number;
    status: string;
    observacao_geral: string | null;
    created_at: string;
    total_minutos?: number; // Calculado localmente
}

interface DesvioDetalhe {
    id: string;
    tipo_desvio: { nome: string } | null;
    quantidade: number;
    observacao: string | null;
    foto_url: string | null;
}

interface RevisorDetalhe {
    revisor: { nome: string } | null;
}

interface RevisionHistoryProps {
    onNavigate?: (page: string) => void;
}

const RevisionHistory: React.FC<RevisionHistoryProps> = ({ onNavigate }) => {
    const [revisoes, setRevisoes] = useState<Revisao[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRevisao, setSelectedRevisao] = useState<Revisao | null>(null);
    const [desviosDetalhe, setDesviosDetalhe] = useState<DesvioDetalhe[]>([]);
    const [revisoresDetalhe, setRevisoresDetalhe] = useState<RevisorDetalhe[]>([]);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [confirmReopenRevisao, setConfirmReopenRevisao] = useState<Revisao | null>(null);

    useEffect(() => {
        carregarRevisoes();
    }, []);

    const carregarRevisoes = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('qual_revisoes')
                .select(`
                    *,
                    setor_origem:qual_setores(nome),
                    operador:qual_operadores(nome),
                    tempos:qual_revisao_tempos(data_inicio, data_fim)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Calcular duração total para cada revisão
            const dataComDuracao = (data || []).map((r: any) => {
                let totalMs = 0;
                r.tempos?.forEach((t: any) => {
                    const inicio = new Date(t.data_inicio).getTime();
                    const fim = t.data_fim ? new Date(t.data_fim).getTime() : new Date().getTime();
                    if (inicio) {
                        totalMs += Math.max(0, fim - inicio);
                    }
                });
                return { ...r, total_minutos: Math.floor(totalMs / (1000 * 60)) };
            });

            setRevisoes(dataComDuracao);
        } catch (error) {
            console.error('Erro ao carregar revisões:', error);
        } finally {
            setLoading(false);
        }
    };

    const abrirDetalhes = async (revisao: Revisao) => {
        console.log('Abrindo detalhes para:', revisao.id);
        setSelectedRevisao(revisao);

        // Carregar desvios
        const { data: desvios } = await supabase
            .from('qual_revisao_desvios')
            .select(`
                id,
                quantidade,
                observacao,
                foto_url,
                tipo_desvio:qual_tipos_desvios(nome)
            `)
            .eq('revisao_id', revisao.id);

        // Carregar revisores
        const { data: revisores } = await supabase
            .from('qual_revisao_revisores')
            .select(`
                revisor:qual_revisores(nome)
            `)
            .eq('revisao_id', revisao.id);

        setDesviosDetalhe((desvios || []) as any);
        setRevisoresDetalhe((revisores || []) as any);
    };

    const excluirRevisao = async (id: string) => {
        console.log('Executando exclusão para id:', id);

        try {
            setLoading(true);
            // Deletar dados relacionados primeiro
            await supabase.from('qual_revisao_desvios').delete().eq('revisao_id', id);
            await supabase.from('qual_revisao_revisores').delete().eq('revisao_id', id);
            await supabase.from('qual_revisao_tempos').delete().eq('revisao_id', id);

            // Deletar a revisão principal
            const { error } = await supabase.from('qual_revisoes').delete().eq('id', id);
            if (error) throw error;

            alert('Revisão excluída com sucesso!');
            carregarRevisoes();
        } catch (error) {
            console.error('Erro ao excluir revisão:', error);
            alert('Erro ao excluir revisão.');
        } finally {
            setLoading(false);
        }
    };

    const reabrirERetomar = async (revisao: Revisao) => {
        console.log('reabrirERetomar chamado para:', revisao.id, 'status:', revisao.status);
        if (revisao.status === 'finalizada' && !confirmReopenRevisao) {
            setConfirmReopenRevisao(revisao);
            return;
        }

        if (revisao.status === 'finalizada' && confirmReopenRevisao) {

            try {
                setLoading(true);
                const { error } = await supabase
                    .from('qual_revisoes')
                    .update({ status: 'em_andamento' })
                    .eq('id', revisao.id);

                if (error) throw error;
                console.log('Revisão reaberta com sucesso:', revisao.id);
            } catch (error) {
                console.error('Erro ao reabrir revisão:', error);
                alert('Erro ao reabrir revisão.');
                setLoading(false);
                return;
            } finally {
                setLoading(false);
                setConfirmReopenRevisao(null);
            }
        }

        const url = `/qualidade/nova?op=${revisao.op}`;
        window.history.pushState({}, '', url);

        if (onNavigate) {
            onNavigate('revisions');
        } else {
            window.location.href = url;
        }
    };

    const filteredRevisoes = revisoes.filter(r =>
        r.op.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.setor_origem?.nome.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatarDataShort = (dataStr: string) => {
        return new Date(dataStr).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatarHoras = (minutosTotal: number = 0) => {
        if (minutosTotal === 0) return '0h';
        const horas = Math.floor(minutosTotal / 60);
        const minutos = minutosTotal % 60;
        return `${horas}h ${minutos}min`;
    };

    return (
        <div className="stock-container">
            <div className="page-header">
                <h2><ClipboardList size={24} /> Histórico de Revisões</h2>
                <div className="header-actions">
                    <div className="search-box">
                        <Search size={18} />
                        <input
                            placeholder="Buscar por OP ou Setor..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Tabela */}
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                            <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, fontSize: '13px', color: '#64748B' }}>Data/Hora</th>
                            <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, fontSize: '13px', color: '#64748B' }}>OP</th>
                            <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, fontSize: '13px', color: '#64748B' }}>Operador</th>
                            <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, fontSize: '13px', color: '#64748B' }}>Setor</th>
                            <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, fontSize: '13px', color: '#64748B' }}>Revisadas</th>
                            <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, fontSize: '13px', color: '#64748B' }}>Aprovadas</th>
                            <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, fontSize: '13px', color: '#64748B' }}>Reprovadas</th>
                            <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, fontSize: '13px', color: '#64748B' }}>Duração</th>
                            <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, fontSize: '13px', color: '#64748B' }}>Status</th>
                            <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, fontSize: '13px', color: '#64748B', minWidth: '280px' }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                                    Carregando...
                                </td>
                            </tr>
                        ) : filteredRevisoes.length === 0 ? (
                            <tr>
                                <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                                    Nenhuma revisão encontrada.
                                </td>
                            </tr>
                        ) : (
                            filteredRevisoes.map(r => (
                                <tr key={r.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                    <td style={{ padding: '14px 16px', fontSize: '14px', color: '#475569' }}>
                                        {formatarDataShort(r.created_at)}
                                    </td>
                                    <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: 700, color: 'var(--kingraf-orange)' }}>
                                        {r.op}
                                    </td>
                                    <td style={{ padding: '14px 16px', fontSize: '14px', color: '#0F172A' }}>
                                        {r.operador?.nome || '-'}
                                    </td>
                                    <td style={{ padding: '14px 16px', fontSize: '14px', color: '#0F172A' }}>
                                        {r.setor_origem?.nome || '-'}
                                    </td>
                                    <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: '14px', fontWeight: 600 }}>
                                        {r.quantidade_revisada.toLocaleString()}
                                    </td>
                                    <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: '14px', fontWeight: 600, color: '#10B981' }}>
                                        {r.quantidade_aprovada.toLocaleString()}
                                    </td>
                                    <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: '14px', fontWeight: 600, color: '#EF4444' }}>
                                        {r.quantidade_reprovada.toLocaleString()}
                                    </td>
                                    <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: '14px', color: '#64748B' }}>
                                        {formatarHoras(r.total_minutos)}
                                    </td>
                                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                        <span
                                            style={{
                                                padding: '4px 10px',
                                                borderRadius: '999px',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                textTransform: 'uppercase',
                                                backgroundColor: r.status === 'finalizada' ? '#ECFDF5' : '#FFFBEB',
                                                color: r.status === 'finalizada' ? '#059669' : '#D97706',
                                                border: r.status === 'finalizada' ? '1px solid #D1FAE5' : '1px solid #FEF3C7'
                                            }}
                                        >
                                            {r.status === 'finalizada' ? 'Finalizada' : 'Em Andamento'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); abrirDetalhes(r); }}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    padding: '8px 12px',
                                                    backgroundColor: '#EFF6FF',
                                                    border: '1px solid #DBEAFE',
                                                    borderRadius: '8px',
                                                    color: '#2563EB',
                                                    fontWeight: 600,
                                                    fontSize: '13px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <Eye size={14} /> Ver
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); reabrirERetomar(r); }}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    padding: '8px 12px',
                                                    backgroundColor: '#F8FAFC',
                                                    border: '1px solid #E2E8F0',
                                                    borderRadius: '8px',
                                                    color: '#64748B',
                                                    fontWeight: 600,
                                                    fontSize: '13px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <Pencil size={14} /> Editar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(r.id); }}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    padding: '8px 12px',
                                                    backgroundColor: '#FEF2F2',
                                                    border: '1px solid #FEE2E2',
                                                    borderRadius: '8px',
                                                    color: '#EF4444',
                                                    fontWeight: 600,
                                                    fontSize: '13px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <Trash2 size={14} /> Excluir
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal de Detalhes */}
            {selectedRevisao && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '700px' }}>
                        <div className="modal-header">
                            <h3>Detalhes da Revisão - OP {selectedRevisao.op}</h3>
                            <button onClick={() => setSelectedRevisao(null)}><X size={20} /></button>
                        </div>

                        {/* Resumo */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                            <div style={{ padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '12px', textAlign: 'center' }}>
                                <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600, marginBottom: '4px' }}>REVISADAS</div>
                                <div style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A' }}>{selectedRevisao.quantidade_revisada.toLocaleString()}</div>
                            </div>
                            <div style={{ padding: '16px', backgroundColor: '#ECFDF5', borderRadius: '12px', textAlign: 'center' }}>
                                <div style={{ fontSize: '12px', color: '#059669', fontWeight: 600, marginBottom: '4px' }}>APROVADAS</div>
                                <div style={{ fontSize: '24px', fontWeight: 800, color: '#10B981' }}>{selectedRevisao.quantidade_aprovada.toLocaleString()}</div>
                            </div>
                            <div style={{ padding: '16px', backgroundColor: '#FEF2F2', borderRadius: '12px', textAlign: 'center' }}>
                                <div style={{ fontSize: '12px', color: '#DC2626', fontWeight: 600, marginBottom: '4px' }}>REPROVADAS</div>
                                <div style={{ fontSize: '24px', fontWeight: 800, color: '#EF4444' }}>{selectedRevisao.quantidade_reprovada.toLocaleString()}</div>
                            </div>
                        </div>

                        {/* Informações */}
                        <div style={{ marginBottom: '24px' }}>
                            <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Setor de Origem</div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>{selectedRevisao.setor_origem?.nome || '-'}</div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Operador (Produção)</div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>{selectedRevisao.operador?.nome || '-'}</div>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>Tempo Total</div>
                                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>
                                        {formatarHoras(selectedRevisao.total_minutos)}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Revisores */}
                        {revisoresDetalhe.length > 0 && (
                            <div style={{ marginBottom: '24px' }}>
                                <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Users size={16} /> Revisores
                                </h4>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                    {revisoresDetalhe.map((r, i) => (
                                        <span
                                            key={i}
                                            style={{
                                                padding: '6px 12px',
                                                backgroundColor: '#EFF6FF',
                                                borderRadius: '8px',
                                                fontSize: '13px',
                                                fontWeight: 600,
                                                color: '#2563EB'
                                            }}
                                        >
                                            {r.revisor?.nome || 'Revisor'}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Desvios */}
                        {desviosDetalhe.length > 0 && (
                            <div style={{ marginBottom: '24px' }}>
                                <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <AlertCircle size={16} /> Desvios Encontrados
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {desviosDetalhe.map(d => (
                                        <div
                                            key={d.id}
                                            style={{
                                                padding: '12px 16px',
                                                backgroundColor: '#FEF2F2',
                                                borderRadius: '10px',
                                                border: '1px solid #FEE2E2'
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div style={{ fontWeight: 700, color: '#DC2626', fontSize: '14px' }}>{d.tipo_desvio?.nome || 'Desvio'}</div>
                                                    {d.observacao && (
                                                        <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>{d.observacao}</div>
                                                    )}
                                                </div>
                                                <div style={{ fontWeight: 800, fontSize: '18px', color: '#EF4444' }}>
                                                    {d.quantidade.toLocaleString()}
                                                </div>
                                            </div>
                                            {d.foto_url && (
                                                <div style={{ marginTop: '12px' }}>
                                                    <img
                                                        src={d.foto_url}
                                                        alt="Foto do desvio"
                                                        style={{
                                                            maxWidth: '100%',
                                                            maxHeight: '200px',
                                                            borderRadius: '8px',
                                                            border: '2px solid var(--kingraf-orange)',
                                                            cursor: 'pointer'
                                                        }}
                                                        onClick={() => window.open(d.foto_url!, '_blank')}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Observação Geral */}
                        {selectedRevisao.observacao_geral && (
                            <div>
                                <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>Observações</h4>
                                <p style={{ fontSize: '14px', color: '#475569', lineHeight: 1.6 }}>{selectedRevisao.observacao_geral}</p>
                            </div>
                        )}

                        <div className="modal-actions">
                            <button className="btn-orange" onClick={() => setSelectedRevisao(null)}>Fechar</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Confirmação de Exclusão */}
            {confirmDeleteId && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
                        <AlertCircle size={48} color="#EF4444" style={{ marginBottom: '16px' }} />
                        <h3>Confirmar Exclusão</h3>
                        <p style={{ color: '#64748B', marginBottom: '24px' }}>
                            Tem certeza que deseja excluir esta revisão? Esta ação não pode ser desfeita.
                        </p>
                        <div className="modal-actions" style={{ justifyContent: 'center' }}>
                            <button className="btn-cancel" onClick={() => setConfirmDeleteId(null)}>Cancelar</button>
                            <button
                                className="btn-orange"
                                style={{ backgroundColor: '#EF4444' }}
                                onClick={() => {
                                    excluirRevisao(confirmDeleteId);
                                    setConfirmDeleteId(null);
                                }}
                            >
                                Excluir Permanentemente
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Confirmação de Reabertura */}
            {confirmReopenRevisao && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
                        <Pencil size={48} color="var(--kingraf-orange)" style={{ marginBottom: '16px' }} />
                        <h3>Reabrir Revisão</h3>
                        <p style={{ color: '#64748B', marginBottom: '24px' }}>
                            Esta revisão está finalizada. Deseja reabri-la para edição?
                        </p>
                        <div className="modal-actions" style={{ justifyContent: 'center' }}>
                            <button className="btn-cancel" onClick={() => setConfirmReopenRevisao(null)}>Cancelar</button>
                            <button
                                className="btn-orange"
                                onClick={() => reabrirERetomar(confirmReopenRevisao)}
                            >
                                Reabrir e Editar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RevisionHistory;
