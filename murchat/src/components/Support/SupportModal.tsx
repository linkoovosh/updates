import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { MailIcon } from '../UI/Icons'; // IMPORT ICONS
import './SupportModal.css';

interface SupportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
    const [problemText, setProblemText] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const username = useSelector((state: RootState) => state.ui.username);
    const userId = useSelector((state: RootState) => state.ui.userId);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleSubmit = async () => {
        if (!problemText.trim()) {
            alert('Пожалуйста, опишите проблему.');
            return;
        }

        setIsSubmitting(true);

        const formData = new FormData();
        formData.append('username', username || 'Unknown');
        formData.append('userId', userId || 'Unknown');
        formData.append('description', problemText);
        if (selectedFile) {
            formData.append('screenshot', selectedFile);
        }

        try {
            // Use the correct server URL (check your config or hardcode for now)
            const serverUrl = 'https://89.221.20.26:22822'; 
            const response = await fetch(`${serverUrl}/api/support`, {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                alert('Ваше сообщение отправлено в поддержку!');
                setProblemText('');
                setSelectedFile(null);
                onClose();
            } else {
                alert('Ошибка при отправке сообщения.');
            }
        } catch (error) {
            console.error('Support request failed:', error);
            alert('Не удалось связаться с сервером.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return createPortal(
        <div className="support-modal-overlay" onClick={onClose}>
            <div className="support-modal-content" onClick={e => e.stopPropagation()}>
                <div className="support-header">
                    <h2>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                        Сообщить о проблеме
                    </h2>
                </div>
                
                <p className="support-description">
                    Опишите, что пошло не так. Мы создадим тикет и разберемся.
                </p>

                <textarea
                    className="support-textarea"
                    placeholder="Опишите проблему подробно..."
                    value={problemText}
                    onChange={(e) => setProblemText(e.target.value)}
                />

                <div className="file-upload-area" onClick={() => fileInputRef.current?.click()}>
                    {selectedFile ? (
                        <div className="file-preview" onClick={e => e.stopPropagation()}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><MailIcon /> {selectedFile.name}</span>
                            <button className="remove-file-btn" onClick={() => setSelectedFile(null)}>Удалить</button>
                        </div>
                    ) : (
                        <span>Нажмите, чтобы прикрепить скриншот (необязательно)</span>
                    )}
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        style={{ display: 'none' }} 
                        accept="image/*"
                        onChange={handleFileChange}
                    />
                </div>

                <div className="support-actions">
                    <button className="btn-cancel" onClick={onClose} disabled={isSubmitting}>Отмена</button>
                    <button className="btn-submit" onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? 'Отправка...' : 'Отправить'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default SupportModal;
