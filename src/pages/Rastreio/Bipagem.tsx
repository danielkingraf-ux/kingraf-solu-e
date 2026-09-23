import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScanLine, CheckCircle2, XCircle, Truck, Undo2, Camera } from 'lucide-react';
import LeitorCamera from './LeitorCamera';
import { supabase } from '../../supabaseClient';
import type { Setor } from './api';
import { codigoDoTexto, formatarQtd, lerMatricula, listarSetores, mensagemErro, salvarMatricula } from './api';
import { ehCodigoEtiquetaPalete } from '../Labels/codigoPalete';
import './Rastreio.css';

// A estacao (computador ou tablet do setor) fica presa a um setor.
const CHAVE_SETOR = 'kingraf.rastreio.setor';

type Resultado =
    | { tipo: 'ok' | 'terceiros'; titulo: string; texto: string }
    | { tipo: 'erro'; titulo: string; texto: string };

interface Registro { hora: string; codigo: string; ok: boolean; texto: string }

// Bipe curto: agudo quando aceita, grave e longo quando recusa. O operador
// percebe sem olhar para a tela.
function bipe(ok: boolean) {
    try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = ok ? 1200 : 220;
        osc.type = ok ? 'sine' : 'square';
        gain.gain.value = 0.15;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + (ok ? 0.12 : 0.6));
        osc.onended = () => ctx.close();
    } catch { /* sem audio no aparelho */ }
}

