import React, { useState, useEffect } from 'react';
import './UpdateNotifier.css';

const UpdateNotifier: React.FC = () => {
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'available' | 'downloading' | 'ready'>('idle');
    const [progress, setProgress] = useState(0);
    const [version, setVersion] = useState('');

    useEffect(() => {
        if (!(window as any).electron) return;

        const electron = (window as any).electron;

        const onAvailable = (_: any, info: any) => {
            setUpdateStatus('available');
            setVersion(info.version);
        };

        const onProgress = (_: any, progressObj: any) => {
            setUpdateStatus('downloading');
            setProgress(Math.round(progressObj.percent));
        };

        const onReady = (_: any, info: any) => {
            setUpdateStatus('ready');
            setVersion(info.version);
        };

        electron.receive('update-available', onAvailable);
        electron.receive('update-download-progress', onProgress);
        electron.receive('update-ready', onReady);

        return () => {
            // Clean up listeners if electron supports it
        };
    }, []);

    if (updateStatus === 'idle') return null;

    return (
        <div className={`update-notifier-container ${updateStatus !== 'idle' ? 'show' : ''}`}>
            <div className="update-notifier-card glass-panel">
                <div className="update-icon">🚀</div>
                <div className="update-info">
                    {updateStatus === 'available' && (
                        <>
                            <h4>Доступно обновление!</h4>
                            <p>Версия {version} уже в пути...</p>
                        </>
                    )}
                    {updateStatus === 'downloading' && (
                        <>
                            <h4>Загрузка обновления...</h4>
                            <div className="progress-bar-wrapper">
                                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                                <span className="progress-text">{progress}%</span>
                            </div>
                        </>
                    )}
                    {updateStatus === 'ready' && (
                        <>
                            <h4>Обновление готово!</h4>
                            <p>Версия {version} скачана. Перезапустить?</p>
                            <div className="update-actions">
                                <button className="holo-btn primary" onClick={() => (window as any).electron.send('install-update')}>
                                    Обновить сейчас
                                </button>
                                <button className="holo-btn secondary" onClick={() => setUpdateStatus('idle')}>
                                    Позже
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UpdateNotifier;
