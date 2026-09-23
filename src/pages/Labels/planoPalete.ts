import { supabase } from '../../supabaseClient';

/**
 * A conta do palete: o que a OP pede contra o que o corte e vinco rodou.
 *
 * Sao duas contas diferentes, e e de proposito que elas aparecam lado a lado.
 *
 *   OP:    500.000 pecas / 300 por caixa = 1.666,67 caixas
 *          1.666,67 caixas / 30 por palete = 55,5 paletes.  <- a meta
 *
 *   VINCO: folhas x bocas = pecas que existem de verdade no chao.
 *
 * O vinco tem que dar A MAIS que a OP. Entre o vinco e a expedicao sempre se
 * perde peca (refile, acerto de maquina, defeito), entao rodar exatamente o
 * pedido da OP garante que a OP nao fecha.
 *
 * Ver supabase/migrations/20260923_palete_plano_op.sql
 */

/** O que o operador digita. Tudo texto: vem de <input>. */
export interface PlanoOP {
    /** Quanto a OP pede, em pecas. */
    quantidadeOP: string;
    /** Folhas passadas no corte e vinco. */
    folhasVinco: string;
    /** Pecas por folha (as bocas da faca). */
    bocas: string;
    quantidadePorCaixa: string;
    caixasPorPallet: string;
}

export const planoVazio: PlanoOP = {
    quantidadeOP: '',
    folhasVinco: '',
    bocas: '',
    quantidadePorCaixa: '',
    caixasPorPallet: ''
};

/**
 * Le um campo de texto como numero positivo. Devolve null para vazio, lixo ou
 * zero — e null propaga pela conta inteira, para a tela mostrar "—" em vez de
 * um Infinity ou um NaN.
 */
const num = (valor: string): number | null => {
    const limpo = valor.replace(/\./g, '').replace(',', '.').trim();
    if (!limpo) return null;
    const n = Number(limpo);
    return Number.isFinite(n) && n > 0 ? n : null;
};

/** Uma das duas colunas da conta: de uma quantidade de pecas ate os paletes. */
export interface Coluna {
    pecas: number | null;
    caixas: number | null;
    paletes: number | null;
}

export interface Conta {
    /** O que a OP pede. */
    op: Coluna;
    /** O que o corte e vinco rodou (folhas x bocas). */
    vinco: Coluna;
    /** vinco.pecas - op.pecas. Positivo e a sobra; negativo e o que falta. */
    diferenca: number | null;
    /** Folhas que o vinco precisa rodar so para empatar com a OP. */
    folhasParaFechar: number | null;
    /**
     * true  = o vinco ja passou da OP.
     * false = ainda nao passou, e ai a OP nao fecha.
     * null  = falta dado para saber.
     */
    fecha: boolean | null;
}

const coluna = (pecas: number | null, porCaixa: number | null, porPalete: number | null): Coluna => {
    const caixas = pecas !== null && porCaixa !== null ? pecas / porCaixa : null;
    const paletes = caixas !== null && porPalete !== null ? caixas / porPalete : null;
    return { pecas, caixas, paletes };
};

export const calcular = (plano: PlanoOP): Conta => {
    const porCaixa = num(plano.quantidadePorCaixa);
    const porPalete = num(plano.caixasPorPallet);
    const pecasOP = num(plano.quantidadeOP);
    const folhas = num(plano.folhasVinco);
    const bocas = num(plano.bocas);

    const pecasVinco = folhas !== null && bocas !== null ? folhas * bocas : null;

    return {
        op: coluna(pecasOP, porCaixa, porPalete),
        vinco: coluna(pecasVinco, porCaixa, porPalete),
        diferenca: pecasOP !== null && pecasVinco !== null ? pecasVinco - pecasOP : null,
        // Arredonda para cima: meia folha nao existe na maquina.
        folhasParaFechar: pecasOP !== null && bocas !== null ? Math.ceil(pecasOP / bocas) : null,
        fecha: pecasOP !== null && pecasVinco !== null ? pecasVinco > pecasOP : null
    };
};

/** Numero inteiro no formato daqui: 500.000. */
export const inteiro = (n: number | null): string =>
    n === null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

/** Numero quebrado: 1.666,67 caixas, 55,5 paletes. */
export const quebrado = (n: number | null, casas = 2): string =>
    n === null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/**
 * Paletes que a expedicao de fato monta: 55,5 significa 56 paletes, sendo o
 * ultimo pela metade. E esse numero que vai no "x de y" da etiqueta.
 */
export const paletesInteiros = (paletes: number | null): number | null =>
    paletes === null ? null : Math.ceil(paletes);

/**
 * Le o plano guardado daquela OP. Devolve null quando a OP ainda nao tem um.
 * So leitura: nao cria linha nenhuma.
 */
export const buscarPlano = async (op: string): Promise<PlanoOP | null> => {
    const chave = op.trim().toUpperCase();
    if (!chave) return null;

    const { data, error } = await supabase
        .from('prod_op_palete_plano')
        .select('quantidade_op, folhas_vinco, bocas, quantidade_por_caixa, caixas_por_pallet')
        .eq('op', chave)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const txt = (v: number | null) => (v === null || v === undefined ? '' : String(v));
    return {
        quantidadeOP: txt(data.quantidade_op),
        folhasVinco: txt(data.folhas_vinco),
        bocas: txt(data.bocas),
        quantidadePorCaixa: txt(data.quantidade_por_caixa),
        caixasPorPallet: txt(data.caixas_por_pallet)
    };
};

/**
 * Guarda o plano da OP para o proximo palete ja vir preenchido. Uma linha por
 * OP: salvar de novo sobrescreve, nunca duplica.
 */
export const salvarPlano = async (op: string, plano: PlanoOP): Promise<void> => {
    const chave = op.trim().toUpperCase();
    if (!chave) return;

    const { error } = await supabase
        .from('prod_op_palete_plano')
        .upsert({
            op: chave,
            quantidade_op: num(plano.quantidadeOP),
            folhas_vinco: num(plano.folhasVinco),
            bocas: num(plano.bocas),
            quantidade_por_caixa: num(plano.quantidadePorCaixa),
            caixas_por_pallet: num(plano.caixasPorPallet)
        }, { onConflict: 'op' });
    if (error) throw error;
};
