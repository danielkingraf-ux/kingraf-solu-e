import React, { useState, useEffect } from 'react';
import {
    ClipboardList,
    Clock,
    CheckCircle2,
    AlertTriangle,
    TrendingUp
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
    Cell
} from 'recharts';
import { supabase } from '../../supabaseClient';
import './Dashboard.css';

interface KPI {
    title: string;
    value: string;
    sub: string;
    icon: React.ReactNode;
    color: string;
}

interface ChartData {
    name: string;
    value: number;
    color?: string;
    [key: string]: string | number | undefined;
}

interface RecentRevision {
    id: string;
    op: string;
    setor: string;
    status: string;
}

const Dashboard: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [kpis, setKpis] = useState<KPI[]>([]);
    const [barData, setBarData] = useState<ChartData[]>([]);
    const [pieData, setPieData] = useState<ChartData[]>([]);
    const [recentRevisoes, setRecentRevisoes] = useState<RecentRevision[]>([]);

    useEffect(() => {
        carregarDados();
    }, []);

    const carregarDados = async () => {
        setLoading(true);
        try {
            // 1. Buscar KPIs
            const { data: revisoes } = await supabase
                .from('qual_revisoes')
                .select('*, setor_origem:qual_setores(nome), tempos:qual_revisao_tempos(data_inicio, data_fim)');

            const totalRevisoes = revisoes?.length || 0;
            const emAndamento = revisoes?.filter(r => r.status === 'em_andamento').length || 0;
            const totalReprovadas = revisoes?.reduce((acc, r) => acc + (r.quantidade_reprovada || 0), 0) || 0;

            // Calcular horas totais
            let totalMinutos = 0;
            revisoes?.forEach(r => {
                r.tempos?.forEach((t: any) => {
                    if (t.data_inicio) {
                        const inicio = new Date(t.data_inicio).getTime();
                        const fim = t.data_fim ? new Date(t.data_fim).getTime() : new Date().getTime();
                        totalMinutos += Math.floor((fim - inicio) / (1000 * 60));
                    }
                });
            });
            const horas = Math.floor(totalMinutos / 60);
            const minutos = totalMinutos % 60;

            setKpis([
                { title: 'Total de Revisões', value: String(totalRevisoes), sub: `${emAndamento} em andamento`, icon: <ClipboardList size={24} />, color: '#6366F1' },
                { title: 'Horas em Revisão', value: `${horas}h ${minutos}m`, sub: 'Tempo acumulado', icon: <Clock size={24} />, color: '#3B82F6' },
                { title: 'Revisões Abertas', value: String(emAndamento), sub: 'Aguardando', icon: <CheckCircle2 size={24} />, color: '#F59E0B' },
                { title: 'Desvios Totais', value: totalReprovadas.toLocaleString(), sub: 'Unidades reprovadas', icon: <AlertTriangle size={24} />, color: '#EF4444' },
            ]);

            // 2. Revisões por Setor
            const setorCount: Record<string, number> = {};
            revisoes?.forEach(r => {
                const setor = r.setor_origem?.nome || 'Sem setor';
                setorCount[setor] = (setorCount[setor] || 0) + 1;
            });
            setBarData(Object.entries(setorCount).map(([name, value]) => ({ name, value })));

            // 3. Desvios por Tipo
            const { data: desvios } = await supabase
                .from('qual_revisao_desvios')
                .select('quantidade, tipo_desvio:qual_tipos_desvios(nome)');

            const desvioCount: Record<string, number> = {};
            desvios?.forEach((d: any) => {
                const tipo = d.tipo_desvio?.nome || 'Outro';
                desvioCount[tipo] = (desvioCount[tipo] || 0) + (d.quantidade || 0);
            });

            const pieColors = ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EF4444', '#EC4899', '#14B8A6'];
            setPieData(Object.entries(desvioCount).map(([name, value], idx) => ({
                name,
                value,
                color: pieColors[idx % pieColors.length]
            })));

            // 4. Últimas Revisões
            const recentes = revisoes?.slice(0, 5).map(r => ({
                id: r.id,
                op: r.op,
                setor: r.setor_origem?.nome || '-',
                status: r.status
            })) || [];
            setRecentRevisoes(recentes);

        } catch (error) {
            console.error('Erro ao carregar dashboard:', error);
        } finally {
            setLoading(false);
        }
    };

    const totalDesvios = pieData.reduce((acc, d) => acc + d.value, 0);

    if (loading) {
        return (
            <div className="dashboard-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                <p style={{ fontSize: '16px', color: '#64748B' }}>Carregando dashboard...</p>
            </div>
        );
    }

    return (
        <div className="dashboard-container">
            <div className="dashboard-header-info">
                <h2 className="dashboard-title">Dashboard de Qualidade</h2>
                <p className="dashboard-subtitle">Indicadores de desempenho e controle de desvios</p>
            </div>

            <div className="kpi-grid">
                {kpis.map((kpi, idx) => (
                    <div key={idx} className="kpi-card" style={{ '--accent-color': kpi.color } as React.CSSProperties}>
                        <div className="kpi-main">
                            <div className="kpi-info">
                                <span className="kpi-title">{kpi.title}</span>
                                <span className="kpi-value">{kpi.value}</span>
                                <span className="kpi-sub">{kpi.sub}</span>
                            </div>
                            <div className="kpi-icon-wrapper" style={{ color: kpi.color }}>
                                {kpi.icon}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="charts-grid">
                <div className="chart-card">
                    <div className="chart-header">
                        <h3><TrendingUp size={20} /> Revisões por Setor</h3>
                    </div>
                    <div className="chart-content">
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={barData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={100} style={{ fontSize: '13px', fontWeight: 600 }} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                />
                                <Bar dataKey="value" fill="url(#barGradient)" radius={[0, 8, 8, 0]} barSize={24}>
                                    <defs>
                                        <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
                                            <stop offset="0%" stopColor="#3B82F6" />
                                            <stop offset="100%" stopColor="#60A5FA" />
                                        </linearGradient>
                                    </defs>
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="chart-card">
                    <div className="chart-header">
                        <h3><AlertTriangle size={20} /> Desvios por Tipo</h3>
                    </div>
                    <div className="chart-content flex-center">
                        <ResponsiveContainer width="100%" height={250}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={90}
                                    paddingAngle={8}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: '24px', fontWeight: 800, fill: '#1E293B' }}>
                                    {totalDesvios >= 1000 ? `${(totalDesvios / 1000).toFixed(1)}k` : totalDesvios}
                                </text>
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="pie-legend">
                            {pieData.map((item, idx) => (
                                <div key={idx} className="legend-item">
                                    <span className="legend-dot" style={{ backgroundColor: item.color }}></span>
                                    <span className="legend-label">{item.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="chart-card">
                    <div className="chart-header">
                        <h3>Últimas Revisões</h3>
                    </div>
                    <div className="chart-content">
                        <div className="recent-list">
                            {recentRevisoes.length === 0 ? (
                                <p style={{ color: '#64748B', textAlign: 'center', padding: '20px' }}>Nenhuma revisão registrada.</p>
                            ) : (
                                recentRevisoes.map((item, idx) => (
                                    <div key={idx} className="recent-item">
                                        <div className="recent-info">
                                            <span className="recent-id">{item.op}</span>
                                            <span className="recent-sector">{item.setor}</span>
                                        </div>
                                        <span className={`status-badge ${item.status === 'finalizada' ? 'green' : 'orange'}`}>
                                            {item.status === 'finalizada' ? 'Finalizada' : 'Em andamento'}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
