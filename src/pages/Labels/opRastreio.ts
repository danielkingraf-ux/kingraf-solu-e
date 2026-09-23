import { supabase } from '../../supabaseClient';
import { buscarOp, fechamentoOp, type Palete, type Situacao } from '../Rastreio/api';

/**
 * A etiqueta de palete lendo o modulo de rastreio. So leitura: a etiqueta
 * nunca cria nem altera nada nas tabelas rast_.
 *
 * Do XML do Metrics (rast_ops e filhas) vem o que antes era digitado: cliente,
 * modelos com a quantidade, e as bocas (poses por ciclo do corte e vinco).
 *
 * Os paletes da colagem ja existem no rastreio (setor COL). O numero de cada
 * um, sequencial dentro da OP, e o "3" de "3/56" da etiqueta; a contagem de
 * quantos sairam da colagem e quantos a expedicao recebeu e a mesma do
 * fechamento da OP (rast_fechamento_op), para os dois modulos nunca darem
 * numeros diferentes.
 */

export interface ModeloOP {
    id: string;
    descricao: string;
    quantidade: number | null;
}

export interface PaleteColagem {
    id: string;
    codigo: string;
    numero: number;
    produtoId: string | null;
    quantidade: number;
    unidade: 'folhas' | 'unidades';
    situacao: Situacao;
}

export interface DadosOP {
    numeroOp: number;
    cliente: string | null;
    modelos: ModeloOP[];
    /** Soma dos modelos. A numeracao dos paletes e da OP inteira, nao do modelo. */
    quantidadeTotal: number | null;
    /** Poses por ciclo da etapa de corte e vinco. */
    bocas: number | null;
    /** Paletes da colagem, do primeiro ao ultimo. Cancelados ficam de fora. */
    paletesColagem: PaleteColagem[];
    /** Paletes que sairam da colagem (fechamento, setor COL). */
    sairamColagem: number;
    /** Paletes que a expedicao ja bipou (situacao finalizado). */
    chegaramExpedicao: number;
}

/** "20418" -> 20418. OP com letra ou vazia nao existe no rastreio. */
export const numeroDaOP = (op: string): number | null => {
    const limpo = op.trim();
    return /^\d+$/.test(limpo) ? Number(limpo) : null;
};

/** Devolve null quando a OP nao foi importada no rastreio. */
export const buscarDadosOP = async (op: string): Promise<DadosOP | null> => {
    const numero = numeroDaOP(op);
    if (numero === null) return null;

    const encontrada = await buscarOp(numero);
    if (!encontrada) return null;
    const { op: rastOp, roteiro, produtos } = encontrada;

    const [setores, fechamento, cliente, finalizados] = await Promise.all([
        supabase.from('rast_setores').select('id, sigla').in('sigla', ['CV', 'COL']),
        fechamentoOp(numero),
        rastOp.cliente_id === null
            ? Promise.resolve({ data: null, error: null })
            : supabase.from('rast_clientes').select('nome').eq('id', rastOp.cliente_id).maybeSingle(),
        // A expedicao recebe o palete finalizando ele (rast_bipar), sem evento
        // 'consumido' — por isso nao sai da entrada do fechamento.
        supabase.from('rast_paletes').select('id', { count: 'exact', head: true })
            .eq('numero_op', numero).eq('situacao', 'finalizado')
    ]);
    if (setores.error) throw setores.error;
    if (cliente.error) throw cliente.error;
    if (finalizados.error) throw finalizados.error;

    const setorId = (sigla: string) => setores.data?.find(s => s.sigla === sigla)?.id ?? null;
    const colagemId = setorId('COL');
    const vincoId = setorId('CV');

    let paletesColagem: PaleteColagem[] = [];
    if (colagemId !== null) {
        const { data, error } = await supabase
            .from('rast_paletes')
            .select('id, codigo, numero, produto_id, quantidade, unidade, situacao')
            .eq('numero_op', numero)
            .eq('setor_origem_id', colagemId)
            .neq('situacao', 'cancelado')
            .order('numero');
        if (error) throw error;
        paletesColagem = ((data || []) as Pick<Palete,
            'id' | 'codigo' | 'numero' | 'produto_id' | 'quantidade' | 'unidade' | 'situacao'>[]
        ).map(p => ({
            id: p.id,
            codigo: p.codigo,
            numero: p.numero,
            produtoId: p.produto_id,
            // NUMERIC pode chegar como texto do PostgREST
            quantidade: Number(p.quantidade),
            unidade: p.unidade,
            situacao: p.situacao
        }));
    }

    const modelos = produtos.map(p => ({
        id: p.id,
        descricao: p.descricao || p.codigo || 'Modelo sem nome',
        quantidade: p.quantidade === null ? null : Number(p.quantidade)
    }));
    const comQuantidade = modelos.filter(m => m.quantidade !== null);
    const etapaVinco = roteiro.find(r => r.setor_id === vincoId && r.poses_por_ciclo);
    const linha = (sigla: string) => fechamento.find(l => l.sigla === sigla);

    return {
        numeroOp: numero,
        cliente: cliente.data?.nome ?? null,
        modelos,
        quantidadeTotal: comQuantidade.length
            ? comQuantidade.reduce((soma, m) => soma + (m.quantidade as number), 0)
            : null,
        bocas: etapaVinco?.poses_por_ciclo ? Number(etapaVinco.poses_por_ciclo) : null,
        paletesColagem,
        sairamColagem: linha('COL')?.saida_paletes ?? 0,
        chegaramExpedicao: finalizados.count ?? 0
    };
};

/**
 * Codigos de palete da colagem que ja tem etiqueta impressa nesta OP. Serve
 * para a tela sugerir o proximo palete sem etiqueta.
 */
export const codigosComEtiqueta = async (op: string): Promise<Set<string>> => {
    const { data, error } = await supabase
        .from('prod_etiquetas_historico')
        .select('info_extra')
        .eq('tipo', 'pallet')
        .eq('op', op.trim().toUpperCase());
    if (error) throw error;
    return new Set(
        (data || [])
            .map((l: { info_extra: { rastPalete?: string } | null }) => l.info_extra?.rastPalete)
            .filter((c): c is string => !!c)
    );
};

/**
 * O "x/y" da etiqueta. O total e o que a OP pede; se a sobra do vinco fizer
 * sair mais paletes que isso, o total acompanha o numero (57/57, nunca 57/56).
 * Sem a conta da OP preenchida, sai so o numero.
 */
export const volumeDoPalete = (numero: number, previstos: number | null): string =>
    previstos === null ? String(numero) : `${numero}/${Math.max(numero, previstos)}`;
