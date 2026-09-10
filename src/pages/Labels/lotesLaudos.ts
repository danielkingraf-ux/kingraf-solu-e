import { supabase } from '../../supabaseClient';

/**
 * Lote e laudo sao alocados pelo banco, nunca pelo navegador, e a chave e o
 * par OP + MODELO (o codigo KING) — a mesma OP pode carregar modelos
 * diferentes, e cada um tem seu proprio lote e seus proprios laudos.
 * Ver supabase/migrations/20260910_lote_laudo_por_modelo.sql
 */

export interface Laudo {
    id: string;
    laudo: number;
    sequencia: number;
    quantidade: number | null;
    created_at: string;
}

/** Uma linha crua do RPC prod_dados_da_op (par OP+modelo x laudo, via LEFT JOIN). */
interface LinhaDadosOP {
    op: string;
    modelo: string;
    sobra: boolean;
    lote: number;
    cliente: string | null;
    produto: string | null;
    laudo_id: string | null;
    laudo: number | null;
    sequencia: number | null;
    quantidade: number | null;
    created_at: string | null;
}

export interface DadosOP {
    op: string;
    modelo: string;
    /** true = este e o lote de sobra daquele par, nao o da producao normal. */
    sobra: boolean;
    lote: number;
    cliente: string | null;
    produto: string | null;
    laudos: Laudo[];
}

/** Normaliza do mesmo jeito que o banco, pra tela e banco nunca divergirem. */
export const normalizarOP = (op: string) => op.trim().toUpperCase();
export const normalizarModelo = (modelo: string) => modelo.trim().toUpperCase();

/**
 * Le o que o par OP+modelo ja tem. Nao aloca nada.
 * Devolve null quando o par ainda nao recebeu lote.
 */
export const buscarDadosOP = async (
    op: string,
    modelo: string,
    sobra = false
): Promise<DadosOP | null> => {
    const chave = normalizarOP(op);
    if (!chave) return null;

    const { data, error } = await supabase.rpc('prod_dados_da_op', {
        p_op: chave,
        p_modelo: normalizarModelo(modelo),
        p_sobra: sobra
    });
    if (error) throw error;
    if (!data || data.length === 0) return null;

    const linhas = data as LinhaDadosOP[];
    const primeira = linhas[0];
    return {
        op: primeira.op,
        modelo: primeira.modelo,
        sobra: primeira.sobra,
        lote: primeira.lote,
        cliente: primeira.cliente,
        produto: primeira.produto,
        // O LEFT JOIN devolve uma linha com laudo nulo quando o par ainda nao
        // teve entrega.
        laudos: linhas
            .filter(linha => linha.laudo !== null && linha.laudo_id !== null)
            .map(linha => ({
                id: linha.laudo_id as string,
                laudo: linha.laudo as number,
                sequencia: linha.sequencia as number,
                quantidade: linha.quantidade,
                created_at: linha.created_at as string
            }))
    };
};

/**
 * Devolve o lote do par OP+modelo, alocando o proximo da sequencia se for a
 * primeira vez. Idempotente: chamar de novo com o mesmo par devolve o mesmo
 * numero.
 */
export const obterLoteDaOP = async (
    op: string,
    modelo: string,
    sobra = false,
    cliente?: string,
    produto?: string
): Promise<number> => {
    const { data, error } = await supabase.rpc('prod_lote_da_op', {
        p_op: normalizarOP(op),
        p_modelo: normalizarModelo(modelo),
        p_sobra: sobra,
        p_cliente: cliente || null,
        p_produto: produto || null
    });
    if (error) throw error;
    return data as number;
};

/**
 * Abre uma nova entrega do par OP+modelo e consome o proximo numero de laudo.
 * Cada chamada gera um laudo novo — nao usar para reimpressao.
 */
