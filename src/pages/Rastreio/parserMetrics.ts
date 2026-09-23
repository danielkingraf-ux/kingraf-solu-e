// Parser do XML de planejamento do Metrics (ePS). Porte do parser_metrics.py.
//
// Roda no navegador: o XML nunca sai da maquina, so o roteiro filtrado vai
// para o banco. Custo, preco, markup e dado de cliente NUNCA sao lidos: o
// filtro e por lista de permitidos, entao campo novo que a ePS incluir no XML
// nao entra sozinho. Nao trocar por lista de bloqueados.
//
// A ordem do roteiro nao esta escrita no XML. Ela e deduzida do encadeamento
// de material (quem produz o componente vem antes de quem consome) e ordenada
// por topologia (Kahn, desempate por IdProcess).

// ---------------------------------------------------------------------------
// LISTA DE PERMITIDOS. Nada fora daqui e copiado do XML.
// ---------------------------------------------------------------------------

const CAMPOS_PROCESSO = new Set([
    'Description',        // nome do processo
    'PlanQtd',            // quantidade planejada
    'PlanWasteSetupQtd',  // refugo previsto de acerto
    'PlanWasteRunQtd',    // refugo previsto de rodagem
    'RunSpeed',           // velocidade planejada
    'SetupTime1',         // tempo de acerto
    'IdProcess',          // chave interna do processo
    'ProductByCycle',     // poses por ciclo
]);

const CAMPOS_COMPONENTE = new Set([
    'Description',
    'Code',               // codigo do item (cartao, caixa, palete)
    'IdUnit',             // unidade: e o que distingue folha de unidade
    'IdCmp',
]);

const CAMPOS_OP = new Set([
    'IdWO',               // id interno do Metrics, NAO e o numero da OP
    'IdWS',               // liga a OP ao servico, onde mora o numero da OP
    'RequestNum',         // numero do pedido
    'DtMinStart',         // inicio minimo planejado
    'IdWOStatus',
    'Version',            // versao do planejamento: reimportar versao nova nao reescreve historico
]);

// plnWS e o servico. O numero que a fabrica chama de OP (e que da nome ao
// arquivo PLNxxxxx.xml) esta aqui em Code, nao no IdWO do plnWO.
const CAMPOS_SERVICO = new Set([
    'IdWS',
    'Code',               // o numero da OP
    'ExtRef',
    'Description',        // cliente e produto, do jeito que o Metrics escreve
    'IdActorCustomer',    // so o numero do cliente: nome, contato e endereco ficam de fora
]);

// plnFinalProduct: os modelos (SKU) da OP, com a quantidade de cada um.
// Custo e orcamento existem neste elemento e NAO entram: a lista abaixo e o filtro.
const CAMPOS_PRODUTO_FINAL = new Set([
    'IdCmp',              // liga ao componente, onde estao codigo e descricao
    'QtyAdjusted',        // quantidade a produzir
    'QtyApproved',        // quantidade aprovada no pedido
]);

// Terceirizacao. O sinal certo e o proprio Metrics escrever "(Terceiros)" no
// nome do processo, OP a OP: o mesmo servico pode ser interno numa OP e
// externo em outra. Os nomes abaixo sao servicos que a Kingraf confirmou como
// sempre externos. Se o nome bate aqui mas o Metrics NAO marcou, vira
// alerta_terceiros: tratado como externo (lado seguro) e o PCP confere.
// Verniz TOTAL e em casa, verniz LOCALIZADO e fora: "verniz" sozinho nunca serve.
const MARCA_TERCEIROS = 'terceiro';
const SEMPRE_EXTERNOS = ['laminac', 'laminaç', 'localizad'];

// Processos de apoio que nao entram na corrente de paletes.
const PALAVRAS_APOIO = [
    'preparacao de tintas', 'preparação de tintas',
    'gravacao de chapa', 'gravação de chapa',
    '<link>',
];

// Etapas que estao no roteiro mas nao recebem palete: inspecionam, nao movimentam.
const PALAVRAS_SEM_PALETE = ['controle de qualidade', 'inspec', 'inspeç'];

// ---------------------------------------------------------------------------

type Attrs = Record<string, string>;

export interface EtapaRoteiro {
    seq: number;
    processo: string;
    movimenta_palete: boolean;
    terceiros: boolean;
    alerta_terceiros: boolean;
    qtd_planejada: number | null;
    refugo_acerto: number | null;
    refugo_rodagem: number | null;
    velocidade: number | null;
    tempo_acerto_min: number | null;
    poses_por_ciclo: number | null;
}

