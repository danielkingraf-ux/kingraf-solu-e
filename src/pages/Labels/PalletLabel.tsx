import React, { useState, useEffect } from 'react';
import { Printer, X, Copy, Save, Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import './PalletLabel.css';

interface PalletLabelProps {
    onBack: () => void;
}

interface LabelData {
    cliente: string;
    produto: string;
    lote: string;
    quantidadePorCaixa: string;
    caixasPorPallet: string;
    op: string;
    operadorMaquina: string;
    turno: string;
    data: string;
    hora: string;
}

const PalletLabel: React.FC<PalletLabelProps> = ({ onBack }) => {
    const [palletInfo, setPalletInfo] = useState({ current: 1, total: 1 });
    const [isTimeManual, setIsTimeManual] = useState(false);
    const [savedId, setSavedId] = useState<string | null>(null);
    const [labelData, setLabelData] = useState<LabelData>({
        cliente: '',
        produto: '',
        lote: '',
        quantidadePorCaixa: '',
        caixasPorPallet: '',
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

    const totalQuantity = (parseFloat(labelData.quantidadePorCaixa) || 0) * (parseInt(labelData.caixasPorPallet) || 0);

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

    const handleSave = async () => {
        try {
            const dataToSave = {
                tipo: 'pallet',
                cliente: labelData.cliente,
                produto: labelData.produto,
                lote: labelData.lote,
                op: labelData.op,
                operador: labelData.operadorMaquina,
                turno: labelData.turno,
                quantidade_por_caixa: labelData.quantidadePorCaixa,
                caixas_por_pallet: labelData.caixasPorPallet,
                data: labelData.data,
                hora: labelData.hora
            };

            if (savedId) {
                // Update
                const { error } = await supabase
                    .from('prod_etiquetas_historico')
                    .update({ info_extra: dataToSave })
                    .eq('id', savedId);
                if (error) throw error;
                alert('Etiqueta atualizada com sucesso!');
            } else {
                // Insert
                const { data, error } = await supabase
                    .from('prod_etiquetas_historico')
                    .insert([dataToSave])
                    .select('id');
                if (error) throw error;
                setSavedId(data[0].id);
                alert('Etiqueta salva com sucesso!');
            }
        } catch (error) {
            console.error('Erro ao salvar:', error);
            alert('Erro ao salvar a etiqueta.');
        }
    };

    const handleDelete = async () => {
        if (!savedId) return;
        if (!confirm('Tem certeza que deseja excluir esta etiqueta?')) return;
        try {
            const { error } = await supabase
                .from('prod_etiquetas_historico')
                .delete()
                .eq('id', savedId);
            if (error) throw error;
            setSavedId(null);
            alert('Etiqueta excluída com sucesso!');
        } catch (error) {
            console.error('Erro ao excluir:', error);
            alert('Erro ao excluir a etiqueta.');
        }
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
                        <div className="form-row">
                            <div className="form-group">
                                <label>Quantidade por Caixa</label>
                                <input name="quantidadePorCaixa" value={labelData.quantidadePorCaixa} onChange={handleChange} placeholder="Ex: 100" />
                            </div>
                            <div className="form-group">
                                <label>Caixas por Pallet</label>
                                <input name="caixasPorPallet" value={labelData.caixasPorPallet} onChange={handleChange} placeholder="Ex: 50" />
                            </div>
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
                    <div className="preview-info">
                        <Copy size={16} color="var(--kingraf-orange)" />
                        <span>Pré-visualização: Palete {palletInfo.current} de {palletInfo.total}</span>
                    </div>
                    <div className="preview-actions">
                        <button className="save-btn" onClick={handleSave}>
                            <Save size={20} />
                            {savedId ? 'Atualizar' : 'Salvar'}
                        </button>
                        {savedId && (
                            <button className="delete-btn" onClick={handleDelete}>
                                <Trash2 size={20} />
                                Excluir
                            </button>
                        )}
                        <button className="print-btn" onClick={handlePrint}>
                            <Printer size={20} />
                            Imprimir
                        </button>
                    </div>
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
                                {/* Cliente */}
                                <div className="pl-field span-4 span-row-2">
                                    <div className="pl-label">CLIENTE</div>
                                    <div className="pl-value">{labelData.cliente || '---'}</div>
                                </div>

                                {/* Produto */}
                                <div className="pl-field span-4 span-row-2">
                                    <div className="pl-label">PRODUTO</div>
                                    <div className="pl-value bold">{labelData.produto || '---'}</div>
                                </div>

                                {/* OP */}
                                <div className="pl-field span-2">
                                    <div className="pl-label">OP / ORDEM</div>
                                    <div className="pl-value highlight">{labelData.op || '---'}</div>
                                </div>

                                {/* Lote */}
                                <div className="pl-field span-2">
                                    <div className="pl-label">LOTE</div>
                                    <div className="pl-value highlight">{labelData.lote || '---'}</div>
                                </div>

                                {/* Turno */}
                                <div className="pl-field span-2">
                                    <div className="pl-label">TURNO</div>
                                    <div className="pl-value">{labelData.turno || '---'}</div>
                                </div>

                                {/* Operador */}
                                <div className="pl-field span-2">
                                    <div className="pl-label">OPERADOR</div>
                                    <div className="pl-value">{labelData.operadorMaquina || '---'}</div>
                                </div>

                                {/* QTD / CAIXA */}
                                <div className="pl-field span-1">
                                    <div className="pl-label">QTD / CAIXA</div>
                                    <div className="pl-value">{labelData.quantidadePorCaixa || '---'}</div>
                                </div>

                                {/* CAIXAS / PALLET */}
                                <div className="pl-field span-1">
                                    <div className="pl-label">CAIXAS / PALLET</div>
                                    <div className="pl-value highlight">{labelData.caixasPorPallet || '---'}</div>
                                </div>

                                {/* QTD NO PALLET */}
                                <div className="pl-field span-2 span-row-2">
                                    <div className="pl-label">QTD NO PALLET</div>
                                    <div className="pl-value highlight">{totalQuantity || '---'}</div>
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
