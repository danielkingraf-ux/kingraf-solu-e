import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock, Lock, LockOpen, Maximize2, Minimize2, RefreshCw, Search, ShieldCheck, Truck,
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../components/Toast/ToastProvider';
import { formatarDataHora, formatarQtd, mensagemErro } from './api';
import { TOLERANCIA, useLiberacao } from './liberacao';
import './Rastreio.css';
import './Painel.css';

/**
 * Painel por OP. Tudo vem de uma chamada so (rast_painel_ops): paletes por
 * setor no rastreio, caixas e etiquetas de palete emitidas e as liberacoes
 * da supervisao. No piloto, etiqueta de palete impressa = enviado para a
 * expedicao; a bipagem da expedicao no rastreio aparece a parte.
 * Ver supabase/migrations/20260924_painel_liberacao.sql e 20260924_piloto_expedicao.sql
 */

interface SetorPaletes {
    sigla: string;
    nome: string;
    paletes: number;
    quantidade: number;
    abertos: number;
    unidade: 'folhas' | 'unidades' | null;
}

interface LinhaPainel {
    op: string;
    numero_op: number;
    descricao: string | null;
    cliente: string | null;
    pedido: string | null;
    entrega_prevista: string | null;
    importado_em: string;
    modelos: number;
    qtd_op: number | null;
    qtd_por_caixa: number | null;
    caixas_por_pallet: number | null;
    setores: SetorPaletes[];
    // Piloto: etiquetas de palete impressas = sairam da colagem para a expedicao.
    paletes_colagem: number;
    pecas_colagem: number;
    // Bipagem da expedicao no rastreio (palete finalizado).
    paletes_expedicao: number;
    pecas_expedicao: number;
    paletes_em_aberto: number;
    caixas_emitidas: number;
    etiquetas_palete: number;
    liberacoes: number;
    encerrada_em: string | null;
    // Enviados que a expedicao ainda nao bipou e desde quando o mais antigo espera.
    aguardando_bipagem: number;
    aguardando_desde: string | null;
    // Revisao da qualidade, em unidades. null = OP sem revisao.
    revisado_revisao: number | null;
    aprovado_revisao: number | null;
}

interface Liberacao {
    id: string;
    tipo: string;
    previsto: number | null;
    emitido: number | null;
    motivo: string;
    referencia: string | null;
    created_at: string;
    supervisor: { nome: string; matricula: string } | null;
}

type Situacao = 'encerrada' | 'acima' | 'pronta' | 'producao';

/** Contas de uma OP: o que a OP preve e onde ela esta contra isso. */
const analisar = (l: LinhaPainel) => {
    const caixasPrevistas = l.qtd_op && l.qtd_por_caixa ? Math.ceil(l.qtd_op / l.qtd_por_caixa) : null;
    const paletesPrevistos = caixasPrevistas && l.caixas_por_pallet ? Math.ceil(caixasPrevistas / l.caixas_por_pallet) : null;
    const limite = (n: number | null) => (n === null ? null : n * (1 + TOLERANCIA));

    const acimaPaletes = paletesPrevistos !== null && l.paletes_colagem > (limite(paletesPrevistos) as number);
    const acimaCaixas = caixasPrevistas !== null && l.caixas_emitidas > (limite(caixasPrevistas) as number);
    const expedido = l.qtd_op ? l.pecas_colagem / l.qtd_op : null;
    // Abaixo so importa na hora de encerrar: qualquer quantidade a menos.
    // Caixas so contam se a OP tem etiqueta de caixa: no piloto a colagem pode
    // imprimir so a de palete.
    const abaixo = (l.qtd_op !== null && l.pecas_colagem < l.qtd_op)
        || (caixasPrevistas !== null && l.caixas_emitidas > 0 && l.caixas_emitidas < caixasPrevistas)
        // A revisao aprovou menos que a OP pede.
        || (l.qtd_op !== null && (l.revisado_revisao ?? 0) > 0 && (l.aprovado_revisao ?? 0) < l.qtd_op);
    // Palete enviado e nao bipado ha muito tempo: so alerta onde a expedicao
    // ja bipa esta OP, senao toda OP do piloto acenderia.
    const esperaHoras = l.aguardando_desde ? (Date.now() - new Date(l.aguardando_desde).getTime()) / 3600_000 : 0;
    const semBipagem = l.paletes_expedicao > 0 && l.aguardando_bipagem > 0 && esperaHoras >= HORAS_SEM_BIPAGEM;

    const situacao: Situacao = l.encerrada_em ? 'encerrada'
        : acimaPaletes || acimaCaixas ? 'acima'
            : expedido !== null && expedido >= 1 ? 'pronta'
                : 'producao';

    return { caixasPrevistas, paletesPrevistos, acimaPaletes, acimaCaixas, expedido, abaixo, situacao, esperaHoras, semBipagem };
};

