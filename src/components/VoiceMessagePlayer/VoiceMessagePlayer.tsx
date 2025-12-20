import React, { useRef, useState, useEffect } from 'react';
import './VoiceMessagePlayer.css';

interface VoiceMessagePlayerProps {
  src: string;
  duration?: number; // Optional: if we want to pass a pre-calculated duration
}

const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({ src, duration: initialDuration }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setAudioData = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(Math.round(audio.duration));
      }
    };

    const updateTime = () => setCurrentTime(audio.currentTime); // Use raw currentTime for smoother updates
    const togglePlayPause = () => setIsPlaying(!audio.paused);

    audio.addEventListener('loadedmetadata', setAudioData);
    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('ended', togglePlayPause);
    audio.addEventListener('play', togglePlayPause);
    audio.addEventListener('pause', togglePlayPause);

    // Initial check for duration if already loaded
    if (audio.readyState >= 1) { // HAVE_METADATA
      setAudioData();
    }

    return () => {
      audio.removeEventListener('loadedmetadata', setAudioData);
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('ended', togglePlayPause);
      audio.removeEventListener('play', togglePlayPause);
      audio.removeEventListener('pause', togglePlayPause);
    };
  }, [src]);

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(error => console.error('Error playing audio:', error));
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = Number(e.target.value);
    }
  };

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const progressBarWidth = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="voice-message-player-custom">
      <audio ref={audioRef} src={src} preload="metadata" /> {/* Hidden audio element */}
      <button onClick={handlePlayPause} className="play-pause-button">
        {isPlaying ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg> // Pause icon
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> // Play icon
        )}
      </button>
      <div className="progress-container">
        <div className="progress-bar-background">
          <div className="progress-bar-fill" style={{ width: `${progressBarWidth}%` }}></div>
        </div>
        <input
          type="range"
          min="0"
          max={duration}
          value={currentTime}
          onChange={handleSeek}
          className="seek-slider"
        />
      </div>
      <span className="time-display">{formatTime(currentTime)} / {formatTime(duration)}</span>
    </div>
  );
};

export default VoiceMessagePlayer;
