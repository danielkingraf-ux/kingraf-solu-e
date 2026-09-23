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

/*
 * ---- Caixas da OP ----
 * 15.000 pecas a 1.600 por caixa = 9 caixas cheias e uma 10a caixa com 600.
 * A caixa incompleta vai no ultimo palete.
 */
export interface DivisaoCaixas {
    caixasCheias: number;
    /** Pecas da caixa incompleta. 0 = divisao exata. */
    sobra: number;
    /** Cheias mais a incompleta, se houver. */
    caixasTotais: number;
    paletes: number;
    /** Caixas que vao no ultimo palete (contando a incompleta). */
    caixasUltimoPalete: number;
}

export const dividirEmCaixas = (plano: PlanoOP): DivisaoCaixas | null => {
    const pecas = num(plano.quantidadeOP);
    const porCaixa = num(plano.quantidadePorCaixa);
    const porPalete = num(plano.caixasPorPallet);
    if (pecas === null || porCaixa === null || porPalete === null) return null;

    const caixasCheias = Math.floor(pecas / porCaixa);
    const sobra = pecas - caixasCheias * porCaixa;
    const caixasTotais = caixasCheias + (sobra > 0 ? 1 : 0);
    const paletes = Math.ceil(caixasTotais / porPalete);
    return {
        caixasCheias,
        sobra,
        caixasTotais,
        paletes,
        caixasUltimoPalete: caixasTotais - (paletes - 1) * porPalete
    };
};

/*
 * ---- Paletes expedidos ----
 * Piloto colagem -> expedicao (2026-09-24): imprimir a etiqueta de palete
 * conta como palete que saiu da colagem e chegou na expedicao. O numero do
 * palete ("3" de "3/10") e a sequencia das etiquetas de palete da OP, gravada
 * em info_extra.paleteNumero. Um indice unico no banco impede duas etiquetas
 * com o mesmo numero na mesma OP.
 * Ver supabase/migrations/20260924_piloto_expedicao.sql
 */

export interface PaletesExpedidos {
    /** Maior numero ja impresso. O proximo palete e ultimo + 1. */
    ultimo: number;
    quantidade: number;
    pecas: number;
}

export const buscarExpedidos = async (op: string): Promise<PaletesExpedidos> => {
    const chave = op.trim().toUpperCase();
    const vazio: PaletesExpedidos = { ultimo: 0, quantidade: 0, pecas: 0 };
    if (!chave) return vazio;

    const { data, error } = await supabase
        .from('prod_etiquetas_historico')
        .select('quantidade, info_extra')
        .eq('tipo', 'pallet')
        .eq('op', chave);
    if (error) throw error;

    return (data || []).reduce((acc: PaletesExpedidos, linha: { quantidade: string | null; info_extra: { paleteNumero?: number } | null }) => {
        const numero = Number(linha.info_extra?.paleteNumero);
        // Etiqueta de antes do piloto nao tem numero: nao entra na contagem.
        if (!Number.isFinite(numero) || numero <= 0) return acc;
        return {
            ultimo: Math.max(acc.ultimo, numero),
            quantidade: acc.quantidade + 1,
            pecas: acc.pecas + (Number(linha.quantidade) || 0)
        };
    }, vazio);
};

/**
 * O "x/y" da etiqueta. O total e o que a OP preve; se sair mais palete que
 * isso, o total acompanha o numero (11/11, nunca 11/10). Sem a conta da OP,
 * sai so o numero.
 */
export const volumeDoPalete = (numero: number, previstos: number | null): string =>
    previstos === null ? String(numero) : `${numero}/${Math.max(numero, previstos)}`;