const SITUACAO: Record<Situacao, { texto: string; icone: React.ReactNode }> = {
    encerrada: { texto: 'Encerrada', icone: <Lock size={13} /> },
    acima: { texto: 'Acima do previsto', icone: <AlertTriangle size={13} /> },
    pronta: { texto: 'Pronta para encerrar', icone: <CheckCircle2 size={13} /> },
    producao: { texto: 'Em produção', icone: <RefreshCw size={13} /> },
};

type Filtro = 'abertas' | 'acima' | 'encerradas' | 'todas';

const TIPO_LIBERACAO: Record<string, string> = {
    palete_etiqueta: 'Etiqueta de palete',
    caixa_etiqueta: 'Etiqueta de caixa',
    palete_rastreio: 'Palete no rastreio',
    encerrar_op: 'Encerramento',
};

/** Horas de palete enviado sem bipagem na expedicao antes de alertar. */
const HORAS_SEM_BIPAGEM = 4;

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * Barra de andamento. Ate 100% no laranja da marca; passou do previsto vira
 * alerta, e passou da tolerancia vira perigo. O trilho e um tom claro da
 * mesma cor, e a marca vertical e o 100%.
 */
const Medidor: React.FC<{ valor: number | null; rotulo: string; detalhe: string }> = ({ valor, rotulo, detalhe }) => {
    const estado = valor === null ? 'vazio' : valor > 1 + TOLERANCIA ? 'perigo' : valor > 1 ? 'alerta' : valor >= 1 ? 'ok' : 'andamento';
    // A escala vai ate 120% para a sobra aparecer depois da marca do 100%.
    const largura = valor === null ? 0 : Math.min(valor, 1.2) / 1.2 * 100;
    return (
        <div className={`painel-medidor ${estado}`} title={`${rotulo}: ${detalhe}`}>
            <div className="painel-medidor-topo">
                <span>{rotulo}</span>
                <b>{valor === null ? '—' : pct(valor)}</b>
            </div>
            <div className="painel-trilho" role="meter" aria-label={rotulo}
                aria-valuenow={valor === null ? undefined : Math.round(valor * 100)} aria-valuemin={0} aria-valuemax={120}>
                <div className="painel-preenchido" style={{ width: `${largura}%` }} />
                <div className="painel-marca-100" />
            </div>
            <small>{detalhe}</small>
        </div>
    );
};

