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
    const [photoStatusMessage, setPhotoStatusMessage] = useState('0/6 Aguardando seleção de foto');
    const [photoPreparing, setPhotoPreparing] = useState(false);
    const [photoProcessingError, setPhotoProcessingError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
    const MAX_PHOTO_DIMENSION = 1920;
    const PHOTO_QUALITY = 0.78;
    const productionPhotoBuckets = Array.from(
        new Set(
            [import.meta.env.VITE_PRODUCTION_PHOTO_BUCKET, 'fotos', 'quality-photos'].filter(
                (bucket): bucket is string => Boolean(bucket)
            )
        )
    );

    const updatePhotoStatus = (step: number, message: string) => {
        setPhotoStatusMessage(`${step}/6 ${message}`);
    };

    const handleOpenFileDialog = () => {
        setPhotoProcessingError(null);
        setPhotoStatusMessage('0/6 Selecionando arquivo...');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

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

    const isHeicFile = (file: File) => /heic|heif/i.test(file.type) || /\.heic$/i.test(file.name);

    const convertHeicToJpeg = async (file: File, updateStatus: (step: number, message: string) => void) => {
        updateStatus(3, 'Iniciando conversão HEIC...');
        const baseName = file.name ? file.name.replace(/\.[^/.]+$/, '') : 'foto';
        try {
            const heic2any = (await import('heic2any')).default;
            const blob = await heic2any({
                blob: file,
                toType: 'image/jpeg',
                quality: 0.85
            });
            updateStatus(3, 'Conversão HEIC concluída');
            return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
        } catch (error) {
            console.error('Erro ao converter HEIC:', error);
            throw new Error('Falha na conversão HEIC. Envie JPEG ou PNG.');
        }
    };

    const resizeLargeImage = async (file: File, updateStatus: (step: number, message: string) => void) => {
        updateStatus(4, 'Iniciando redimensionamento...');
        return new Promise<File>((resolve, reject) => {
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                const maxDimension = Math.max(img.width, img.height);
                const scale = maxDimension > MAX_PHOTO_DIMENSION ? MAX_PHOTO_DIMENSION / maxDimension : 1;
                const width = Math.round(img.width * scale);
                const height = Math.round(img.height * scale);
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    updateStatus(4, 'Não foi possível preparar a foto.');
                    reject(new Error('Canvas não disponível para redimensionar.'));
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            updateStatus(4, 'Redimensionamento falhou; mantendo original.');
                            reject(new Error('Redimensionamento retornou blob vazio.'));
                            return;
                        }
                        const baseName = file.name ? file.name.replace(/\.[^/.]+$/, '') : 'foto';
                        const resized = new File([blob], `${baseName}.jpg`, {
                            type: 'image/jpeg'
                        });
                        const sizeMb = (blob.size / 1024 / 1024).toFixed(2);
                        updateStatus(4, `Redimensionamento concluído (${width}x${height}, ~${sizeMb} MB)`);
                        resolve(resized);
                    },
                    'image/jpeg',
                    PHOTO_QUALITY
                );
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                updateStatus(4, 'Erro ao carregar a foto para redimensionamento.');
                reject(new Error('Falha ao carregar imagem para redimensionar.'));
            };
            img.src = objectUrl;
        });
    };

    const preparePhotoFile = async (file: File, updateStatus: (step: number, message: string) => void) => {
        let workingFile = file;

        try {
            if (isHeicFile(workingFile)) {
                workingFile = await convertHeicToJpeg(workingFile, updateStatus);
            } else {
                updateStatus(3, 'Conversão HEIC não necessária');
            }

            if (workingFile.size > MAX_PHOTO_SIZE_BYTES) {
                workingFile = await resizeLargeImage(workingFile, updateStatus);
            } else {
                const sizeMb = (workingFile.size / 1024 / 1024).toFixed(2);
                updateStatus(4, `Redimensionamento não necessário (${sizeMb} MB)`);
            }

            return workingFile;
        } catch (error) {
            const message = (error as Error).message || 'Erro ao preparar a foto.';
            updateStatus(0, message);
            throw error;
        }
    };

    const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        updatePhotoStatus(1, 'Arquivo selecionado');
        setPhotoProcessingError(null);
        setPhotoPreparing(true);
        const sizeMb = (file.size / 1024 / 1024).toFixed(2);
        updatePhotoStatus(2, `Tipo ${file.type || 'desconhecido'} - ${sizeMb} MB`);

        try {
            const preparedFile = await preparePhotoFile(file, updatePhotoStatus);
            setPhotoFile(preparedFile);
            const reader = new FileReader();
            reader.onload = () => {
                setPhotoPreview(reader.result as string);
                updatePhotoStatus(5, 'Preview gerado');
            };
            reader.onloadend = () => {
                updatePhotoStatus(6, 'Pronto para upload');
            };
            reader.readAsDataURL(preparedFile);
            setPhotoProcessingError(null);
        } catch (error) {
            const message = (error as Error).message || 'Erro ao processar a foto.';
            setPhotoProcessingError(message);
            setPhotoStatusMessage(`0/6 ${message}`);
            setPhotoFile(null);
            setPhotoPreview(null);
        } finally {
            setPhotoPreparing(false);
        }
    };

    const removePhoto = () => {
        setPhotoFile(null);
        setPhotoPreview(null);
        setPhotoStatusMessage('0/6 Aguardando seleção de foto');
        setPhotoProcessingError(null);
        setPhotoPreparing(false);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const uploadPhoto = async (): Promise<string> => {
        if (!photoFile) {
            throw new Error('Foto indisponível para upload.');
        }

        setUploadingPhoto(true);
        const uniqueId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const filePath = `producao/${uniqueId}.jpg`;

        try {
            for (const bucket of productionPhotoBuckets) {
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from(bucket)
                    .upload(filePath, photoFile, {
                        cacheControl: '3600',
                        upsert: true,
                        contentType: 'image/jpeg'
                    });

                if (uploadError || !uploadData) {
                    console.error(`Erro no upload para o bucket ${bucket}:`, uploadError);
                    continue;
                }

                const { data: publicData, error: publicError } = supabase.storage
                    .from(bucket)
                    .getPublicUrl(filePath);

                if (publicError || !publicData?.publicUrl) {
                    console.error(`Erro ao gerar URL publica no bucket ${bucket}:`, publicError);
                    continue;
                }

                updatePhotoStatus(6, 'Foto enviada com sucesso');
                return publicData.publicUrl;
            }

            throw new Error('Nenhum bucket aceitou o upload da foto.');
        } catch (error) {
            const message = (error as Error).message || 'Erro ao enviar a foto.';
            console.error('Erro ao fazer upload da foto:', error);
            setPhotoProcessingError(message);
            setPhotoStatusMessage(`0/6 ${message}`);
            throw error;
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

        if (photoProcessingError) {
            alert(photoProcessingError);
            return;
        }

        setSaving(true);
        try {
            // Upload photo first if exists
            let fotoUrl = null;
            if (photoFile) {
                fotoUrl = await uploadPhoto();
                if (!fotoUrl) {
                    setSaving(false);
                    return;
                }
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
                        capture="environment"
                        onChange={handlePhotoSelect}
                        style={{ display: 'none' }}
                    />

                    <div
                        className={`photo-status-message ${photoPreparing ? 'loading' : ''} ${photoProcessingError ? 'error' : ''}`}
                    >
                        {photoStatusMessage || '0/6 Aguardando seleção de foto'}
                    </div>

                    {photoPreview ? (
                        <div className="photo-preview-container">
                            <img src={photoPreview} alt="Preview" className="photo-preview" />
                            <button className="remove-photo-btn" onClick={removePhoto}>
                                <X size={18} />
                                Remover
                            </button>
                        </div>
                    ) : (
                        <button type="button" className="photo-placeholder" onClick={handleOpenFileDialog}>
                            <div className="photo-icon">
                                <Upload size={48} />
                            </div>
                            <span>Clique para fazer upload da foto</span>
                            <span className="photo-hint">JPG, PNG, HEIC compatível até 5MB</span>
                        </button>
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
