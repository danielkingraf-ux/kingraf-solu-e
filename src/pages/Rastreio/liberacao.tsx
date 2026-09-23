import React, { useRef, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { formatarQtd, mensagemErro } from './api';
import './Liberacao.css';

/**
 * Liberacao da supervisao. Ver supabase/migrations/20260924_painel_liberacao.sql
 *
 * Regra combinada com o Daniel (2026-09-24):
 *   - emitir ate 10% acima do previsto passa direto;
 *   - acima disso, pede a matricula de um supervisor;
 *   - encerrar a OP com qualquer quantidade a menos tambem pede.
 */

/** 10%: acima do previsto ate aqui nao precisa de supervisor. */
export const TOLERANCIA = 0.10;

/** true quando `emitido` passa do previsto mais a tolerancia. Sem previsto, nunca trava. */
export const acimaDoPrevisto = (previsto: number | null | undefined, emitido: number): boolean =>
    previsto !== null && previsto !== undefined && previsto > 0 && emitido > previsto * (1 + TOLERANCIA);

export type TipoLiberacao = 'palete_etiqueta' | 'caixa_etiqueta' | 'palete_rastreio' | 'encerrar_op';

export interface PedidoLiberacao {
    tipo: TipoLiberacao;
    op: string;
    previsto: number | null;
    emitido: number;
    /** Palavra da quantidade: "paletes", "caixas", "unidades". */
    unidade: string;
    /** O que esta sendo liberado, gravado junto: codigo do palete, faixa de caixas. */
    referencia?: string;
    /** Frase de abertura do popup. */
    titulo: string;
}

const TIPO_TEXTO: Record<TipoLiberacao, string> = {
    palete_etiqueta: 'Etiqueta de palete',
    caixa_etiqueta: 'Etiqueta de caixa',
    palete_rastreio: 'Palete no rastreio',
    encerrar_op: 'Encerramento da OP'
};

/**
 * Popup de liberacao. Uso:
 *   const { modal, pedirLiberacao } = useLiberacao();
 *   const id = await pedirLiberacao({...});   // null = cancelado
 *   ... e renderizar {modal} em algum lugar da tela.
 */
export const useLiberacao = () => {
    const [pedido, setPedido] = useState<PedidoLiberacao | null>(null);
    const [matricula, setMatricula] = useState('');
    const [motivo, setMotivo] = useState('');
    const [erro, setErro] = useState<string | null>(null);
    const [enviando, setEnviando] = useState(false);
    const resolver = useRef<((id: string | null) => void) | null>(null);

    const fechar = (id: string | null) => {
        resolver.current?.(id);
        resolver.current = null;
        setPedido(null);
        setMatricula('');
        setMotivo('');
        setErro(null);
    };

    const pedirLiberacao = (p: PedidoLiberacao) =>
        new Promise<string | null>(resolve => {
            resolver.current = resolve;
            setPedido(p);
        });

    const liberar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pedido) return;
        setEnviando(true);
        setErro(null);
        try {
            const { data, error } = await supabase.rpc('rast_liberar', {
                p_matricula: matricula.trim(),
                p_tipo: pedido.tipo,
                p_op: pedido.op,
                p_previsto: pedido.previsto,
                p_emitido: pedido.emitido,
                p_motivo: motivo,
                p_referencia: pedido.referencia ?? null
            });
            if (error) throw error;
            fechar(data as string);
        } catch (err) {
            setErro(mensagemErro(err));
        } finally {
            setEnviando(false);
        }
    };

    const diferenca = pedido && pedido.previsto
        ? ((pedido.emitido - pedido.previsto) / pedido.previsto) * 100
        : null;

    const modal = pedido && (
        <div className="lib-fundo" role="dialog" aria-modal="true" aria-labelledby="lib-titulo">
            <form className="lib-caixa" onSubmit={liberar}>
                <div className="lib-topo">
                    <ShieldCheck size={22} />
                    <h3 id="lib-titulo">Liberação da supervisão</h3>
                    <button type="button" className="lib-fechar" onClick={() => fechar(null)} aria-label="Cancelar">
                        <X size={18} />
                    </button>
                </div>

                <p className="lib-texto">{pedido.titulo}</p>

                <div className="lib-numeros">
                    <div><span>Previsto</span><b>{pedido.previsto === null ? '—' : formatarQtd(pedido.previsto)}</b></div>
                    <div><span>Emitindo</span><b>{formatarQtd(pedido.emitido)}</b></div>
                    <div className={diferenca !== null && diferenca < 0 ? 'abaixo' : 'acima'}>
                        <span>Diferença</span>
                        <b>{diferenca === null ? '—' : `${diferenca > 0 ? '+' : ''}${diferenca.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}</b>
                    </div>
                </div>
                <small className="lib-ajuda">{TIPO_TEXTO[pedido.tipo]} · OP {pedido.op} · em {pedido.unidade}</small>

                <label htmlFor="lib-mat">Matrícula do supervisor</label>
                {/* type=password: a matricula e a chave da liberacao, nao fica na tela. */}
                <input id="lib-mat" type="password" autoComplete="off" autoFocus value={matricula}
                    onChange={e => setMatricula(e.target.value)} placeholder="Bipe ou digite" />

                <label htmlFor="lib-mot">Motivo</label>
                <input id="lib-mot" value={motivo} onChange={e => setMotivo(e.target.value)}
                    placeholder="Ex.: sobra do vinco, cliente aceitou a mais" />

                {erro && <p className="lib-erro">{erro}</p>}

                <div className="lib-botoes">
                    <button type="button" className="lib-btn" onClick={() => fechar(null)}>Cancelar</button>
                    <button type="submit" className="lib-btn primario"
                        disabled={enviando || !matricula.trim() || !motivo.trim()}>
                        {enviando ? 'Conferindo...' : 'Liberar'}
                    </button>
                </div>
            </form>
        </div>
    );

    return { modal, pedirLiberacao };
};
