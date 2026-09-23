import React, { useEffect, useState } from 'react';
import { Search, Plus, Trash2, Printer, AlertTriangle, Clock, ArrowRight } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../components/Toast/ToastProvider';
import type { Etapa, Maquina, Op, OpResumo, Palete, Produto, Setor } from './api';
import {
    buscarOp, fechamentoOp, formatarDataHora, formatarQtd, lerMatricula, listarMaquinas, listarOps, listarSetores,
    mensagemErro, nomeDestino, proximaEtapa, salvarMatricula,
} from './api';
import { acimaDoPrevisto, useLiberacao } from './liberacao';
import { imprimirFichas } from './ficha';
import './Rastreio.css';

const NovoPalete: React.FC = () => {
    const { showSuccess, showError } = useToast();
    const [setores, setSetores] = useState<Setor[]>([]);
    const [numeroOp, setNumeroOp] = useState('');
    const [buscando, setBuscando] = useState(false);
    const [op, setOp] = useState<Op | null>(null);
    const [roteiro, setRoteiro] = useState<Etapa[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [produtoId, setProdutoId] = useState<string>('');
    const [etapaId, setEtapaId] = useState<string>('');
    const [matricula, setMatricula] = useState(lerMatricula());
    const [maquina, setMaquina] = useState('');
    const [unidade, setUnidade] = useState<'folhas' | 'unidades'>('folhas');
    const [status, setStatus] = useState('aprovado');
    const [qtds, setQtds] = useState<string[]>(['']);
    const [refugo, setRefugo] = useState('');
    const [observacao, setObservacao] = useState('');
    const [erro, setErro] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);
    const [criados, setCriados] = useState<Palete[]>([]);
    const [agora, setAgora] = useState(Date.now());
    const [ops, setOps] = useState<OpResumo[]>([]);
    const [filtro, setFiltro] = useState('');
    const [maquinas, setMaquinas] = useState<Maquina[]>([]);
    const { modal: modalLiberacao, pedirLiberacao } = useLiberacao();

    useEffect(() => {
        listarSetores().then(setSetores).catch(e => setErro(mensagemErro(e)));
        listarOps().then(setOps).catch(e => setErro(mensagemErro(e)));
        listarMaquinas().then(setMaquinas).catch(() => { });
        const t = setInterval(() => setAgora(Date.now()), 30000);
        return () => clearInterval(t);
    }, []);

    const etapasDePalete = roteiro.filter(r => r.movimenta_palete && !r.terceiros);
    const etapa = roteiro.find(r => r.id === etapaId) ?? null;
    const setor = setores.find(s => s.id === etapa?.setor_id) ?? null;
    const destino = etapa ? proximaEtapa(roteiro, etapa) : null;
    const liberaEm = setor && setor.cura_horas > 0 ? new Date(agora + setor.cura_horas * 3600_000) : null;

    const numeros = qtds.map(q => Number(q.replace(/\./g, '').replace(',', '.')));
    const validas = numeros.filter(n => Number.isFinite(n) && n > 0);
    const total = validas.reduce((a, b) => a + b, 0);
    const podeSalvarQtd = !!etapa && matricula.trim() !== '' && validas.length === qtds.length && qtds.length > 0;

    const buscar = (e?: React.FormEvent) => {
        e?.preventDefault();
        const n = parseInt(numeroOp.trim(), 10);
        if (n) abrirOp(n);
    };

    const abrirOp = async (n: number) => {
        setNumeroOp(String(n));
        setBuscando(true);
        setErro(null);
        setOp(null);
        setRoteiro([]);
        setEtapaId('');
        setCriados([]);
        try {
            const r = await buscarOp(n);
            if (!r) {
                setErro(`OP ${n} não foi importada. Peça ao PCP para importar o XML em "Importar OP".`);
                return;
            }
            setOp(r.op);
            setRoteiro(r.roteiro);
            setProdutos(r.produtos);
            // OP de um modelo so: nao faz o operador escolher o obvio.
            setProdutoId(r.produtos.length === 1 ? r.produtos[0].id : '');
            // Palete nasce na impressao: ja deixa ela escolhida.
            const imp = setores.find(s => s.sigla === 'IMP');
            const primeira = r.roteiro.find(x => x.movimenta_palete && !x.terceiros && x.setor_id === imp?.id)
                ?? r.roteiro.find(x => x.movimenta_palete && !x.terceiros);
            setEtapaId(primeira?.id ?? '');
        } catch (err) {
            setErro(mensagemErro(err));
        } finally {
            setBuscando(false);
        }
    };

    // Busca pelo numero da OP ou pelo pedido: no chao ninguem lembra o numero.
    const termo = filtro.trim().toLowerCase();
    const opsFiltradas = termo
        ? ops.filter(o => String(o.numero_op).includes(termo)
            || (o.pedido || '').toLowerCase().includes(termo)
            || (o.descricao || '').toLowerCase().includes(termo))
        : ops;

    const salvar = async () => {
        if (!etapa) return;
        setSalvando(true);
        setErro(null);
        try {
            // O que o setor ja soltou desta OP mais este lancamento, contra o
            // planejado da etapa no XML. Passou de 10%: so com supervisor.
            const linha = op && etapa.setor_id !== null
                ? (await fechamentoOp(op.numero_op)).find(l => l.setor_id === etapa.setor_id)
                : undefined;
            const acumulado = (linha?.saida ?? 0) + total;
            if (op && linha && acimaDoPrevisto(linha.planejado, acumulado)) {
                const liberado = await pedirLiberacao({
                    tipo: 'palete_rastreio',
                    op: String(op.numero_op),
                    previsto: linha.planejado,
                    emitido: acumulado,
                    unidade: unidade,
                    referencia: `${linha.setor}: ${validas.length} palete(s), ${formatarQtd(total)} ${unidade}`,
                    titulo: `${linha.setor} já soltou ${formatarQtd(linha.saida)} e este lançamento leva a ${formatarQtd(acumulado)}. O planejado da etapa é ${formatarQtd(linha.planejado)}: passou mais de 10%.`
                });
                if (!liberado) return;
            }

            const { data, error } = await supabase.rpc('rast_criar_paletes', {
                p_etapa_id: etapa.id,
                p_matricula: matricula.trim(),
                p_maquina: maquina,
                p_quantidades: validas,
                p_refugo: Number(refugo.replace(/\./g, '').replace(',', '.')) || 0,
                p_unidade: unidade,
                p_status: status,
                p_observacao: observacao,
                p_produto_id: produtoId || null,
            });
            if (error) throw error;
            const novos = (data || []) as Palete[];
            salvarMatricula(matricula.trim());
            setCriados(novos);
            setQtds(['']);
            setRefugo('');
            setObservacao('');
            showSuccess(`${novos.length} palete(s) registrado(s). Imprimindo as fichas.`);
            listarOps().then(setOps).catch(() => { });
            await imprimirFichas(novos.map(p => p.id));
        } catch (err) {
            setErro(mensagemErro(err));
        } finally {
            setSalvando(false);
        }
    };

    const reimprimir = async (p: Palete) => {
        try {
            const { error } = await supabase.rpc('rast_reimprimir_etiqueta', { p_palete_id: p.id, p_matricula: matricula.trim() });
            if (error) throw error;
            await imprimirFichas([p.id]);
        } catch (err) {
            showError(mensagemErro(err));
        }
    };

    const etapaNome = (e: Etapa) => `${e.seq}. ${e.processo}`;

    // "Bocas" e o numero de poses na folha: 2.500 folhas x 14 bocas = 35.000 unidades.
    const bocas = etapa?.poses_por_ciclo ?? null;
    // Hot stamping e relevo ficam dentro do corte e vinco: quem separa o que
    // foi feito e a etapa do roteiro e a maquina escolhida aqui.
    const maquinasDoSetor = maquinas.filter(m => m.setor_id === setor?.id);
    const exigeModelo = !!setor?.exige_produto && produtos.length > 1;
    const podeSalvarModelo = !exigeModelo || produtoId !== '';

    return (
        <div className="rast-page">
            {modalLiberacao}
            <div className="rast-card">
                <h2>Escolher a OP</h2>
                <form className="rast-linha" onSubmit={buscar} style={{ marginBottom: 20 }}>
                    <div className="rast-campo estreito">
                        <label htmlFor="rast-op">Número da OP</label>
                        <input id="rast-op" inputMode="numeric" value={numeroOp} autoFocus
                            onChange={e => setNumeroOp(e.target.value.replace(/\D/g, ''))} placeholder="20418" />
                    </div>
                    <button className="rast-btn primario" type="submit" disabled={buscando || !numeroOp}>
                        <Search size={18} /> {buscando ? 'Abrindo...' : 'Abrir OP'}
                    </button>
                    <div className="rast-campo" style={{ marginLeft: 'auto', maxWidth: 280 }}>
                        <label htmlFor="rast-filtro">Procurar na lista</label>
                        <input id="rast-filtro" value={filtro} onChange={e => setFiltro(e.target.value)}
                            placeholder="OP, pedido ou produto" />
                    </div>
                </form>

                <p className="rast-ajuda" style={{ marginBottom: 8 }}>
                    OPs importadas, da mais recente para a mais antiga. Clique na OP para abrir.
                </p>

                {ops.length === 0 ? (
                    <div className="rast-vazio">
                        Nenhuma OP importada ainda. Peça ao PCP para importar o XML do Metrics em "Importar OP".
                    </div>
                ) : opsFiltradas.length === 0 ? (
                    <div className="rast-vazio">Nenhuma OP encontrada para "{filtro}".</div>
                ) : (
                    <div className="rast-tabela-wrap">
                        <table className="rast-tabela">
                            <thead>
                                <tr>
                                    <th>OP</th>
                                    <th>Produto</th>
                                    <th>Pedido</th>
                                    <th>Entrega</th>
                                    <th style={{ textAlign: 'right' }}>Paletes em aberto</th>
                                    <th style={{ textAlign: 'right' }}>Total de paletes</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {opsFiltradas.map(o => (
                                    <tr key={o.id} className={op?.id === o.id ? 'selecionada' : ''}>
                                        <td><b>{o.numero_op}</b></td>
                                        <td style={{ maxWidth: 300 }}>{o.descricao || '-'}</td>
                                        <td>{o.pedido || '-'}</td>
                                        <td>{o.entrega_prevista ? new Date(o.entrega_prevista + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                                        <td className="num">{o.paletes_abertos || '-'}</td>
                                        <td className="num">{o.paletes_total || '-'}</td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button className="rast-btn pequeno" disabled={buscando} onClick={() => abrirOp(o.numero_op)}>
                                                Abrir <ArrowRight size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {erro && <div className="rast-aviso erro"><AlertTriangle size={18} /><span>{erro}</span></div>}

            {op && (
                <div className="rast-card">
                    <h2>OP {op.numero_op}{op.pedido ? `, pedido ${op.pedido}` : ''}</h2>

                    <div className="rast-campo" style={{ marginBottom: 16 }}>
                        <label>Onde o palete foi produzido</label>
                        <div className="rast-etapas">
                            {etapasDePalete.map(e => (
                                <button key={e.id} type="button"
                                    className={`rast-etapa ${e.id === etapaId ? 'ativa' : ''}`}
                                    onClick={() => setEtapaId(e.id)}>
                                    {etapaNome(e)}
                                    <small>{setores.find(s => s.id === e.setor_id)?.nome ?? 'sem setor'}</small>
                                </button>
                            ))}
                        </div>
                    </div>

                    {etapa && (
                        <div className="rast-resumo" style={{ marginBottom: 20 }}>
                            <div>
                                <span>Destino do palete</span>
                                <b style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <ArrowRight size={18} /> {nomeDestino(destino, setores)}
                                </b>
                            </div>
                            <div>
                                <span>Cura</span>
                                <b style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Clock size={18} />
                                    {liberaEm ? `${formatarQtd(setor!.cura_horas)} h, libera ${formatarDataHora(liberaEm.toISOString())}` : 'Não se aplica'}
                                </b>
                            </div>
                        </div>
                    )}

                    {produtos.length > 0 && (
                        <div className="rast-campo" style={{ marginBottom: 16 }}>
                            <label htmlFor="rast-modelo">
                                Modelo {exigeModelo ? '(obrigatório neste setor)' : produtos.length === 1 ? '(único da OP)' : '(opcional até o destaque)'}
                            </label>
                            <select id="rast-modelo" value={produtoId} onChange={e => setProdutoId(e.target.value)}
                                className={exigeModelo && !produtoId ? 'faltando' : ''}>
                                <option value="">{exigeModelo ? 'Escolha o modelo' : 'Ainda misturado, sem modelo'}</option>
                                {produtos.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.codigo} · {p.descricao}{p.quantidade ? ` · ${formatarQtd(p.quantidade)} un` : ''}
                                    </option>
                                ))}
                            </select>
                            {exigeModelo && !produtoId && (
                                <span className="rast-ajuda" style={{ color: 'var(--danger)' }}>
                                    Esta OP tem {produtos.length} modelos e aqui o material já está separado: escolha de qual modelo é o palete.
                                </span>
                            )}
                        </div>
                    )}

                    <div className="rast-linha" style={{ marginBottom: 16 }}>
                        <div className="rast-campo estreito">
                            <label htmlFor="rast-mat">Matrícula do operador</label>
                            <input id="rast-mat" value={matricula} onChange={e => setMatricula(e.target.value)} placeholder="Bipe o crachá" />
                        </div>
                        <div className="rast-campo">
                            <label htmlFor="rast-maq">Máquina</label>
                            <input id="rast-maq" list="rast-maquinas" value={maquina}
                                onChange={e => setMaquina(e.target.value)}
                                placeholder={maquinasDoSetor.length ? 'Escolha ou digite' : 'Ex.: Bobst 1'} />
                            <datalist id="rast-maquinas">
                                {maquinasDoSetor.map(m => <option key={m.id} value={m.nome} />)}
                            </datalist>
                        </div>
                        <div className="rast-campo estreito">
                            <label htmlFor="rast-un">Unidade</label>
                            <select id="rast-un" value={unidade} onChange={e => setUnidade(e.target.value as 'folhas' | 'unidades')}>
                                <option value="folhas">Folhas</option>
                                <option value="unidades">Unidades</option>
                            </select>
                        </div>
                        <div className="rast-campo estreito">
                            <label htmlFor="rast-st">Status</label>
                            <select id="rast-st" value={status} onChange={e => setStatus(e.target.value)}>
                                <option value="aprovado">Aprovado</option>
                                <option value="escolha">Escolha</option>
                                <option value="rejeitado">Rejeitado</option>
                                <option value="sobra">Sobra</option>
                            </select>
                        </div>
                    </div>

                    <div className="rast-campo" style={{ marginBottom: 12 }}>
                        <label>Quantidade de cada palete</label>
                        <div className="rast-qtds">
                            {qtds.map((q, i) => (
                                <div className="rast-qtd" key={i}>
                                    <span>{i + 1}</span>
                                    <input className="rast-input" inputMode="numeric" value={q} aria-label={`Quantidade do palete ${i + 1}`}
                                        onChange={e => setQtds(v => v.map((x, j) => j === i ? e.target.value : x))} placeholder="2800" />
                                    {qtds.length > 1 && (
                                        <button type="button" className="rast-icone-btn" aria-label="Remover palete"
                                            onClick={() => setQtds(v => v.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
                                    )}
                                </div>
                            ))}
                        </div>
                        <div>
                            <button type="button" className="rast-btn pequeno" style={{ marginTop: 8 }}
                                onClick={() => setQtds(v => [...v, v[v.length - 1] || ''])}>
                                <Plus size={14} /> Mais um palete
                            </button>
                        </div>
                    </div>

                    <div className="rast-linha" style={{ marginBottom: 20 }}>
                        <div className="rast-campo estreito">
                            <label htmlFor="rast-ref">Refugo deste lançamento</label>
                            <input id="rast-ref" inputMode="numeric" value={refugo} onChange={e => setRefugo(e.target.value)} placeholder="0" />
                        </div>
                        <div className="rast-campo">
                            <label htmlFor="rast-obs">Observação</label>
                            <input id="rast-obs" value={observacao} onChange={e => setObservacao(e.target.value)} />
                        </div>
                    </div>

                    <div className="rast-linha" style={{ justifyContent: 'space-between' }}>
                        <span className="rast-ajuda">
                            {validas.length} palete(s), total {formatarQtd(total)} {unidade}
                            {unidade === 'folhas' && bocas ? `, que dão ${formatarQtd(total * bocas)} unidades com ${formatarQtd(bocas)} bocas` : ''}
                        </span>
                        <button className="rast-btn primario" disabled={!podeSalvarQtd || !podeSalvarModelo || salvando} onClick={salvar}>
                            <Printer size={18} /> {salvando ? 'Registrando...' : 'Registrar e imprimir fichas'}
                        </button>
                    </div>
                </div>
            )}

            {criados.length > 0 && (
                <div className="rast-card">
                    <h2>Paletes registrados agora</h2>
                    <div className="rast-tabela-wrap">
                        <table className="rast-tabela">
                            <thead><tr><th>Código</th><th style={{ textAlign: 'right' }}>Quantidade</th><th>Destino</th><th>Libera em</th><th></th></tr></thead>
                            <tbody>
                                {criados.map(p => (
                                    <tr key={p.id}>
                                        <td className="rast-codigo">{p.codigo}</td>
                                        <td className="num">{formatarQtd(p.quantidade)} {p.unidade}</td>
                                        <td>{nomeDestino(roteiro.find(r => r.id === p.etapa_destino_id), setores)}</td>
                                        <td>{Number(p.cura_horas) > 0 ? formatarDataHora(p.liberado_em) : '-'}</td>
                                        <td>
                                            <button className="rast-btn pequeno" onClick={() => reimprimir(p)}>
                                                <Printer size={14} /> Reimprimir
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NovoPalete;
