import React from 'react';
import { DEV_COMMANDS, DEV_GUIDE } from '../../constants/devData';
import './DevToolsUI.css';

interface CommandPickerProps {
    filter: string;
    onSelect: (cmd: string) => void;
}

export const CommandPicker: React.FC<CommandPickerProps> = ({ filter, onSelect }) => {
    const filtered = DEV_COMMANDS.filter(c => c.cmd.startsWith(filter) || filter === '/');
    if (filtered.length === 0) return null;

    return (
        <div className="dev-command-picker glass-panel">
            <div className="picker-header">Команды Разработчика</div>
            <div className="picker-list">
                {filtered.map(item => (
                    <div key={item.cmd} className="picker-item" onClick={() => onSelect(item.cmd)}>
                        <span className="item-cmd">{item.cmd}</span>
                        <span className="item-desc">{item.desc}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

interface DevGuideModalProps {
    onClose: () => void;
}

export const DevGuideModal: React.FC<DevGuideModalProps> = ({ onClose }) => {
    return (
        <div className="dev-guide-overlay" onClick={onClose}>
            <div className="dev-guide-content glass-panel" onClick={e => e.stopPropagation()}>
                <h2>🛠 {DEV_GUIDE.title}</h2>
                <div className="guide-sections">
                    {DEV_GUIDE.sections.map(s => (
                        <div key={s.title} className="guide-section">
                            <h4>{s.title}</h4>
                            <p>{s.content}</p>
                        </div>
                    ))}
                </div>
                <div className="guide-footer">{DEV_GUIDE.footer}</div>
                <button className="holo-btn primary" onClick={onClose}>Принять Кодекс</button>
            </div>
        </div>
    );
};