export interface ProdutoXml {
    codigo: string | null;      // codigo Kingraf, ex.: 90.001.10524
    descricao: string | null;   // ex.: 400514.00 CAR VULT BAT ICON/CRM 207
    quantidade: number | null;
    qtd_aprovada: number | null;
    unidade_id: number | null;
}

export interface OpXml {
    numero_op: string | null;   // plnWS.Code: o numero que a fabrica usa (20418, ou 20363_01 na reimpressao)
    id_wo: number | null;       // IdWO: id interno do Metrics, para conferencia
    descricao: string | null;   // cliente e produto
    cliente_id: number | null;  // IdActorCustomer: o nome nao vem no XML
    pedido: string | null;
    versao_xml: string;
    entrega_prevista: string | null;
    inicio_minimo: string | null;
    status_erp: string | null;
}

export interface ResultadoParser {
    op: OpXml;
    produtos: ProdutoXml[];
    roteiro: EtapaRoteiro[];
    etapas_sem_movimentacao: string[];
    componentes: Attrs[];
}

const normalizar = (texto: string | null | undefined) => (texto || '').trim().toLowerCase();

function filtrar(elem: Element, permitidos: Set<string>): Attrs {
    const saida: Attrs = {};
    for (const a of Array.from(elem.attributes)) {
        if (permitidos.has(a.name)) saida[a.name] = a.value;
    }
    return saida;
}

function num(valor: string | undefined): number | null {
    if (valor === undefined || valor === null || valor.trim() === '') return null;
    const f = Number(valor);
    if (!Number.isFinite(f)) return null;
    return Number.isInteger(f) ? f : Math.round(f * 10000) / 10000;
}

// Equivalente ao ElementTree.iter(tag): o proprio elemento e todos os descendentes.
function iterTag(raiz: Element, tag: string): Element[] {
    const todos = [raiz, ...Array.from(raiz.getElementsByTagName('*'))];
    return todos.filter(e => e.localName === tag);
}

function filhos(elem: Element): Element[] {
    return Array.from(elem.children);
}

/** Devolve os entids referenciados por uma lista filha do elemento. */
function itens(indice: Map<string, Element>, elemento: Element, nomeTag: string): string[] {
    for (const filho of filhos(elemento)) {
        if (filho.localName !== nomeTag) continue;
        const alvo = indice.get(filho.getAttribute('entref') || '');
        if (!alvo) continue;
        return filhos(alvo).map(i => i.getAttribute('entref')).filter((x): x is string => !!x);
    }
    return [];
}

interface Processo {
    attrs: Attrs;
    entid: string;
    com_maquina: boolean;
}

