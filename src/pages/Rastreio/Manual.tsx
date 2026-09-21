import React from 'react';
import { Printer, Download } from 'lucide-react';
// O manual e conteudo fixo nosso, escrito a mao em manual.html. Fica em arquivo
// separado porque e impresso: seis partes com layout proprio de A4.
import manual from './manual.html?raw';
import './Rastreio.css';
import './Manual.css';

const Manual: React.FC = () => (
    <div className="rast-page">
        <div className="rast-card rast-manual-topo">
            <p className="rast-ajuda" style={{ margin: 0 }}>
                Seis partes, dez páginas A4. A última traz os cartões para recortar e colar na máquina.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a className="rast-btn" href="/manual-rastreio-de-palete.pdf" download>
                    <Download size={18} /> Baixar em PDF
                </a>
                <button className="rast-btn primario" onClick={() => window.print()}>
                    <Printer size={18} /> Imprimir o manual
                </button>
            </div>
        </div>

        <div className="rast-manual" dangerouslySetInnerHTML={{ __html: manual }} />
    </div>
);

export default Manual;
