import React, { useEffect, useRef, useState } from 'react';
import { X, Camera } from 'lucide-react';
import { codigoDoTexto } from './api';
import './Rastreio.css';

interface LeitorCameraProps {
    onLer: (codigo: string) => void;
    onFechar: () => void;
}

/**
 * Transforma o celular em leitor: le o codigo de barras e o QR da ficha pela
 * camera. Serve enquanto nao ha leitor USB no setor, e como reserva quando um
 * leitor quebra.
 *
 * A biblioteca entra por import dinamico: quem nunca abre a camera nao baixa
 * esse peso todo, e o PC com leitor USB nem chega a pedir.
 */
const LeitorCamera: React.FC<LeitorCameraProps> = ({ onLer, onFechar }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [lendo, setLendo] = useState(false);

    useEffect(() => {
        let parar: (() => void) | null = null;
        let valendo = true;
        let ultimo = '';
        let ultimoEm = 0;

        (async () => {
            try {
                const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
                    import('@zxing/browser'),
                    import('@zxing/library'),
                ]);
                if (!valendo) return;

                // So os dois formatos da ficha: quanto menos a biblioteca tenta,
                // mais rapido ela acerta com a camera tremendo na mao.
                const dicas = new Map();
                dicas.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE]);

                const leitor = new BrowserMultiFormatReader(dicas, { delayBetweenScanAttempts: 120 });
                setLendo(true);

                const controle = await leitor.decodeFromVideoDevice(
                    undefined,           // camera padrao; no celular, a de tras
                    videoRef.current!,
                    (resultado) => {
                        if (!resultado || !valendo) return;
                        const codigo = codigoDoTexto(resultado.getText());
                        // A camera le o mesmo codigo varias vezes por segundo.
                        const agora = Date.now();
                        if (codigo === ultimo && agora - ultimoEm < 3000) return;
                        ultimo = codigo;
                        ultimoEm = agora;
                        if (navigator.vibrate) navigator.vibrate(60);
                        onLer(codigo);
                    },
                );
                parar = () => controle.stop();
            } catch (e) {
                if (!valendo) return;
                const msg = e instanceof Error ? e.message : String(e);
                setErro(/permission|denied|notallowed/i.test(msg)
                    ? 'O navegador não liberou a câmera. Abra as permissões do site e autorize a câmera.'
                    : `Não consegui abrir a câmera. ${msg}`);
            }
        })();

        return () => { valendo = false; parar?.(); };
    }, [onLer]);

    return (
        <div className="rast-camera" role="dialog" aria-label="Ler pela câmera">
            <div className="rast-camera-topo">
                <span><Camera size={18} /> Aponte para o código da ficha</span>
                <button className="rast-btn pequeno" onClick={onFechar}><X size={16} /> Fechar</button>
            </div>

            {erro
                ? <div className="rast-aviso erro" style={{ margin: 16 }}>{erro}</div>
                : <video ref={videoRef} className="rast-camera-video" muted playsInline />}

            <p className="rast-camera-ajuda">
                {lendo ? 'Lê o código de barras e o QR. Cada leitura registra uma bipagem.' : 'Abrindo a câmera...'}
            </p>
        </div>
    );
};

export default LeitorCamera;
