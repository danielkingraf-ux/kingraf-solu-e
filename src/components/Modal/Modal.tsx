import React from 'react';
import { X, CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';
import './Modal.css';

export type ModalType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm?: () => void;
    title?: string;
    message: string;
    type?: ModalType;
    confirmText?: string;
    cancelText?: string;
    showCancel?: boolean;
}

const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    type = 'info',
    confirmText = 'OK',
    cancelText = 'Cancelar',
    showCancel = false
}) => {
    if (!isOpen) return null;

    const icons = {
        success: <CheckCircle size={48} />,
        error: <XCircle size={48} />,
        warning: <AlertCircle size={48} />,
        info: <Info size={48} />,
        confirm: <AlertCircle size={48} />
    };

    const colors = {
        success: '#10B981',
        error: '#EF4444',
        warning: '#F59E0B',
        info: '#3B82F6',
        confirm: '#F59E0B'
    };

    const handleConfirm = () => {
        if (onConfirm) {
            onConfirm();
        }
        onClose();
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="modal-overlay" onClick={handleBackdropClick}>
            <div className="modal-content">
                <div className="modal-header">
                    <div className="modal-icon" style={{ color: colors[type] }}>
                        {icons[type]}
                    </div>
                    {title && (
                        <h3 className="modal-title">{title}</h3>
                    )}
                    <button className="modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body">
                    <p className="modal-message">{message}</p>
                </div>
                <div className="modal-footer">
                    {showCancel && (
                        <button className="modal-btn modal-btn-cancel" onClick={onClose}>
                            {cancelText}
                        </button>
                    )}
                    <button
                        className="modal-btn modal-btn-primary"
                        style={{ backgroundColor: colors[type] }}
                        onClick={handleConfirm}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Modal;
