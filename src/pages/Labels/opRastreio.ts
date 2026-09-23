import { supabase } from '../../supabaseClient';
import { buscarOp } from '../Rastreio/api';

/**
 * A etiqueta lendo a OP importada no rastreio. So leitura: a etiqueta nunca
 * cria nem altera nada nas tabelas rast_.
 *
 * Do XML do Metrics vem o que antes era digitado: cliente, modelos com a
 * quantidade, e as bocas (poses por ciclo do corte e vinco).
 *
 * A contagem de paletes NAO vem daqui: no piloto colagem -> expedicao ela e
 * a das etiquetas de palete impressas (ver buscarExpedidos em planoPalete.ts).
 */

export interface ModeloOP {
    id: string;
    descricao: string;
    quantidade: number | null;
}

export interface DadosOP {
    numeroOp: string;
    cliente: string | null;
    modelos: ModeloOP[];
    /** Soma dos modelos. */
    quantidadeTotal: number | null;
    /** Poses por ciclo da etapa de corte e vinco. */
    bocas: number | null;
}

/** OP como o rastreio guarda: 20418, ou 20363_01 na reimpressao. Outro formato nao existe la. */
export const numeroDaOP = (op: string): string | null => {
    const limpo = op.trim().toUpperCase();
    return /^\d+(_\d+)?$/.test(limpo) ? limpo : null;
};

/** Devolve null quando a OP nao foi importada no rastreio. */
export const buscarDadosOP = async (op: string): Promise<DadosOP | null> => {
    const numero = numeroDaOP(op);
    if (numero === null) return null;

    const encontrada = await buscarOp(numero);
    if (!encontrada) return null;
    const { op: rastOp, roteiro, produtos } = encontrada;

    const [vinco, cliente] = await Promise.all([
        supabase.from('rast_setores').select('id').eq('sigla', 'CV').maybeSingle(),
        rastOp.cliente_id === null
            ? Promise.resolve({ data: null, error: null })
            : supabase.from('rast_clientes').select('nome').eq('id', rastOp.cliente_id).maybeSingle()
    ]);
    if (vinco.error) throw vinco.error;
    if (cliente.error) throw cliente.error;

    const modelos = produtos.map(p => ({
        id: p.id,
        descricao: p.descricao || p.codigo || 'Modelo sem nome',
        // NUMERIC pode chegar como texto do PostgREST
        quantidade: p.quantidade === null ? null : Number(p.quantidade)
    }));
    const comQuantidade = modelos.filter(m => m.quantidade !== null);
    const etapaVinco = roteiro.find(r => r.setor_id === vinco.data?.id && r.poses_por_ciclo);

    return {
        numeroOp: numero,
        cliente: cliente.data?.nome ?? null,
        modelos,
        quantidadeTotal: comQuantidade.length
            ? comQuantidade.reduce((soma, m) => soma + (m.quantidade as number), 0)
            : null,
        bocas: etapaVinco?.poses_por_ciclo ? Number(etapaVinco.poses_por_ciclo) : null
    };
};
