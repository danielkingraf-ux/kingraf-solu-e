import React, { useState, useEffect, useRef } from 'react';
import {
    Calculator,
    Save,
    RotateCcw,
    Camera,
    Info,
    Upload,
    X
} from 'lucide-react';
import './BoxRegistry.css';
import { supabase } from '../../supabaseClient';

const BoxRegistry: React.FC = () => {
    const [availableSizes, setAvailableSizes] = useState<{ id: string, numero_caixa: string }[]>([]);
    const [loadingSizes, setLoadingSizes] = useState(false);

    const [formData, setFormData] = useState({
        boxType: '',
        op: '',
        client: '',
        product: '',
        sku: '',
        units: '',
        rows: '',
        bundlesPerRow: '',
        qtyPerBundle: '',
        height: '',
        observacao: ''
    });

    const [totals, setTotals] = useState({
        totalBundles: 0,
        totalItems: 0
    });

    const [saving, setSaving] = useState(false);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const parseOptionalNumber = (value: number | string) => {
        if (value === '' || value === null || value === undefined) return null;
        const numberValue = Number(value);
        return Number.isFinite(numberValue) ? numberValue : null;
    };

    const parseDecimalInput = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const normalized = trimmed.replace(',', '.');
        const numberValue = Number(normalized);
        return Number.isFinite(numberValue) ? numberValue : null;
    };

    useEffect(() => {
        const rows = parseOptionalNumber(formData.rows) ?? 0;
        const bundlesPerRow = parseOptionalNumber(formData.bundlesPerRow) ?? 0;
        const qtyPerBundle = parseOptionalNumber(formData.qtyPerBundle) ?? 0;
        const height = parseOptionalNumber(formData.height) ?? 0;
        const totalBundles = rows * bundlesPerRow;
        const extraUnits = parseDecimalInput(formData.units) ?? 0;
        const totalItems = totalBundles * qtyPerBundle * height + extraUnits;
        setTotals({ totalBundles, totalItems });
    }, [formData]);

    useEffect(() => {
        fetchAvailableSizes();
    }, []);

    const fetchAvailableSizes = async () => {
        try {
            setLoadingSizes(true);
            const { data, error } = await supabase
                .from('prod_tamanhos')
                .select('id, numero_caixa')
                .eq('ativo', true)
                .order('numero_caixa', { ascending: true });

            if (error) throw error;
            if (data) setAvailableSizes(data);
        } catch (error) {
            console.error('Error fetching sizes:', error);
        } finally {
            setLoadingSizes(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPhotoFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setPhotoPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const removePhoto = () => {
        setPhotoFile(null);
        setPhotoPreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const uploadPhoto = async (): Promise<string | null> => {
        if (!photoFile) return null;

        try {
            setUploadingPhoto(true);
            const fileExt = photoFile.name.split('.').pop();
            const fileName = `${Date.now()}-${formData.op.replace(/[^a-zA-Z0-9]/g, '_')}.${fileExt}`;
            const filePath = `producao/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('fotos')
                .upload(filePath, photoFile);

            if (uploadError) throw uploadError;

            const { data } = supabase.storage
                .from('fotos')
                .getPublicUrl(filePath);

            return data.publicUrl;
        } catch (error) {
            console.error('Erro ao fazer upload da foto:', error);
            return null;
        } finally {
            setUploadingPhoto(false);
        }
    };

    const handleClear = () => {
        setFormData({
            boxType: '',
            op: '',
            client: '',
            product: '',
            sku: '',
            units: '',
            rows: '',
            bundlesPerRow: '',
            qtyPerBundle: '',
            height: '',
            observacao: ''
        });
        removePhoto();
    };

    const handleSave = async () => {
        if (!formData.op || !formData.client || !formData.product) {
            alert('Por favor, preencha os campos obrigatorios (OP, Cliente, Produto).');
            return;
        }

        setSaving(true);
        try {
            // Upload photo first if exists
            let fotoUrl = null;
            if (photoFile) {
                fotoUrl = await uploadPhoto();
            }

            const unidades = parseDecimalInput(formData.units);

            const payload = {
                op: formData.op,
                cliente: formData.client,
                produto: formData.product,
                sku: formData.sku,
                tipo_caixa: formData.boxType,
                unidades,
                qtd_fileiras: parseOptionalNumber(formData.rows),
                qtd_macos_fileira: parseOptionalNumber(formData.bundlesPerRow),
                qtd_por_maco: parseOptionalNumber(formData.qtyPerBundle),
                altura: parseOptionalNumber(formData.height),
                total_macos: totals.totalBundles,
                total_itens: totals.totalItems,
                foto_url: fotoUrl,
                observacao: formData.observacao
            };

            const { error } = await supabase
                .from('producao_caixas')
                .insert([payload]);

            if (error) throw error;

            alert('Registro de caixa salvo com sucesso!');
            handleClear();
        } catch (error: any) {
            console.error('Erro ao salvar:', error);
            alert('Erro ao salvar registro: ' + (error.message || 'Erro desconhecido'));
        } finally {
            setSaving(false);
        }
    };


    return (
        <div className="box-registry-container">
            <div className="registry-main">
                <section className="registry-section">
                    <div className="section-header">
                        <Info size={18} />
                        <h2>Informações da Caixa</h2>
                    </div>
                    <div className="form-grid">
                        <div className="form-group">
                            <label>Tipo de Caixa *</label>
                            <select
                                name="boxType"
                                value={formData.boxType}
                                onChange={handleChange}
                                required
                                className="registry-select"
                            >
                                <option value="">Selecione um tamanho...</option>
                                {availableSizes.map(size => (
                                    <option key={size.id} value={size.numero_caixa}>
                                        Caixa {size.numero_caixa}
                                    </option>
                                ))}
                            </select>
                            {availableSizes.length === 0 && !loadingSizes && (
                                <span className="input-hint error">Nenhum tamanho ativo cadastrado.</span>
                            )}
                        </div>
                        <div className="form-group">
                            <label>OP (Ordem de Produção) *</label>
                            <input
                                name="op"
                                placeholder="Ex: OP-001, 12345"
                                value={formData.op}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="form-group">
                            <label>Cliente *</label>
                            <input
                                name="client"
                                placeholder="Nome do cliente"
                                value={formData.client}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="form-group">
                            <label>Modelo / Produto *</label>
                            <input
                                name="product"
                                placeholder="Nome do produto"
                                value={formData.product}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="form-group span-2">
                            <label>Código Interno do Produto</label>
                            <input
                                name="sku"
                                placeholder="Ex: SKU-001, COD-12345"
                                value={formData.sku}
                                onChange={handleChange}
                            />
                        </div>
                    </div>
                </section>

                <section className="registry-section">
                    <div className="section-header">
                        <Calculator size={18} />
                        <h2>Quantidades</h2>
                    </div>
                    <div className="quantity-grid">
                        <div className="form-group">
                            <label>Fileiras</label>
                            <input
                                type="number"
                                name="rows"
                                value={formData.rows}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="form-group">
                            <label>Maços/Fileira</label>
                            <input
                                type="number"
                                name="bundlesPerRow"
                                value={formData.bundlesPerRow}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="form-group">
                            <label>Qtd/Maço</label>
                            <input
                                type="number"
                                name="qtyPerBundle"
                                value={formData.qtyPerBundle}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="form-group">
                            <label>Altura</label>
                            <input
                                type="number"
                                name="height"
                                value={formData.height}
                                onChange={handleChange}
                            />
                        </div>
                        <div className="form-group">
                            <label>Unidades extras</label>
                            <input
                                name="units"
                                placeholder="Ex: 25,5"
                                value={formData.units}
                                onChange={handleChange}
                                inputMode="decimal"
                            />
                        </div>
                    </div>
                </section>

                <section className="registry-section">
                    <div className="section-header">
                        <Camera size={18} />
                        <h2>Foto da Disposição</h2>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoSelect}
                        style={{ display: 'none' }}
                        id="photo-input"
                    />

                    {photoPreview ? (
                        <div className="photo-preview-container">
                            <img src={photoPreview} alt="Preview" className="photo-preview" />
                            <button className="remove-photo-btn" onClick={removePhoto}>
                                <X size={18} />
                                Remover
                            </button>
                        </div>
                    ) : (
                        <label htmlFor="photo-input" className="photo-placeholder">
                            <div className="photo-icon">
                                <Upload size={48} />
                            </div>
                            <span>Clique para fazer upload da foto</span>
                            <span className="photo-hint">JPG, PNG até 5MB</span>
                        </label>
                    )}

                    <div className="form-group">
                        <label>Observacao</label>
                        <textarea
                            name="observacao"
                            rows={3}
                            placeholder="Observacoes sobre a disposicao"
                            value={formData.observacao}
                            onChange={handleChange}
                        />
                    </div>
                </section>
            </div>

            <aside className="registry-sidebar">
                <div className="calculations-card">
                    <div className="card-header">
                        <Calculator size={18} />
                        <h3>Cálculos Automáticos</h3>
                    </div>
                    <div className="calc-result">
                        <span className="calc-label">Total de Maços</span>
                        <span className="calc-value">{totals.totalBundles}</span>
                        <span className="calc-formula">Fileiras × Maços/Fileira</span>
                    </div>
                    <div className="calc-result active">
                        <span className="calc-label">Total de Itens</span>
                        <span className="calc-value">{totals.totalItems}</span>
                        <span className="calc-formula">Maços × Qtd/Maço × Altura</span>
                    </div>
                </div>

                <div className="action-buttons">
                    <button className="btn-secondary" onClick={handleClear}>
                        <RotateCcw size={18} />
                        Limpar
                    </button>
                    <button className="btn-primary" onClick={handleSave} disabled={saving || uploadingPhoto}>
                        <Save size={18} />
                        {saving ? 'Salvando...' : uploadingPhoto ? 'Enviando foto...' : 'Salvar'}
                    </button>
                </div>
            </aside>
        </div>
    );
};

export default BoxRegistry;
