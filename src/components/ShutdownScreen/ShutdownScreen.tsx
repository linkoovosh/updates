import React from 'react';
import './ShutdownScreen.css';

const ShutdownScreen: React.FC = () => {
  return (
    <div className="shutdown-overlay">
      <div className="shutdown-content">
        <div className="shutdown-icon">
            🐱 💻 ☁️
        </div>
        <div className="shutdown-text">
            <h2>Подождите, пожалуйста</h2>
            <p>Котики завершают клиент и сохраняют логи... Meow!</p>
        </div>
      </div>
    </div>
  );
};

export default ShutdownScreen;
