import React from 'react';
import { ClipboardCheck, Package, Tags, ArrowRight, LogOut } from 'lucide-react';
import './Selection.css';
import logoFull from '../../assets/logo/logo-full.png';

interface SelectionProps {
    onSelect: (module: string) => void;
    onLogout?: () => void;
}

const Selection: React.FC<SelectionProps> = ({ onSelect, onLogout }) => {
    const modules = [
        {
            id: 'revisions',
            title: 'Controle de Revisão',
            description: 'Gerenciamento de qualidade, revisões de produção e registro de desvios.',
            icon: <ClipboardCheck size={40} />,
            color: '#FF5C00',
            bgLight: 'rgba(255, 92, 0, 0.05)'
        },
        {
            id: 'production',
            title: 'Controle de Caixas',
            description: 'Acompanhamento de produção física, volumes produzidos e vinculação com OPs.',
            icon: <Package size={40} />,
            color: '#3B82F6',
            bgLight: 'rgba(59, 130, 246, 0.05)'
        },
        {
            id: 'labels',
            title: 'Emissão de Etiquetas',
            description: 'Geração de etiquetas de pallet e caixa com rastreabilidade total.',
            icon: <Tags size={40} />,
            color: '#10B981',
            bgLight: 'rgba(16, 185, 129, 0.05)'
        }
    ];

    return (
        <div className="selection-container">
            {onLogout && (
                <button className="selection-logout-btn" onClick={onLogout} title="Sair">
                    <LogOut size={20} />
                    <span>Sair</span>
                </button>
            )}
            <div className="selection-header">
                <div className="logo-large">
                    <img src={logoFull} alt="Kingraf Logo" className="selection-logo-img" />
                    <div className="logo-subtitle">PLATAFORMA UNIFICADA</div>
                </div>
                <h1>Bem-vindo ao Sistema Unificado</h1>
                <p>Selecione o módulo que deseja acessar para iniciar suas atividades.</p>
            </div>

            <div className="module-grid">
                {modules.map((module, index) => (
                    <button
                        key={module.id}
                        className={`module-card animate-fade-in-up delay-${(index + 1) * 100}`}
                        onClick={() => onSelect(module.id)}
                        style={{ '--module-color': module.color, '--module-bg': module.bgLight } as React.CSSProperties}
                    >
                        <div className="module-icon-box">
                            {module.icon}
                        </div>
                        <div className="module-info">
                            <h3>{module.title}</h3>
                            <p>{module.description}</p>
                        </div>
                        <div className="module-footer">
                            <span>Acessar módulo</span>
                            <ArrowRight size={18} />
                        </div>
                    </button>
                ))}
            </div>

            <div className="selection-footer">
                <p>Kingraf Lean Start © 2026 • Sistema de Monitoramento Industrial</p>
            </div>
        </div>
    );
};

export default Selection;
