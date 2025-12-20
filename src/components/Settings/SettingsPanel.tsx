// src/components/Settings/SettingsPanel.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSelector, useDispatch } from 'react-redux';
import type { RootState, AppDispatch } from '../../store';
import { 
    setTheme, setUiScale, setFont, setFontSize, setUiRoundness,
    setAnimationsEnabled, setBlurIntensity, setIsTerminalVisible,
    setAppOpacity, setAccentColor, setEnableTransparency, setGlassMaterial, setCatModeEnabled,
    setInputDeviceId, setOutputDeviceId, setVideoDeviceId,
    setNoiseSuppression, setEchoCancellation, setPushToTalk,
    setInputVolume, setVadThreshold,
    setScreenShareResolution, setScreenShareFps,
    setPmPrivacy, setFriendRequestPrivacy,
    setEnableDesktopNotifications, setEnableSoundNotifications,
    setNotifyOnMention, setNotifyOnDm, setPlayUserJoinLeaveSounds
} from '../../store/slices/settingsSlice';
import { logout, updateUserProfile } from "../../store/slices/authSlice";
import { C2S_MSG_TYPE } from "@common/types";
import type { UpdateProfilePayload } from "@common/types";
import webSocketService from "../../services/websocket";
import { webRTCService } from '../../services/webrtc';
import { generateAvatarColor, getInitials } from '../../utils/avatarUtils';
import ImageCropperModal from '../ImageCropper/ImageCropperModal';
import ChangePasswordModal from './ChangePasswordModal'; 
import CustomThemeEditor from './CustomThemeEditor';
import CustomSelect from '../UI/CustomSelect';
import { 
    UserIcon, PaletteIcon, MicIcon, LockIcon, BellIcon, 
    CatIcon, GlobeIcon, SettingsIcon, ExitIcon, TrashIcon, CheckIcon,
    ShieldIcon, MonitorIcon, CrownIcon, InfoIcon, CameraIcon, ImageIcon
} from '../UI/Icons'; 
import './SettingsPanel.css';
import '../UserProfilePopup/UserProfilePopup.css'; 
import type { CustomTheme } from '@common/types'; 

const AppearanceSettings: React.FC = () => {
    const dispatch = useDispatch();
    const settings = useSelector((state: RootState) => state.settings);
    
    return (
        <div className="settings-section">
            <h3 className="section-title">Тема и Шрифты</h3>
            <div className="settings-grid">
                <div className="setting-item">
                    <label>Тема приложения</label>
                    <CustomSelect 
                        value={settings.theme} 
                        onChange={(val) => dispatch(setTheme(val as any))}
                        options={[
                            { value: 'light', label: 'Светлая' },
                            { value: 'dark', label: 'Тёмная' },
                            { value: 'system', label: 'Системная' }
                        ]}
                    />
                </div>
                <div className="setting-item">
                    <label>Шрифт</label>
                    <CustomSelect 
                        value={settings.font} 
                        onChange={(val) => dispatch(setFont(val as any))}
                        options={[
                            { value: 'Inter', label: 'Inter' },
                            { value: 'Roboto', label: 'Roboto' },
                            { value: 'System', label: 'System Default' }
                        ]}
                    />
                </div>
                <div className="setting-item">
                    <label>Размер текста ({settings.fontSize}px)</label>
                    <input type="range" min="12" max="20" step="1" value={settings.fontSize} onChange={(e) => dispatch(setFontSize(parseInt(e.target.value)))} />
                </div>
                <div className="setting-item">
                    <label>Масштаб интерфейса ({Math.round(settings.uiScale * 100)}%)</label>
                    <input type="range" min="0.8" max="1.5" step="0.05" value={settings.uiScale} onChange={(e) => dispatch(setUiScale(parseFloat(e.target.value)))} />
                </div>
            </div>

            <h3 className="section-title">Эффекты и Стекло</h3>
            <div className="settings-grid">
                <div className="setting-item">
                    <label>Материал интерфейса</label>
                    <CustomSelect 
                        value={settings.glassMaterial} 
                        onChange={(val) => dispatch(setGlassMaterial(val as any))}
                        options={[
                            { value: 'solid', label: 'Solid (Классика)' },
                            { value: 'soft', label: 'Soft Glass (Мягкий блюр)' },
                            { value: 'liquid-ios', label: 'Liquid iOS (VisionOS)' }
                        ]}
                    />
                </div>
                <div className="setting-item">
                    <label>Интенсивность блюра ({Math.round(settings.blurIntensity * 100)}%)</label>
                    <input type="range" min="0" max="1" step="0.1" value={settings.blurIntensity} onChange={(e) => dispatch(setBlurIntensity(parseFloat(e.target.value)))} />
                </div>
                <div className="setting-item">
                    <label>Прозрачность окон ({Math.round(settings.appOpacity * 100)}%)</label>
                    <input type="range" min="0.3" max="1" step="0.05" value={settings.appOpacity} onChange={(e) => dispatch(setAppOpacity(parseFloat(e.target.value)))} />
                </div>
                <div className="setting-item">
                    <label>Закругления</label>
                    <CustomSelect 
                        value={settings.uiRoundness} 
                        onChange={(val) => dispatch(setUiRoundness(val as any))}
                        options={[
                            { value: 'small', label: 'Минимальные' },
                            { value: 'medium', label: 'Средние' },
                            { value: 'large', label: 'Максимальные' }
                        ]}
                    />
                </div>
            </div>

            <h3 className="section-title">Акцент и Анимации</h3>
            <div className="setting-item full-width">
                <label>Акцентный цвет</label>
                <div className="accent-color-picker">
                    <div 
                        onClick={() => dispatch(setAccentColor('transparent'))} 
                        className={`color-swatch transparent-swatch ${settings.accentColor === 'transparent' ? 'active' : ''}`} 
                        title="Прозрачный"
                    />
                    {['#4D7CFF', '#A56BFF', '#3BA55D', '#FF9F43', '#FF6B6B', '#00F3FF'].map(color => (
                        <div key={color} onClick={() => dispatch(setAccentColor(color))} style={{ backgroundColor: color }} className={`color-swatch ${settings.accentColor === color ? 'active' : ''}`} />
                    ))}
                    <input type="color" value={settings.accentColor === 'transparent' ? '#000000' : settings.accentColor} onChange={(e) => dispatch(setAccentColor(e.target.value))} />
                </div>
            </div>
            <div className="setting-item">
                <label>Включить анимации интерфейса</label>
                <input type="checkbox" checked={settings.animationsEnabled} onChange={(e) => dispatch(setAnimationsEnabled(e.target.checked))} />
            </div>
            <div className="setting-item">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CatIcon /> Режим котика (Neko Mode)
                </label>
                <input type="checkbox" checked={settings.catModeEnabled} onChange={(e) => dispatch(setCatModeEnabled(e.target.checked))} />
            </div>
        </div>
    );
};

