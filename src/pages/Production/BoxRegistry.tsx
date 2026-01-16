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
import { useToast } from '../../components/Toast/ToastProvider';
import { useModal } from '../../components/Modal/useModal';

const BoxRegistry: React.FC = () => {
    const toast = useToast();
    const modal = useModal();
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
    const INITIAL_PHOTO_STATUS = '0/6 Aguardando seleção de foto';
    const [photoStatusMessage, setPhotoStatusMessage] = useState(INITIAL_PHOTO_STATUS);
    const [photoPreparing, setPhotoPreparing] = useState(false);
    const [photoProcessingError, setPhotoProcessingError] = useState<string | null>(null);
    const [photoAttempted, setPhotoAttempted] = useState(false);
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
        setPhotoAttempted(true);
        setPhotoStatusMessage('0/6 Selecionando arquivo...');
        if (fileInputRef.current) {
            // Limpar o valor anterior para garantir que o evento onChange seja disparado novamente no iOS
            fileInputRef.current.value = '';
            // Pequeno delay para garantir que o input esteja pronto no iOS
            setTimeout(() => {
                if (fileInputRef.current) {
                    fileInputRef.current.click();
                }
            }, 100);
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
            const output = await heic2any({
                blob: file,
                toType: 'image/jpeg',
                quality: 0.85
            });
            const blob = Array.isArray(output) ? output[0] : output;
            updateStatus(3, 'Conversão HEIC concluída');
            return new File([blob as BlobPart], `${baseName}.jpg`, { type: 'image/jpeg' });
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
        if (!file) {
            console.log('Nenhum arquivo selecionado');
            return;
        }
        
        console.log('Arquivo selecionado:', { name: file.name, type: file.type, size: file.size });
        setPhotoAttempted(true);

        updatePhotoStatus(1, 'Arquivo selecionado');
        setPhotoProcessingError(null);
        setPhotoPreparing(true);
        const sizeMb = (file.size / 1024 / 1024).toFixed(2);
        updatePhotoStatus(2, `Tipo ${file.type || 'desconhecido'} - ${sizeMb} MB`);

        try {
            const preparedFile = await preparePhotoFile(file, updatePhotoStatus);
            console.log('Arquivo preparado:', { name: preparedFile.name, type: preparedFile.type, size: preparedFile.size });
            
            // Garantir que o arquivo foi preparado corretamente
            if (!preparedFile || !(preparedFile instanceof File)) {
                throw new Error('Erro ao preparar o arquivo da foto');
            }
            
            setPhotoFile(preparedFile);
            
            // Usar Promise para garantir que o FileReader funcione corretamente no iOS
            const previewPromise = new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                
                reader.onload = (event) => {
                    const result = event.target?.result;
                    if (result && typeof result === 'string') {
                        console.log('Preview gerado com sucesso');
                        resolve(result);
                    } else {
                        reject(new Error('Erro ao gerar preview da foto'));
                    }
                };
                
                reader.onerror = () => {
                    console.error('Erro no FileReader');
                    reject(new Error('Erro ao ler o arquivo da foto'));
                };
                
                reader.onloadend = () => {
                    console.log('FileReader concluído');
                };
                
                try {
                    reader.readAsDataURL(preparedFile);
                } catch (readError) {
                    console.error('Erro ao iniciar leitura:', readError);
                    reject(new Error('Erro ao iniciar leitura do arquivo'));
                }
            });

            const previewUrl = await previewPromise;
            setPhotoPreview(previewUrl);
            updatePhotoStatus(5, 'Preview gerado');
            updatePhotoStatus(6, 'Pronto para upload');
            setPhotoProcessingError(null);
            
            console.log('Foto processada com sucesso, pronta para upload');
        } catch (error) {
            const message = (error as Error).message || 'Erro ao processar a foto.';
            console.error('Erro ao processar foto:', error);
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
        setPhotoStatusMessage(INITIAL_PHOTO_STATUS);
        setPhotoProcessingError(null);
        setPhotoPreparing(false);
        setPhotoAttempted(false);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const uploadPhoto = async (): Promise<string> => {
        if (!photoFile) {
            throw new Error('Foto indisponível para upload.');
        }

        // Validar que o arquivo ainda existe e é válido
        if (!(photoFile instanceof File)) {
            throw new Error('Arquivo de foto inválido.');
        }

        console.log('Iniciando upload da foto:', {
            name: photoFile.name,
            size: photoFile.size,
            type: photoFile.type
        });

        setUploadingPhoto(true);
        const uniqueId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const filePath = `producao/${uniqueId}.jpg`;

        let lastError: any = null;

        try {
            for (const bucket of productionPhotoBuckets) {
                console.log(`Tentando upload no bucket: ${bucket}`);
                
                try {
                    const { data: uploadData, error: uploadError } = await supabase.storage
                        .from(bucket)
                        .upload(filePath, photoFile, {
                            cacheControl: '3600',
                            upsert: true,
                            contentType: 'image/jpeg'
                        });

                    if (uploadError) {
                        console.error(`Erro no upload para o bucket ${bucket}:`, uploadError);
                        lastError = uploadError;
                        continue;
                    }

                    if (!uploadData) {
                        console.error(`Upload retornou sem dados para o bucket ${bucket}`);
                        lastError = new Error('Upload retornou sem dados');
                        continue;
                    }

                    console.log(`Upload bem-sucedido no bucket ${bucket}, path: ${uploadData.path}`);

                    // Usar uploadData.path para garantir que estamos usando o caminho correto retornado pelo upload
                    const actualPath = uploadData.path || filePath;
                    const { data: publicData } = supabase.storage
                        .from(bucket)
                        .getPublicUrl(actualPath);

                    if (!publicData?.publicUrl) {
                        console.error(`Erro ao gerar URL publica no bucket ${bucket}: URL não gerada`);
                        lastError = new Error('URL pública não gerada');
                        continue;
                    }

                    const photoUrl = publicData.publicUrl;
                    
                    // Validar que a URL foi gerada corretamente
                    if (!photoUrl || photoUrl.trim() === '') {
                        console.error(`URL vazia gerada para o bucket ${bucket}`);
                        lastError = new Error('URL vazia gerada');
                        continue;
                    }

                    // Validar formato da URL
                    try {
                        new URL(photoUrl);
                    } catch (urlError) {
                        console.error(`URL inválida gerada para o bucket ${bucket}:`, photoUrl);
                        lastError = new Error('URL inválida gerada');
                        continue;
                    }

                    console.log(`✓ Foto enviada com sucesso no bucket ${bucket}:`, photoUrl);
                    updatePhotoStatus(6, `Foto enviada com sucesso (${bucket}/${actualPath})`);
                    return photoUrl;
                } catch (bucketError: any) {
                    console.error(`Erro ao processar bucket ${bucket}:`, bucketError);
                    lastError = bucketError;
                    continue;
                }
            }

            // Se chegou aqui, todos os buckets falharam
            const errorMessage = lastError?.message || 'Nenhum bucket aceitou o upload da foto.';
            throw new Error(errorMessage);
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
            toast.showWarning('Por favor, preencha os campos obrigatórios (OP, Cliente, Produto).');
            return;
        }

        if (photoProcessingError) {
            toast.showError(photoProcessingError);
            return;
        }

        if (!photoFile) {
            const message = photoAttempted
                ? 'Você tentou anexar a foto, mas ela não carregou.'
                : 'Anexe uma foto antes de salvar.';
            toast.showWarning(message);
            return;
        }

        // Verificar se a foto está pronta - mais flexível para iOS
        const isPhotoReady = photoFile && 
                            (photoStatusMessage.startsWith('6/6') || 
                             photoStatusMessage.includes('Pronto para upload') ||
                             photoPreview !== null);
        
        if (!isPhotoReady && photoFile) {
            toast.showWarning('Aguarde a foto ficar pronta antes de salvar. Status: ' + photoStatusMessage);
            return;
        }

        setSaving(true);
        try {
            // Upload photo first if exists
            let fotoUrl: string | null = null;
            if (photoFile) {
                try {
                    console.log('Iniciando upload da foto...', { 
                        fileName: photoFile.name, 
                        fileSize: photoFile.size, 
                        fileType: photoFile.type 
                    });
                    
                    fotoUrl = await uploadPhoto();
                    
                    if (!fotoUrl || fotoUrl.trim() === '') {
                        console.error('URL vazia retornada do upload');
                        toast.showError('A foto foi enviada mas a URL não foi gerada corretamente. Tente novamente.');
                        setSaving(false);
                        return;
                    }
                    
                    console.log('Foto URL gerada com sucesso:', fotoUrl);
                    
                    // Validar que a URL é válida
                    try {
                        new URL(fotoUrl);
                    } catch (urlError) {
                        console.error('URL inválida gerada:', fotoUrl);
                        toast.showError('A URL da foto gerada é inválida. Tente novamente.');
                        setSaving(false);
                        return;
                    }
                } catch (uploadError: any) {
                    console.error('Erro no upload da foto:', uploadError);
                    const errorMessage = uploadError?.message || 'Erro desconhecido';
                    modal.showError('Erro ao fazer upload da foto: ' + errorMessage + '\n\nTente novamente ou verifique sua conexão.', 'Erro no Upload');
                    setSaving(false);
                    return;
                }
            } else {
                console.warn('Tentativa de salvar sem foto');
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

            console.log('Payload a ser salvo:', { 
                ...payload, 
                foto_url: fotoUrl ? `URL presente (${fotoUrl.substring(0, 50)}...)` : 'null' 
            });

            const { data, error } = await supabase
                .from('producao_caixas')
                .insert([payload])
                .select();

            if (error) {
                console.error('Erro ao inserir no banco:', error);
                throw error;
            }

            // Verificar se o registro foi salvo com a foto
            if (data && data.length > 0) {
                const savedRecord = data[0];
                console.log('Registro salvo:', { 
                    id: savedRecord.id, 
                    foto_url: savedRecord.foto_url ? 'URL presente' : 'null',
                    op: savedRecord.op
                });
                
                if (fotoUrl && !savedRecord.foto_url) {
                    console.error('ERRO CRÍTICO: Foto foi enviada mas não foi salva no registro!');
                    toast.showWarning('O registro foi salvo, mas a foto pode não ter sido associada corretamente. Verifique o registro.');
                } else if (fotoUrl && savedRecord.foto_url) {
                    console.log('✓ Foto salva com sucesso no registro');
                }
            } else {
                console.error('Nenhum registro retornado após inserção');
                throw new Error('Registro não foi criado corretamente');
            }

            toast.showSuccess('Registro de caixa salvo com sucesso!' + (fotoUrl ? ' ✓ Foto incluída' : ''));
            handleClear();
        } catch (error: any) {
            console.error('Erro ao salvar:', error);
            toast.showError('Erro ao salvar registro: ' + (error.message || 'Erro desconhecido'));
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
                        accept="image/*,image/heic,image/heif"
                        capture="environment"
                        onChange={handlePhotoSelect}
                        style={{ display: 'none' }}
                    />

                    <div
                        className={`photo-status-message ${photoPreparing ? 'loading' : ''} ${photoProcessingError ? 'error' : ''}`}
                    >
                        {photoStatusMessage || INITIAL_PHOTO_STATUS}
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
            <modal.ModalComponent />
        </div>
    );
};

export default BoxRegistry;
