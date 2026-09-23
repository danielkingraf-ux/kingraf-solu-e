import React from 'react';
import { Printer } from 'lucide-react';
// Conteudo fixo nosso, escrito a mao em manualPiloto.html, como o manual do
// rastreio. Explica o piloto colagem -> expedicao das etiquetas de palete.
import manual from './manualPiloto.html?raw';
import './Rastreio.css';
import './ManualPiloto.css';

const ManualPiloto: React.FC = () => (
    <div className="rast-page">
        <div className="rast-card rast-manual-topo">
            <p className="rast-ajuda" style={{ margin: 0 }}>
                Como funciona a etiqueta de palete no piloto da colagem, a conta em caixas, a liberação da supervisão e o Painel por OP.
            </p>
            <button className="rast-btn primario" onClick={() => window.print()}>
                <Printer size={18} /> Imprimir
            </button>
        </div>

        <div className="rast-card">
            <div className="mp" dangerouslySetInnerHTML={{ __html: manual }} />
        </div>
    </div>
);

export default ManualPiloto;
