import React, { useEffect, useState } from 'react';
import { Search, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import type { FechamentoSetor, OpResumo, Palete, Setor } from './api';
import {
    SITUACAO_LABEL, fechamentoOp, formatarDataHora, formatarQtd,
    listarOps, listarSetores, mensagemErro,
} from './api';
import './Rastreio.css';

interface PaleteComOperador extends Palete {
    operador: { matricula: string; nome: string } | null;
}

const Fechamento: React.FC = () => {
    const [ops, setOps] = useState<OpResumo[]>([]);
    const [setores, setSetores] = useState<Setor[]>([]);
    const [numeroOp, setNumeroOp] = useState('');
    const [opAberta, setOpAberta] = useState<number | null>(null);
    const [linhas, setLinhas] = useState<FechamentoSetor[]>([]);
    const [paletes, setPaletes] = useState<PaleteComOperador[]>([]);
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        listarOps().then(setOps).catch(e => setErro(mensagemErro(e)));
        listarSetores().then(setSetores).catch(() => { });
    }, []);

    const abrir = async (n: number) => {
        setNumeroOp(String(n));
        setCarregando(true);
        setErro(null);
        try {
            const [linhasFech, { data, error }] = await Promise.all([
                fechamentoOp(n),
                supabase
                    .from('rast_paletes')
                    .select('*, operador:rast_operadores(matricula, nome)')
                    .eq('numero_op', n)
                    .order('produzido_em'),
            ]);
            if (error) throw error;
            setLinhas(linhasFech);
            setPaletes((data || []) as PaleteComOperador[]);
            setOpAberta(n);
        } catch (e) {
            setErro(mensagemErro(e));
        } finally {
            setCarregando(false);
        }
    };

    const nomeSetor = (id: number) => setores.find(s => s.id === id)?.nome ?? '-';
    const temPendencia = linhas.some(l => l.falta_lancar > 0.001 || l.em_aberto > 0);

    return (
        <div className="rast-page">
            <div className="rast-card">
                <h2>Fechamento da OP</h2>
                <p className="rast-ajuda" style={{ marginBottom: 16 }}>
                    Confere se o que saiu de um setor chegou todo no próximo, e mostra quem assinou cada palete.
                </p>
                <form className="rast-linha" onSubmit={e => { e.preventDefault(); const n = parseInt(numeroOp, 10); if (n) abrir(n); }}>
                    <div className="rast-campo estreito">
                        <label htmlFor="rast-f-op">Número da OP</label>
                        <input id="rast-f-op" inputMode="numeric" list="rast-fech-ops" value={numeroOp} autoFocus
                            onChange={e => setNumeroOp(e.target.value.replace(/\D/g, ''))} placeholder="20418" />
                        <datalist id="rast-fech-ops">
                            {ops.map(o => <option key={o.id} value={o.numero_op}>{o.pedido ? `pedido ${o.pedido}` : ''}</option>)}
                        </datalist>
                    </div>
                    <button className="rast-btn primario" type="submit" disabled={carregando || !numeroOp}>
                        <Search size={18} /> {carregando ? 'Abrindo...' : 'Abrir'}
                    </button>
                    {opAberta && (
                        <button className="rast-btn" type="button" onClick={() => abrir(opAberta)} disabled={carregando} aria-label="Atualizar">
                            <RefreshCw size={18} />
                        </button>
                    )}
                </form>
            </div>

            {erro && <div className="rast-aviso erro"><AlertTriangle size={18} /><span>{erro}</span></div>}

            {opAberta && linhas.length === 0 && !carregando && (
                <div className="rast-aviso info">
                    <AlertTriangle size={18} />
                    <span>A OP {opAberta} não tem palete nem roteiro importado. Confira o número.</span>
                </div>
            )}

            {linhas.length > 0 && (
                <>
                    <div className={`rast-aviso ${temPendencia ? 'alerta' : 'ok'}`}>
                        {temPendencia ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
                        <span>
                            {temPendencia
                                ? 'Tem material em aberto nesta OP. As linhas destacadas abaixo mostram onde.'
                                : 'Tudo o que saiu de cada setor foi baixado no setor seguinte. Nada em aberto.'}
                        </span>
                    </div>

                    <div className="rast-card">
                        <h2>Por setor</h2>
                        <div className="rast-tabela-wrap">
                            <table className="rast-tabela">
                                <thead>
                                    <tr>
                                        <th>Setor</th>
                                        <th style={{ textAlign: 'right' }}>Planejado</th>
                                        <th style={{ textAlign: 'right' }}>Entrou</th>
                                        <th style={{ textAlign: 'right' }}>Falta lançar</th>
                                        <th style={{ textAlign: 'right' }}>Saiu</th>
                                        <th style={{ textAlign: 'right' }}>Refugo</th>
                                        <th style={{ textAlign: 'right' }}>Ainda no setor seguinte</th>
                                        <th>Operadores</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {linhas.map(l => (
                                        <tr key={l.setor_id}>
                                            <td><b>{l.setor}</b></td>
                                            <td className="num">{l.planejado ? formatarQtd(l.planejado) : '-'}</td>
                                            <td className="num">
                                                {l.entrada > 0 ? `${formatarQtd(l.entrada)} ${l.entrada_unidade ?? ''}` : '-'}
                                                {l.entrada_paletes > 0 && <><br /><small>{l.entrada_paletes} palete(s)</small></>}
                                            </td>
                                            <td className="num">
                                                {l.falta_lancar > 0.001
                                                    ? <span className="rast-badge alerta">{formatarQtd(Math.round(l.falta_lancar))} {l.entrada_unidade ?? ''}</span>
                                                    : '-'}
                                            </td>
                                            <td className="num">
                                                {l.saida > 0 ? `${formatarQtd(l.saida)} ${l.saida_unidade ?? ''}` : '-'}
                                                {l.saida_paletes > 0 && <><br /><small>{l.saida_paletes} palete(s)</small></>}
                                            </td>
                                            <td className="num">{l.refugo > 0 ? formatarQtd(l.refugo) : '-'}</td>
                                            <td className="num">
                                                {l.em_aberto > 0
                                                    ? <span className="rast-badge aguardando">{formatarQtd(l.em_aberto)} em {l.em_aberto_paletes} palete(s)</span>
                                                    : '-'}
                                            </td>
                                            <td>{l.operadores.length ? l.operadores.join(', ') : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="rast-ajuda" style={{ marginTop: 12 }}>
                            <b>Falta lançar</b>: material que entrou no setor e ainda não virou palete nem refugo.{' '}
                            <b>Ainda no setor seguinte</b>: palete que saiu daqui e não foi bipado no destino.{' '}
                            No destaque a conta muda de folhas para unidades, pelas poses da OP.
                        </p>
                    </div>

                    <div className="rast-card">
                        <h2>Paletes da OP ({paletes.length})</h2>
                        <div className="rast-tabela-wrap">
                            <table className="rast-tabela">
                                <thead>
                                    <tr>
                                        <th>Código</th>
                                        <th>Setor de origem</th>
                                        <th>Máquina</th>
                                        <th>Operador</th>
                                        <th style={{ textAlign: 'right' }}>Quantidade</th>
                                        <th>Situação</th>
                                        <th>Produzido</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paletes.map(p => (
                                        <tr key={p.id} className={p.situacao === 'cancelado' ? 'apagada' : ''}>
                                            <td className="rast-codigo">{p.codigo}</td>
                                            <td>{nomeSetor(p.setor_origem_id)}</td>
                                            <td>{p.maquina || '-'}</td>
                                            <td>{p.operador ? `${p.operador.matricula} · ${p.operador.nome}` : '-'}</td>
                                            <td className="num">{formatarQtd(p.quantidade)} {p.unidade}</td>
                                            <td><span className={`rast-badge ${p.situacao}`}>{SITUACAO_LABEL[p.situacao]}</span></td>
                                            <td>{formatarDataHora(p.produzido_em)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Fechamento;
