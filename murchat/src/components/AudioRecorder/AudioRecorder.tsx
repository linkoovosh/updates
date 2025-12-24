import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import './AudioRecorder.css';

interface AudioRecorderProps {
  onComplete: (audioData: string) => void;
  onCancel: () => void;
}

const AudioRecorder = forwardRef((props: AudioRecorderProps, ref) => {
  const { onComplete, onCancel } = props;
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const isCancelledRef = useRef<boolean>(false); // NEW: flag to prevent sending on delete
  const [recordingDuration, setRecordingDuration] = useState<number>(0);
  const durationIntervalRef = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    stopAndSend: () => {
      isCancelledRef.current = false;
      stopRecording();
    }
  }));

  useEffect(() => {
    startRecording();
    return () => {
      cleanup();
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      startTimeRef.current = Date.now();
      setRecordingDuration(0);

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        // ONLY send if not cancelled
        if (!isCancelledRef.current && audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result as string;
            onComplete(base64);
          };
          reader.readAsDataURL(audioBlob);
        }
        
        cleanup();
      };

      mediaRecorderRef.current.start();
      startDurationTimer();
      console.log('Recording started auto.');
    } catch (err) {
      console.error('Error accessing microphone:', err);
      onCancel();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const cancelRecording = (e: React.MouseEvent) => {
    e.stopPropagation();
    isCancelledRef.current = true; // Mark as cancelled!
    cleanup();
    onCancel();
    console.log('Recording cancelled by user.');
  };

  const cleanup = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    stopDurationTimer();
  };

  const startDurationTimer = () => {
    stopDurationTimer();
    durationIntervalRef.current = window.setInterval(() => {
      setRecordingDuration(Math.round((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  };

  const stopDurationTimer = () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="audio-recorder recording-active">
        <div className="recording-controls">
          <button className="cancel-recording-button" onClick={cancelRecording} title="Отменить (удалить)">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="icon-trash"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
          <div className="recording-status">
            <span className="recording-dot"></span>
            <span className="recording-duration">{formatDuration(recordingDuration)}</span>
          </div>
          <div className="recording-hint">Отпустите мышь, чтобы отправить</div>
        </div>
    </div>
  );
});

export default AudioRecorder;