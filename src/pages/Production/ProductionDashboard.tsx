import React, { useState, useEffect } from 'react';
import { Package, TrendingUp, CheckCircle2, History } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { supabase } from '../../supabaseClient';
import './ProductionDashboard.css';

const ProductionDashboard: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [kpis, setKpis] = useState([
        { title: 'Total Produzido Hoje', value: '0', sub: 'Calculando...', icon: <Package />, color: '#3B82F6' },
        { title: 'Total em Estoque', value: '0', sub: 'Itens em saldo', icon: <History />, color: '#10B981' },
        { title: 'Média Maços/Fileira', value: '0', sub: 'Eficiência carga', icon: <TrendingUp />, color: '#F59E0B' },
        { title: 'Tipos de Caixa', value: '0', sub: 'Modelos ativos', icon: <CheckCircle2 />, color: '#8B5CF6' },
    ]);

    const [dailyData, setDailyData] = useState<any[]>([]);
    const [stockData, setStockData] = useState<any[]>([]);
    const [recentProduction, setRecentProduction] = useState<any[]>([]);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // 1. Fetch KPIs
            const { data: prodToday } = await supabase
                .from('producao_caixas')
                .select('total_itens, created_at')
                .gte('created_at', today.toISOString());

            const { data: totalStock } = await supabase
                .from('prod_estoque')
                .select('quantidade');

            const { data: sizesCount } = await supabase
                .from('prod_tamanhos')
                .select('id', { count: 'exact' })
                .eq('ativo', true);

            const { data: avgStats } = await supabase
                .from('producao_caixas')
                .select('qtd_macos_fileira')
                .limit(50);

            const sumToday = prodToday?.reduce((acc, curr) => acc + curr.total_itens, 0) || 0;
            const sumStock = totalStock?.reduce((acc, curr) => acc + curr.quantidade, 0) || 0;
            const avgMacos = avgStats?.length ? (avgStats.reduce((acc, curr) => acc + curr.qtd_macos_fileira, 0) / avgStats.length).toFixed(1) : '0';

            setKpis([
                { title: 'Total Produzido Hoje', value: sumToday.toLocaleString(), sub: `${prodToday?.length || 0} registros`, icon: <Package />, color: '#3B82F6' },
                { title: 'Total em Estoque', value: sumStock.toLocaleString(), sub: 'Saldo disponível', icon: <History />, color: '#10B981' },
                { title: 'Média Maços/Fileira', value: avgMacos, sub: 'Últimos 50 lotes', icon: <TrendingUp />, color: '#F59E0B' },
                { title: 'Tipos de Caixa', value: (sizesCount?.length || 0).toString(), sub: 'Modelos cadastrados', icon: <CheckCircle2 />, color: '#8B5CF6' },
            ]);

            // 2. Fetch Daily Production (Last 7 days)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { data: weekProd } = await supabase
                .from('producao_caixas')
                .select('total_itens, created_at')
                .gte('created_at', sevenDaysAgo.toISOString());

            const dailyMap: any = {};
            for (let i = 0; i < 7; i++) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toLocaleDateString('pt-BR', { weekday: 'short' });
                dailyMap[dateStr] = 0;
            }

            weekProd?.forEach(item => {
                const dateStr = new Date(item.created_at).toLocaleDateString('pt-BR', { weekday: 'short' });
                if (dailyMap[dateStr] !== undefined) {
                    dailyMap[dateStr] += item.total_itens;
                }
            });

            setDailyData(Object.keys(dailyMap).map(day => ({ name: day, producao: dailyMap[day] })).reverse());

            // 3. Stock by Type
            const { data: stockItems } = await supabase
                .from('prod_estoque')
                .select('tipo_caixa, quantidade');

            const stockMap: any = {};
            stockItems?.forEach(item => {
                stockMap[item.tipo_caixa] = (stockMap[item.tipo_caixa] || 0) + item.quantidade;
            });

            setStockData(Object.keys(stockMap).map(type => ({ name: type, value: stockMap[type] })).sort((a, b) => b.value - a.value).slice(0, 5));

            // 4. Recent Production
            const { data: recent } = await supabase
                .from('producao_caixas')
                .select('op, cliente, produto, total_itens, created_at')
                .order('created_at', { ascending: false })
                .limit(5);

            setRecentProduction(recent || []);

        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

    if (loading) {
        return <div className="loading-container">Carregando Dashboard...</div>;
    }

    return (
        <div className="prod-dashboard-container">
            <section className="kpi-grid">
                {kpis.map((kpi, idx) => (
                    <div key={idx} className="kpi-card" style={{ '--accent-color': kpi.color } as React.CSSProperties}>
                        <div className="kpi-icon-wrapper">
                            {kpi.icon}
                        </div>
                        <div className="kpi-content">
                            <span className="kpi-title">{kpi.title}</span>
                            <span className="kpi-value">{kpi.value}</span>
                            <span className="kpi-sub">{kpi.sub}</span>
                        </div>
                    </div>
                ))}
            </section>

            <section className="charts-section">
                <div className="chart-card">
                    <h3>Produção Diária (Últimos 7 dias)</h3>
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={dailyData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="name" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val} />
                                <Tooltip
                                    cursor={{ fill: 'var(--kingraf-orange-alpha)' }}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                />
                                <Bar dataKey="producao" fill="var(--kingraf-orange)" radius={[6, 6, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="chart-card">
                    <h3>Saldo por Tipo de Caixa (Top 5)</h3>
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={stockData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {stockData.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="chart-legend">
                            {stockData.map((item, idx) => (
                                <div key={idx} className="legend-item">
                                    <span className="legend-dot" style={{ backgroundColor: COLORS[idx % COLORS.length] }}></span>
                                    <span className="legend-label">{item.name}:</span>
                                    <span className="legend-value">{item.value.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            <section className="recent-section">
                <div className="chart-card">
                    <div className="section-header">
                        <h3>Produções Recentes</h3>
                    </div>
                    <div className="recent-table-wrapper">
                        <table className="recent-table">
                            <thead>
                                <tr>
                                    <th>OP</th>
                                    <th>Cliente</th>
                                    <th>Produto</th>
                                    <th>Quantidade</th>
                                    <th>Data/Hora</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentProduction.map((item, idx) => (
                                    <tr key={idx}>
                                        <td><strong>{item.op}</strong></td>
                                        <td>{item.cliente}</td>
                                        <td>{item.produto}</td>
                                        <td>{item.total_itens.toLocaleString()}</td>
                                        <td>{new Date(item.created_at).toLocaleString('pt-BR')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default ProductionDashboard;
