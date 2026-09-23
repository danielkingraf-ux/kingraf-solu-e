// Ficha A4 que anda grampeada no palete. Preto e branco puro (laser de chao de
// fabrica), com QR e codigo de barras do codigo do palete, e campo de baixa
// manual no rodape como plano B se o coletor falhar.
// ?inline: o logo entra como data URI, dentro do proprio HTML da ficha. Se
// fosse um arquivo por URL, a impressao poderia comecar antes de ele carregar
// e a ficha sairia sem logo, que foi o que aconteceu no primeiro teste.
import logoPreto from '../../assets/logo/logo-preto.png?inline';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { supabase } from '../../supabaseClient';
import type { Etapa, Palete, RastroEtapa, Setor } from './api';
import { buscarRastro, codigoCurto, formatarQtd, nomeDestino } from './api';

export interface DadosFicha {
    palete: Palete;
    produto: { codigo: string | null; descricao: string | null } | null;
    cliente: string | null;
    servico: string | null;
    pedido: string | null;
    versao: string;
    roteiro: Etapa[];
    setores: Setor[];
    operador: { matricula: string; nome: string } | null;
    etiqueta: { numero: number; motivo: string; impressa_em: string } | null;
    rastro: RastroEtapa[];
}

const normalizar = (t: string | null | undefined) => (t || '').trim().toLowerCase();

const esc = (s: unknown) =>
    String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const dataHora = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function codigoBarras(texto: string): string {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, texto, { format: 'CODE128', height: 64, width: 2.2, margin: 0, displayValue: false, background: '#ffffff', lineColor: '#000000' });
    return svg.outerHTML;
}

