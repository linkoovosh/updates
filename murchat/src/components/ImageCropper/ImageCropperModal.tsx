import React, { useState, useRef, useEffect } from 'react';
import './ImageCropperModal.css';

interface ImageCropperModalProps {
  isOpen: boolean;
  imageSrc: string;
  onClose: () => void;
  onSave: (croppedImage: string) => void;
  aspectRatio?: number; // 1 for avatar, 16/9 for banner
}

const ImageCropperModal: React.FC<ImageCropperModalProps> = ({ isOpen, imageSrc, onClose, onSave, aspectRatio = 1 }) => {
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen, imageSrc]);

  if (!isOpen || !imageSrc) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleSave = () => {
    const canvas = document.createElement('canvas');
    // We'll use a higher resolution for the saved image
    const outputWidth = aspectRatio === 1 ? 400 : 960;
    const outputHeight = outputWidth / aspectRatio;
    
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx && imageRef.current && containerRef.current) {
        const img = imageRef.current;
        
        // 1. Clear background
        ctx.clearRect(0, 0, outputWidth, outputHeight);
        
        // 2. Move to center of canvas
        ctx.translate(outputWidth / 2, outputHeight / 2);
        
        // 3. Apply scale and position
        // We calculate the scale factor between the visual preview area (320px wide) 
        // and the target output resolution.
        const visualToOutputScale = outputWidth / 320;
        
        // Final scale = User zoom * ratio of natural image size to visual area
        // But since the image in preview is also scaled by CSS/React, we just need
        // to match the visual relative coordinates.
        
        ctx.translate(position.x * visualToOutputScale, position.y * visualToOutputScale);
        ctx.scale(zoom * visualToOutputScale, zoom * visualToOutputScale);
        
        // 4. Draw image centered at its own local coordinates
        // We use naturalWidth/Height to ensure we get full quality
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        onSave(dataUrl);
    }
  };

  const areaStyle: React.CSSProperties = {
      height: 320 / aspectRatio,
      maxHeight: '320px'
  };

  return (
    <div className="cropper-modal-overlay" onClick={onClose}>
      <div className="cropper-modal-content" onClick={e => e.stopPropagation()}>
        <h3>{aspectRatio === 1 ? 'Редактирование аватара' : 'Редактирование баннера'}</h3>
        <div className="cropper-area" 
             style={areaStyle}
             ref={containerRef}
             onMouseDown={handleMouseDown}
             onMouseMove={handleMouseMove}
             onMouseUp={handleMouseUp}
             onMouseLeave={handleMouseUp}
        >
            <div className={`cropper-mask ${aspectRatio === 1 ? 'circle' : 'rect'}`}></div>
            <img 
                ref={imageRef}
                src={imageSrc} 
                alt="Upload" 
                style={{ 
                    transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                    cursor: isDragging ? 'grabbing' : 'grab'
                }}
                draggable={false}
            />
        </div>
        
        <div className="cropper-controls">
            <label>Масштаб</label>
            <input 
                type="range" 
                min="0.1" 
                max="5" 
                step="0.05" 
                value={zoom} 
                onChange={(e) => setZoom(parseFloat(e.target.value))} 
            />
        </div>

        <div className="cropper-actions">
          <button onClick={onClose} className="cropper-btn secondary">Отмена</button>
          <button onClick={handleSave} className="cropper-btn primary">Сохранить</button>
        </div>
      </div>
    </div>
  );
};

export default ImageCropperModal;
