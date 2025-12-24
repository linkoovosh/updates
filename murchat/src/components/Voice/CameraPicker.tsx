import React, { useEffect, useState } from "react";
import './screenShare.css'; // Reuse the same glassy styles

interface CameraDevice {
  deviceId: string;
  label: string;
}

interface CameraPickerProps {
  onSelect: (deviceId: string) => void;
  onCancel: () => void;
}

const CameraPicker: React.FC<CameraPickerProps> = ({ onSelect, onCancel }) => {
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCameras() {
      try {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = allDevices
            .filter(d => d.kind === 'videoinput')
            .map(d => ({ deviceId: d.deviceId, label: d.label || `Камера ${d.deviceId.slice(0, 5)}` }));
          setDevices(videoDevices);
      } catch (e) {
          console.error("Failed to load cameras:", e);
      }
      setLoading(false);
    }
    loadCameras();
  }, []);

  return (
    <div className="screen-picker-overlay" onClick={onCancel}>
      <div className="screen-picker-window" onClick={e => e.stopPropagation()}>
        <h2 className="screen-picker-title">Выберите камеру</h2>
        
        {loading ? (
            <div className="screen-picker-loading">Загрузка...</div>
        ) : devices.length === 0 ? (
            <div className="screen-picker-empty">Камеры не найдены.</div>
        ) : (
            <div className="screen-picker-grid">
            {devices.map(dev => (
                <div
                key={dev.deviceId}
                className="screen-source"
                onClick={() => onSelect(dev.deviceId)}
                title={dev.label}
                style={{ padding: '20px', textAlign: 'center' }}
                >
                <div style={{ fontSize: '40px', marginBottom: '10px' }}>📷</div>
                <p>{dev.label}</p>
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

export default CameraPicker;