export async function montarFicha(d: DadosFicha): Promise<string> {
    const p = d.palete;
    const origem = d.roteiro.find(r => r.id === p.etapa_origem_id);
    const destino = d.roteiro.find(r => r.id === p.etapa_destino_id) ?? null;
    // O QR leva o endereco do sistema com o codigo junto: lido pela camera do
    // celular, abre a tela de bipagem com o palete carregado. O codigo de
    // barras continua com o codigo puro, que e o que o leitor USB espera.
    const enderecoQr = `${location.origin}/?bipar=${encodeURIComponent(p.codigo)}`;
    const qr = await QRCode.toString(enderecoQr, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
    const reimpressao = d.etiqueta?.motivo === 'reimpressao';
    const temCura = Number(p.cura_horas) > 0;

    const linhasRoteiro = d.roteiro.map(r => {
        const marca = r.id === p.etapa_origem_id ? 'ORIGEM' : r.id === p.etapa_destino_id ? 'DESTINO' : '';
        return `<tr class="${marca ? 'marcada' : ''}${r.movimenta_palete ? '' : ' sem-palete'}">
            <td>${r.seq}</td>
            <td>${esc(r.processo)}${r.movimenta_palete ? '' : ' <em>(não recebe palete)</em>'}</td>
            <td>${r.terceiros ? 'TERCEIROS' : ''}</td>
            <td>${marca}</td>
        </tr>`;
    }).join('');

    return `
    <section class="ficha">
        <header>
            <div>
                <img class="logo" src="${logoPreto}" alt="Kingraf">
                <div class="titulo">FICHA DE PALETE</div>
            </div>
            <div class="ids">
                ${d.pedido ? `<div>Pedido ${esc(d.pedido)}</div>` : ''}
                ${d.cliente ? `<div>${esc(d.cliente)}</div>` : ''}
                <div>Palete nº <b>${p.numero}</b> · Id Etiqueta <b>${d.etiqueta?.numero ?? '-'}</b></div>
                ${reimpressao ? '<div class="via">2ª VIA (REIMPRESSÃO)</div>' : ''}
            </div>
        </header>

        <div class="codigos">
            <div class="qr">${qr}</div>
            <div class="barras">
                ${codigoBarras(p.codigo)}
                <div class="codigo">${esc(p.codigo)}</div>
            </div>
        </div>

        <div class="destino">
            <div class="rotulo">LEVAR PARA</div>
            <div class="valor">${esc(nomeDestino(destino, d.setores).toUpperCase())}</div>
            ${destino && !destino.terceiros && normalizar(destino.processo) !== normalizar(nomeDestino(destino, d.setores))
                ? `<div class="etapa">etapa: ${esc(destino.processo)}</div>` : ''}
            ${destino?.terceiros ? '<div class="obs">Sai pela portaria. Bipar na saída e no retorno.</div>' : ''}
        </div>

        ${d.produto || d.servico ? `<div class="produto">
            <span>${d.produto ? "Modelo deste palete" : "Serviço"}</span>
            <b>${esc(d.produto ? [d.produto.codigo, d.produto.descricao].filter(Boolean).join(" · ") : d.servico)}</b>
        </div>` : ''}

        <div class="destaques">
            <div><span>OP</span><b>${p.numero_op}</b></div>
            <div><span>Quantidade</span><b>${formatarQtd(p.quantidade)} <small>${esc(p.unidade)}</small></b></div>
            <div><span>Operador</span><b>${d.operador ? esc(d.operador.matricula) : '-'}</b>${d.operador ? `<em>${esc(d.operador.nome)}</em>` : ''}</div>
            <div><span>Produzido em</span><b class="data">${dataHora(p.produzido_em)}</b></div>
        </div>

        ${temCura ? `<div class="cura">
            <span>Cura de ${formatarQtd(p.cura_horas)} h: só pode ser bipado a partir de</span>
            <b>${dataHora(p.liberado_em)}</b>
        </div>` : ''}

        <div class="grade">
            <div class="campo"><span>Origem</span><b>${esc(origem?.processo ?? '-')}</b></div>
            <div class="campo"><span>Máquina</span><b>${esc(p.maquina ?? '-')}</b></div>
            ${p.status !== 'aprovado' ? `<div class="campo"><span>Status</span><b>${esc(p.status.toUpperCase())}</b></div>` : ''}
            ${p.observacao ? `<div class="campo largo"><span>Observação</span><b>${esc(p.observacao)}</b></div>` : ''}
        </div>

        ${montarRastro(d.rastro, p.numero_op)}

        <table class="roteiro">
            <thead><tr><th>Seq</th><th>Roteiro da OP${d.versao ? ` (versão ${esc(d.versao)})` : ''}</th><th></th><th></th></tr></thead>
            <tbody>${linhasRoteiro}</tbody>
        </table>

        <div class="manual">
            <div class="rotulo">BAIXA MANUAL (usar só se o coletor falhar, e lançar no sistema depois)</div>
            <table>
                <thead><tr><th>Setor</th><th>Matrícula</th><th>Data e hora</th><th>Quantidade</th><th>Refugo</th><th>Visto</th></tr></thead>
                <tbody>${'<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>'.repeat(2)}</tbody>
            </table>
        </div>

        <footer>Etiqueta impressa em ${d.etiqueta ? dataHora(d.etiqueta.impressa_em) : '-'} · Reimpressão gera etiqueta nova, nunca palete novo.</footer>
    </section>`;
}

// Por onde o material passou antes de virar este palete, e quem mexeu.
function montarRastro(rastro: RastroEtapa[], numeroOp: string): string {
    if (!rastro.length) return '';
    const lista = (xs: string[], max = 5) =>
        xs.length > max ? `${xs.slice(0, max).map(esc).join(', ')} e mais ${xs.length - max}` : xs.map(esc).join(', ') || '-';
    const linhas = rastro.map(r => `<tr>
            <td><b>${esc(r.setor)}</b>${r.terceiros.length ? `<br><small>+ terceiros: ${lista(r.terceiros)}</small>` : ''}</td>
            <td>${lista(r.codigos.map(c => codigoCurto(c, numeroOp)))}</td>
            <td>${lista(r.operadores, 3)}</td>
            <td>${lista(r.maquinas, 3)}</td>
            <td>${dataHora(r.produzido_de)}</td>
            <td>${lista(r.bipado_por, 3)}</td>
        </tr>`).join('');
    return `<table class="rastro">
        <thead>
            <tr><th colspan="6">RASTRO DO MATERIAL (de onde saiu este palete)</th></tr>
            <tr><th>Etapa</th><th>Paletes</th><th>Operador</th><th>Máquina</th><th>Produzido</th><th>Entrada bipada por</th></tr>
        </thead>
        <tbody>${linhas}</tbody>
    </table>`;
}

export const CSS_FICHA = `
@page { size: A4; margin: 10mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; font-size: 11pt; }
.ficha { height: 269mm; overflow: hidden; display: flex; flex-direction: column; gap: 2.5mm; page-break-after: always; }
.ficha:last-child { page-break-after: auto; }
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1.5mm solid #000; padding-bottom: 2mm; }
.logo { height: 13mm; width: auto; display: block; margin-bottom: 1.5mm; }
.titulo { font-size: 18pt; font-weight: 800; letter-spacing: 1px; }
.ids { text-align: right; font-size: 12pt; line-height: 1.5; }
.ids b { font-size: 15pt; }
.via { display: inline-block; border: 0.6mm solid #000; padding: 0.5mm 2mm; font-weight: 800; margin-top: 1mm; }
.codigos { display: flex; gap: 8mm; align-items: center; }
.qr svg { width: 24mm; height: 24mm; display: block; }
.barras { flex: 1; text-align: center; }
.barras svg { width: 100%; height: 15mm; }
.codigo { font-size: 19pt; font-weight: 800; letter-spacing: 2px; font-family: 'Courier New', monospace; }
.destino { border: 1.2mm solid #000; padding: 2mm 4mm; text-align: center; }
.destino .rotulo { font-size: 11pt; font-weight: 800; letter-spacing: 2px; }
.destino .valor { font-size: 28pt; font-weight: 900; line-height: 1.05; }
.destino .obs { font-size: 11pt; margin-top: 1mm; }
.destino .etapa { font-size: 12pt; font-weight: 700; margin-top: 0.5mm; }
.produto { border: 0.4mm solid #000; padding: 1.5mm 3mm; }
.produto span { font-size: 9pt; text-transform: uppercase; letter-spacing: 1px; display: block; }
.produto b { font-size: 13pt; }
/* O que o operador precisa ler de longe: OP, quantidade, quem fez e quando. */
.destaques { display: grid; grid-template-columns: 1fr 1fr; border: 0.5mm solid #000; }
.destaques > div { padding: 2mm 4mm; border-bottom: 0.3mm solid #000; }
.destaques > div:nth-child(odd) { border-right: 0.3mm solid #000; }
.destaques > div:nth-last-child(-n+2) { border-bottom: none; }
.destaques span { display: block; font-size: 9pt; text-transform: uppercase; letter-spacing: 1px; }
.destaques b { font-size: 26pt; font-weight: 900; line-height: 1.1; display: block; }
.destaques b small { font-size: 15pt; font-weight: 700; }
.destaques em { font-size: 12pt; font-style: normal; }
.destaques b.data { font-size: 19pt; }

.cura { border: 1.2mm solid #000; padding: 2mm 4mm; text-align: center; }
.cura span { font-size: 10pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
.cura b { display: block; font-size: 22pt; font-weight: 900; line-height: 1.1; }

.grade { display: grid; grid-template-columns: 1fr 1fr; border: 0.4mm solid #000; }
.campo { padding: 2mm 3mm; border-bottom: 0.3mm solid #000; display: flex; flex-direction: column; gap: 0.5mm; }
.campo:nth-child(odd) { border-right: 0.3mm solid #000; }
.campo.largo { grid-column: 1 / -1; border-right: none; }
.campo span { font-size: 9pt; text-transform: uppercase; letter-spacing: 1px; }
.campo b { font-size: 12pt; }
table { width: 100%; border-collapse: collapse; }
.roteiro th, .roteiro td { border: 0.3mm solid #000; padding: 0.7mm 2mm; font-size: 9.5pt; text-align: left; }
.roteiro td:first-child { width: 10mm; text-align: center; }
.roteiro td:nth-child(3), .roteiro td:nth-child(4) { width: 24mm; font-weight: 800; }
.roteiro tr.marcada td { font-weight: 800; border-width: 0.7mm; }
.roteiro tr.sem-palete td { color: #000; }
.rastro th, .rastro td { border: 0.3mm solid #000; padding: 0.7mm 2mm; font-size: 8.5pt; text-align: left; vertical-align: top; }
.rastro thead tr:first-child th { font-size: 10pt; letter-spacing: 1px; border-width: 0.6mm; }
.rastro small { font-size: 8pt; }
.manual { margin-top: auto; }
.manual .rotulo { font-size: 9pt; font-weight: 800; margin-bottom: 1mm; }
.manual th, .manual td { border: 0.3mm solid #000; font-size: 9pt; padding: 1mm; }
.manual td { height: 8mm; }
footer { font-size: 8pt; text-align: center; }
`;

/** Carrega os dados e manda imprimir uma ficha por palete. */
export async function imprimirFichas(paleteIds: string[]) {
    if (!paleteIds.length) return;

    const { data: paletes, error } = await supabase.from('rast_paletes').select('*').in('id', paleteIds);
    if (error) throw error;
    const lista = (paletes || []) as Palete[];
    lista.sort((a, b) => a.numero_op.localeCompare(b.numero_op, 'pt-BR', { numeric: true }) || a.setor_origem_id - b.setor_origem_id || a.numero - b.numero);

    const opIds = [...new Set(lista.map(p => p.op_id))];
    const operIds = [...new Set(lista.map(p => p.operador_id))];

    const [ops, roteiros, operadores, etiquetas, setores] = await Promise.all([
        supabase.from('rast_ops').select('id, pedido, versao_xml, descricao, cliente_id').in('id', opIds),
        supabase.from('rast_op_roteiro').select('*').in('op_id', opIds).order('seq'),
        supabase.from('rast_operadores').select('id, matricula, nome').in('id', operIds),
        supabase.from('rast_etiquetas').select('palete_id, numero, motivo, impressa_em').in('palete_id', paleteIds).order('numero', { ascending: false }),
        supabase.from('rast_setores').select('*'),
    ]);
    for (const r of [ops, roteiros, operadores, etiquetas, setores]) if (r.error) throw r.error;
    const rastros = await Promise.all(lista.map(p => buscarRastro(p.id)));

    const idsProduto = [...new Set(lista.map(p => p.produto_id).filter(Boolean))] as string[];
    const idsCliente = [...new Set((ops.data || []).map(o => (o as { cliente_id: number | null }).cliente_id).filter(Boolean))] as number[];
    const [produtos, clientes] = await Promise.all([
        idsProduto.length ? supabase.from('rast_op_produtos').select('id, codigo, descricao').in('id', idsProduto) : Promise.resolve({ data: [], error: null }),
        idsCliente.length ? supabase.from('rast_clientes').select('id, nome').in('id', idsCliente) : Promise.resolve({ data: [], error: null }),
    ]);

    const html: string[] = [];
    for (const [i, p] of lista.entries()) {
        const op = ops.data!.find(o => o.id === p.op_id);
        const cli = (clientes.data as { id: number; nome: string | null }[] | null)
            ?.find(c => c.id === (op as { cliente_id?: number | null })?.cliente_id);
        html.push(await montarFicha({
            palete: p,
            produto: (produtos.data as { id: string; codigo: string | null; descricao: string | null }[] | null)
                ?.find(x => x.id === p.produto_id) ?? null,
            cliente: cli?.nome ?? (cli ? `Cliente ${cli.id}` : null),
            servico: (op as { descricao?: string | null })?.descricao ?? null,
            pedido: op?.pedido ?? null,
            versao: op?.versao_xml ?? '',
            roteiro: (roteiros.data as Etapa[]).filter(r => r.op_id === p.op_id),
            setores: setores.data as Setor[],
            operador: operadores.data!.find(o => o.id === p.operador_id) ?? null,
            // a mais recente: na reimpressao e a que acabou de ser gerada
            etiqueta: etiquetas.data!.find(e => e.palete_id === p.id) ?? null,
            rastro: rastros[i],
        }));
    }

    imprimirHtml(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Fichas de palete</title><style>${CSS_FICHA}</style></head><body>${html.join('')}</body></html>`);
}

// Imprime por um iframe escondido: nao depende de pop-up liberado no navegador.
function imprimirHtml(documento: string) {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(documento);
    doc.close();
    const janela = iframe.contentWindow!;
    const remover = () => setTimeout(() => iframe.remove(), 1000);
    janela.addEventListener('afterprint', remover);

    let jaImprimiu = false;
    const imprimir = () => {
        if (jaImprimiu) return;   // load e o prazo de seguranca podem disparar juntos
        jaImprimiu = true;
        janela.focus();
        janela.print();
        // alguns navegadores nao disparam afterprint
        setTimeout(remover, 60000);
    };

    // Espera a pagina montar antes de imprimir: mandando cedo demais, a ficha
    // sai sem o que ainda nao desenhou.
    if (doc.readyState === 'complete') {
        setTimeout(imprimir, 150);
    } else {
        janela.addEventListener('load', () => setTimeout(imprimir, 150));
        setTimeout(imprimir, 3000);   // rede lenta ou load que nao dispara
    }
}