export function extrair(textoXml: string): ResultadoParser {
    const doc = new DOMParser().parseFromString(textoXml, 'application/xml');
    const erro = doc.getElementsByTagName('parsererror')[0];
    if (erro) throw new Error('O arquivo não é um XML válido. Exporte de novo pelo Metrics.');

    const raiz = doc.documentElement;
    const indice = new Map<string, Element>();
    for (const e of [raiz, ...Array.from(raiz.getElementsByTagName('*'))]) {
        const id = e.getAttribute('entid');
        if (id) indice.set(id, e);
    }

    // --- cabecalho da OP -----------------------------------------------
    let opAttrs: Attrs = {};
    const wo = iterTag(raiz, 'plnWO')[0];
    if (wo) opAttrs = filtrar(wo, CAMPOS_OP);

    let dueDate: string | null = null;
    for (const elem of iterTag(raiz, 'plnWODelivery')) {
        if (elem.getAttribute('DueDate')) { dueDate = elem.getAttribute('DueDate'); break; }
    }

    // --- servico: e daqui que sai o numero da OP -------------------------
    const servicos = iterTag(raiz, 'plnWS').map(e => filtrar(e, CAMPOS_SERVICO));
    const servico = servicos.find(s => s.IdWS && s.IdWS === opAttrs.IdWS) ?? servicos[0] ?? {};

    // --- processos ------------------------------------------------------
    // plnProcessAtv = processo com maquina. plnProcess = etapa sem maquina.
    const processos = new Map<string, Processo>();
    for (const tag of ['plnProcessAtv', 'plnProcess']) {
        for (const elem of iterTag(raiz, tag)) {
            const entid = elem.getAttribute('entid');
            if (!entid) continue;
            processos.set(entid, { attrs: filtrar(elem, CAMPOS_PROCESSO), entid, com_maquina: tag === 'plnProcessAtv' });
        }
    }

    // --- ligacoes: quem produz e quem consome cada componente -----------
    const produz = new Map<string, string>();   // plnProduction    -> processo
    const consome = new Map<string, string>();  // plnDemandProcess -> processo
    for (const entid of processos.keys()) {
        const elem = indice.get(entid)!;
        for (const prod of itens(indice, elem, 'LOutPutProduction')) produz.set(prod, entid);
        for (const dem of itens(indice, elem, 'LInputDemand')) consome.set(dem, entid);
    }

    // --- arestas do roteiro ---------------------------------------------
    const arestas = new Set<string>(); // "origem|destino"
    const componentes: Attrs[] = [];
    const cmps = [...iterTag(raiz, 'plnCmpProduced'), ...iterTag(raiz, 'plnCmpPhysical')];

    const origensDe = (cmp: Element) =>
        itens(indice, cmp, 'LProductionProcess').filter(p => produz.has(p)).map(p => produz.get(p)!);
    const destinosDe = (cmp: Element) =>
        itens(indice, cmp, 'LDemand').filter(d => consome.has(d)).map(d => consome.get(d)!);

    for (const cmp of cmps) {
        componentes.push(filtrar(cmp, CAMPOS_COMPONENTE));
        for (const o of origensDe(cmp)) {
            for (const d of destinosDe(cmp)) {
                if (o !== d) arestas.add(`${o}|${d}`);
            }
        }
    }

    // --- processos sem ligacao de material ------------------------------
    // Impressao 1x0 e controle de qualidade aparecem no roteiro sem consumir
    // nem produzir componente. A posicao vem do nome do componente
    // "... Antes de <processo>": quem produz vem antes, quem consome depois.
    const ligados = new Set<string>();
    for (const par of arestas) par.split('|').forEach(e => ligados.add(e));
    const encaixados = new Set<string>();

    for (const cmp of cmps) {
        const desc = normalizar(cmp.getAttribute('Description'));
        if (!desc.includes(' antes de ')) continue;
        const alvo = desc.split(' antes de ').slice(1).join(' antes de ').trim();

        const proc = [...processos.entries()].find(
            ([e, d]) => !ligados.has(e) && normalizar(d.attrs.Description) === alvo,
        )?.[0];
        if (!proc) continue;

        const origens = origensDe(cmp);
        const destinos = destinosDe(cmp);
        if (!origens.length && !destinos.length) continue;

        for (const o of origens) arestas.add(`${o}|${proc}`);
        for (const d of destinos) arestas.add(`${proc}|${d}`);
        encaixados.add(proc);
    }

    // Movimenta palete: quem move material, mais os encaixados que nao sao
    // inspecao. (O parser Python deixava todo encaixado como "nao movimenta",
    // o que tirava a Impressao 1x0 da corrente de paletes.)
    const movimenta = new Set(ligados);
    for (const e of encaixados) {
        const nome = normalizar(processos.get(e)!.attrs.Description);
        if (!PALAVRAS_SEM_PALETE.some(p => nome.includes(p))) movimenta.add(e);
    }

    // so entra na corrente quem move material ou foi encaixado acima
    const naCorrente = new Set<string>();
    for (const par of arestas) par.split('|').forEach(e => naCorrente.add(e));
    const ehApoio = (e: string) => PALAVRAS_APOIO.some(p => normalizar(processos.get(e)!.attrs.Description).includes(p));

    const semFluxo = [...processos.keys()]
        .filter(e => !naCorrente.has(e) && !ehApoio(e))
        .map(e => processos.get(e)!.attrs.Description || '(sem nome)');

    // --- ordenacao topologica -------------------------------------------
    const ordem = ordenar([...processos.keys()].filter(e => naCorrente.has(e)), arestas, processos);

    const roteiro: EtapaRoteiro[] = [];
    let seq = 0;
    for (const entid of ordem) {
        if (ehApoio(entid)) continue;
        const d = processos.get(entid)!.attrs;
        const nome = normalizar(d.Description);
        const marcado = nome.includes(MARCA_TERCEIROS);
        const pelaLista = SEMPRE_EXTERNOS.some(p => nome.includes(p));
        seq += 1;
        roteiro.push({
            seq,
            processo: d.Description || '(sem nome)',
            movimenta_palete: movimenta.has(entid),
            terceiros: marcado || pelaLista,
            alerta_terceiros: !marcado && pelaLista,
            qtd_planejada: num(d.PlanQtd),
            refugo_acerto: num(d.PlanWasteSetupQtd),
            refugo_rodagem: num(d.PlanWasteRunQtd),
            velocidade: num(d.RunSpeed),
            tempo_acerto_min: num(d.SetupTime1),
            poses_por_ciclo: num(d.ProductByCycle),
        });
    }

    // O palete nasce na impressao: o que vem antes dela (corte de papel,
    // por exemplo) nao entra na corrente de paletes. O PCP pode mudar na tela.
    const primeiraImpressao = roteiro.findIndex(r => normalizar(r.processo).includes('impress'));
    for (let i = 0; i < primeiraImpressao; i++) roteiro[i].movimenta_palete = false;

    // --- modelos da OP --------------------------------------------------
    // Uma OP de embalagem simples tem um modelo. A do batom Vult tem cinco,
    // e cada um tem a sua quantidade. O palete so sabe de qual modelo e
    // depois do destaque, quando o material ja esta separado.
    const porIdCmp = new Map<string, Attrs>();
    for (const cmp of cmps) {
        const id = cmp.getAttribute("IdCmp");
        if (id && !porIdCmp.has(id)) porIdCmp.set(id, filtrar(cmp, CAMPOS_COMPONENTE));
    }

    const produtos: ProdutoXml[] = iterTag(raiz, "plnFinalProduct").map(el => {
        const fp = filtrar(el, CAMPOS_PRODUTO_FINAL);
        const cmp = porIdCmp.get(fp.IdCmp ?? "") ?? {};
        return {
            codigo: cmp.Code ?? null,
            descricao: cmp.Description ?? null,
            quantidade: num(fp.QtyAdjusted),
            qtd_aprovada: num(fp.QtyApproved),
            unidade_id: num(cmp.IdUnit),
        };
    }).filter(p => p.codigo || p.descricao);

    // O numero da OP e o Code do servico. O IdWO so serve de conferencia: ele
    // e outro numero, interno do Metrics, e nao e o que esta na ordem impressa.
    // Texto, nao numero: a reimpressao vem como Code="20363_01".
    const numeroOp = (servico.Code ?? servico.ExtRef ?? '').trim().toUpperCase() || null;
    return {
        op: {
            numero_op: numeroOp,
            id_wo: num(opAttrs.IdWO),
            descricao: servico.Description ?? null,
            cliente_id: num(servico.IdActorCustomer),
            pedido: opAttrs.RequestNum ?? null,
            versao_xml: opAttrs.Version ?? '',
            entrega_prevista: dueDate,
            inicio_minimo: opAttrs.DtMinStart ?? null,
            status_erp: opAttrs.IdWOStatus ?? null,
        },
        produtos,
        roteiro,
        etapas_sem_movimentacao: semFluxo,
        componentes,
    };
}

