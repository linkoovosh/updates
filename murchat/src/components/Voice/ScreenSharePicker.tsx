import React, { useEffect, useState } from "react";
import './screenShare.css';

interface Source {
  id: string;
  name: string;
  thumbnail: string;
}

interface ScreenSharePickerProps {
  onSelect: (source: Source) => void;
  onCancel: () => void;
}

const ScreenSharePicker: React.FC<ScreenSharePickerProps> = ({ onSelect, onCancel }) => {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSources() {
      if (window.electron && window.electron.getScreenSources) {
        try {
            const src = await window.electron.getScreenSources();
            setSources(src);
        } catch (e) {
            console.error("Failed to load screen sources:", e);
        }
      } else {
          console.warn("Electron API not available");
      }
      setLoading(false);
    }
    loadSources();
  }, []);

  return (
    <div className="screen-picker-overlay" onClick={onCancel}>
      <div className="screen-picker-window" onClick={e => e.stopPropagation()}>
        <h2 className="screen-picker-title">Выберите окно для трансляции</h2>
        
        {loading ? (
            <div className="screen-picker-loading">Загрузка...</div>
        ) : sources.length === 0 ? (
            <div className="screen-picker-empty">Нет доступных окон для трансляции.</div>
        ) : (
            <div className="screen-picker-grid">
            {sources.map(src => (
                <div
                key={src.id}
                className="screen-source"
                onClick={() => onSelect(src)}
                title={src.name}
                >
                <img src={src.thumbnail} alt={src.name} />
                <p>{src.name}</p>
                </div>
            ))}
            </div>
        )}

        <button className="cancel-btn" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}

export default ScreenSharePicker;
