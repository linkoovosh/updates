import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { setUsername } from '../store/slices/uiSlice';
import './UsernameInput.css';

const UsernameInput: React.FC = () => {
  const [inputName, setInputName] = useState('');
  const dispatch = useDispatch();

  const handleSetUsername = () => {
    if (inputName.trim()) {
      dispatch(setUsername(inputName.trim()));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSetUsername();
    }
  };

  return (
    <div className="username-input-container">
      <div className="username-input-card">
        <h2>Введите ваше имя</h2>
        <input
          type="text"
          placeholder="Ваше имя пользователя"
          value={inputName}
          onChange={(e) => setInputName(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button onClick={handleSetUsername}>Продолжить</button>
      </div>
    </div>
  );
};

export default UsernameInput;
