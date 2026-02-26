import { useState, useCallback } from 'react';
import Modal from './Modal';
import type { ModalType } from './Modal';

interface UseModalReturn {
    isOpen: boolean;
    openModal: (message: string, type?: ModalType, title?: string) => void;
    closeModal: () => void;
    showSuccess: (message: string, title?: string) => void;
    showError: (message: string, title?: string) => void;
    showWarning: (message: string, title?: string) => void;
    showInfo: (message: string, title?: string) => void;
    showConfirm: (message: string, onConfirm: () => void, title?: string) => void;
    ModalComponent: React.FC<{ onConfirm?: () => void; confirmText?: string; cancelText?: string; showCancel?: boolean }>;
}

export const useModal = (): UseModalReturn => {
    const [isOpen, setIsOpen] = useState(false);
    const [modalProps, setModalProps] = useState<{
        message: string;
        type: ModalType;
        title?: string;
        onConfirm?: () => void;
        confirmText?: string;
        cancelText?: string;
        showCancel?: boolean;
    }>({
        message: '',
        type: 'info'
    });

    const openModal = useCallback((message: string, type: ModalType = 'info', title?: string) => {
        setModalProps({ message, type, title });
        setIsOpen(true);
    }, []);

    const closeModal = useCallback(() => {
        setIsOpen(false);
        // Limpar props após animação
        setTimeout(() => {
            setModalProps({ message: '', type: 'info' });
        }, 300);
    }, []);

    const showSuccess = useCallback((message: string, title?: string) => {
        openModal(message, 'success', title);
    }, [openModal]);

    const showError = useCallback((message: string, title?: string) => {
        openModal(message, 'error', title);
    }, [openModal]);

    const showWarning = useCallback((message: string, title?: string) => {
        openModal(message, 'warning', title);
    }, [openModal]);

    const showInfo = useCallback((message: string, title?: string) => {
        openModal(message, 'info', title);
    }, [openModal]);

    const showConfirm = useCallback((message: string, onConfirm: () => void, title?: string) => {
        setModalProps({
            message,
            type: 'confirm',
            title,
            onConfirm,
            showCancel: true,
            confirmText: 'Confirmar',
            cancelText: 'Cancelar'
        });
        setIsOpen(true);
    }, []);

    const ModalComponent: React.FC<{
        onConfirm?: () => void;
        confirmText?: string;
        cancelText?: string;
        showCancel?: boolean;
    }> = ({ onConfirm, confirmText, cancelText, showCancel }) => {
        return (
            <Modal
                isOpen={isOpen}
                onClose={closeModal}
                onConfirm={onConfirm || modalProps.onConfirm}
                message={modalProps.message}
                type={modalProps.type}
                title={modalProps.title}
                confirmText={confirmText || modalProps.confirmText}
                cancelText={cancelText || modalProps.cancelText}
                showCancel={showCancel !== undefined ? showCancel : modalProps.showCancel}
            />
        );
    };

    return {
        isOpen,
        openModal,
        closeModal,
        showSuccess,
        showError,
        showWarning,
        showInfo,
        showConfirm,
        ModalComponent
    };
};
