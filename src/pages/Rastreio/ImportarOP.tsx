import React, { useEffect, useRef, useState } from 'react';
import { FileUp, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useToast } from '../../components/Toast/ToastProvider';
import { extrair, sugerirSetor } from './parserMetrics';
import type { ResultadoParser, EtapaRoteiro } from './parserMetrics';
import type { Op, Setor } from './api';
import { formatarQtd, listarSetores, mensagemErro } from './api';
import './Rastreio.css';

type Linha = EtapaRoteiro & { setor_id: number | null };

const ImportarOP: React.FC = () => {
    const { showSuccess } = useToast();
    const inputRef = useRef<HTMLInputElement>(null);
    const [setores, setSetores] = useState<Setor[]>([]);
    const [arquivo, setArquivo] = useState<string>('');
    const [lido, setLido] = useState<ResultadoParser | null>(null);
    const [linhas, setLinhas] = useState<Linha[]>([]);
    const [erro, setErro] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);
    const [recentes, setRecentes] = useState<Op[]>([]);

    const carregarRecentes = async () => {
        const { data } = await supabase.from('rast_ops').select('*').order('importado_em', { ascending: false }).limit(15);
        setRecentes((data || []) as Op[]);
    };

    useEffect(() => {
        listarSetores().then(setSetores).catch(e => setErro(mensagemErro(e)));
        carregarRecentes();
    }, []);

    const aoEscolher = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        setErro(null);
        setLido(null);
        try {
            const r = extrair(await f.text());
            if (!r.op.numero_op) throw new Error('Não achei o número da OP no arquivo. Confira se é o XML de planejamento do Metrics.');
            if (!r.roteiro.length) throw new Error('Não achei nenhum processo com ligação de material neste XML. Confira se a OP está planejada no Metrics.');
            setArquivo(f.name);
            setLido(r);
            setLinhas(r.roteiro.map(et => ({ ...et, setor_id: sugerirSetor(et, setores) })));
        } catch (err) {
            setErro(mensagemErro(err));
        }
    };

    const alterar = (seq: number, mudanca: Partial<Linha>) =>
        setLinhas(ls => ls.map(l => {
            if (l.seq !== seq) return l;
            const nova = { ...l, ...mudanca };
            // Marcou terceiros: vai para a portaria. Desmarcou: volta a sugestao pelo nome.
            if ('terceiros' in mudanca) nova.setor_id = sugerirSetor(nova, setores);
            if (mudanca.terceiros === false) nova.alerta_terceiros = false;
            return nova;
        }));

    const semSetor = linhas.filter(l => l.movimenta_palete && !l.setor_id);
    const faltaSetor = semSetor.length > 0;
    const alertas = linhas.filter(l => l.alerta_terceiros);

    const importar = async () => {
        if (!lido) return;
        setSalvando(true);
        setErro(null);
        try {
            const { error } = await supabase.rpc('rast_importar_op', {
                p_op: lido.op,
                p_roteiro: linhas,
                p_produtos: [],
                p_arquivo: arquivo,
            });
            if (error) throw error;
            showSuccess(`OP ${lido.op.numero_op} importada. Já pode criar paletes.`);
            setLido(null);
            setLinhas([]);
            carregarRecentes();
        } catch (err) {
            setErro(mensagemErro(err));
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className="rast-page">
            <div className="rast-card">
                <h2>Importar roteiro do Metrics</h2>
                <p className="rast-ajuda" style={{ marginBottom: 16 }}>
                    Escolha o arquivo PLNxxxxx.xml exportado do Metrics. O arquivo é lido aqui no navegador:
                    só o roteiro vai para o sistema. Custo, preço, markup e dados de cliente não são lidos.
                </p>
                <input ref={inputRef} type="file" accept=".xml,text/xml,application/xml" onChange={aoEscolher} hidden />
                <button className="rast-btn primario" onClick={() => inputRef.current?.click()}>
                    <FileUp size={18} /> Escolher XML
                </button>
            </div>

            {erro && <div className="rast-aviso erro"><AlertTriangle size={18} /><span>{erro}</span></div>}

            {lido && (
                <div className="rast-card">
                    <h2>OP {lido.op.numero_op}{lido.op.versao_xml ? `, versão ${lido.op.versao_xml}` : ''}</h2>
                    {lido.op.descricao && <p className="rast-ajuda" style={{ marginTop: -8, marginBottom: 12 }}>{lido.op.descricao}</p>}
                    <div className="rast-resumo" style={{ marginBottom: 16 }}>
                        <div><span>Pedido</span><b>{lido.op.pedido || '-'}</b></div>
                        <div><span>IdWO no Metrics</span><b>{lido.op.id_wo ?? '-'}</b></div>
                        <div><span>Entrega</span><b>{lido.op.entrega_prevista ? new Date(lido.op.entrega_prevista).toLocaleDateString('pt-BR') : '-'}</b></div>
                        <div><span>Arquivo</span><b style={{ fontSize: 14 }}>{arquivo}</b></div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                        <div className="rast-aviso info">
                            <Info size={18} />
                            <span>
                                Confira a ordem e as colunas antes de importar. <b>Recebe palete</b> desmarcado quer dizer
                                que a etapa está no roteiro mas não bipa palete (controle de qualidade, por exemplo).
                                O destino de cada palete é a próxima etapa marcada.
                            </span>
                        </div>
                        {alertas.length > 0 && (
                            <div className="rast-aviso alerta">
                                <AlertTriangle size={18} />
                                <span>
                                    {alertas.map(a => a.processo).join(', ')}: o nome indica serviço externo, mas o Metrics
                                    não marcou "(Terceiros)". Vai como terceiros (lado seguro). Avise o PCP para conferir o cadastro.
                                </span>
                            </div>
                        )}
                        {lido.etapas_sem_movimentacao.length > 0 && (
                            <div className="rast-aviso alerta">
                                <AlertTriangle size={18} />
                                <span>
                                    Ficaram fora do roteiro por não ter ligação de material: {lido.etapas_sem_movimentacao.join(', ')}.
                                    Se alguma delas movimenta palete, corrija o planejamento no Metrics e exporte de novo.
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="rast-tabela-wrap">
                        <table className="rast-tabela">
                            <thead>
                                <tr>
                                    <th>Seq</th>
                                    <th>Processo</th>
                                    <th>Recebe palete</th>
                                    <th>Terceiros</th>
                                    <th>Setor</th>
                                    <th style={{ textAlign: 'right' }}>Qtd planejada</th>
                                    <th style={{ textAlign: 'right' }}>Poses</th>
                                </tr>
                            </thead>
                            <tbody>
                                {linhas.map(l => (
                                    <tr key={l.seq} className={l.movimenta_palete ? '' : 'apagada'}>
                                        <td>{l.seq}</td>
                                        <td>
                                            {l.processo}{' '}
                                            {l.alerta_terceiros && <span className="rast-badge alerta">conferir</span>}
                                        </td>
                                        <td>
                                            <input type="checkbox" checked={l.movimenta_palete}
                                                onChange={e => alterar(l.seq, { movimenta_palete: e.target.checked })}
                                                aria-label={`${l.processo} recebe palete`} />
                                        </td>
                                        <td>
                                            <input type="checkbox" checked={l.terceiros}
                                                onChange={e => alterar(l.seq, { terceiros: e.target.checked })}
                                                aria-label={`${l.processo} é terceiros`} />
                                        </td>
                                        <td>
                                            <select
                                                value={l.setor_id ?? ''}
                                                className={l.movimenta_palete && !l.setor_id ? 'faltando' : ''}
                                                onChange={e => alterar(l.seq, { setor_id: e.target.value ? Number(e.target.value) : null })}
                                                aria-label={`Setor de ${l.processo}`}
                                            >
                                                <option value="">{l.movimenta_palete ? 'Escolha o setor' : '-'}</option>
                                                {setores.filter(s => s.ativo).map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                                            </select>
                                        </td>
                                        <td className="num">{formatarQtd(l.qtd_planejada)}</td>
                                        <td className="num">{formatarQtd(l.poses_por_ciclo)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {faltaSetor && (
                        <div className="rast-aviso erro" style={{ marginTop: 16 }}>
                            <AlertTriangle size={18} />
                            <span>
                                Falta escolher o setor de {semSetor.length === 1 ? 'uma etapa' : `${semSetor.length} etapas`}:{' '}
                                <b>{semSetor.map(l => `${l.seq}. ${l.processo}`).join(', ')}</b>.
                                Escolha o setor na coluna vermelha, ou desmarque "Recebe palete" se a etapa não bipa palete.
                                Enquanto faltar, o botão de importar fica desligado.
                            </span>
                        </div>
                    )}

                    <div className="rast-linha" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
                        <button className="rast-btn" onClick={() => { setLido(null); setLinhas([]); }}>Descartar</button>
                        <button className="rast-btn primario" disabled={salvando || faltaSetor} onClick={importar}>
                            <CheckCircle2 size={18} /> {salvando ? 'Importando...' : 'Importar roteiro'}
                        </button>
                    </div>
                </div>
            )}

            <div className="rast-card">
                <h2>Importadas recentemente</h2>
                {recentes.length === 0 ? (
                    <div className="rast-vazio">Nenhuma OP importada ainda.</div>
                ) : (
                    <div className="rast-tabela-wrap">
                        <table className="rast-tabela">
                            <thead><tr><th>OP</th><th>Produto</th><th>Versão</th><th>Pedido</th><th>Arquivo</th><th></th></tr></thead>
                            <tbody>
                                {recentes.map(o => (
                                    <tr key={o.id} className={o.ativa ? '' : 'apagada'}>
                                        <td><b>{o.numero_op}</b></td>
                                        <td style={{ maxWidth: 320 }}>{o.descricao || '-'}</td>
                                        <td>{o.versao_xml || '-'}</td>
                                        <td>{o.pedido || '-'}</td>
                                        <td>{o.arquivo_origem || '-'}</td>
                                        <td>{o.ativa ? <span className="rast-badge consumido">em uso</span> : <span className="rast-badge cancelado">substituída</span>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ImportarOP;
