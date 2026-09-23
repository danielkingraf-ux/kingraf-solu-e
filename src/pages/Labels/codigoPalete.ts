import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

/**
 * Codigo da etiqueta de palete da colagem, que a expedicao bipa: 20330-PAL-001.
 * Mesmo esquema da ficha do rastreio: o QR leva o endereco do sistema com o
 * codigo (a camera do celular abre a Bipagem), o codigo de barras leva o
 * codigo puro (o leitor USB digita ele).
 * Ver supabase/migrations/20260927_etiqueta_escolha_bipagem.sql
 */

export const codigoDoPalete = (op: string, numero: number) =>
    `${op.trim().toUpperCase()}-PAL-${String(numero).padStart(3, '0')}`;

/** Codigo de etiqueta de palete, e nao de palete do rastreio (20418-COL-003). */
export const ehCodigoEtiquetaPalete = (codigo: string) => /-PAL-\d+$/i.test(codigo.trim());

export interface CodigosDesenhados {
    codigo: string;
    qr: string;
    barras: string;
}

export async function desenharCodigos(codigo: string): Promise<CodigosDesenhados> {
    const endereco = `${location.origin}/?bipar=${encodeURIComponent(codigo)}`;
    const qr = await QRCode.toString(endereco, {
        type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' }
    });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, codigo, {
        format: 'CODE128', height: 64, width: 2.2, margin: 0, displayValue: false,
        background: '#ffffff', lineColor: '#000000'
    });
    return { codigo, qr, barras: svg.outerHTML };
}
