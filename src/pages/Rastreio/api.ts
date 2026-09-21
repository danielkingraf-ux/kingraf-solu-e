// Acesso ao banco do modulo de Rastreio. As travas (cura, destino, quantidade)
// moram nas funcoes rast_* do Postgres: a tela so chama e mostra a mensagem.
import { supabase } from '../../supabaseClient';

export interface Setor {
    id: number;
    nome: string;
    sigla: string;
    palavras_chave: string[];
    terceiros: boolean;
    cura_horas: number;
    expedicao: boolean;
    exige_produto: boolean;
    ativo: boolean;
    ordem: number;
}

/**
 * Perfil da CONTA do sistema, que separa o PC da maquina da administracao.
 * Nao confundir com o papel da MATRICULA (operador, lider, supervisor), que
 * diz quem pode cancelar palete.
 */
export async function ehAdministrador(): Promise<boolean> {
    const { data, error } = await supabase.rpc('rast_eh_admin');
    if (error) {
        // Banco ainda sem a migration de administracao (a funcao nao existe):
        // segue como antes, com tudo liberado. Qualquer outro erro fecha.
        return error.code === 'PGRST202';
    }
    return data === true;
}

export type Papel = "operador" | "lider" | "supervisor";

export const PAPEL_LABEL: Record<Papel, string> = {
    operador: "Operador",
    lider: "Líder de setor",
    supervisor: "Supervisor",
};

export interface Operador {
    id: string;
    matricula: string;
    nome: string;
    setor_id: number | null;
    papel: Papel;
    ativo: boolean;
}

/** Modelo (SKU) da OP. A do batom Vult tem cinco; a de embalagem simples, um. */
export interface Produto {
    id: string;
    op_id: string;
    codigo: string | null;
    descricao: string | null;
    quantidade: number | null;
    qtd_aprovada: number | null;
    unidade_id: number | null;
}

export interface Cliente {
    id: number;
    nome: string | null;
    ativo: boolean;
}

export interface Op {
    id: string;
    numero_op: number;
    id_wo: number | null;
    descricao: string | null;
    cliente_id: number | null;
    pedido: string | null;
    versao_xml: string;
    entrega_prevista: string | null;
    ativa: boolean;
    importado_em: string;
    arquivo_origem: string | null;
}

export interface Etapa {
    id: string;
    op_id: string;
    seq: number;
    processo: string;
    setor_id: number | null;
    movimenta_palete: boolean;
    terceiros: boolean;
    alerta_terceiros: boolean;
    qtd_planejada: number | null;
    poses_por_ciclo: number | null;
}

export type Situacao = 'aguardando' | 'em_terceiros' | 'consumido' | 'finalizado' | 'cancelado';

export interface Palete {
    id: string;
    codigo: string;
    op_id: string;
    numero_op: number;
    produto_id: string | null;
    setor_origem_id: number;
    numero: number;
    etapa_origem_id: string;
    etapa_destino_id: string | null;
    maquina: string | null;
    operador_id: string;
    quantidade: number;
    unidade: 'folhas' | 'unidades';
    status: string;
    situacao: Situacao;
    produzido_em: string;
    cura_horas: number;
    liberado_em: string;
    observacao: string | null;
}

export const SITUACAO_LABEL: Record<Situacao, string> = {
    aguardando: 'Aguardando destino',
    em_terceiros: 'No fornecedor',
    consumido: 'Baixado',
    finalizado: 'Expedido',
    cancelado: 'Cancelado',
};

/** Mensagem do RAISE EXCEPTION do banco, ou a do erro de rede. */
export function mensagemErro(erro: unknown): string {
    if (erro && typeof erro === 'object' && 'message' in erro) {
        const msg = String((erro as { message: unknown }).message);
        if (/Failed to fetch|NetworkError/i.test(msg)) {
            return 'Sem conexão com o servidor. Confira a rede e tente de novo.';
        }
        return msg;
    }
    return 'Erro inesperado. Tente de novo.';
}

export async function listarSetores(): Promise<Setor[]> {
    const { data, error } = await supabase.from('rast_setores').select('*').order('ordem');
    if (error) throw error;
    return (data || []) as Setor[];
}

export interface OpResumo extends Op {
    paletes_abertos: number;   // aguardando destino ou no fornecedor
    paletes_total: number;
}

/**
 * OPs que estao no sistema (versao em uso), da importada mais recente para a
 * mais antiga, com a contagem de paletes. E a lista da tela, para ninguem
 * precisar lembrar o numero da OP de cabeca.
 */
export async function listarOps(limite = 50): Promise<OpResumo[]> {
    const { data, error } = await supabase
        .from('rast_ops')
        .select('*')
        .eq('ativa', true)
        .order('importado_em', { ascending: false })
        .limit(limite);
    if (error) throw error;
    const ops = (data || []) as Op[];
    if (!ops.length) return [];

    const { data: paletes, error: e2 } = await supabase
        .from('rast_paletes')
        .select('numero_op, situacao')
        .in('numero_op', ops.map(o => o.numero_op));
    if (e2) throw e2;

    const linhas = (paletes || []) as { numero_op: number; situacao: Situacao }[];
    return ops.map(o => {
        const daOp = linhas.filter(p => p.numero_op === o.numero_op && p.situacao !== 'cancelado');
        return {
            ...o,
            paletes_total: daOp.length,
            paletes_abertos: daOp.filter(p => p.situacao === 'aguardando' || p.situacao === 'em_terceiros').length,
        };
    });
}

