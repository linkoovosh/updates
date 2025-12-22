// src/components/TerminalPanel.tsx
import React from 'react';
import './TerminalPanel.css';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';

const TerminalPanel: React.FC = () => {
  const isVisible = useSelector((state: RootState) => state.settings.isTerminalVisible);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <span>Терминал</span>
      </div>
      <div className="terminal-content">
        <p>Вывод терминала...</p>
      </div>
    </div>
  );
};

export default TerminalPanel;
