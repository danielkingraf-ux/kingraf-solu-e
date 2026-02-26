import React, { useState, useEffect } from 'react';
import {
    FileText,
    Download,
    Calendar,
    TrendingUp,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Clock,
    Users,
    Mail,
    X
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend
} from 'recharts';
import { supabase } from '../../supabaseClient';
import '../Production/Stock.css';

const COLORS = ['#F97316', '#3B82F6', '#10B981', '#EF4444', '#8B5CF6', '#F59E0B', '#06B6D4', '#EC4899'];

interface ReportData {
    totalRevisoes: number;
    totalRevisada: number;
    totalAprovada: number;
    totalReprovada: number;
    totalMinutos: number;
    revisoesPorSetor: { nome: string; quantidade: number }[];
    revisoesPorOperador: { nome: string; quantidade: number; reprovadas: number }[];
    desviosPorTipo: { nome: string; quantidade: number }[];
    revisoes: any[];
}

const QualityReports: React.FC = () => {
    const [periodo, setPeriodo] = useState<'semana' | 'mes' | 'ano'>('mes');
    const [dataInicio, setDataInicio] = useState('');
    const [dataFim, setDataFim] = useState('');
    const [loading, setLoading] = useState(true);
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailDestino, setEmailDestino] = useState('');
    const [enviandoEmail, setEnviandoEmail] = useState(false);

    useEffect(() => {
        calcularPeriodo(periodo);
    }, [periodo]);

    useEffect(() => {
        if (dataInicio && dataFim) {
            carregarRelatorio();
        }
    }, [dataInicio, dataFim]);

    const calcularPeriodo = (p: 'semana' | 'mes' | 'ano') => {
        const hoje = new Date();
        let inicio: Date;

        switch (p) {
            case 'semana':
                inicio = new Date(hoje);
                inicio.setDate(hoje.getDate() - 7);
                break;
            case 'mes':
                inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
                break;
            case 'ano':
                inicio = new Date(hoje.getFullYear(), 0, 1);
                break;
        }

        setDataInicio(inicio.toISOString().split('T')[0]);
        setDataFim(hoje.toISOString().split('T')[0]);
    };

    const carregarRelatorio = async () => {
        setLoading(true);
        try {
            const { data: revisoes } = await supabase
                .from('qual_revisoes')
                .select(`
                    *,
                    setor_origem:qual_setores(nome),
                    operador:qual_operadores(nome),
                    operadores_rel:qual_revisao_operadores(operador:qual_operadores(nome)),
                    revisores_rel:qual_revisao_revisores(revisor:qual_revisores(nome)),
                    tempos:qual_revisao_tempos(data_inicio, data_fim),
                    desvios:qual_revisao_desvios(quantidade, tipo_desvio:qual_tipos_desvios(nome))
                `)
                .gte('created_at', `${dataInicio}T00:00:00`)
                .lte('created_at', `${dataFim}T23:59:59`)
                .order('created_at', { ascending: false });

            if (!revisoes) {
                setReportData(null);
                setLoading(false);
                return;
            }

            // Calcular totais
            let totalRevisada = 0;
            let totalAprovada = 0;
            let totalReprovada = 0;
            let totalMinutos = 0;
            const setorCount: Record<string, number> = {};
            const desvioCount: Record<string, number> = {};
            const operadorStats: Record<string, { quantidade: number; reprovadas: number }> = {};

            revisoes.forEach(r => {
                totalRevisada += r.quantidade_revisada || 0;
                totalAprovada += r.quantidade_aprovada || 0;
                totalReprovada += r.quantidade_reprovada || 0;

                // Revisores (Contagem de pessoas envolvidas)
                r.num_revisores = r.revisores_rel?.length || 0;

                // Tempo
                r.tempos?.forEach((t: any) => {
                    if (t.data_inicio) {
                        const inicio = new Date(t.data_inicio).getTime();
                        const fim = t.data_fim ? new Date(t.data_fim).getTime() : new Date().getTime();
                        totalMinutos += Math.floor((fim - inicio) / (1000 * 60));
                    }
                });

                // Setor
                const setor = r.setor_origem?.nome || 'Sem setor';
                setorCount[setor] = (setorCount[setor] || 0) + 1;

                // Ranking de Operadores Causadores
                const opsRel = r.operadores_rel || [];
                opsRel.forEach((rel: any) => {
                    const nomeRel = rel.operador?.nome || 'Desconhecido';
                    if (!operadorStats[nomeRel]) operadorStats[nomeRel] = { quantidade: 0, reprovadas: 0 };
                    operadorStats[nomeRel].quantidade += 1;
                    operadorStats[nomeRel].reprovadas += (r.quantidade_reprovada || 0);
                });

                // Desvios
                r.desvios?.forEach((d: any) => {
                    const tipo = d.tipo_desvio?.nome || 'Outro';
                    desvioCount[tipo] = (desvioCount[tipo] || 0) + (d.quantidade || 0);
                });
            });

            setReportData({
                totalRevisoes: revisoes.length,
                totalRevisada,
                totalAprovada,
                totalReprovada,
                totalMinutos,
                revisoesPorSetor: Object.entries(setorCount).map(([nome, quantidade]) => ({ nome, quantidade })),
                revisoesPorOperador: Object.entries(operadorStats)
                    .map(([nome, stats]) => ({ nome, ...stats }))
                    .sort((a, b) => b.reprovadas - a.reprovadas),
                desviosPorTipo: Object.entries(desvioCount).map(([nome, quantidade]) => ({ nome, quantidade })).sort((a, b) => b.quantidade - a.quantidade),
                revisoes
            });
        } catch (error) {
            console.error('Erro ao carregar relatório:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatarHoras = (minutos: number) => {
        const h = Math.floor(minutos / 60);
        const m = minutos % 60;
        return `${h}h ${m}min`;
    };

    const formatarData = (dataStr: string) => {
        return new Date(dataStr).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    };

    const gerarPDF = () => {
        // Abre janela de impressão do navegador que pode salvar como PDF
        const printContent = document.getElementById('report-content');
        if (!printContent) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        printWindow.document.write(`
            <html>
            <head>
                <title>Relatório de Qualidade - ${formatarData(dataInicio)} a ${formatarData(dataFim)}</title>
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #1E293B; }
                    h1 { color: #F97316; border-bottom: 3px solid #F97316; padding-bottom: 10px; }
                    h2 { color: #0F172A; margin-top: 30px; }
                    .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 15px; margin: 20px 0; }
                    .kpi-card { background: #F8FAFC; padding: 15px; border-radius: 12px; text-align: center; border: 1px solid #E2E8F0; }
                    .kpi-value { font-size: 24px; font-weight: 800; color: #0F172A; }
                    .kpi-label { font-size: 10px; color: #64748B; font-weight: 600; margin-top: 5px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #E2E8F0; font-size: 12px; }
                    th { background: #F1F5F9; font-weight: 700; color: #475569; }
                    .badge { padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 600; }
                    .badge-green { background: #DCFCE7; color: #16A34A; }
                    .badge-orange { background: #FEF3C7; color: #D97706; }
                    .footer { margin-top: 40px; text-align: center; color: #94A3B8; font-size: 12px; }
                    @media print { body { padding: 20px; } }
                </style>
            </head>
            <body>
                <h1>📋 Relatório de Qualidade</h1>
                <p><strong>Período:</strong> ${formatarData(dataInicio)} a ${formatarData(dataFim)}</p>
                <p><strong>Gerado em:</strong> ${new Date().toLocaleString('pt-BR')}</p>

                <div class="kpi-grid">
                    <div class="kpi-card">
                        <div class="kpi-value">${reportData?.totalRevisoes || 0}</div>
                        <div class="kpi-label">REVISÕES</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-value">${reportData?.totalRevisada?.toLocaleString() || 0}</div>
                        <div class="kpi-label">PEÇAS REVISADAS</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-value" style="color: #8B5CF6">${reportData?.revisoes.reduce((acc, r) => acc + (r.num_revisores || 0), 0)}</div>
                        <div class="kpi-label">PESSOAS</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-value" style="color: #10B981">${reportData?.totalAprovada?.toLocaleString() || 0}</div>
                        <div class="kpi-label">APROVADAS</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-value" style="color: #EF4444">${reportData?.totalReprovada?.toLocaleString() || 0}</div>
                        <div class="kpi-label">REPROVADAS</div>
                    </div>
                </div>

                <h2>⏱️ Tempo Total em Revisão</h2>
                <p style="font-size: 24px; font-weight: 700;">${formatarHoras(reportData?.totalMinutos || 0)}</p>

                <h2>📊 Revisões por Setor</h2>
                <table>
                    <tr><th>Setor</th><th>Quantidade</th></tr>
                    ${reportData?.revisoesPorSetor.map(s => `<tr><td>${s.nome}</td><td>${s.quantidade}</td></tr>`).join('') || ''}
                </table>

                <h2>🏆 Ranking de Operadores (Causadores de Desvios)</h2>
                <table>
                    <tr><th>Operador</th><th>Quantidade de Reprovadas</th></tr>
                    ${reportData?.revisoesPorOperador.slice(0, 5).map(o => `<tr><td>${o.nome}</td><td><strong>${o.reprovadas.toLocaleString()}</strong></td></tr>`).join('') || ''}
                </table>

                <h2>⚠️ Principais Desvios</h2>
                <table>
                    <tr><th>Tipo de Desvio</th><th>Quantidade</th></tr>
                    ${reportData?.desviosPorTipo.slice(0, 10).map(d => `<tr><td>${d.nome}</td><td>${d.quantidade.toLocaleString()}</td></tr>`).join('') || ''}
                </table>

                <h2>📝 Lista de Revisões</h2>
                <table>
                    <tr><th>OP</th><th>Setor</th><th>Operador</th><th>Pessoas</th><th>Revisada</th><th>Aprovada</th><th>Reprovada</th><th>Status</th></tr>
                    ${reportData?.revisoes.map(r => `
                        <tr>
                            <td><strong>${r.op}</strong></td>
                            <td>${r.setor_origem?.nome || '-'}</td>
                            <td>${r.operador?.nome || '-'}</td>
                            <td>${r.num_revisores || 1}</td>
                            <td>${r.quantidade_revisada.toLocaleString()}</td>
                            <td>${r.quantidade_aprovada.toLocaleString()}</td>
                            <td>${r.quantidade_reprovada.toLocaleString()}</td>
                            <td><span class="badge ${r.status === 'finalizada' ? 'badge-green' : 'badge-orange'}">${r.status === 'finalizada' ? 'Finalizada' : 'Em Andamento'}</span></td>
                        </tr>
                    `).join('') || ''}
                </table>

                <div class="footer">
                    <p>Kingraf - Sistema de Qualidade</p>
                    <p>Relatório gerado automaticamente</p>
                </div>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    };

    const enviarPorEmail = () => {
        if (!emailDestino || !reportData) return;

        setEnviandoEmail(true);

        const assunto = encodeURIComponent(`Relatório de Qualidade - ${formatarData(dataInicio)} a ${formatarData(dataFim)}`);
        const corpo = encodeURIComponent(`
RELATÓRIO DE QUALIDADE - KINGRAF
================================

Período: ${formatarData(dataInicio)} a ${formatarData(dataFim)}
Gerado em: ${new Date().toLocaleString('pt-BR')}

RESUMO EXECUTIVO
----------------
• Total de Revisões: ${reportData.totalRevisoes}
• Peças Revisadas: ${reportData.totalRevisada.toLocaleString()}
• Peças Aprovadas: ${reportData.totalAprovada.toLocaleString()} (${taxaAprovacao}%)
• Peças Reprovadas: ${reportData.totalReprovada.toLocaleString()}
• Pessoas Envolvidas: ${reportData.revisoes.reduce((acc, r) => acc + (r.num_revisores || 0), 0)}
• Tempo Total: ${formatarHoras(reportData.totalMinutos)}

REVISÕES POR SETOR
------------------
${reportData.revisoesPorSetor.map(s => `• ${s.nome}: ${s.quantidade} revisões`).join('\n')}

RANKING DE OPERADORES (REPROVADAS)
----------------------------------
${reportData.revisoesPorOperador.slice(0, 5).map(o => `• ${o.nome}: ${o.reprovadas.toLocaleString()} peças`).join('\n')}

PRINCIPAIS DESVIOS
------------------
${reportData.desviosPorTipo.slice(0, 5).map(d => `• ${d.nome}: ${d.quantidade.toLocaleString()} ocorrências`).join('\n')}

---
Kingraf - Sistema de Qualidade
Relatório gerado automaticamente
        `);

        window.location.href = `mailto:${emailDestino}?subject=${assunto}&body=${corpo}`;

        setTimeout(() => {
            setEnviandoEmail(false);
            setShowEmailModal(false);
            setEmailDestino('');
        }, 1000);
    };

    const taxaAprovacao = reportData && reportData.totalRevisada > 0
        ? ((reportData.totalAprovada / reportData.totalRevisada) * 100).toFixed(1)
        : '0';

    return (
        <div className="stock-container">
            <div className="page-header">
                <h2><FileText size={24} /> Relatórios de Qualidade</h2>
                <div className="header-actions">
                    <button
                        className="btn-orange"
                        onClick={() => setShowEmailModal(true)}
                        disabled={loading || !reportData}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: 'transparent',
                            color: 'var(--kingraf-orange)',
                            border: '2px solid var(--kingraf-orange)'
                        }}
                    >
                        <Mail size={18} />
                        Enviar por Email
                    </button>
                    <button
                        className="btn-orange"
                        onClick={gerarPDF}
                        disabled={loading || !reportData}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <Download size={18} />
                        Baixar PDF
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="stock-card" style={{ marginBottom: '24px' }}>
                <div className="card-header">
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                        <Calendar size={18} style={{ marginRight: '8px' }} />
                        Período do Relatório
                    </h3>
                </div>
                <div className="card-content">
                    <div className="report-period-actions">
                        {(['semana', 'mes', 'ano'] as const).map(p => (
                            <button
                                key={p}
                                onClick={() => setPeriodo(p)}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '10px',
                                    border: periodo === p ? '2px solid var(--kingraf-orange)' : '1px solid #D1D5DB',
                                    backgroundColor: periodo === p ? 'var(--kingraf-orange-alpha)' : '#FFFFFF',
                                    color: periodo === p ? 'var(--kingraf-orange)' : '#64748B',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                {p === 'semana' ? 'Última Semana' : p === 'mes' ? 'Este Mês' : 'Este Ano'}
                            </button>
                        ))}
                    </div>
                    <div className="form-row report-date-row">
                        <div className="form-group">
                            <label>Data Início</label>
                            <input
                                type="date"
                                value={dataInicio}
                                onChange={e => setDataInicio(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label>Data Fim</label>
                            <input
                                type="date"
                                value={dataFim}
                                onChange={e => setDataFim(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#64748B' }}>
                    Carregando relatório...
                </div>
            ) : !reportData ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#64748B' }}>
                    Nenhum dado encontrado para o período selecionado.
                </div>
            ) : (
                <div id="report-content">
                    {/* KPIs */}
                    <div className="report-kpi-grid">
                        <div className="stock-card" style={{ textAlign: 'center', padding: '20px' }}>
                            <TrendingUp size={28} style={{ color: '#6366F1', marginBottom: '8px' }} />
                            <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A' }}>{reportData.totalRevisoes}</div>
                            <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>REVISÕES</div>
                        </div>
                        <div className="stock-card" style={{ textAlign: 'center', padding: '20px' }}>
                            <Clock size={28} style={{ color: '#3B82F6', marginBottom: '8px' }} />
                            <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A' }}>{formatarHoras(reportData.totalMinutos)}</div>
                            <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>TEMPO TOTAL</div>
                        </div>
                        <div className="stock-card" style={{ textAlign: 'center', padding: '20px' }}>
                            <Users size={28} style={{ color: '#8B5CF6', marginBottom: '8px' }} />
                            <div style={{ fontSize: '28px', fontWeight: 800, color: '#0F172A' }}>{reportData.revisoes.reduce((acc, r) => acc + (r.num_revisores || 0), 0)}</div>
                            <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>PESSOAS ENVOLVIDAS</div>
                        </div>
                        <div className="stock-card" style={{ textAlign: 'center', padding: '20px' }}>
                            <CheckCircle2 size={28} style={{ color: '#10B981', marginBottom: '8px' }} />
                            <div style={{ fontSize: '28px', fontWeight: 800, color: '#10B981' }}>{reportData.totalAprovada.toLocaleString()}</div>
                            <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>APROVADAS</div>
                        </div>
                        <div className="stock-card" style={{ textAlign: 'center', padding: '20px' }}>
                            <XCircle size={28} style={{ color: '#EF4444', marginBottom: '8px' }} />
                            <div style={{ fontSize: '28px', fontWeight: 800, color: '#EF4444' }}>{reportData.totalReprovada.toLocaleString()}</div>
                            <div style={{ fontSize: '12px', color: '#64748B', fontWeight: 600 }}>REPROVADAS</div>
                        </div>
                    </div>

                    {/* Gráficos */}
                    <div className="report-charts-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                        {/* Gráfico de Barras - Revisões por Setor */}
                        <div className="stock-card">
                            <div className="card-header">
                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                                    <FileText size={18} style={{ marginRight: '8px' }} />
                                    Revisões por Setor
                                </h3>
                            </div>
                            <div className="card-content" style={{ height: '280px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={reportData.revisoesPorSetor}
                                        layout="vertical"
                                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                        <XAxis type="number" tick={{ fontSize: 12 }} />
                                        <YAxis dataKey="nome" type="category" tick={{ fontSize: 12 }} width={100} />
                                        <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px' }} />
                                        <Bar dataKey="quantidade" fill="#F97316" radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Ranking de Operadores (Causadores de Desvios) */}
                        <div className="stock-card">
                            <div className="card-header">
                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                                    <TrendingUp size={18} style={{ marginRight: '8px' }} />
                                    Ranking de Operadores (Qtd Reprovada)
                                </h3>
                            </div>
                            <div className="card-content" style={{ height: '280px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={reportData.revisoesPorOperador.slice(0, 5)}
                                        layout="vertical"
                                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                                        <XAxis type="number" tick={{ fontSize: 12 }} />
                                        <YAxis dataKey="nome" type="category" tick={{ fontSize: 12 }} width={100} />
                                        <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px' }} />
                                        <Bar dataKey="reprovadas" fill="#EF4444" radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Gráfico de Pizza - Desvios por Tipo */}
                        <div className="stock-card">
                            <div className="card-header">
                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                                    <AlertTriangle size={18} style={{ marginRight: '8px' }} />
                                    Principais Desvios (Qtd)
                                </h3>
                            </div>
                            <div className="card-content" style={{ height: '280px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={reportData.desviosPorTipo.slice(0, 6)}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={50}
                                            outerRadius={90}
                                            dataKey="quantidade"
                                            nameKey="nome"
                                        >
                                            {reportData.desviosPorTipo.slice(0, 6).map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px' }} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Lista de Revisões */}
                    <div className="stock-card">
                        <div className="card-header">
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                                <FileText size={18} style={{ marginRight: '8px' }} />
                                Todas as Revisões ({reportData.revisoes.length})
                            </h3>
                        </div>
                        <div className="card-content" style={{ padding: 0 }}>
                            <div className="report-table-wrapper">
                                <table className="report-table">
                                    <thead>
                                        <tr style={{ backgroundColor: '#F1F5F9' }}>
                                            <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#475569' }}>OP</th>
                                            <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#475569' }}>SETOR</th>
                                            <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 700, color: '#475569' }}>OPERADOR</th>
                                            <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#475569' }}>PESSOAS</th>
                                            <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#475569' }}>REVISADA</th>
                                            <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#475569' }}>APROVADA</th>
                                            <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#475569' }}>REPROVADA</th>
                                            <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#475569' }}>STATUS</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportData.revisoes.map((r, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                                <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0F172A' }}>{r.op}</td>
                                                <td style={{ padding: '14px 16px', color: '#475569' }}>{r.setor_origem?.nome || '-'}</td>
                                                <td style={{ padding: '14px 16px', color: '#475569' }}>{r.operador?.nome || '-'}</td>
                                                <td style={{ padding: '14px 16px', textAlign: 'center', color: '#475569' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                        <Users size={14} />
                                                        {r.num_revisores || 1}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 600 }}>{r.quantidade_revisada.toLocaleString()}</td>
                                                <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 600, color: '#10B981' }}>{r.quantidade_aprovada.toLocaleString()}</td>
                                                <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 600, color: '#EF4444' }}>{r.quantidade_reprovada.toLocaleString()}</td>
                                                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                    <span style={{
                                                        padding: '4px 12px',
                                                        borderRadius: '20px',
                                                        fontSize: '12px',
                                                        fontWeight: 600,
                                                        backgroundColor: r.status === 'finalizada' ? '#DCFCE7' : '#FEF3C7',
                                                        color: r.status === 'finalizada' ? '#16A34A' : '#D97706'
                                                    }}>
                                                        {r.status === 'finalizada' ? 'Finalizada' : 'Em Andamento'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Email */}
            {showEmailModal && (
                <div className="modal-overlay" style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        padding: '24px',
                        width: '400px',
                        maxWidth: '90%',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0F172A' }}>
                                <Mail size={20} style={{ marginRight: '8px' }} />
                                Enviar Relatório por Email
                            </h3>
                            <button
                                onClick={() => setShowEmailModal(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: '#64748B'
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="form-group">
                            <label>Email do Destinatário</label>
                            <input
                                type="email"
                                placeholder="diretoria@empresa.com"
                                value={emailDestino}
                                onChange={e => setEmailDestino(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '12px 16px',
                                    border: '1px solid #D1D5DB',
                                    borderRadius: '10px',
                                    fontSize: '14px'
                                }}
                            />
                        </div>
                        <p style={{ fontSize: '13px', color: '#64748B', margin: '12px 0' }}>
                            O email será aberto no seu cliente de email padrão (Outlook, Gmail, etc.) com o resumo do relatório.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                            <button
                                onClick={() => setShowEmailModal(false)}
                                style={{
                                    padding: '10px 20px',
                                    border: '1px solid #D1D5DB',
                                    borderRadius: '10px',
                                    background: '#FFFFFF',
                                    cursor: 'pointer',
                                    fontWeight: 600
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={enviarPorEmail}
                                disabled={!emailDestino || enviandoEmail}
                                className="btn-orange"
                                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                <Mail size={16} />
                                {enviandoEmail ? 'Abrindo...' : 'Enviar Email'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QualityReports;
