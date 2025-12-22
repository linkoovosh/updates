import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { createPortal } from 'react-dom';
import type { RootState } from '../../store';
import { C2S_MSG_TYPE, type ThemeConfig, type CustomTheme } from '@common/types';
import webSocketService from '../../services/websocket';
import { getInitials } from '../../utils/avatarUtils';
import './CustomThemeEditor.css';

interface CustomThemeEditorProps {
    isOpen: boolean;
    onClose: () => void;
    initialTheme?: CustomTheme | null; // Pass existing theme to edit
}

const DEFAULT_CONFIG: ThemeConfig = {
    cardBg: 'rgba(25, 25, 30, 0.7)',
    cardBorder: 'rgba(255, 255, 255, 0.15)',
    cardShadow: '0 30px 60px rgba(0, 0, 0, 0.6)',
    cardBlur: 20,
    textColor: '#ffffff',
    accentColor: '#5865F2',
    avatarBorder: 'none',
    avatarGlow: 'none',
    animations: true,
    borderRadius: '24px',
    backdropSaturate: 100,
    shineOpacity: 0.3,
    bgImage: ''
};

const CustomThemeEditor: React.FC<CustomThemeEditorProps> = ({ isOpen, onClose, initialTheme }) => {
    const { username, discriminator, avatar, profile_banner, bio, userId } = useSelector((state: RootState) => state.auth);
    
    // State initialization from prop or default
    const [config, setConfig] = useState<ThemeConfig>(DEFAULT_CONFIG);
    const [themeName, setThemeName] = useState('');
    const [activeTab, setActiveTab] = useState<'base' | 'borders' | 'effects'>('base');

    // Load initial theme data when opened/changed
    useEffect(() => {
        if (initialTheme) {
            setConfig({
                ...DEFAULT_CONFIG, // Ensure new fields have defaults if missing in old themes
                ...initialTheme.config
            });
            setThemeName(initialTheme.name);
        } else {
            setConfig(DEFAULT_CONFIG);
            setThemeName('');
        }
    }, [initialTheme, isOpen]);

    if (!isOpen) return null;

    const isOwner = initialTheme && initialTheme.authorId === userId;

    const handleSave = (asNew: boolean = false) => {
        if (!themeName.trim()) {
            alert('Введите название темы!');
            return;
        }

        if (isOwner && !asNew && initialTheme) {
            // Update existing
            webSocketService.sendMessage(C2S_MSG_TYPE.UPDATE_THEME, {
                themeId: initialTheme.id,
                name: themeName,
                config: config
            });
        } else {
            // Create new (Fork or Scratch)
            webSocketService.sendMessage(C2S_MSG_TYPE.CREATE_THEME, {
                name: themeName,
                config: config
            });
        }
        onClose();
    };

    const updateConfig = (key: keyof ThemeConfig, value: any) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    // Helper
    const getBorder = (val: string) => val.includes('solid') || val.includes('dashed') || val.includes('dotted') ? val : `1px solid ${val}`;

    // Construct the live preview styles
    const previewStyle: React.CSSProperties = {
        background: config.bgImage ? `url(${config.bgImage}) center/cover no-repeat` : config.cardBg,
        border: getBorder(config.cardBorder),
        boxShadow: config.cardShadow,
        backdropFilter: `blur(${config.cardBlur}px) saturate(${config.backdropSaturate || 100}%)`,
        color: config.textColor,
        borderRadius: config.borderRadius || '24px'
    };

    const avatarStyle: React.CSSProperties = {
        border: config.avatarBorder,
        boxShadow: config.avatarGlow
    };

    return createPortal(
        <div className="theme-editor-overlay" onClick={onClose}>
            <div className="theme-editor-window glass-panel" onClick={e => e.stopPropagation()}>
                <div className="editor-header">
                    <h2>{initialTheme ? (isOwner ? '✏️ Редактирование темы' : '🍴 Копирование темы') : '🎨 Конструктор стиля'}</h2>
                    <button onClick={onClose} className="close-btn">&times;</button>
                </div>

                <div className="editor-content">
                    {/* LEFT COLUMN: CONTROLS */}
                    <div className="editor-controls">
                        <div className="control-tabs">
                            <button className={activeTab === 'base' ? 'active' : ''} onClick={() => setActiveTab('base')}>Основа</button>
                            <button className={activeTab === 'borders' ? 'active' : ''} onClick={() => setActiveTab('borders')}>Форма</button>
                            <button className={activeTab === 'effects' ? 'active' : ''} onClick={() => setActiveTab('effects')}>Эффекты</button>
                        </div>

                        <div className="control-panel scrollable">
                            {activeTab === 'base' && (
                                <>
                                    <div className="control-group">
                                        <label>Фон карточки (Цвет/Градиент)</label>
                                        <input type="text" value={config.cardBg} onChange={e => updateConfig('cardBg', e.target.value)} placeholder="rgba(0,0,0,0.5) or linear-gradient(...)" />
                                    </div>
                                    <div className="control-group">
                                        <label>Фон-картинка (URL) [Опционально]</label>
                                        <input type="text" value={config.bgImage || ''} onChange={e => updateConfig('bgImage', e.target.value)} placeholder="https://..." />
                                    </div>
                                    <div className="control-group">
                                        <label>Размытие фона (Blur): {config.cardBlur}px</label>
                                        <input type="range" min="0" max="60" value={config.cardBlur} onChange={e => updateConfig('cardBlur', parseInt(e.target.value))} />
                                    </div>
                                    <div className="control-group">
                                        <label>Насыщенность (Saturate): {config.backdropSaturate || 100}%</label>
                                        <input type="range" min="0" max="200" step="10" value={config.backdropSaturate || 100} onChange={e => updateConfig('backdropSaturate', parseInt(e.target.value))} />
                                    </div>
                                    <div className="control-group">
                                        <label>Цвет текста</label>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <input type="color" value={config.textColor} onChange={e => updateConfig('textColor', e.target.value)} />
                                            <input type="text" value={config.textColor} onChange={e => updateConfig('textColor', e.target.value)} style={{ flex: 1 }} />
                                        </div>
                                    </div>
                                    <div className="control-group">
                                        <label>Акцентный цвет (Свечение)</label>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <input type="color" value={config.accentColor} onChange={e => updateConfig('accentColor', e.target.value)} />
                                            <input type="text" value={config.accentColor} onChange={e => updateConfig('accentColor', e.target.value)} style={{ flex: 1 }} />
                                        </div>
                                    </div>
                                </>
                            )}

                            {activeTab === 'borders' && (
                                <>
                                    <div className="control-group">
                                        <label>Скругление углов: {config.borderRadius || '24px'}</label>
                                        <input type="text" value={config.borderRadius || '24px'} onChange={e => updateConfig('borderRadius', e.target.value)} placeholder="24px, 10px, 50%..." />
                                    </div>
                                    <div className="control-group">
                                        <label>Граница карточки (Color/CSS)</label>
                                        <input type="text" value={config.cardBorder} onChange={e => updateConfig('cardBorder', e.target.value)} placeholder="rgba(255,255,255,0.1) OR 2px solid red" />
                                    </div>
                                    <div className="control-group">
                                        <label>Граница аватара (CSS)</label>
                                        <input type="text" value={config.avatarBorder} onChange={e => updateConfig('avatarBorder', e.target.value)} placeholder="2px solid #fff" />
                                    </div>
                                    <div className="control-group">
                                        <label>Свечение аватара (Box-Shadow)</label>
                                        <input type="text" value={config.avatarGlow} onChange={e => updateConfig('avatarGlow', e.target.value)} placeholder="0 0 15px rgba(0,243,255,0.5)" />
                                    </div>
                                </>
                            )}

                            {activeTab === 'effects' && (
                                <>
                                    <div className="control-group">
                                        <label>Тень всей карточки (CSS)</label>
                                        <textarea 
                                            value={config.cardShadow} 
                                            onChange={e => updateConfig('cardShadow', e.target.value)} 
                                            rows={3} 
                                            className="editor-textarea"
                                            placeholder="0 20px 50px rgba(0,0,0,0.5)"
                                        />
                                    </div>
                                    <div className="control-group">
                                        <label>Прозрачность блика (Shine): {config.shineOpacity ?? 0.3}</label>
                                        <input type="range" min="0" max="1" step="0.05" value={config.shineOpacity ?? 0.3} onChange={e => updateConfig('shineOpacity', parseFloat(e.target.value))} />
                                    </div>
                                    <div className="control-group">
                                        <label>Анимации</label>
                                        <div className="checkbox-item">
                                            <input type="checkbox" checked={config.animations} onChange={e => updateConfig('animations', e.target.checked)} />
                                            <span>Включить переливы (Holo Shine)</span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="save-section">
                            <input 
                                type="text" 
                                className="theme-name-input" 
                                placeholder="Название стиля..." 
                                value={themeName} 
                                onChange={e => setThemeName(e.target.value)} 
                            />
                            
                            <div className="save-actions">
                                {isOwner && (
                                    <button className="holo-btn primary full-width" onClick={() => handleSave(false)}>
                                        💾 Сохранить изменения
                                    </button>
                                )}
                                <button className={`holo-btn ${isOwner ? 'secondary' : 'primary'} full-width`} onClick={() => handleSave(true)}>
                                    {isOwner ? '📄 Сохранить как новую' : '💾 Сохранить себе'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: PREVIEW */}
                    <div className="editor-preview">
                        <h3>Предпросмотр</h3>
                        <div className="preview-container">
                             <div className="holo-card custom-theme-override" style={previewStyle}>
                                <div className="holo-shine" style={{ opacity: config.shineOpacity ?? 0.3 }} />
                                <div className="profile-banner" style={{ backgroundImage: profile_banner ? `url(${profile_banner})` : `linear-gradient(135deg, ${config.accentColor}, #000)` }} />
                                
                                <div className="profile-content">
                                    <div className="profile-avatar-wrapper" style={avatarStyle}>
                                        <div className="profile-avatar" style={{ backgroundImage: avatar ? `url(${avatar})` : 'none', backgroundColor: config.accentColor }}>
                                            {!avatar && getInitials(username || '')}
                                        </div>
                                        <div className="status-ring online" />
                                    </div>

                                    <div className="user-identity">
                                        <div className="user-name" style={{ color: config.textColor }}>{username}</div>
                                        <div className="user-discriminator">#{discriminator}</div>
                                    </div>

                                    <div className="bio-box">
                                        <div className="bio-label">BIO.LOG</div>
                                        {bio || 'Ваше описание здесь...'}
                                    </div>

                                    <div className="actions-grid">
                                        <button className="holo-btn primary">Message</button>
                                        <button className="holo-btn secondary">Add Friend</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default CustomThemeEditor;
