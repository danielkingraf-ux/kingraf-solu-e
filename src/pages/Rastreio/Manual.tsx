import React from 'react';
import { Printer } from 'lucide-react';
// O manual e conteudo fixo nosso, escrito a mao em manual.html. Fica em arquivo
// separado porque e impresso: sao seis folhas A4 com layout proprio.
import manual from './manual.html?raw';
import './Rastreio.css';
import './Manual.css';

const Manual: React.FC = () => (
    <div className="rast-page">
        <div className="rast-card rast-manual-topo">
            <p className="rast-ajuda" style={{ margin: 0 }}>
                Seis folhas A4. A última traz os cartões para recortar e colar na máquina.
            </p>
            <button className="rast-btn primario" onClick={() => window.print()}>
                <Printer size={18} /> Imprimir o manual
            </button>
        </div>

        <div className="rast-manual" dangerouslySetInnerHTML={{ __html: manual }} />
    </div>
);

export default Manual;
