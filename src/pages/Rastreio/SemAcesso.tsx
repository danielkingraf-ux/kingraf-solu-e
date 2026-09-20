import React from 'react';
import { Lock } from 'lucide-react';
import './Rastreio.css';

/** Tela de administracao aberta por uma conta de operacao. */
const SemAcesso: React.FC = () => (
    <div className="rast-page">
        <div className="rast-card" style={{ textAlign: 'center', padding: 40 }}>
            <Lock size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
            <h2 style={{ marginBottom: 8 }}>Tela de administração</h2>
            <p className="rast-ajuda" style={{ maxWidth: 460, margin: '0 auto' }}>
                Este computador está com uma conta de operação, que bipa, cria palete, consulta e imprime.
                Importar OP e mexer em cadastro é com o PCP ou o supervisor, numa conta de administração.
            </p>
        </div>
    </div>
);

export default SemAcesso;