/** Kahn. Empate desfeito pelo IdProcess para dar saida estavel. */
function ordenar(ids: string[], arestas: Set<string>, processos: Map<string, Processo>): string[] {
    const noConjunto = new Set(ids);
    const entrada = new Map(ids.map(e => [e, 0]));
    const saida = new Map<string, string[]>(ids.map(e => [e, []]));
    for (const par of arestas) {
        const [o, d] = par.split('|');
        if (noConjunto.has(o) && noConjunto.has(d)) {
            saida.get(o)!.push(d);
            entrada.set(d, entrada.get(d)! + 1);
        }
    }

    const chave = (e: string) => {
        const n = parseInt(processos.get(e)?.attrs.IdProcess || '0', 10);
        return Number.isNaN(n) ? 0 : n;
    };
    const porChave = (a: string, b: string) => chave(a) - chave(b);

    const prontos = ids.filter(e => entrada.get(e) === 0).sort(porChave);
    const ordem: string[] = [];
    while (prontos.length) {
        const atual = prontos.shift()!;
        ordem.push(atual);
        for (const prox of saida.get(atual)!) {
            entrada.set(prox, entrada.get(prox)! - 1);
            if (entrada.get(prox) === 0) prontos.push(prox);
        }
        prontos.sort(porChave);
    }

    if (ordem.length < ids.length) {
        // ciclo ou processo solto: vai para o fim
        const feitos = new Set(ordem);
        ordem.push(...ids.filter(e => !feitos.has(e)).sort(porChave));
    }
    return ordem;
}

/** Setor sugerido pelo nome do processo. Terceiros vai sempre para a portaria. */
export function sugerirSetor(
    etapa: Pick<EtapaRoteiro, 'processo' | 'terceiros'>,
    setores: { id: number; palavras_chave: string[]; terceiros: boolean; ativo: boolean }[],
): number | null {
    const ativos = setores.filter(s => s.ativo);
    if (etapa.terceiros) return ativos.find(s => s.terceiros)?.id ?? null;
    const nome = normalizar(etapa.processo);
    return ativos.find(s => !s.terceiros && s.palavras_chave.some(p => nome.includes(p.toLowerCase())))?.id ?? null;
}
