import { supabase } from '../../supabaseClient';

/**
 * Lote e laudo sao alocados pelo banco, nunca pelo navegador.
 * Ver supabase/migrations/20260910_lote_laudo_sequencial.sql
 */

export interface Laudo {
    id: string;
    laudo: number;
    sequencia: number;
    quantidade: number | null;
    created_at: string;
}

/** Uma linha crua do RPC prod_dados_da_op (OP x laudo, via LEFT JOIN). */
interface LinhaDadosOP {
    op: string;
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
    lote: number;
    cliente: string | null;
    produto: string | null;
    laudos: Laudo[];
}

/** Normaliza a OP do mesmo jeito que o banco, pra tela e banco nunca divergirem. */
export const normalizarOP = (op: string) => op.trim().toUpperCase();

/**
 * Le o que a OP ja tem. Nao aloca nada.
 * Devolve null quando a OP ainda nao recebeu lote.
 */
export const buscarDadosOP = async (op: string): Promise<DadosOP | null> => {
    const chave = normalizarOP(op);
    if (!chave) return null;

    const { data, error } = await supabase.rpc('prod_dados_da_op', { p_op: chave });
    if (error) throw error;
    if (!data || data.length === 0) return null;

    const linhas = data as LinhaDadosOP[];
    const primeira = linhas[0];
    return {
        op: primeira.op,
        lote: primeira.lote,
        cliente: primeira.cliente,
        produto: primeira.produto,
        // O LEFT JOIN devolve uma linha com laudo nulo quando a OP ainda nao teve entrega.
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
 * Devolve o lote da OP, alocando o proximo da sequencia se for a primeira vez.
 * Idempotente: chamar de novo com a mesma OP devolve o mesmo numero.
 */
export const obterLoteDaOP = async (
    op: string,
    cliente?: string,
    produto?: string
): Promise<number> => {
    const { data, error } = await supabase.rpc('prod_lote_da_op', {
        p_op: normalizarOP(op),
        p_cliente: cliente || null,
        p_produto: produto || null
    });
    if (error) throw error;
    return data as number;
};

/**
 * Abre uma nova entrega da OP e consome o proximo numero de laudo.
 * Cada chamada gera um laudo novo — nao usar para reimpressao.
 */
export const gerarNovoLaudo = async (
    op: string,
    quantidade?: string | number | null,
    cliente?: string,
    produto?: string
): Promise<Laudo & { lote: number }> => {
    const qtd = quantidade === '' || quantidade === null || quantidade === undefined
        ? null
        : Number(quantidade);

    const { data, error } = await supabase.rpc('prod_novo_laudo', {
        p_op: normalizarOP(op),
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