const Painel: React.FC = () => {
    const { showSuccess, showError } = useToast();
    const { modal: modalLiberacao, pedirLiberacao } = useLiberacao();
    const [linhas, setLinhas] = useState<LinhaPainel[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [busca, setBusca] = useState('');
    const [filtro, setFiltro] = useState<Filtro>('abertas');
    const [aberta, setAberta] = useState<string | null>(null);
    const [liberacoes, setLiberacoes] = useState<Liberacao[]>([]);
    const [agindo, setAgindo] = useState(false);
    // Modo TV: tela cheia para o chao de fabrica, so OPs abertas, sem botoes
    // de acao, atualizando sozinho a cada minuto.
    const [tv, setTv] = useState(false);
    const paginaRef = useRef<HTMLDivElement>(null);

    const carregar = async () => {
        setCarregando(true);
        setErro(null);
        try {
            const { data, error } = await supabase.rpc('rast_painel_ops', { p_limite: 500 });
            if (error) throw error;
            // NUMERIC chega como texto do PostgREST quando tem casa decimal.
            const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
            setLinhas(((data || []) as LinhaPainel[]).map(l => ({
                ...l,
                qtd_op: n(l.qtd_op),
                qtd_por_caixa: n(l.qtd_por_caixa),
                pecas_colagem: Number(l.pecas_colagem),
                pecas_expedicao: Number(l.pecas_expedicao),
                revisado_revisao: n(l.revisado_revisao),
                aprovado_revisao: n(l.aprovado_revisao),
                setores: (l.setores || []).map(s => ({ ...s, quantidade: Number(s.quantidade) })),
            })));
        } catch (err) {
            setErro(mensagemErro(err));
        } finally {
            setCarregando(false);
        }
    };

    useEffect(() => { carregar(); }, []);

    const abrirDetalhe = async (op: string) => {
        if (aberta === op) { setAberta(null); return; }
        setAberta(op);
        setLiberacoes([]);
        const { data, error } = await supabase
            .from('rast_liberacoes')
            .select('id, tipo, previsto, emitido, motivo, referencia, created_at, supervisor:rast_operadores(nome, matricula)')
            .eq('op', op)
            .order('created_at', { ascending: false });
        if (error) { showError(mensagemErro(error)); return; }
        setLiberacoes((data || []) as unknown as Liberacao[]);
    };

    const encerrar = async (l: LinhaPainel) => {
        const a = analisar(l);
        let liberacaoId: string | null = null;
        if (a.abaixo) {
            liberacaoId = await pedirLiberacao({
                tipo: 'encerrar_op',
                op: l.op,
                previsto: l.qtd_op,
                emitido: l.pecas_colagem,
                unidade: 'unidades',
                referencia: a.caixasPrevistas !== null && l.caixas_emitidas > 0
                    ? `caixas ${l.caixas_emitidas} de ${a.caixasPrevistas}` : undefined,
                titulo: `Foram para a expedição ${formatarQtd(l.pecas_colagem)} de ${formatarQtd(l.qtd_op)} unidades`
                    + (a.caixasPrevistas !== null && l.caixas_emitidas > 0 ? ` e saíram ${l.caixas_emitidas} de ${a.caixasPrevistas} caixas` : '')
                    + ((l.revisado_revisao ?? 0) > 0 ? `; a revisão aprovou ${formatarQtd(l.aprovado_revisao)}` : '')
                    + '. Encerrar abaixo do previsto precisa da supervisão.',
            });
            if (!liberacaoId) return;
        } else if (!confirm(`Encerrar a OP ${l.op}?`)) {
            return;
        }
        setAgindo(true);
        try {
            const { error } = await supabase.rpc('rast_encerrar_op', { p_op: l.op, p_liberacao_id: liberacaoId });
            if (error) throw error;
            showSuccess(`OP ${l.op} encerrada.`);
            await carregar();
        } catch (err) {
            showError(mensagemErro(err));
        } finally {
            setAgindo(false);
        }
    };

    const reabrir = async (l: LinhaPainel) => {
        if (!confirm(`Reabrir a OP ${l.op}?`)) return;
        setAgindo(true);
        try {
            const { error } = await supabase.rpc('rast_reabrir_op', { p_op: l.op });
            if (error) throw error;
            showSuccess(`OP ${l.op} reaberta.`);
            await carregar();
        } catch (err) {
            showError(mensagemErro(err));
        } finally {
            setAgindo(false);
        }
    };

    useEffect(() => {
        if (!tv) return;
        const t = setInterval(carregar, 60_000);
        const aoSairDaTelaCheia = () => { if (!document.fullscreenElement) setTv(false); };
        document.addEventListener('fullscreenchange', aoSairDaTelaCheia);
        return () => { clearInterval(t); document.removeEventListener('fullscreenchange', aoSairDaTelaCheia); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tv]);

    const alternarTv = async () => {
        if (tv) {
            setTv(false);
            if (document.fullscreenElement) await document.exitFullscreen().catch(() => { });
            return;
        }
        setTv(true);
        setAberta(null);
        // Tela cheia e opcional: alguns navegadores recusam, e o modo TV segue.
        await paginaRef.current?.requestFullscreen?.().catch(() => { });
    };

    const analisadas = useMemo(() => linhas.map(l => ({ l, a: analisar(l) })), [linhas]);

    const termo = busca.trim().toLowerCase();
    const visiveis = analisadas.filter(({ l, a }) => {
        if ((tv || filtro === 'abertas') && a.situacao === 'encerrada') return false;
        if (tv) return true;
        if (filtro === 'acima' && a.situacao !== 'acima') return false;
        if (filtro === 'encerradas' && a.situacao !== 'encerrada') return false;
        if (!termo) return true;
        return [l.op, l.cliente, l.descricao, l.pedido].some(t => (t || '').toLowerCase().includes(termo));
    });

    const abertas = analisadas.filter(({ a }) => a.situacao !== 'encerrada');
    const kpi = {
        ops: abertas.length,
        noChao: abertas.reduce((s, { l }) => s + l.paletes_em_aberto, 0),
        expedidos: abertas.reduce((s, { l }) => s + l.paletes_colagem, 0),
        bipados: abertas.reduce((s, { l }) => s + l.paletes_expedicao, 0),
        acima: abertas.filter(({ a }) => a.situacao === 'acima').length,
        liberacoes: abertas.reduce((s, { l }) => s + l.liberacoes, 0),
        semBipagem: abertas.filter(({ a }) => a.semBipagem).length,
    };

    const hoje = new Date().toISOString().slice(0, 10);

    return (
        <div className={`rast-page painel ${tv ? 'tv' : ''}`} ref={paginaRef}>
            {modalLiberacao}

            <div className="painel-kpis">
                <div className="painel-kpi"><span>OPs abertas</span><b>{kpi.ops}</b></div>
                <div className="painel-kpi"><span>Paletes no chão</span><b>{kpi.noChao}</b><small>aguardando ou em terceiros</small></div>
                <div className="painel-kpi"><span>Paletes enviados à expedição</span><b>{kpi.expedidos}</b><small>{kpi.bipados} já bipados lá</small></div>
                <div className={`painel-kpi ${kpi.acima ? 'perigo' : ''}`}>
                    <span>OPs acima do previsto</span><b>{kpi.acima}</b>
                    <small>mais de {pct(TOLERANCIA)} acima</small>
                </div>
                <div className={`painel-kpi ${kpi.semBipagem ? 'alerta' : ''}`}>
                    <span>Sem bipagem na expedição</span><b>{kpi.semBipagem}</b>
                    <small>OPs com palete enviado há mais de {HORAS_SEM_BIPAGEM} h</small>
                </div>
                <div className="painel-kpi"><span>Liberações</span><b>{kpi.liberacoes}</b><small>da supervisão, nas OPs abertas</small></div>
            </div>

            {tv ? (
                <div className="painel-filtros">
                    <span className="painel-tv-hora">
                        <RefreshCw size={16} /> Atualiza sozinho a cada minuto
                    </span>
                    <button className="rast-btn pequeno" onClick={alternarTv}>
                        <Minimize2 size={14} /> Sair do modo TV
                    </button>
                </div>
            ) : (
            <div className="painel-filtros">
                <div className="painel-abas" role="tablist">
                    {([['abertas', 'Abertas'], ['acima', 'Acima do previsto'], ['encerradas', 'Encerradas'], ['todas', 'Todas']] as [Filtro, string][]).map(([f, t]) => (
                        <button key={f} role="tab" aria-selected={filtro === f}
                            className={filtro === f ? 'ativa' : ''} onClick={() => setFiltro(f)}>{t}</button>
                    ))}
                </div>
                <div className="painel-busca">
                    <Search size={16} />
                    <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="OP, cliente, produto ou pedido" />
                </div>
                <button className="rast-btn pequeno" onClick={carregar} disabled={carregando}>
                    <RefreshCw size={14} /> {carregando ? 'Atualizando...' : 'Atualizar'}
                </button>
                <button className="rast-btn pequeno" onClick={alternarTv}>
                    <Maximize2 size={14} /> Modo TV
                </button>
            </div>
            )}

            {erro && <div className="rast-aviso erro"><AlertTriangle size={18} /><span>{erro}</span></div>}

            {!carregando && visiveis.length === 0 && !erro && (
                <div className="rast-vazio">
                    {linhas.length === 0 ? 'Nenhuma OP importada no rastreio ainda.' : 'Nenhuma OP neste filtro.'}
                </div>
            )}

            <div className="painel-grade">
                {visiveis.map(({ l, a }) => {
                    const atrasada = !l.encerrada_em && l.entrega_prevista && l.entrega_prevista < hoje;
                    const detalhe = aberta === l.op;
                    return (
                        <article key={l.op} className={`painel-op ${a.situacao} ${detalhe ? 'expandida' : ''}`}>
                            <header className="painel-op-topo">
                                <div>
                                    <h3>OP {l.op}</h3>
                                    <p>{l.cliente || 'Cliente sem nome'}{l.pedido ? ` · pedido ${l.pedido}` : ''}</p>
                                </div>
                                <span className={`painel-situacao ${a.situacao}`}>
                                    {SITUACAO[a.situacao].icone}{SITUACAO[a.situacao].texto}
                                </span>
                            </header>

                            <p className="painel-produto" title={l.descricao || ''}>{l.descricao || '—'}</p>

                            <div className="painel-numeros">
                                <div>
                                    <span>Enviados à expedição</span>
                                    <b className={a.acimaPaletes ? 'perigo' : ''}>
                                        {l.paletes_colagem}
                                        <em>{a.paletesPrevistos !== null ? ` / ${a.paletesPrevistos}` : ''}</em>
                                    </b>
                                </div>
                                <div>
                                    <span><Truck size={12} /> Bipados na expedição</span>
                                    <b>{l.paletes_expedicao}</b>
                                </div>
                                <div>
                                    <span>Caixas emitidas</span>
                                    <b className={a.acimaCaixas ? 'perigo' : ''}>
                                        {l.caixas_emitidas}
                                        <em>{a.caixasPrevistas !== null ? ` / ${a.caixasPrevistas}` : ''}</em>
                                    </b>
                                </div>
                            </div>

                            <Medidor
                                valor={a.expedido}
                                rotulo="Expedido"
                                detalhe={l.qtd_op
                                    ? `${formatarQtd(l.pecas_colagem)} de ${formatarQtd(l.qtd_op)} unidades`
                                    : 'OP sem quantidade no XML'}
                            />

                            {/* O que a qualidade aprovou na revisao, contra a OP. */}
                            {(l.revisado_revisao ?? 0) > 0 && (
                                <Medidor
                                    valor={l.qtd_op ? (l.aprovado_revisao ?? 0) / l.qtd_op : null}
                                    rotulo="Aprovado na revisão"
                                    detalhe={`${formatarQtd(l.aprovado_revisao)} aprovadas de ${formatarQtd(l.revisado_revisao)} revisadas`
                                        + (l.qtd_op ? ` · OP pede ${formatarQtd(l.qtd_op)}` : '')}
                                />
                            )}

                            {/* Enviado pela colagem e ainda nao bipado na expedicao. */}
                            {l.aguardando_bipagem > 0 && l.paletes_expedicao > 0 && (
                                <p className={`painel-espera ${a.semBipagem ? 'alerta' : ''}`}>
                                    <Clock size={14} />
                                    {l.aguardando_bipagem} palete(s) enviado(s) ainda sem bipagem na expedição
                                    {a.esperaHoras >= 1 && ` · o mais antigo há ${Math.floor(a.esperaHoras)} h`}
                                </p>
                            )}

                            {/* O caminho do material: paletes que cada setor soltou,
                                e quantos ainda estao no chao esperando o proximo. */}
                            <div className="painel-fluxo" aria-label="Paletes por setor">
                                {l.setores.length === 0 && <small className="rast-ajuda">Nenhum palete no rastreio ainda.</small>}
                                {l.setores.map(s => (
                                    <div key={s.sigla} className="painel-setor"
                                        title={`${s.nome}: ${s.paletes} paletes, ${formatarQtd(s.quantidade)} ${s.unidade || ''}; ${s.abertos} no chão`}>
                                        <span>{s.sigla}</span>
                                        <b>{s.paletes}</b>
                                        {s.abertos > 0 && <small>{s.abertos} no chão</small>}
                                    </div>
                                ))}
                            </div>

                            <footer className="painel-op-rodape">
                                <span className={atrasada ? 'atrasada' : ''}>
                                    Entrega {l.entrega_prevista ? new Date(l.entrega_prevista + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                                    {atrasada ? ' · atrasada' : ''}
                                </span>
                                {l.liberacoes > 0 && (
                                    <span className="painel-lib"><ShieldCheck size={13} /> {l.liberacoes} liberação(ões)</span>
                                )}
                                {!tv && (
                                    <button className="rast-btn pequeno" onClick={() => abrirDetalhe(l.op)} aria-expanded={detalhe}>
                                        {detalhe ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Detalhes
                                    </button>
                                )}
                            </footer>

                            {detalhe && (
                                <div className="painel-detalhe">
                                    <table className="rast-tabela">
                                        <thead><tr><th>Setor</th><th style={{ textAlign: 'right' }}>Paletes</th><th style={{ textAlign: 'right' }}>Quantidade</th><th style={{ textAlign: 'right' }}>No chão</th></tr></thead>
                                        <tbody>
                                            {l.setores.map(s => (
                                                <tr key={s.sigla}>
                                                    <td>{s.nome}</td>
                                                    <td className="num">{s.paletes}</td>
                                                    <td className="num">{formatarQtd(s.quantidade)} {s.unidade || ''}</td>
                                                    <td className="num">{s.abertos || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    <div className="painel-detalhe-linha">
                                        <span>Etiquetas de palete impressas</span><b>{l.etiquetas_palete}</b>
                                    </div>
                                    <div className="painel-detalhe-linha">
                                        <span>Modelos na OP</span><b>{l.modelos}</b>
                                    </div>
                                    {(a.caixasPrevistas === null) && (
                                        <p className="rast-ajuda">
                                            Caixas e paletes previstos saem da conta da OP na etiqueta de palete (quantidade por caixa e caixas por palete). Esta OP ainda não tem essa conta.
                                        </p>
                                    )}

                                    <h4>Liberações da supervisão</h4>
                                    {liberacoes.length === 0 ? (
                                        <p className="rast-ajuda">Nenhuma.</p>
                                    ) : (
                                        <ul className="painel-libs">
                                            {liberacoes.map(x => (
                                                <li key={x.id}>
                                                    <b>{TIPO_LIBERACAO[x.tipo] || x.tipo}</b>
                                                    <span>
                                                        {x.previsto !== null ? `previsto ${formatarQtd(x.previsto)}, ` : ''}
                                                        emitido {formatarQtd(x.emitido)}
                                                        {x.referencia ? ` · ${x.referencia}` : ''}
                                                    </span>
                                                    <span>“{x.motivo}” · {x.supervisor?.nome ?? '—'} · {formatarDataHora(x.created_at)}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    <div className="painel-acoes">
                                        {l.encerrada_em ? (
                                            <>
                                                <span className="rast-ajuda">Encerrada em {formatarDataHora(l.encerrada_em)}</span>
                                                <button className="rast-btn pequeno" disabled={agindo} onClick={() => reabrir(l)}>
                                                    <LockOpen size={14} /> Reabrir
                                                </button>
                                            </>
                                        ) : (
                                            <button className="rast-btn primario" disabled={agindo} onClick={() => encerrar(l)}>
                                                <Lock size={16} /> Encerrar OP{a.abaixo ? ' (abaixo do previsto)' : ''}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </article>
                    );
                })}
            </div>
        </div>
    );
};

export default Painel;
