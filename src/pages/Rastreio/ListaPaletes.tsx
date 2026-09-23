import React, { useCallback, useEffect, useState } from 'react';
import { Search, Printer, Ban, ChevronDown, ChevronRight, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../components/Toast/ToastProvider';
import type { Etapa, OpResumo, Palete, RastroEtapa, Setor, Situacao } from './api';
import {
    SITUACAO_LABEL, buscarRastro, codigoCurto, formatarDataHora, formatarQtd, lerMatricula, limparNumeroOp, listarOps, listarSetores,
    mensagemErro, nomeDestino, salvarMatricula,
} from './api';
import { imprimirFichas } from './ficha';
import './Rastreio.css';

type Filtro = 'abertos' | 'todos' | Situacao;

interface Evento {
    id: string;
    tipo: string;
    quantidade: number | null;
    refugo: number;
    ocorrido_em: string;
    observacao: string | null;
    etapa_id: string | null;
    operador_id: string | null;
    operador: { matricula: string; nome: string } | null;
}

const TIPO_EVENTO: Record<string, string> = {
    criado: 'Criado',
    consumido: 'Baixado no setor',
    saida_terceiros: 'Saiu para terceiros',
    retorno_terceiros: 'Voltou de terceiros',
    finalizado: 'Expedido',
    cancelado: 'Cancelado',
    ajuste: 'Ajuste',
};

const ListaPaletes: React.FC = () => {
    const { showSuccess, showError } = useToast();
    const [setores, setSetores] = useState<Setor[]>([]);
    const [numeroOp, setNumeroOp] = useState('');
    const [filtro, setFiltro] = useState<Filtro>('abertos');
    const [paletes, setPaletes] = useState<Palete[]>([]);
    const [etapas, setEtapas] = useState<Map<string, Etapa>>(new Map());
    const [operadores, setOperadores] = useState<Map<string, string>>(new Map());
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [aberto, setAberto] = useState<string | null>(null);
    const [eventos, setEventos] = useState<Evento[]>([]);
    const [rastro, setRastro] = useState<RastroEtapa[]>([]);
    const [matricula, setMatricula] = useState(lerMatricula());
    const [cancelando, setCancelando] = useState<string | null>(null);
    const [motivo, setMotivo] = useState('');
    const [agora, setAgora] = useState(Date.now());
    const [ops, setOps] = useState<OpResumo[]>([]);

    const carregar = useCallback(async () => {
        setCarregando(true);
        setErro(null);
        try {
            let q = supabase.from('rast_paletes').select('*').order('produzido_em', { ascending: false }).limit(300);
            const n = limparNumeroOp(numeroOp);
            if (n) q = q.eq('numero_op', n);
            if (filtro === 'abertos') q = q.in('situacao', ['aguardando', 'em_terceiros']);
            else if (filtro !== 'todos') q = q.eq('situacao', filtro);
            const { data, error } = await q;
            if (error) throw error;
            const lista = (data || []) as Palete[];

            const idsEtapa = [...new Set(lista.flatMap(p => [p.etapa_origem_id, p.etapa_destino_id]).filter(Boolean))] as string[];
            const idsOper = [...new Set(lista.map(p => p.operador_id))];
            const [rEt, rOp] = await Promise.all([
                idsEtapa.length ? supabase.from('rast_op_roteiro').select('*').in('id', idsEtapa) : Promise.resolve({ data: [], error: null }),
                idsOper.length ? supabase.from('rast_operadores').select('id, matricula, nome').in('id', idsOper) : Promise.resolve({ data: [], error: null }),
            ]);
            if (rEt.error) throw rEt.error;
            if (rOp.error) throw rOp.error;
            setEtapas(new Map((rEt.data as Etapa[]).map(e => [e.id, e])));
            setOperadores(new Map((rOp.data as { id: string; matricula: string; nome: string }[]).map(o => [o.id, `${o.matricula} · ${o.nome}`])));
            setPaletes(lista);
            setAgora(Date.now());
        } catch (e) {
            setErro(mensagemErro(e));
        } finally {
            setCarregando(false);
        }
    }, [numeroOp, filtro]);

    useEffect(() => {
        listarSetores().then(setSetores).catch(() => { });
        listarOps().then(setOps).catch(() => { });
    }, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { carregar(); }, [filtro]);

    const abrir = async (p: Palete) => {
        if (aberto === p.id) { setAberto(null); return; }
        setAberto(p.id);
        setEventos([]);
        setRastro([]);
        const [{ data, error }, r] = await Promise.all([
            supabase.from('rast_palete_eventos').select('*, operador:rast_operadores(matricula, nome)').eq('palete_id', p.id).order('ocorrido_em'),
            buscarRastro(p.id).catch(() => [] as RastroEtapa[]),
        ]);
        if (error) { showError(mensagemErro(error)); return; }
        setRastro(r);
        const evs = (data || []) as Evento[];
        // etapas de eventos que ainda nao estao no mapa
        const faltam = evs.map(e => e.etapa_id).filter((id): id is string => !!id && !etapas.has(id));
        if (faltam.length) {
            const { data: et } = await supabase.from('rast_op_roteiro').select('*').in('id', faltam);
            setEtapas(m => { const n = new Map(m); (et as Etapa[] || []).forEach(e => n.set(e.id, e)); return n; });
        }
        setEventos(evs);
    };

    const exigirMatricula = () => {
        if (!matricula.trim()) { showError('Informe sua matrícula no topo da tela.'); return false; }
        salvarMatricula(matricula.trim());
        return true;
    };

    const reimprimir = async (p: Palete) => {
        if (!exigirMatricula()) return;
        try {
            const { error } = await supabase.rpc('rast_reimprimir_etiqueta', { p_palete_id: p.id, p_matricula: matricula.trim() });
            if (error) throw error;
            await imprimirFichas([p.id]);
        } catch (e) {
            showError(mensagemErro(e));
        }
    };

    const cancelar = async (p: Palete) => {
        if (!exigirMatricula()) return;
        try {
            const { error } = await supabase.rpc('rast_cancelar_palete', { p_palete_id: p.id, p_matricula: matricula.trim(), p_motivo: motivo });
            if (error) throw error;
            showSuccess(`Palete ${p.codigo} cancelado.`);
            setCancelando(null);
            setMotivo('');
            carregar();
        } catch (e) {
            showError(mensagemErro(e));
        }
    };

    const nomeSetor = (id: number) => setores.find(s => s.id === id)?.nome ?? '-';

    return (
        <div className="rast-page">
            <div className="rast-card">
                <form className="rast-linha" onSubmit={e => { e.preventDefault(); carregar(); }}>
                    <div className="rast-campo estreito">
                        <label htmlFor="rast-l-op">OP</label>
                        <input id="rast-l-op" inputMode="numeric" list="rast-lista-ops" value={numeroOp} placeholder="Todas"
                            onChange={e => setNumeroOp(limparNumeroOp(e.target.value))} />
                        <datalist id="rast-lista-ops">
                            {ops.map(o => (
                                <option key={o.id} value={o.numero_op}>
                                    {o.pedido ? `pedido ${o.pedido}` : ''}{o.paletes_abertos ? ` · ${o.paletes_abertos} em aberto` : ''}
                                </option>
                            ))}
                        </datalist>
                    </div>
                    <div className="rast-campo estreito">
                        <label htmlFor="rast-l-sit">Situação</label>
                        <select id="rast-l-sit" value={filtro} onChange={e => setFiltro(e.target.value as Filtro)}>
                            <option value="abertos">Em aberto</option>
                            <option value="aguardando">Aguardando destino</option>
                            <option value="em_terceiros">No fornecedor</option>
                            <option value="consumido">Baixados</option>
                            <option value="finalizado">Expedidos</option>
                            <option value="cancelado">Cancelados</option>
                            <option value="todos">Todos</option>
                        </select>
                    </div>
                    <button className="rast-btn primario" type="submit" disabled={carregando}>
                        <Search size={18} /> Filtrar
                    </button>
                    <button className="rast-btn" type="button" onClick={carregar} disabled={carregando} aria-label="Atualizar">
                        <RefreshCw size={18} />
                    </button>
                    <div className="rast-campo estreito" style={{ marginLeft: 'auto' }}>
                        <label htmlFor="rast-l-mat">Sua matrícula</label>
                        <input id="rast-l-mat" value={matricula} onChange={e => setMatricula(e.target.value)} placeholder="Para reimprimir" />
                    </div>
                </form>
            </div>

            {erro && <div className="rast-aviso erro"><AlertTriangle size={18} /><span>{erro}</span></div>}

            <div className="rast-card">
                {paletes.length === 0 ? (
                    <div className="rast-vazio">{carregando ? 'Carregando...' : 'Nenhum palete com esse filtro.'}</div>
                ) : (
                    <div className="rast-tabela-wrap">
                        <table className="rast-tabela">
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>Código</th>
                                    <th>Origem</th>
                                    <th style={{ textAlign: 'right' }}>Quantidade</th>
                                    <th>Destino</th>
                                    <th>Situação</th>
                                    <th>Produzido</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {paletes.map(p => {
                                    const emCura = new Date(p.liberado_em).getTime() > agora && p.situacao === 'aguardando';
                                    const destino = p.etapa_destino_id ? etapas.get(p.etapa_destino_id) : null;
                                    return (
                                        <React.Fragment key={p.id}>
                                            <tr className={p.situacao === 'cancelado' ? 'apagada' : ''}>
                                                <td>
                                                    <button className="rast-icone-btn" onClick={() => abrir(p)} aria-label="Ver histórico">
                                                        {aberto === p.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                    </button>
                                                </td>
                                                <td className="rast-codigo">{p.codigo}</td>
                                                <td>{nomeSetor(p.setor_origem_id)}{p.maquina ? `, ${p.maquina}` : ''}</td>
                                                <td className="num">{formatarQtd(p.quantidade)} {p.unidade}</td>
                                                <td>{nomeDestino(destino, setores)}</td>
                                                <td>
                                                    <span className={`rast-badge ${p.situacao}`}>{SITUACAO_LABEL[p.situacao]}</span>{' '}
                                                    {emCura && <span className="rast-badge cura">cura até {formatarDataHora(p.liberado_em)}</span>}
                                                </td>
                                                <td>{formatarDataHora(p.produzido_em)}</td>
                                                <td style={{ whiteSpace: 'nowrap' }}>
                                                    <button className="rast-btn pequeno" onClick={() => reimprimir(p)}><Printer size={14} /> Reimprimir</button>{' '}
                                                    {p.situacao === 'aguardando' && (
                                                        <button className="rast-btn pequeno perigo" onClick={() => { setCancelando(p.id); setMotivo(''); }}>
                                                            <Ban size={14} /> Cancelar
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                            {cancelando === p.id && (
                                                <tr>
                                                    <td colSpan={8} className="rast-eventos">
                                                        <div className="rast-linha">
                                                            <div className="rast-campo">
                                                                <label htmlFor="rast-motivo">Motivo do cancelamento de {p.codigo}, matrícula de líder ou supervisor</label>
                                                                <input id="rast-motivo" autoFocus value={motivo} onChange={e => setMotivo(e.target.value)}
                                                                    placeholder="Ex.: ficha emitida com quantidade errada" />
                                                            </div>
                                                            <button className="rast-btn" onClick={() => setCancelando(null)}>Voltar</button>
                                                            <button className="rast-btn primario" disabled={!motivo.trim()} onClick={() => cancelar(p)}>Confirmar cancelamento</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            {aberto === p.id && (
                                                <tr>
                                                    <td colSpan={8} className="rast-eventos">
                                                        <div className="rast-ajuda" style={{ marginBottom: 6 }}>
                                                            OP {p.numero_op} · Operador {operadores.get(p.operador_id) ?? '-'}
                                                            {p.observacao ? ` · ${p.observacao}` : ''}
                                                        </div>
                                                        {rastro.length > 0 && (
                                                            <div style={{ marginBottom: 10 }}>
                                                                <b className="rast-ajuda">De onde saiu este palete</b>
                                                                <ul>
                                                                    {rastro.map(r => (
                                                                        <li key={`${r.nivel}-${r.setor}-${r.processo}`}>
                                                                            <b>{r.setor}</b>: {r.codigos.map(c => codigoCurto(c, p.numero_op)).join(', ')}
                                                                            {' · operador '}{r.operadores.join(', ')}
                                                                            {r.maquinas.length ? ` · ${r.maquinas.join(', ')}` : ''}
                                                                            {r.terceiros.length ? ` · terceiros: ${r.terceiros.join(', ')}` : ''}
                                                                            {r.bipado_por.length ? ` · entrada bipada por ${r.bipado_por.join(', ')}` : ''}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                        <b className="rast-ajuda">Movimentos</b>
                                                        <ul>
                                                            {eventos.map(ev => (
                                                                <li key={ev.id}>
                                                                    <b>{formatarDataHora(ev.ocorrido_em)}</b>{' · '}
                                                                    {TIPO_EVENTO[ev.tipo] ?? ev.tipo}
                                                                    {ev.etapa_id && etapas.get(ev.etapa_id) ? ` em ${etapas.get(ev.etapa_id)!.processo}` : ''}
                                                                    {ev.operador ? ` por ${ev.operador.matricula} ${ev.operador.nome}` : ''}
                                                                    {ev.quantidade !== null ? `, ${formatarQtd(ev.quantidade)}` : ''}
                                                                    {Number(ev.refugo) > 0 ? `, refugo ${formatarQtd(ev.refugo)}` : ''}
                                                                    {ev.observacao ? `, ${ev.observacao}` : ''}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ListaPaletes;