export const gerarNovoLaudo = async (
    op: string,
    modelo: string,
    quantidade?: string | number | null,
    cliente?: string,
    produto?: string
): Promise<Laudo & { lote: number }> => {
    const qtd = quantidade === '' || quantidade === null || quantidade === undefined
        ? null
        : Number(quantidade);

    const { data, error } = await supabase.rpc('prod_novo_laudo', {
        p_op: normalizarOP(op),
        p_modelo: normalizarModelo(modelo),
        p_quantidade: Number.isFinite(qtd as number) ? qtd : null,
        p_observacao: null,
        p_cliente: cliente || null,
        p_produto: produto || null
    });
    if (error) throw error;

    const linha = Array.isArray(data) ? data[0] : data;
    return {
        id: linha.id,
        laudo: linha.laudo,
        sequencia: linha.sequencia,
        quantidade: Number.isFinite(qtd as number) ? (qtd as number) : null,
        created_at: new Date().toISOString(),
        lote: linha.lote
    };
};

/** Ano em que o laudo foi aberto. Reimpressao de laudo antigo mantem o ano dele. */
export const anoDoLaudo = (createdAt?: string | null): string =>
    String((createdAt ? new Date(createdAt) : new Date()).getFullYear());

/**
 * Formato exigido na etiqueta: numero/ano-0.
 * O sufixo -0 e fixo, herdado do sistema anterior.
 */
export const formatarLaudo = (
    laudo: string | number | null | undefined,
    ano?: string | number | null
): string => {
    const numero = String(laudo ?? '').trim();
    if (!numero) return '';
    const anoFinal = String(ano ?? '').trim() || anoDoLaudo();
    return `${numero}/${anoFinal}-0`;
};

/** Uma linha da conferencia: um lote com os laudos que sairam dele. */
export interface LinhaConferencia {
    op: string;
    modelo: string;
    sobra: boolean;
    lote: number;
    cliente: string | null;
    produto: string | null;
    created_at: string;
    laudos: { laudo: number; sequencia: number; created_at: string }[];
}

/**
 * Lista os lotes emitidos, do mais novo para o mais antigo, com os laudos de
 * cada um. Só leitura — nao aloca nada.
 *
 * O termo aceita OP, modelo, numero de lote ou numero de laudo. Buscar por
 * laudo exige um passo a mais: o laudo mora em outra tabela, entao primeiro
 * descobrimos a que par OP+modelo ele pertence e so depois filtramos os lotes.
 */
export const buscarConferencia = async (
    termo = '',
    limite = 50
): Promise<LinhaConferencia[]> => {
    const t = termo.trim();
    let query = supabase
        .from('prod_op_lote')
        .select('op, modelo, sobra, lote, cliente, produto, created_at')
        .order('lote', { ascending: false })
        .limit(limite);

    if (t) {
        const ehNumero = /^\d+$/.test(t);
        const filtros = [`op.ilike.%${t}%`, `modelo.ilike.%${t}%`];

        if (ehNumero) {
            filtros.push(`lote.eq.${t}`);
            const { data: doLaudo } = await supabase
                .from('prod_op_laudo')
                .select('op')
                .eq('laudo', Number(t));
            const ops = [...new Set((doLaudo ?? []).map(l => l.op as string))];
            if (ops.length > 0) {
                filtros.push(`op.in.(${ops.join(',')})`);
            }
        }

        query = query.or(filtros.join(','));
    }

    const { data, error } = await query;
    if (error) throw error;

    const lotes = (data ?? []) as Omit<LinhaConferencia, 'laudos'>[];
    if (lotes.length === 0) return [];

    const { data: laudos, error: erroLaudos } = await supabase
        .from('prod_op_laudo')
        .select('op, modelo, laudo, sequencia, created_at')
        .in('op', [...new Set(lotes.map(l => l.op))])
        .order('sequencia');
    if (erroLaudos) throw erroLaudos;

    return lotes.map(l => {
        const doPar = (laudos ?? [])
            .filter(x => x.op === l.op && x.modelo === l.modelo)
            .map(x => ({
                laudo: x.laudo as number,
                sequencia: x.sequencia as number,
                created_at: x.created_at as string
            }));

        return {
            ...l,
            // A sobra nao tem laudo proprio: ela carrega o da 1a entrega da
            // producao normal daquele par, e so esse. Como a consulta ja vem
            // ordenada por sequencia, a 1a entrega e a primeira da lista.
            laudos: l.sobra ? doPar.slice(0, 1) : doPar
        };
    });
};
