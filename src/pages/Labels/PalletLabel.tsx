import React, { useState, useEffect } from 'react';
import { Printer, X, Copy, Save, Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { buscarDadosOP, obterLoteDaOP } from './lotesLaudos';
import {
    calcular, buscarPlano, salvarPlano, inteiro, quebrado, paletesInteiros,
    type PlanoOP
} from './planoPalete';
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
    /** Quanto a OP pede, em pecas. So entra na conta — nao sai impresso. */
    quantidadeOP: string;
    /** Folhas passadas no corte e vinco. */
    folhasVinco: string;
    /** Pecas por folha (as bocas da faca). */
    bocas: string;
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
    // O lote e o mesmo da OP em qualquer etiqueta: vem do banco, ver lotesLaudos.ts
    const [opBusy, setOpBusy] = useState(false);
    const [opErro, setOpErro] = useState<string | null>(null);
    // Saida de emergencia: destrava o lote para digitar a mao (OP antiga,
    // numero vindo de fora, acerto de erro). Ligado, o sistema nao aloca nada.
    const [manual, setManual] = useState(false);
    const [labelData, setLabelData] = useState<LabelData>({
        cliente: '',
        produto: '',
        lote: '',
        quantidadePorCaixa: '',
        caixasPorPallet: '',
        quantidadeOP: '',
        folhasVinco: '',
        bocas: '',
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

    // O que a OP pede x o que o vinco rodou. Ver planoPalete.ts.
    const plano: PlanoOP = {
        quantidadeOP: labelData.quantidadeOP,
        folhasVinco: labelData.folhasVinco,
        bocas: labelData.bocas,
        quantidadePorCaixa: labelData.quantidadePorCaixa,
        caixasPorPallet: labelData.caixasPorPallet
    };
    const conta = calcular(plano);
    const paletesDaOP = paletesInteiros(conta.op.paletes);

    // Joga os paletes previstos no "x de y" da etiqueta. E um botao, nunca
    // automatico: quem decide quantos paletes a OP vai render e o operador,
    // olhando a conta — a tela so faz a divisao.
    const usarTotalPrevisto = () => {
        if (paletesDaOP === null) return;
        setPalletInfo(prev => ({ ...prev, total: paletesDaOP }));
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name === 'hora' || name === 'data') {
            setIsTimeManual(true);
        }
        setLabelData(prev => ({ ...prev, [name]: value }));
    };

    // Puxa o lote da OP (alocando na primeira vez). E o mesmo numero que a
    // etiqueta de caixa daquela OP carrega.
    const handleOPBlur = async () => {
        const op = labelData.op.trim().toUpperCase();
        if (!op) return;

        setOpBusy(true);
        setOpErro(null);
        try {
            // O palete trabalha por OP, sem modelo: passa modelo vazio de
            // proposito. Quem separa lote por modelo (o codigo KING) e a
            // etiqueta de CAIXA — ver lotesLaudos.ts. O '' precisa ser
            // explicito porque todos os parametros sao string: omitir faria o
            // cliente entrar no lugar do modelo sem o compilador reclamar.
            const dados = await buscarDadosOP(op, '');

            // No manual so aproveitamos cliente e produto. obterLoteDaOP ALOCA
            // um lote novo no banco, e queimar numero de uma OP digitada a mao
            // e o que o modo manual existe para evitar.
            if (manual) {
                const so = await buscarPlano(op);
                setLabelData(prev => ({
                    ...prev,
                    op,
                    cliente: prev.cliente || dados?.cliente || '',
                    produto: prev.produto || dados?.produto || '',
                    ...(so ? {
                        quantidadeOP: prev.quantidadeOP || so.quantidadeOP,
                        folhasVinco: prev.folhasVinco || so.folhasVinco,
                        bocas: prev.bocas || so.bocas,
                        quantidadePorCaixa: prev.quantidadePorCaixa || so.quantidadePorCaixa,
                        caixasPorPallet: prev.caixasPorPallet || so.caixasPorPallet
                    } : {})
                }));
                return;
            }

            const lote = dados
                ? dados.lote
                : await obterLoteDaOP(op, '', false, labelData.cliente, labelData.produto);

            const guardado = await buscarPlano(op);

            setLabelData(prev => ({
                ...prev,
                op,
                lote: String(lote),
                cliente: prev.cliente || dados?.cliente || '',
                produto: prev.produto || dados?.produto || '',
                // O plano e da OP inteira: o 2o palete ja abre preenchido. O
                // que o operador digitou nesta tela vence o que esta guardado.
                ...(guardado ? {
                    quantidadeOP: prev.quantidadeOP || guardado.quantidadeOP,
                    folhasVinco: prev.folhasVinco || guardado.folhasVinco,
                    bocas: prev.bocas || guardado.bocas,
                    quantidadePorCaixa: prev.quantidadePorCaixa || guardado.quantidadePorCaixa,
                    caixasPorPallet: prev.caixasPorPallet || guardado.caixasPorPallet
                } : {})
            }));
        } catch (error) {
            console.error('Erro ao carregar lote da OP:', error);
            setOpErro(
                error instanceof Error && error.message
                    ? error.message
                    : 'Nao foi possivel carregar o lote desta OP.'
            );
        } finally {
            setOpBusy(false);
        }
    };

    // Liga e desliga a digitacao manual do lote. Ao desligar, o banco volta a
    // mandar: recarrega o lote da OP e descarta o que foi digitado.
    const handleTrocarManual = (e: React.ChangeEvent<HTMLInputElement>) => {
        const ligado = e.target.checked;
        if (ligado && !confirm(
            'Digitar o lote a mao?\n\n' +
            'O sistema para de gerar e de conferir esse numero nesta etiqueta. ' +
            'O que voce digitar e o que sai impresso e fica no arquivo.\n\n' +
            'Use para OP antiga, numero vindo de fora ou acerto de erro.'
        )) {
            return;
        }
        setManual(ligado);
        setOpErro(null);
        if (!ligado) handleOPBlur();
    };

    const handlePrint = async () => {
        const saved = await handleSave();
        if (!saved) return;
        window.print();
    };

    const handleSave = async (): Promise<boolean> => {
        try {
            // O plano e da OP, nao desta etiqueta: guardar aqui faz o proximo
            // palete da mesma OP abrir com tudo preenchido. Se falhar, a
            // etiqueta ainda tem que salvar — o plano e conveniencia, nao o
            // registro que importa.
            if (labelData.op) {
                try {
                    await salvarPlano(labelData.op, plano);
                } catch (erro) {
                    console.error('Nao foi possivel guardar o plano da OP:', erro);
                }
            }

            const dataToSave = {
                tipo: 'pallet',
                op: labelData.op,
                cliente: labelData.cliente,
                produto: labelData.produto,
                sku: '',
                quantidade: totalQuantity,
                volume: `${palletInfo.current}/${palletInfo.total}`,
                data: labelData.data,
                info_extra: {
                    lote: labelData.lote,
                    operador: labelData.operadorMaquina,
                    turno: labelData.turno,
                    quantidadePorCaixa: labelData.quantidadePorCaixa,
                    caixasPorPallet: labelData.caixasPorPallet,
                    hora: labelData.hora,
                    // Retrato da conta na hora em que este palete saiu.
                    quantidadeOP: labelData.quantidadeOP,
                    folhasVinco: labelData.folhasVinco,
                    bocas: labelData.bocas
                }
            };

            if (savedId) {
                // Update
                const { error } = await supabase
                    .from('prod_etiquetas_historico')
                    .update({ info_extra: dataToSave.info_extra, quantidade: dataToSave.quantidade, volume: dataToSave.volume, data: dataToSave.data })
                    .eq('id', savedId);
                if (error) throw error;
                alert('Etiqueta atualizada com sucesso!');
                return true;
            } else {
                // Insert
                const { data, error } = await supabase
                    .from('prod_etiquetas_historico')
                    .insert([dataToSave])
                    .select('id');
                if (error) throw error;
                setSavedId(data[0].id);
                alert('Etiqueta salva com sucesso!');
                return true;
            }
        } catch (error) {
            console.error('Erro ao salvar:', error);
            alert('Erro ao salvar a etiqueta.');
            return false;
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
            alert('Etiqueta excluida com sucesso!');
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
                                <input name="op" value={labelData.op} onChange={handleChange} onBlur={handleOPBlur} placeholder="Nº OP" />
                            </div>
                            <div className="form-group">
                                <label>Lote {opBusy && <span className="spin-inline">…</span>}</label>
                                <input
                                    name="lote"
                                    value={labelData.lote}
                                    onChange={handleChange}
                                    readOnly={!manual}
                                    className={manual ? 'campo-manual' : 'campo-gerado'}
                                    placeholder={manual ? 'Digite o lote' : 'Gerado pela OP'}
                                    title={manual
                                        ? 'Modo manual: este numero e o que voce digitar'
                                        : 'O lote e gerado pelo sistema e fica preso a esta OP'}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="check-linha">
                                <input type="checkbox" checked={manual} onChange={handleTrocarManual} />
                                Digitar o lote à mão
                            </label>
                            <small className={manual ? 'campo-aviso' : 'campo-ajuda'}>
                                {manual
                                    ? 'Ligado: o sistema não gera nem confere o lote. O que você digitar é o que sai impresso.'
                                    : 'Para OP antiga, número vindo de fora ou acerto de erro.'}
                            </small>
                        </div>
                        {opErro && <p className="campo-erro">{opErro}</p>}
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
                        <h3 className="section-title">Conta da OP</h3>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Quantidade da OP</label>
                                <input name="quantidadeOP" value={labelData.quantidadeOP} onChange={handleChange} placeholder="Ex: 500000" inputMode="numeric" />
                            </div>
                            <div className="form-group">
                                <label>Bocas</label>
                                <input name="bocas" value={labelData.bocas} onChange={handleChange} placeholder="Peças por folha" inputMode="numeric" />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Folhas rodadas no corte e vinco</label>
                            <input name="folhasVinco" value={labelData.folhasVinco} onChange={handleChange} placeholder="Ex: 1750" inputMode="numeric" />
                            <small className="campo-ajuda">
                                Folhas × bocas = peças que existem de verdade no chão.
                            </small>
                        </div>

                        <div className="conta-tabela">
                            <div className="conta-col">
                                <div className="conta-cabeca">A OP PEDE</div>
                                <div className="conta-linha"><span>Peças</span><b>{inteiro(conta.op.pecas)}</b></div>
                                <div className="conta-linha"><span>Caixas</span><b>{quebrado(conta.op.caixas)}</b></div>
                                <div className="conta-linha destaque"><span>Paletes</span><b>{quebrado(conta.op.paletes)}</b></div>
                            </div>
                            <div className="conta-col">
                                <div className="conta-cabeca">O VINCO RODOU</div>
                                <div className="conta-linha"><span>Peças</span><b>{inteiro(conta.vinco.pecas)}</b></div>
                                <div className="conta-linha"><span>Caixas</span><b>{quebrado(conta.vinco.caixas)}</b></div>
                                <div className="conta-linha destaque"><span>Paletes</span><b>{quebrado(conta.vinco.paletes)}</b></div>
                            </div>
                        </div>

                        {conta.fecha === null ? (
                            <p className="conta-veredito neutro">
                                Preencha a quantidade da OP, as bocas e as folhas do vinco para a conta sair.
                            </p>
                        ) : conta.fecha ? (
                            <p className="conta-veredito ok">
                                Sobra de {inteiro(conta.diferenca)} peças — o vinco passou da OP.
                            </p>
                        ) : (
                            <p className="conta-veredito falta">
                                {conta.diferenca === 0
                                    ? 'O vinco empatou com a OP. Empatar não fecha: entre o vinco e a expedição sempre se perde peça.'
                                    : `Faltam ${inteiro(conta.diferenca === null ? null : -conta.diferenca)} peças.`}
                                {conta.folhasParaFechar !== null &&
                                    ` Só para empatar com a OP o vinco precisa de ${inteiro(conta.folhasParaFechar)} folhas — e tem que rodar mais que isso.`}
                            </p>
                        )}

                        {paletesDaOP !== null && (
                            <button type="button" className="btn-usar-total" onClick={usarTotalPrevisto}>
                                Usar {paletesDaOP} no total de paletes
                            </button>
                        )}
                        <small className="campo-ajuda">
                            Esta conta não sai impressa: serve para conferir e para preencher o total de paletes.
                            {conta.op.paletes !== null && paletesDaOP !== null &&
                                ` ${quebrado(conta.op.paletes)} significa ${paletesDaOP} paletes, com o último incompleto.`}
                        </small>
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