/** Uma linha do fechamento da OP: o que entrou e o que saiu de um setor. */
export interface FechamentoSetor {
    setor_id: number;
    setor: string;
    sigla: string;
    planejado: number | null;
    refugo_previsto: number | null;
    entrada: number;
    entrada_paletes: number;
    entrada_unidade: 'folhas' | 'unidades' | null;
    ja_lancado: number;
    falta_lancar: number;
    saida: number;
    saida_paletes: number;
    saida_unidade: 'folhas' | 'unidades' | null;
    refugo: number;
    em_aberto: number;
    em_aberto_paletes: number;
    operadores: string[];
}

export async function fechamentoOp(numeroOp: number): Promise<FechamentoSetor[]> {
    const { data, error } = await supabase.rpc('rast_fechamento_op', { p_numero_op: numeroOp });
    if (error) throw error;
    // NUMERIC chega como string no PostgREST quando o valor tem casas decimais
    return ((data || []) as FechamentoSetor[]).map(l => ({
        ...l,
        planejado: l.planejado === null ? null : Number(l.planejado),
        refugo_previsto: l.refugo_previsto === null ? null : Number(l.refugo_previsto),
        entrada: Number(l.entrada),
        ja_lancado: Number(l.ja_lancado),
        falta_lancar: Number(l.falta_lancar),
        saida: Number(l.saida),
        refugo: Number(l.refugo),
        em_aberto: Number(l.em_aberto),
    }));
}

export async function listarClientes(): Promise<Cliente[]> {
    const { data, error } = await supabase.from('rast_clientes').select('*').order('id');
    if (error) throw error;
    return (data || []) as Cliente[];
}

/** Versao ativa da OP, o roteiro e os modelos dela. */
export async function buscarOp(numero: number): Promise<{ op: Op; roteiro: Etapa[]; produtos: Produto[] } | null> {
    const { data: op, error } = await supabase
        .from('rast_ops')
        .select('*')
        .eq('numero_op', numero)
        .eq('ativa', true)
        .maybeSingle();
    if (error) throw error;
    if (!op) return null;

    const [{ data: roteiro, error: e2 }, { data: produtos, error: e3 }] = await Promise.all([
        supabase.from('rast_op_roteiro').select('*').eq('op_id', op.id).order('seq'),
        supabase.from('rast_op_produtos').select('*').eq('op_id', op.id).order('descricao'),
    ]);
    if (e2) throw e2;
    if (e3) throw e3;
    return { op: op as Op, roteiro: (roteiro || []) as Etapa[], produtos: (produtos || []) as Produto[] };
}

/** Proxima etapa que movimenta palete depois de `etapa`. Espelha rast_proxima_etapa. */
export function proximaEtapa(roteiro: Etapa[], etapa: Etapa): Etapa | null {
    return roteiro.find(r => r.seq > etapa.seq && r.movimenta_palete) ?? null;
}

/** Uma etapa anterior no caminho do material (funcao rast_rastro do banco). */
export interface RastroEtapa {
    nivel: number;
    setor: string;
    processo: string;
    codigos: string[];
    operadores: string[];
    maquinas: string[];
    produzido_de: string;
    produzido_ate: string;
    terceiros: string[];
    bipado_por: string[];
}

/** De onde o palete saiu: impressao, corte e vinco, destaque... e quem mexeu em cada um. */
export async function buscarRastro(paleteId: string): Promise<RastroEtapa[]> {
    const { data, error } = await supabase.rpc('rast_rastro', { p_palete_id: paleteId });
    if (error) throw error;
    return (data || []) as RastroEtapa[];
}

/** 20418-IMP-003 vira IMP-003 quando a OP ja esta escrita ao lado. */
export const codigoCurto = (codigo: string, numeroOp: number) =>
    codigo.startsWith(`${numeroOp}-`) ? codigo.slice(String(numeroOp).length + 1) : codigo;

export function nomeDestino(destino: Etapa | null | undefined, setores: Setor[]): string {
    if (!destino) return 'Expedição';
    if (destino.terceiros) return `Terceiros: ${destino.processo.replace(/\s*\(terceiros\)/i, '')}`;
    return setores.find(s => s.id === destino.setor_id)?.nome ?? destino.processo;
}

export const formatarQtd = (n: number | null | undefined) =>
    n === null || n === undefined ? '-' : Number(n).toLocaleString('pt-BR');

export const formatarDataHora = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// A matricula fica guardada no aparelho do setor para o operador nao digitar a
// cada palete. Troca de turno: o operador troca a matricula na tela.
const CHAVE_MATRICULA = 'kingraf.rastreio.matricula';
export function lerMatricula(): string {
    try { return localStorage.getItem(CHAVE_MATRICULA) || ''; } catch { return ''; }
}
export function salvarMatricula(m: string) {
    try { localStorage.setItem(CHAVE_MATRICULA, m); } catch { /* storage bloqueado */ }
}
