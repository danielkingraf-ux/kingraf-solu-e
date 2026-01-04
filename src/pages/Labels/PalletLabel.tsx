import React, { useState, useEffect } from 'react';
import { Printer, X, Copy } from 'lucide-react';
import './PalletLabel.css';

interface PalletLabelProps {
    onBack: () => void;
}

interface LabelData {
    cliente: string;
    produto: string;
    lote: string;
    pesoPorCaixa: string;
    op: string;
    operadorMaquina: string;
    turno: string;
    data: string;
    hora: string;
}

const PalletLabel: React.FC<PalletLabelProps> = ({ onBack }) => {
    const [palletInfo, setPalletInfo] = useState({ current: 1, total: 1 });
    const [isTimeManual, setIsTimeManual] = useState(false);
    const [labelData, setLabelData] = useState<LabelData>({
        cliente: '',
        produto: '',
        lote: '',
        pesoPorCaixa: '',
        op: '',
        operadorMaquina: '',
        turno: '',
        data: new Date().toLocaleDateString('pt-BR'),
        hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    });

    // Update time automatically if not manual
    useEffect(() => {
        if (isTimeManual) return;

        const timer = setInterval(() => {
            const now = new Date();
            setLabelData(prev => ({
                ...prev,
                data: now.toLocaleDateString('pt-BR'),
                hora: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
            }));
        }, 30000);

        return () => clearInterval(timer);
    }, [isTimeManual]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'hora' || name === 'data') {
            setIsTimeManual(true);
        }
        setLabelData(prev => ({ ...prev, [name]: value }));
    };

    const handlePrint = () => {
        window.print();
    };

    const handlePalletInfoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setPalletInfo(prev => ({ ...prev, [name]: parseInt(value) || 0 }));
    };

    return (
        <div className="pallet-label-container">
            <aside className="pallet-label-sidebar">
                <div className="sidebar-header">
                    <button className="back-btn-icon" onClick={onBack} title="Voltar">
                        <X size={20} color="#FFFFFF" />
                    </button>
                    <h2>Etiqueta de Palete</h2>
                </div>

                <div className="sidebar-content">
                    <div className="form-section">
                        <h3 className="section-title">Informações Principais</h3>
                        <div className="form-group">
                            <label>Cliente</label>
                            <input name="cliente" value={labelData.cliente} onChange={handleChange} placeholder="Nome do cliente" />
                        </div>
                        <div className="form-group">
                            <label>Produto</label>
                            <input name="produto" value={labelData.produto} onChange={handleChange} placeholder="Descrição do produto" />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>OP</label>
                                <input name="op" value={labelData.op} onChange={handleChange} placeholder="Nº OP" />
                            </div>
                            <div className="form-group">
                                <label>Lote</label>
                                <input name="lote" value={labelData.lote} onChange={handleChange} placeholder="Lote" />
                            </div>
                        </div>
                    </div>

                    <div className="form-section">
                        <h3 className="section-title">Especificações e Turno</h3>
                        <div className="form-group">
                            <label>Peso por Caixa (kg)</label>
                            <input name="pesoPorCaixa" value={labelData.pesoPorCaixa} onChange={handleChange} placeholder="Ex: 12.5" />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Operador Máquina</label>
                                <input name="operadorMaquina" value={labelData.operadorMaquina} onChange={handleChange} placeholder="Nome do operador" />
                            </div>
                            <div className="form-group">
                                <label>Turno</label>
                                <select name="turno" value={labelData.turno} onChange={handleChange} className="registry-select">
                                    <option value="">Selecione...</option>
                                    <option value="1º Turno">1º Turno</option>
                                    <option value="2º Turno">2º Turno</option>
                                    <option value="3º Turno">3º Turno</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="form-section">
                        <h3 className="section-title">Opções de Impressão</h3>
                        <div className="range-control">
                            <div className="form-group">
                                <label>Palete Nº</label>
                                <input type="number" name="current" value={palletInfo.current} onChange={handlePalletInfoChange} min="1" />
                            </div>
                            <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                <label>Total de Paletes</label>
                                <input type="number" name="total" value={palletInfo.total} onChange={handlePalletInfoChange} min="1" />
                            </div>
                        </div>
                        <p className="copies-hint">1 etiqueta por página A4 (Folha Inteira)</p>
                    </div>
                </div>

                <div className="sidebar-footer">
                    <button className="print-btn" onClick={handlePrint}>
                        <Printer size={20} />
                        Imprimir Etiquetas
                    </button>
                </div>
            </aside>

            <main className="pallet-label-preview-area">
                <div className="preview-header">
                    <Copy size={16} color="var(--kingraf-orange)" />
                    <span>Pré-visualização: Palete {palletInfo.current} de {palletInfo.total}</span>
                </div>

                <div className="a4-page-preview pallet-a4">
                    <div className="pallet-single-page" id="printable-pallet-labels">
                        <div className="pallet-label-item full-page">
                            {/* Header - Compact */}
                            <div className="pl-header">
                                <div className="pl-brand">KINGRAF</div>
                                <div className="pl-subtitle">INDÚSTRIA GRÁFICA</div>
                                <div className="pl-title">ETIQUETA DE PALETE</div>
                            </div>

                            {/* Main Content Grid */}
                            <div className="pl-content">
                                {/* Row 1: Cliente */}
                                <div className="pl-row">
                                    <div className="pl-field full">
                                        <div className="pl-label">CLIENTE</div>
                                        <div className="pl-value">{labelData.cliente || '---'}</div>
                                    </div>
                                </div>

                                {/* Row 2: Produto */}
                                <div className="pl-row">
                                    <div className="pl-field full">
                                        <div className="pl-label">PRODUTO</div>
                                        <div className="pl-value bold">{labelData.produto || '---'}</div>
                                    </div>
                                </div>

                                {/* Row 3: OP + Lote */}
                                <div className="pl-row two-col">
                                    <div className="pl-field">
                                        <div className="pl-label">OP / ORDEM</div>
                                        <div className="pl-value highlight">{labelData.op || '---'}</div>
                                    </div>
                                    <div className="pl-field">
                                        <div className="pl-label">LOTE</div>
                                        <div className="pl-value highlight">{labelData.lote || '---'}</div>
                                    </div>
                                </div>

                                {/* Row 4: Peso + Turno + Operador */}
                                <div className="pl-row three-col">
                                    <div className="pl-field weight-field">
                                        <div className="pl-label">PESO / CAIXA (KG)</div>
                                        <div className="pl-value peso">{labelData.pesoPorCaixa || '---'}</div>
                                    </div>
                                    <div className="pl-field">
                                        <div className="pl-label">TURNO</div>
                                        <div className="pl-value">{labelData.turno || '---'}</div>
                                    </div>
                                    <div className="pl-field">
                                        <div className="pl-label">OPERADOR</div>
                                        <div className="pl-value">{labelData.operadorMaquina || '---'}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer - Always visible */}
                            <div className="pl-footer">
                                <div className="pl-pallet-num">
                                    <span className="pl-pallet-label">PALETE</span>
                                    <span className="pl-pallet-value">{palletInfo.current}</span>
                                    <span className="pl-pallet-sep">/</span>
                                    <span className="pl-pallet-total">{palletInfo.total}</span>
                                </div>
                                <div className="pl-timestamp">
                                    <div className="pl-ts-label">DATA / HORA</div>
                                    <div className="pl-ts-value">{labelData.data} - {labelData.hora}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default PalletLabel;