const Bipagem: React.FC = () => {
    const [setores, setSetores] = useState<Setor[]>([]);
    const [setorId, setSetorId] = useState<number | null>(() => {
        try { return Number(localStorage.getItem(CHAVE_SETOR)) || null; } catch { return null; }
    });
    const [matricula, setMatricula] = useState(lerMatricula());
    const [aba, setAba] = useState<'bipar' | 'retorno'>('bipar');
    const [codigo, setCodigo] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [resultado, setResultado] = useState<Resultado | null>(null);
    const [historico, setHistorico] = useState<Registro[]>([]);
    const [retQtd, setRetQtd] = useState('');
    const [retRefugo, setRetRefugo] = useState('');
    const [retObs, setRetObs] = useState('');
    const scanRef = useRef<HTMLInputElement>(null);
    const [camera, setCamera] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(location.search);

        listarSetores().then(lista => {
            const ativos = lista.filter(x => x.ativo);
            setSetores(ativos);

            // ?estacao=CV deixa o aparelho preso a um setor de uma vez so. E o
            // atalho para preparar os PCs e celulares do chao sem ninguem
            // escolher em menu: cada maquina recebe o seu link.
            const sigla = params.get('estacao');
            if (sigla) {
                const alvo = ativos.find(x => x.sigla.toLowerCase() === sigla.toLowerCase().trim());
                if (alvo) escolherSetor(alvo.id);
            }
        }).catch(e => setResultado({ tipo: 'erro', titulo: 'Sem setores', texto: mensagemErro(e) }));

        // Veio do QR da ficha, lido pela camera do celular: ja deixa o codigo
        // no campo. Quem confirma e o operador, porque recarregar a pagina nao
        // pode virar uma bipagem sozinha.
        const doQr = params.get('bipar');
        if (doQr) {
            setCodigo(codigoDoTexto(doQr));
            history.replaceState(null, '', location.pathname);
        }
    }, []);

    const setor = setores.find(s => s.id === setorId) ?? null;
    const pronto = !!setor && matricula.trim() !== '';

    useEffect(() => { if (!setor?.terceiros) setAba('bipar'); }, [setor]);
    useEffect(() => { if (pronto) scanRef.current?.focus(); }, [pronto, aba]);

    const escolherSetor = (id: number | null) => {
        setSetorId(id);
        setResultado(null);
        try { localStorage.setItem(CHAVE_SETOR, id ? String(id) : ''); } catch { /* storage bloqueado */ }
    };

    const registrar = (r: Resultado, cod: string) => {
        setResultado(r);
        bipe(r.tipo !== 'erro');
        setHistorico(h => [{
            hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            codigo: cod, ok: r.tipo !== 'erro', texto: r.tipo === 'erro' ? r.texto : r.titulo,
        }, ...h].slice(0, 20));
    };

    const bipar = async (e?: React.FormEvent, codigoLido?: string) => {
        e?.preventDefault();
        const cod = codigoDoTexto(codigoLido ?? codigo);
        if (!cod || !setor || enviando) return;
        setEnviando(true);
        salvarMatricula(matricula.trim());
        try {
            // 20330-PAL-001 e etiqueta de palete da colagem (piloto): a
            // expedicao registra o recebimento. O resto e palete do rastreio.
            const funcao = ehCodigoEtiquetaPalete(cod) ? 'rast_bipar_etiqueta_palete' : 'rast_bipar_palete';
            const { data, error } = await supabase.rpc(funcao, {
                p_codigo: cod, p_setor_id: setor.id, p_matricula: matricula.trim(),
            });
            if (error) throw error;
            const d = data as { tipo: string; quantidade: number; unidade: string; etapa: string; numero_op: string };
            registrar(d.tipo === 'saida_terceiros'
                ? { tipo: 'terceiros', titulo: `${cod} liberado para terceiros`, texto: `${formatarQtd(d.quantidade)} ${d.unidade} saindo para ${d.etapa}. OP ${d.numero_op}.` }
                : d.tipo === 'finalizado'
                    ? { tipo: 'ok', titulo: `${cod} expedido`, texto: `${formatarQtd(d.quantidade)} ${d.unidade} finalizados. OP ${d.numero_op}.` }
                    : { tipo: 'ok', titulo: `${cod} baixado`, texto: `${formatarQtd(d.quantidade)} ${d.unidade} entraram em ${d.etapa}. OP ${d.numero_op}.` },
                cod);
        } catch (err) {
            registrar({ tipo: 'erro', titulo: 'Palete recusado', texto: mensagemErro(err) }, cod);
        } finally {
            setCodigo('');
            setEnviando(false);
            scanRef.current?.focus();
        }
    };

    const retorno = async (e: React.FormEvent) => {
        e.preventDefault();
        const cod = codigoDoTexto(codigo);
        if (!cod || enviando) return;
        setEnviando(true);
        salvarMatricula(matricula.trim());
        try {
            const { data, error } = await supabase.rpc('rast_retorno_terceiros', {
                p_codigo: cod,
                p_matricula: matricula.trim(),
                p_quantidade: Number(retQtd.replace(/\./g, '').replace(',', '.')),
                p_refugo: Number(retRefugo.replace(/\./g, '').replace(',', '.')) || 0,
                p_observacao: retObs,
            });
            if (error) throw error;
            const d = data as { quantidade: number; proximo_destino: string };
            registrar({ tipo: 'ok', titulo: `${cod} voltou do fornecedor`, texto: `${formatarQtd(d.quantidade)} de volta. Levar para ${d.proximo_destino}.` }, cod);
            setCodigo('');
            setRetQtd('');
            setRetRefugo('');
            setRetObs('');
        } catch (err) {
            registrar({ tipo: 'erro', titulo: 'Retorno recusado', texto: mensagemErro(err) }, cod);
        } finally {
            setEnviando(false);
        }
    };

    const aoLerPelaCamera = useCallback((cod: string) => {
        setCodigo(cod);
        if (aba === 'bipar') bipar(undefined, cod);
        // No retorno de terceiros a camera so preenche: falta a quantidade.
        else setCamera(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aba, setor?.id, matricula, enviando]);

    return (
        <div className="rast-page">
            <div className="rast-card">
                <div className="rast-estacao">
                    <div className="rast-campo">
                        <label htmlFor="rast-setor">Setor desta estação</label>
                        <select id="rast-setor" value={setorId ?? ''} onChange={e => escolherSetor(e.target.value ? Number(e.target.value) : null)}>
                            <option value="">Escolha o setor</option>
                            {setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                        </select>
                    </div>
                    <div className="rast-campo estreito">
                        <label htmlFor="rast-bip-mat">Matrícula do operador</label>
                        <input id="rast-bip-mat" value={matricula} onChange={e => setMatricula(e.target.value)} placeholder="Bipe o crachá" />
                    </div>
                    {setor?.terceiros && (
                        <div className="rast-abas" role="tablist">
                            <button role="tab" aria-selected={aba === 'bipar'} className={aba === 'bipar' ? 'ativa' : ''} onClick={() => setAba('bipar')}>
                                <Truck size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Saída
                            </button>
                            <button role="tab" aria-selected={aba === 'retorno'} className={aba === 'retorno' ? 'ativa' : ''} onClick={() => setAba('retorno')}>
                                <Undo2 size={16} style={{ verticalAlign: -3, marginRight: 6 }} />Retorno
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {!pronto ? (
                <div className="rast-aviso info">
                    <ScanLine size={18} />
                    <span>
                        {codigo
                            ? <>Ficha <b className="rast-codigo">{codigo}</b> lida. Escolha o setor desta estação e informe a matrícula para bipar.</>
                            : 'Escolha o setor desta estação e informe a matrícula para começar a bipar.'}
                    </span>
                </div>
            ) : aba === 'bipar' ? (
                <form className="rast-card" onSubmit={bipar}>
                    <div className="rast-manual-topo" style={{ marginBottom: 12 }}>
                        <h2 style={{ margin: 0 }}>{setor!.terceiros ? 'Saída para terceiros' : `Entrada em ${setor!.nome}`}</h2>
                        <button type="button" className="rast-btn" onClick={() => setCamera(true)}>
                            <Camera size={18} /> Ler pela câmera
                        </button>
                    </div>
                    <input ref={scanRef} className="rast-input rast-scan" value={codigo} disabled={enviando}
                        onChange={e => setCodigo(e.target.value)} placeholder="Bipe a ficha do palete"
                        aria-label="Código do palete" autoComplete="off" />
                    {camera && <LeitorCamera onLer={aoLerPelaCamera} onFechar={() => setCamera(false)} />}
                </form>
            ) : (
                <form className="rast-card" onSubmit={retorno}>
                    <h2>Retorno de terceiros</h2>
                    <div className="rast-linha">
                        <div className="rast-campo" style={{ flexBasis: '100%' }}>
                            <label htmlFor="rast-ret-cod">Código do palete</label>
                            <button type="button" className="rast-btn pequeno" style={{ alignSelf: 'flex-start', marginBottom: 6 }}
                                onClick={() => setCamera(true)}>
                                <Camera size={16} /> Ler pela câmera
                            </button>
                            {camera && <LeitorCamera onLer={aoLerPelaCamera} onFechar={() => setCamera(false)} />}
                            <input id="rast-ret-cod" ref={scanRef} className="rast-scan" value={codigo}
                                onChange={e => setCodigo(e.target.value)} placeholder="Bipe a ficha" autoComplete="off"
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('rast-ret-qtd')?.focus(); } }} />
                        </div>
                        <div className="rast-campo estreito">
                            <label htmlFor="rast-ret-qtd">Quantidade que voltou</label>
                            <input id="rast-ret-qtd" inputMode="numeric" value={retQtd} onChange={e => setRetQtd(e.target.value)} />
                        </div>
                        <div className="rast-campo estreito">
                            <label htmlFor="rast-ret-ref">Refugo do fornecedor</label>
                            <input id="rast-ret-ref" inputMode="numeric" value={retRefugo} onChange={e => setRetRefugo(e.target.value)} placeholder="0" />
                        </div>
                        <div className="rast-campo">
                            <label htmlFor="rast-ret-obs">Observação</label>
                            <input id="rast-ret-obs" value={retObs} onChange={e => setRetObs(e.target.value)} />
                        </div>
                        <button type="submit" className="rast-btn primario" disabled={enviando || !codigo.trim() || !retQtd}>
                            <Undo2 size={18} /> Registrar retorno
                        </button>
                    </div>
                </form>
            )}

            {resultado && (
                <div className={`rast-resultado ${resultado.tipo}`} role="status" aria-live="assertive">
                    {resultado.tipo === 'erro' ? <XCircle size={44} /> : resultado.tipo === 'terceiros' ? <Truck size={44} /> : <CheckCircle2 size={44} />}
                    <div>
                        <h3>{resultado.titulo}</h3>
                        <p>{resultado.texto}</p>
                    </div>
                </div>
            )}

            {historico.length > 0 && (
                <div className="rast-card">
                    <h2>Últimas bipagens nesta estação</h2>
                    <ul className="rast-historico">
                        {historico.map((h, i) => (
                            <li key={i}>
                                <time>{h.hora}</time>
                                {h.ok ? <CheckCircle2 size={16} color="var(--success)" /> : <XCircle size={16} color="var(--danger)" />}
                                <span className="rast-codigo">{h.codigo}</span>
                                <span style={{ color: 'var(--text-secondary)' }}>{h.texto}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default Bipagem;