const AccountSettings: React.FC = () => {
    const dispatch: AppDispatch = useDispatch();
    const { username, discriminator, avatar, bio, profile_banner, profile_theme, email } = useSelector((state: RootState) => state.auth);
    const customThemes = useSelector((state: RootState) => state.customThemes.themes);
    
    const bannerInputRef = useRef<HTMLInputElement>(null);
    const avatarInputRef = useRef<HTMLInputElement>(null);

    const [avatarToCrop, setAvatarToCrop] = useState<string | null>(null);
    const [bannerToCrop, setBannerToCrop] = useState<string | null>(null);
    const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
    const [selectedBanner, setSelectedBanner] = useState<string | null>(null);
    
    const [newUsername, setNewUsername] = useState(username || '');
    const [newBio, setNewBio] = useState(bio || '');
    const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false); 

    const [isAvatarAnimating, setIsAvatarAnimating] = useState(false);
    const [isBannerAnimating, setIsBannerAnimating] = useState(false);

    const isPristine = useMemo(() => {
        return newUsername === username && newBio === bio && !selectedAvatar && !selectedBanner;
    }, [newUsername, username, newBio, bio, selectedAvatar, selectedBanner]);

    const previewAvatar = selectedAvatar || avatar;
    const previewBanner = selectedBanner || profile_banner;
    const previewColor = previewAvatar ? 'var(--accent-primary)' : generateAvatarColor(newUsername || '');
    const activeTheme = profile_theme || 'holographic';
    
    // Resolve Custom Theme
    const customTheme = customThemes.find(t => t.id === activeTheme);
    
    // Helper
    const getBorder = (val: string) => val.includes('solid') || val.includes('dashed') || val.includes('dotted') ? val : `1px solid ${val}`;

    const previewStyle: React.CSSProperties = customTheme ? {
        background: customTheme.config.bgImage ? `url(${customTheme.config.bgImage}) center/cover no-repeat` : customTheme.config.cardBg,
        border: getBorder(customTheme.config.cardBorder),
        boxShadow: customTheme.config.cardShadow,
        backdropFilter: `blur(${customTheme.config.cardBlur}px) saturate(${customTheme.config.backdropSaturate || 100}%)`,
        color: customTheme.config.textColor,
        borderRadius: customTheme.config.borderRadius || '24px'
    } : {};

    const avatarStyle: React.CSSProperties = customTheme ? {
        border: customTheme.config.avatarBorder,
        boxShadow: customTheme.config.avatarGlow,
        cursor: 'pointer'
    } : { cursor: 'pointer' };

    useEffect(() => {
        setIsAvatarAnimating(true);
        const timer = setTimeout(() => setIsAvatarAnimating(false), 600);
        return () => clearTimeout(timer);
    }, [previewAvatar]);

    useEffect(() => {
        setIsBannerAnimating(true);
        const timer = setTimeout(() => setIsBannerAnimating(false), 600);
        return () => clearTimeout(timer);
    }, [previewBanner]);

    const handleAvatarFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (file.type === 'image/gif') {
                    // Skip cropper for GIFs to preserve animation
                    setSelectedAvatar(reader.result as string);
                } else {
                    setAvatarToCrop(reader.result as string);
                }
            };
            reader.readAsDataURL(file);
        }
        if (avatarInputRef.current) avatarInputRef.current.value = '';
    };

    const handleBannerFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (file.type === 'image/gif') {
                     // Skip cropper for GIFs to preserve animation
                     setSelectedBanner(reader.result as string);
                } else {
                    setBannerToCrop(reader.result as string);
                }
            };
            reader.readAsDataURL(file);
        }
        if (bannerInputRef.current) bannerInputRef.current.value = '';
    };

    const handleSave = () => {
        const payload: UpdateProfilePayload = {};
        if (newUsername !== username) payload.username = newUsername;
        if (newBio !== bio) payload.bio = newBio;
        if (selectedAvatar) payload.avatar = selectedAvatar;
        if (selectedBanner) payload.profile_banner = selectedBanner;

        if (Object.keys(payload).length > 0) {
            webSocketService.sendMessage(C2S_MSG_TYPE.UPDATE_PROFILE, payload);
        }
        
        setSelectedAvatar(null);
        setSelectedBanner(null);
    };

    return (
        <div className="account-settings-container">
            <div className="profile-preview-column">
                <h3 className="preview-header">Предпросмотр карточки</h3>
                <div className={`preview-card-outer theme-${activeTheme}`}>
                    <div className={`holo-card theme-${activeTheme} ${customTheme ? 'custom-theme-override' : ''} ${isAvatarAnimating || isBannerAnimating ? 'image-changing' : ''}`} style={previewStyle}>
                        <div className="holo-shine" style={{ opacity: customTheme?.config.shineOpacity ?? 0.3 }} />
                        
                        {!customTheme && (
                            <div className="adaptive-glow" style={{ backgroundColor: previewColor, opacity: 0.15 }} />
                        )}
                        
                        <div 
                            className={`profile-banner ${isBannerAnimating ? 'image-changing' : ''}`} 
                            style={{ backgroundImage: previewBanner ? `url(${previewBanner})` : `linear-gradient(135deg, ${customTheme?.config.accentColor || previewColor}, #000)`, cursor: 'pointer' }}
                            onClick={() => bannerInputRef.current?.click()}
                        >
                            <div className="edit-overlay-icon"><ImageIcon /></div>
                        </div>

                        <div className="profile-content">
                            <div className="profile-avatar-wrapper" style={avatarStyle} onClick={() => avatarInputRef.current?.click()}>
                                <div 
                                    className={`profile-avatar ${isAvatarAnimating ? 'image-changing' : ''}`}
                                    style={{ 
                                        backgroundColor: previewAvatar ? 'transparent' : (customTheme?.config.accentColor || previewColor),
                                        backgroundImage: previewAvatar ? `url(${previewAvatar})` : 'none',
                                        position: 'relative'
                                    }}
                                >
                                    {!previewAvatar && getInitials(newUsername || '')}
                                    <div className="edit-overlay-icon" style={{ fontSize: '1rem' }}><CameraIcon /></div>
                                </div>
                                <div className="status-ring online" />
                            </div>

                            <div className="user-identity">
                                <div className="user-name" style={customTheme ? { color: customTheme.config.textColor } : {}}>{newUsername || 'Username'}</div>
                                <div className="user-discriminator">#{discriminator}</div>
                            </div>

                            {newBio && (
                                <div className="bio-box">
                                    <div className="bio-label">BIO.LOG</div>
                                    {newBio}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <input type="file" ref={avatarInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleAvatarFileChange} />
                <input type="file" ref={bannerInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleBannerFileChange} />
            </div>

            <div className="profile-edit-column">
                <div className="info-field">
                    <label>Никнейм</label>
                    <div className="input-with-tag">
                        <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} className="settings-input" maxLength={32} />
                        <span className="discriminator-tag">#{discriminator}</span>
                    </div>
                </div>

                <div className="info-field">
                    <label>О себе</label>
                    <textarea value={newBio} onChange={(e) => setNewBio(e.target.value)} className="settings-textarea" rows={4} maxLength={190} placeholder="Расскажите о себе..." />
                </div>

                <div className="info-grid-row">
                    <div className="info-field">
                        <label>Почта</label>
                        <div className="info-value">{email}</div>
                    </div>
                    <div className="info-field">
                        <label>Безопасность</label>
                        <button className="change-password-button" onClick={() => setIsChangePasswordModalOpen(true)}>
                            <LockIcon /> Сменить пароль
                        </button>
                    </div>
                </div>

                 {!isPristine && (
                    <div className="save-changes-bar">
                        <span><InfoIcon /> Не забудьте сохранить изменения!</span>
                        <div style={{ display: 'flex', gap: '12px' }}>
                             <button className="holo-btn reset-btn" onClick={() => {
                                 setNewUsername(username || '');
                                 setNewBio(bio || '');
                                 setSelectedAvatar(null);
                                 setSelectedBanner(null);
                             }}>Сброс</button>
                             <button className="holo-btn primary" onClick={handleSave}><CheckIcon /> Сохранить</button>
                        </div>
                    </div>
                )}
                
                <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
                    <button onClick={() => { if(confirm("Выйти?")) { localStorage.removeItem('authToken'); dispatch(logout()); }}} className="holo-btn danger-text">
                        <ExitIcon /> Выйти из системы
                    </button>
                </div>
            </div>

            {avatarToCrop && (
                <ImageCropperModal isOpen={true} imageSrc={avatarToCrop} onClose={() => setAvatarToCrop(null)} onSave={(img) => { setSelectedAvatar(img); setAvatarToCrop(null); }} aspectRatio={1} />
            )}
            {bannerToCrop && (
                <ImageCropperModal isOpen={true} imageSrc={bannerToCrop} onClose={() => setBannerToCrop(null)} onSave={(img) => { setSelectedBanner(img); setBannerToCrop(null); }} aspectRatio={16/9} />
            )}
            {isChangePasswordModalOpen && <ChangePasswordModal isOpen={true} onClose={() => setIsChangePasswordModalOpen(false)} />}
        </div>
    );
};

