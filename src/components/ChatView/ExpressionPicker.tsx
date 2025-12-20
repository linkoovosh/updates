import React, { useState, useEffect, useRef } from 'react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import type { EmojiClickData } from 'emoji-picker-react';
import { SmileIcon, FilmIcon, ImageIcon } from '../UI/Icons';
import './ExpressionPicker.css';

interface ExpressionPickerProps {
    onEmojiSelect: (emoji: string) => void;
    onGifSelect: (gifUrl: string) => void;
    onStickerSelect: (stickerUrl: string) => void;
    onUploadSticker?: (file: File) => Promise<string | null>;
    onClose: () => void;
}

type Tab = 'emoji' | 'gif' | 'sticker';

const TENOR_KEY = 'LIVDSRZULELA'; // Public Demo Key

const ExpressionPicker: React.FC<ExpressionPickerProps> = ({ onEmojiSelect, onGifSelect, onStickerSelect, onUploadSticker, onClose }) => {
    const [activeTab, setActiveTab] = useState<Tab>('emoji');
    const [gifSearch, setGifSearch] = useState('');
    const [gifs, setGifs] = useState<any[]>([]);
    const [isLoadingGifs, setIsLoadingGifs] = useState(false);
    const [customStickers, setCustomStickers] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Mock Stickers (using generic cute images for demo)
    const defaultStickers = [
        'https://cdn-icons-png.flaticon.com/512/742/742751.png',
        'https://cdn-icons-png.flaticon.com/512/742/742752.png',
        'https://cdn-icons-png.flaticon.com/512/742/742760.png',
        'https://cdn-icons-png.flaticon.com/512/4193/4193235.png',
        'https://cdn-icons-png.flaticon.com/512/4193/4193282.png',
        'https://cdn-icons-png.flaticon.com/512/9308/9308232.png',
    ];

    useEffect(() => {
        if (activeTab === 'gif') {
            fetchGifs('trending');
        }
    }, [activeTab]);

    useEffect(() => {
        const savedStickers = localStorage.getItem('user_stickers');
        if (savedStickers) {
            try {
                setCustomStickers(JSON.parse(savedStickers));
            } catch (e) {
                console.error("Failed to parse custom stickers", e);
            }
        }
    }, []);

    const fetchGifs = async (query: string) => {
        setIsLoadingGifs(true);
        try {
            const endpoint = query === 'trending' 
                ? `https://g.tenor.com/v1/trending?key=${TENOR_KEY}&limit=20`
                : `https://g.tenor.com/v1/search?q=${query}&key=${TENOR_KEY}&limit=20`;
            
            const response = await fetch(endpoint);
            const data = await response.json();
            if (data.results) {
                setGifs(data.results);
            }
        } catch (error) {
            console.error('Failed to fetch GIFs:', error);
        } finally {
            setIsLoadingGifs(false);
        }
    };

    const handleGifSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            fetchGifs(gifSearch);
        }
    };

    const handleStickerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && onUploadSticker) {
            const url = await onUploadSticker(file);
            if (url) {
                const updatedStickers = [...customStickers, url];
                setCustomStickers(updatedStickers);
                localStorage.setItem('user_stickers', JSON.stringify(updatedStickers));
            }
        }
        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="expression-picker">
            <div className="picker-tabs">
                <button 
                    className={`picker-tab ${activeTab === 'emoji' ? 'active' : ''}`}
                    onClick={() => setActiveTab('emoji')}
                >
                    <SmileIcon /> Эмодзи
                </button>
                <button 
                    className={`picker-tab ${activeTab === 'gif' ? 'active' : ''}`}
                    onClick={() => setActiveTab('gif')}
                >
                    <FilmIcon /> GIF
                </button>
                <button 
                    className={`picker-tab ${activeTab === 'sticker' ? 'active' : ''}`}
                    onClick={() => setActiveTab('sticker')}
                >
                    <ImageIcon /> Стикеры
                </button>
            </div>

            <div className="picker-content">
                {activeTab === 'emoji' && (
                    <div className="emoji-picker-wrapper">
                        <EmojiPicker 
                            onEmojiClick={(data: EmojiClickData) => onEmojiSelect(data.emoji)}
                            theme={Theme.DARK}
                            width="100%"
                            height="350px"
                            lazyLoadEmojis={true}
                        />
                    </div>
                )}

                {activeTab === 'gif' && (
                    <div className="gif-picker-wrapper">
                        <input 
                            type="text" 
                            className="gif-search-input"
                            placeholder="Поиск GIF..."
                            value={gifSearch}
                            onChange={(e) => setGifSearch(e.target.value)}
                            onKeyDown={handleGifSearch}
                        />
                        <div className="gif-grid">
                            {isLoadingGifs ? (
                                <div className="loading-spinner">Загрузка...</div>
                            ) : (
                                gifs.map((gif: any) => (
                                    <div 
                                        key={gif.id} 
                                        className="gif-item"
                                        onClick={() => onGifSelect(gif.media[0].gif.url)}
                                    >
                                        <img src={gif.media[0].tinygif.url} alt={gif.content_description} />
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'sticker' && (
                    <div className="sticker-picker-wrapper">
                        <div className="sticker-grid">
                            {/* Upload Button */}
                            <div className="sticker-item add-sticker-btn" onClick={() => fileInputRef.current?.click()}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    style={{ display: 'none' }} 
                                    onChange={handleStickerUpload} 
                                    accept="image/*"
                                />
                            </div>

                            {/* Custom Stickers */}
                            {customStickers.map((url, index) => (
                                <div 
                                    key={`custom-${index}`} 
                                    className="sticker-item"
                                    onClick={() => onStickerSelect(url)}
                                >
                                    <img src={url} alt="Custom Sticker" />
                                </div>
                            ))}

                            {/* Default Stickers */}
                            {defaultStickers.map((url, index) => (
                                <div 
                                    key={`default-${index}`} 
                                    className="sticker-item"
                                    onClick={() => onStickerSelect(url)}
                                >
                                    <img src={url} alt="Sticker" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ExpressionPicker;