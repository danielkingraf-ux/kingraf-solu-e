import React from 'react';
import { ClipboardCheck, Package, Tags, ChevronRight, LogOut, Route } from 'lucide-react';
import './Selection.css';
import logoFull from '../../assets/logo/logo-full.png';

interface SelectionProps {
    onSelect: (module: string) => void;
    onLogout?: () => void;
    usuario?: string;
}

const Selection: React.FC<SelectionProps> = ({ onSelect, onLogout, usuario }) => {
    const modules = [
        {
            id: 'revisions',
            title: 'Controle de Revisão',
            description: 'Revisões de produção, desvios e relatórios de qualidade.',
            icon: <ClipboardCheck size={24} />,
            color: '#E65200',
        },
        {
            id: 'production',
            title: 'Controle de Caixas',
            description: 'Produção física, volumes produzidos, estoque e vínculo com OP.',
            icon: <Package size={24} />,
            color: '#2563EB',
        },
        {
            id: 'labels',
            title: 'Emissão de Etiquetas',
            description: 'Etiquetas de caixa e de palete, com lote e laudo da OP.',
            icon: <Tags size={24} />,
            color: '#059669',
        },
        {
            id: 'rast-bipagem',
            title: 'Rastreio de Palete',
            description: 'Ficha do palete, cura, destino e baixa por bipagem em cada setor.',
            icon: <Route size={24} />,
            color: '#7C3AED',
        }
    ];

    return (
        <div className="sel">
            <header className="sel-topo">
                <img src={logoFull} alt="Kingraf" className="sel-logo" />
                <div className="sel-usuario">
                    {usuario && <span className="sel-email">{usuario}</span>}
                    {onLogout && (
                        <button className="sel-sair" onClick={onLogout}>
                            <LogOut size={16} />
                            <span>Sair</span>
                        </button>
                    )}
                </div>
            </header>

            <main className="sel-conteudo">
                <h1>Módulos</h1>
                <p className="sel-sub">Escolha onde você vai trabalhar agora.</p>

                <div className="sel-grade">
                    {modules.map(module => (
                        <button
                            key={module.id}
                            className="sel-card"
                            onClick={() => onSelect(module.id)}
                            style={{ '--cor': module.color } as React.CSSProperties}
                        >
                            <span className="sel-icone">{module.icon}</span>
                            <span className="sel-texto">
                                <span className="sel-titulo">{module.title}</span>
                                <span className="sel-desc">{module.description}</span>
                            </span>
                            <ChevronRight size={20} className="sel-seta" />
                        </button>
                    ))}
                </div>
            </main>

            <footer className="sel-rodape">© 2026 Kingraf Indústria Gráfica</footer>
        </div>
    );
};

export default Selection;