const ProfileCustomization: React.FC = () => {
    const dispatch: AppDispatch = useDispatch();
    const { username, discriminator, avatar, bio, profile_banner, profile_theme, userId } = useSelector((state: RootState) => state.auth);
    const customThemes = useSelector((state: RootState) => state.customThemes.themes);
    const [localTheme, setLocalTheme] = useState(profile_theme || 'holographic');
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    
    // Combined list: default themes + custom themes
    const defaultThemes = [
        { id: 'holographic', label: 'Holographic', desc: 'Классика MurChat.', icon: '💿' },
        { id: 'glass', label: 'Glass', desc: 'Чистое стекло.', icon: '💎' },
        { id: 'cyberpunk', label: 'Cyberpunk', desc: 'Неон и ночь.', icon: '🌃' },
        { id: 'luxury', label: 'Luxury', desc: 'Золото.', icon: '👑' },
        { id: 'minimalist', label: 'Minimal', desc: 'Чистота.', icon: '⚪' },
        { id: 'aero', label: 'Aero', desc: 'Windows 7.', icon: '☁️' },
        { id: 'vaporwave', label: 'Vaporwave', desc: 'Ретро.', icon: '🌴' },
        { id: 'ocean', label: 'Ocean', desc: 'Глубина.', icon: '🌊' },
        { id: 'forest', label: 'Forest', desc: 'Природа.', icon: '🌲' },
        { id: 'bloodmoon', label: 'Blood', desc: 'Мистика.', icon: '🌙' },
        { id: 'sakura', label: 'Sakura', desc: 'Цветы.', icon: '🌸' },
        { id: 'matrix', label: 'Matrix', desc: 'Цифры.', icon: '📟' }
    ];

    const isChanged = localTheme !== profile_theme;
    
    // Find active custom theme config if selected
    const activeCustomTheme = customThemes.find(t => t.id === localTheme);
    
    // Helper
    const getBorder = (val: string) => val.includes('solid') || val.includes('dashed') || val.includes('dotted') ? val : `1px solid ${val}`;

    // Calculate preview styles dynamically if using a custom theme
    const previewStyle: React.CSSProperties = activeCustomTheme ? {
        background: activeCustomTheme.config.bgImage ? `url(${activeCustomTheme.config.bgImage}) center/cover no-repeat` : activeCustomTheme.config.cardBg,
        border: getBorder(activeCustomTheme.config.cardBorder),
        boxShadow: activeCustomTheme.config.cardShadow,
        backdropFilter: `blur(${activeCustomTheme.config.cardBlur}px) saturate(${activeCustomTheme.config.backdropSaturate || 100}%)`,
        color: activeCustomTheme.config.textColor,
        borderRadius: activeCustomTheme.config.borderRadius || '24px'
    } : {};

    const avatarStyle: React.CSSProperties = activeCustomTheme ? {
        border: activeCustomTheme.config.avatarBorder,
        boxShadow: activeCustomTheme.config.avatarGlow
    } : {};
    
    const previewColor = (activeCustomTheme ? activeCustomTheme.config.accentColor : null) || (avatar ? 'var(--accent-primary)' : generateAvatarColor(username || ''));

    const handleSave = () => {
        webSocketService.sendMessage(C2S_MSG_TYPE.UPDATE_PROFILE, { profile_theme: localTheme });
        // Local update for instant feel
        dispatch(updateUserProfile({ profile_theme: localTheme }));
    };

    const handleDeleteTheme = (e: React.MouseEvent, themeId: string) => {
        e.stopPropagation();
        if (confirm('Удалить эту тему?')) {
            webSocketService.sendMessage(C2S_MSG_TYPE.DELETE_THEME, { themeId });
            if (localTheme === themeId) setLocalTheme('holographic');
        }
    };

    return (
        <div className="profile-customization-container">
            <div className="theme-selection-column">
                <p className="settings-description">Выберите уникальный стиль для вашей карточки профиля.</p>
                
                <div className="profile-themes-grid">
                    {/* Default Themes */}
                    {defaultThemes.map(theme => (
                        <div key={theme.id} className={`theme-card ${localTheme === theme.id ? 'active' : ''}`} onClick={() => setLocalTheme(theme.id)}>
                            <div className={`theme-preview-box ${theme.id}`}>{theme.icon}</div>
                            <div className="theme-info">
                                <div className="theme-label">{theme.label}</div>
                                <div className="theme-desc">{theme.desc}</div>
                            </div>
                            <div className="theme-check">{localTheme === theme.id ? <CheckIcon /> : <div className="empty-circle" />}</div>
                        </div>
                    ))}

                    {/* Community Themes */}
                    {customThemes.map(theme => (
                        <div key={theme.id} className={`theme-card custom ${localTheme === theme.id ? 'active' : ''}`} onClick={() => setLocalTheme(theme.id)}>
                            <div className="theme-preview-box" style={{ background: theme.config.accentColor }}>✨</div>
                            <div className="theme-info">
                                <div className="theme-label">{theme.name}</div>
                                <div className="theme-desc">by {theme.authorName}</div>
                            </div>
                            {theme.authorId === userId && (
                                <div className="theme-delete-btn" onClick={(e) => handleDeleteTheme(e, theme.id)}><TrashIcon /></div>
                            )}
                            <div className="theme-check">{localTheme === theme.id ? <CheckIcon /> : <div className="empty-circle" />}</div>
                        </div>
                    ))}
                </div>

                {isChanged && (
                    <div className="save-changes-bar profile-save-bar">
                        <span><InfoIcon /> Тема изменена! Сохраните результат.</span>
                        <div style={{ display: 'flex', gap: '12px' }}>
                             <button className="holo-btn reset-btn" onClick={() => setLocalTheme(profile_theme || 'holographic')}>Сброс</button>
                             <button className="holo-btn primary" onClick={handleSave}><CheckIcon /> Сохранить тему</button>
                        </div>
                    </div>
                )}
            </div>

            <div className="theme-preview-column">
                <h3 className="preview-header">Предпросмотр</h3>
                
                <div className={`preview-card-outer theme-${localTheme}`}>
                    <div className={`holo-card theme-${localTheme} ${activeCustomTheme ? 'custom-theme-override' : ''}`} style={previewStyle}>
                        <div className="holo-shine" style={{ opacity: activeCustomTheme?.config.shineOpacity ?? 0.3 }} />
                        
                        {!activeCustomTheme && (
                            <div className="adaptive-glow" style={{ backgroundColor: previewColor, opacity: 0.2 }} />
                        )}

                        <div className="profile-banner" style={{ backgroundImage: profile_banner ? `url(${profile_banner})` : `linear-gradient(135deg, ${previewColor}, #000)` }} />
                        
                        <div className="profile-content">
                            <div className="profile-avatar-wrapper" style={avatarStyle}>
                                <div className="profile-avatar" style={{ backgroundColor: avatar ? 'transparent' : previewColor, backgroundImage: avatar ? `url(${avatar})` : 'none' }}>
                                    {!avatar && getInitials(username || '')}
                                </div>
                                <div className="status-ring online" />
                            </div>
                            <div className="user-identity">
                                <div className="user-name" style={activeCustomTheme ? { color: activeCustomTheme.config.textColor } : {}}>{username}</div>
                                <div className="user-discriminator">#{discriminator}</div>
                            </div>
                            <div className="bio-box">
                                <div className="bio-label">BIO.LOG</div>
                                {bio || 'Здесь будет ваше описание...'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* THE MAGIC BUTTON */}
                <button className="magic-create-theme-btn" onClick={() => setIsEditorOpen(true)}>
                    <span>{activeCustomTheme ? '✏️ Редактировать стиль' : '✨ Создать свой стиль'}</span>
                </button>
            </div>

            <CustomThemeEditor 
                isOpen={isEditorOpen} 
                onClose={() => setIsEditorOpen(false)} 
                initialTheme={activeCustomTheme}
            />
        </div>
    );
};

const VoiceVideoSettings: React.FC = () => {
    const dispatch = useDispatch();
    const settings = useSelector((state: RootState) => state.settings);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [permissionError, setPermissionError] = useState<string | null>(null);
    const [debugInfo, setDebugInfo] = useState<string>("");
    const [testVolume, setTestVolume] = useState(0);

    const getDevices = async () => {
        let log = "Starting diagnostics...\n";
        try {
            setPermissionError(null);
            
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Ваш клиент не поддерживает захват медиа (Secure context issue?)");
            }

            log += "1. Requesting Audio...\n";
            try {
                const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const track = audioStream.getAudioTracks()[0];
                log += `   - Audio granted! Label: ${track.label}, ID: ${track.id}\n`;
                log += `   - Status: Enabled=${track.enabled}, Muted=${track.muted}, ReadyState=${track.readyState}\n`;
                
                track.stop();
            } catch (ae: any) {
                log += `   - Audio FAILED: ${ae.name}\n`;
            }

            log += "2. Requesting Video...\n";
            try {
                const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                log += "   - Video granted!\n";
                videoStream.getTracks().forEach(t => t.stop());
            } catch (ve: any) {
                log += `   - Video FAILED: ${ve.name}\n`;
            }

            log += "3. Enumerating devices...\n";
            const d = await navigator.mediaDevices.enumerateDevices();
            setDevices(d);
            
            const hasLabels = d.some(dev => dev.label && dev.label.length > 0);
            if (!hasLabels) {
                log += "   - WARNING: Devices found but labels are empty. Permissions still blocked?\n";
                setPermissionError("Устройства найдены, но доступ к их именам заблокирован системой.");
            } else {
                log += `   - Success! Found ${d.length} devices.\n`;
            }

        } catch (e: any) { 
            // Enhanced error logging for non-serializable DOMExceptions
            const errorName = e.name || 'UnknownError';
            const errorMessage = e.message || 'No message provided';
            const errorStack = e.stack || 'No stack trace';
            
            console.error(`[VoiceVideoSettings] Diagnostic error: ${errorName} - ${errorMessage}`);

            setPermissionError(`${errorName}: ${errorMessage}`);
            log += `\n!!! CRITICAL FAILURE !!!\nName: ${errorName}\nMessage: ${errorMessage}\nStack: ${errorStack}\n`;
        } finally {
            setDebugInfo(log);
        }
    };

    // Get devices on mount
    useEffect(() => {
        getDevices();
    }, []);

    // Independent Mic Visualizer
    useEffect(() => {
        let audioContext: AudioContext;
        let analyser: AnalyserNode;
        let source: MediaStreamAudioSourceNode;
        let interval: number;
        let localStream: MediaStream | null = null;

        const startVisualizer = async () => {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    audio: { deviceId: settings.inputDeviceId ? { exact: settings.inputDeviceId } : undefined }
                });

                audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                analyser = audioContext.createAnalyser();
                source = audioContext.createMediaStreamSource(localStream);
                
                source.connect(analyser);
                analyser.fftSize = 256;
                
                const dataArray = new Uint8Array(analyser.frequencyBinCount);

                interval = window.setInterval(() => {
                    if (analyser) {
                        analyser.getByteFrequencyData(dataArray);
                        let sum = 0;
                        for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                        const average = sum / dataArray.length;
                        
                        // Use a ref-like approach to get latest volume without re-running effect
                        const currentVol = (window as any)._latestSettingsVolume || 100;
                        const volumeModifier = currentVol / 100;
                        const normalized = Math.min(100, (average / 255) * 100 * volumeModifier * 2);
                        
                        setTestVolume(normalized);
                    }
                }, 50);

            } catch (e) {
                console.error("Failed to start mic test:", e);
            }
        };

        startVisualizer();

        return () => {
            if (interval) clearInterval(interval);
            if (source) source.disconnect();
            if (analyser) analyser.disconnect();
            if (audioContext) audioContext.close();
            if (localStream) localStream.getTracks().forEach(t => t.stop());
        };
    }, [settings.inputDeviceId]); // ONLY on device change!

    // Keep volume in a place accessible by the interval
    useEffect(() => {
        (window as any)._latestSettingsVolume = settings.inputVolume;
    }, [settings.inputVolume]);

    const audioInputOptions = devices.filter(d => d.kind === 'audioinput').map(d => ({ value: d.deviceId, label: d.label }));
    const audioOutputOptions = devices.filter(d => d.kind === 'audiooutput').map(d => ({ value: d.deviceId, label: d.label }));
    const videoInputOptions = devices.filter(d => d.kind === 'videoinput').map(d => ({ value: d.deviceId, label: d.label }));

    return (
        <div className="settings-section">
            <h3 className="section-title">Устройства</h3>
            
            {permissionError && (
                <div className="permission-error-box" style={{ background: 'rgba(255, 0, 0, 0.1)', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid rgba(255, 0, 0, 0.3)' }}>
                    <p style={{ color: '#ff6b6b', marginBottom: '10px', fontWeight: 'bold' }}>⚠️ Ошибка доступа к оборудованию</p>
                    <p style={{ fontSize: '13px', color: '#ff6b6b', marginBottom: '10px' }}>{permissionError}</p>
                    
                    {debugInfo && (
                        <pre style={{ background: '#000', padding: '10px', borderRadius: '4px', fontSize: '11px', color: '#0f0', overflow: 'auto', maxHeight: '100px', marginBottom: '15px' }}>
                            {debugInfo}
                        </pre>
                    )}

                    <p style={{ fontSize: '12px', opacity: 0.8, marginBottom: '15px' }}>
                        <b>Как исправить:</b><br/>
                        1. Нажмите "Запустить диагностику" ниже.<br/>
                        2. Если не помогло, зайдите в <b>Параметры Windows &rarr; Конфиденциальность &rarr; Микрофон</b> и проверьте, включен ли доступ для "Классических приложений".
                    </p>
                    <button className="magic-create-theme-btn" style={{ width: 'auto' }} onClick={getDevices}>
                        Запустить диагностику и обновить
                    </button>
                </div>
            )}

            <div className="settings-grid">
                <div className="setting-item">
                    <label>Микрофон</label>
                    <CustomSelect 
                        value={settings.inputDeviceId || ''} 
                        onChange={(val) => dispatch(setInputDeviceId(val))}
                        options={audioInputOptions}
                        placeholder="Выберите микрофон..."
                    />
                </div>
                <div className="setting-item">
                    <label>Вывод звука</label>
                    <CustomSelect 
                        value={settings.outputDeviceId || ''} 
                        onChange={(val) => dispatch(setOutputDeviceId(val))}
                        options={audioOutputOptions}
                        placeholder="Выберите динамики..."
                    />
                </div>
                <div className="setting-item">
                    <label>Камера</label>
                    <CustomSelect 
                        value={settings.videoDeviceId || ''} 
                        onChange={(val) => dispatch(setVideoDeviceId(val))}
                        options={videoInputOptions}
                        placeholder="Выберите камеру..."
                    />
                </div>
            </div>

            <h3 className="section-title">Громкость и Чувствительность</h3>
            <div className="setting-item">
                <label>Громкость микрофона ({settings.inputVolume}%)</label>
                <input type="range" min="0" max="200" value={settings.inputVolume} onChange={(e) => dispatch(setInputVolume(parseInt(e.target.value)))} />
            </div>
            <div className="setting-item">
                <label>Порог активации ({settings.vadThreshold}%)</label>
                <input type="range" min="0" max="100" value={settings.vadThreshold} onChange={(e) => dispatch(setVadThreshold(parseInt(e.target.value)))} />
            </div>
            
            <div className="setting-item" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <label>Проверка уровня звука</label>
                <div className="mic-test-bar-bg">
                    <div className="mic-test-threshold" style={{ left: `${settings.vadThreshold}%` }} />
                    <div className="mic-test-level" style={{ width: `${testVolume}%`, backgroundColor: testVolume > settings.vadThreshold ? '#3ba55d' : '#faa61a' }} />
                </div>
            </div>

            <h3 className="section-title">Обработка голоса</h3>
            <div className="settings-grid">
                <div className="setting-item">
                    <label>Шумоподавление</label>
                    <input type="checkbox" checked={settings.noiseSuppression} onChange={(e) => dispatch(setNoiseSuppression(e.target.checked))} />
                </div>
                <div className="setting-item">
                    <label>Эхоподавление</label>
                    <input type="checkbox" checked={settings.echoCancellation} onChange={(e) => dispatch(setEchoCancellation(e.target.checked))} />
                </div>
            </div>
        </div>
    );
};

const PrivacySettings: React.FC = () => {
    const dispatch = useDispatch();
    const settings = useSelector((state: RootState) => state.settings);
    return (
        <div className="settings-section">
            <h3 className="section-title">Конфиденциальность</h3>
            <div className="setting-item">
                <label>Кто может писать вам в ЛС</label>
                <CustomSelect 
                    value={settings.pmPrivacy} 
                    onChange={(val) => dispatch(setPmPrivacy(val as any))}
                    options={[
                        { value: 'all', label: 'Все' },
                        { value: 'friends', label: 'Только друзья' },
                        { value: 'none', label: 'Никто' }
                    ]}
                />
            </div>
            <div className="setting-item">
                <label>Кто может добавлять вас в друзья</label>
                <CustomSelect 
                    value={settings.friendRequestPrivacy} 
                    onChange={(val) => dispatch(setFriendRequestPrivacy(val as any))}
                    options={[
                        { value: 'all', label: 'Все' },
                        { value: 'friends', label: 'Друзья друзей' },
                        { value: 'none', label: 'Никто' }
                    ]}
                />
            </div>
        </div>
    );
};

const NotificationSettings: React.FC = () => {
    const dispatch = useDispatch();
    const settings = useSelector((state: RootState) => state.settings);
    return (
        <div className="settings-section">
            <h3 className="section-title">Уведомления</h3>
            <div className="settings-grid">
                <div className="setting-item">
                    <label>Уведомления на рабочем столе</label>
                    <input type="checkbox" checked={settings.enableDesktopNotifications} onChange={(e) => dispatch(setEnableDesktopNotifications(e.target.checked))} />
                </div>
                <div className="setting-item">
                    <label>Звуковые уведомления</label>
                    <input type="checkbox" checked={settings.enableSoundNotifications} onChange={(e) => dispatch(setEnableSoundNotifications(e.target.checked))} />
                </div>
                <div className="setting-item">
                    <label>Звук входа/выхода участников</label>
                    <input type="checkbox" checked={settings.playUserJoinLeaveSounds} onChange={(e) => dispatch(setPlayUserJoinLeaveSounds(e.target.checked))} />
                </div>
            </div>
        </div>
    );
};

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type Section = 'Account' | 'Profile' | 'Appearance' | 'Voice & Video' | 'Privacy & Security' | 'Notifications';

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = useState<Section>('Account');

  const sections: { name: Section, label: string, icon: React.ReactNode }[] = [
    { name: 'Account', label: 'Учётная запись', icon: <UserIcon /> },
    { name: 'Profile', label: 'Профиль', icon: <PaletteIcon /> },
    { name: 'Appearance', label: 'Внешний вид', icon: <GlobeIcon /> },
    { name: 'Voice & Video', label: 'Голос и видео', icon: <MicIcon /> },
    { name: 'Privacy & Security', label: 'Приватность', icon: <LockIcon /> },
    { name: 'Notifications', label: 'Уведомления', icon: <BellIcon /> },
  ];

  if (!isOpen) return null;

  const renderContent = () => {
    switch (activeSection) {
      case 'Account': return <AccountSettings />;
      case 'Profile': return <ProfileCustomization />;
      case 'Appearance': return <AppearanceSettings />;
      case 'Voice & Video': return <VoiceVideoSettings />;
      case 'Privacy & Security': return <PrivacySettings />;
      case 'Notifications': return <NotificationSettings />;
      default: return <div className="settings-empty">Раздел в разработке...</div>;
    }
  };

  return createPortal(
    <div className="settings-panel-overlay" onClick={onClose}>
      <div className="settings-panel glass-panel" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="close-modal-btn">&times;</button>
        <aside className="settings-sidebar">
            <div className="settings-sidebar-header">Настройки</div>
            {sections.map(s => (
                <div key={s.name} className={`settings-sidebar-item ${activeSection === s.name ? 'active' : ''}`} onClick={() => setActiveSection(s.name)}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {s.icon} {s.label}
                    </span>
                </div>
            ))}
        </aside>
        <main className="settings-main-content">
          <div className="settings-header">
            <h2>{sections.find(s => s.name === activeSection)?.label}</h2>
          </div>
          <div className="settings-content">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>,
    document.body
  );
};

export default SettingsPanel;
