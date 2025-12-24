import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { webRTCService } from '../services/webrtc';
import { mediasoupService } from '../services/mediasoup'; 
import { updateVoiceState } from '../store/slices/voiceSlice';
import type { AppDispatch, RootState } from '../store';
import { getAudioContext, resumeAudioContext } from '../utils/audioContext';

interface RemoteAudioTrack {
  userId: string;
  stream: MediaStream;
}

interface AudioNodeMap {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  streamClone: MediaStream;
}

const VoiceManager: React.FC = () => {
  const [remoteAudioTracks, setRemoteAudioTracks] = React.useState<RemoteAudioTrack[]>([]);
  const audioRefs = React.useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const audioNodesRef = React.useRef<Map<string, AudioNodeMap>>(new Map());
  const animationFrameRef = React.useRef<number>();
  const dispatch: AppDispatch = useDispatch();

  const authUserId = useSelector((state: RootState) => state.auth.userId); 
  const voiceStates = useSelector((state: RootState) => state.voice.voiceStates);
  const outputDeviceId = useSelector((state: RootState) => state.settings.outputDeviceId);
  const selfVoiceState = authUserId ? voiceStates[authUserId] : undefined;
  const isDeafened = selfVoiceState?.isDeafened || false;

  const authUserIdRef = React.useRef(authUserId);
  const voiceStatesRef = React.useRef(voiceStates);
  
  React.useEffect(() => { authUserIdRef.current = authUserId; }, [authUserId]);
  React.useEffect(() => { voiceStatesRef.current = voiceStates; }, [voiceStates]);

  React.useEffect(() => {
    audioContextRef.current = getAudioContext();
  }, []);

  const handleTrack = async (stream: MediaStream, userId: string, metadata?: any) => {
    const currentSelfId = authUserIdRef.current;
    const isLocal = userId === currentSelfId;

    console.log(`[VoiceManager] handleTrack: userId=${userId}, isLocal=${isLocal}, source=${metadata?.source || 'mic'}`);

    if (stream.getAudioTracks().length === 0) return;

    dispatch(updateVoiceState({ userId, partialState: { isConnecting: false } }));

    if (!isLocal) {
      setRemoteAudioTracks(prev => {
        const index = prev.findIndex(track => track.userId === userId);
        if (index !== -1) {
            const newTracks = [...prev];
            newTracks[index] = { userId, stream };
            return newTracks;
        }
        return [...prev, { userId, stream }];
      });
    }

    if (!audioContextRef.current) return;
    const ctx = audioContextRef.current;
    await resumeAudioContext();

    if (audioNodesRef.current.has(userId)) {
        const oldNode = audioNodesRef.current.get(userId);
        oldNode?.source.disconnect();
        oldNode?.streamClone.getTracks().forEach(t => t.stop());
        audioNodesRef.current.delete(userId);
    }

    const streamClone = stream.clone();
    const source = ctx.createMediaStreamSource(streamClone);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);

    audioNodesRef.current.set(userId, { source, analyser, streamClone });
  };

  const handleTrackRemoved = (userId: string, metadata?: any) => {
      if (!metadata || metadata.source === 'mic') {
           setRemoteAudioTracks(prev => prev.filter(t => t.userId !== userId));
           if (audioNodesRef.current.has(userId)) {
               const node = audioNodesRef.current.get(userId);
               node?.source.disconnect();
               node?.streamClone.getTracks().forEach(t => t.stop());
               audioNodesRef.current.delete(userId);
           }
      }
  };

  React.useEffect(() => {
    const unsubscribeRemote = webRTCService.onRemoteTrack(handleTrack);
    const unsubscribeRemoved = webRTCService.onRemoteTrackRemoved(handleTrackRemoved);
    const unsubscribeLocal = webRTCService.onLocalStream((s) => handleTrack(s, authUserIdRef.current || 'local', { source: 'mic' }));
    
    mediasoupService.on('newStream', ({ userId, stream, appData }: any) => handleTrack(stream, userId, appData));
    mediasoupService.on('streamClosed', ({ userId, appData }: any) => handleTrackRemoved(userId, appData));

    return () => {
      unsubscribeRemote();
      unsubscribeRemoved();
      unsubscribeLocal();
      mediasoupService.removeAllListeners('newStream');
      mediasoupService.removeAllListeners('streamClosed');
    };
  }, [dispatch]);

  React.useEffect(() => {
    const analyze = () => {
      audioNodesRef.current.forEach((nodes, userId) => {
        const dataArray = new Uint8Array(nodes.analyser.frequencyBinCount);
        nodes.analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const amplitude = (dataArray[i] - 128) / 128;
          sum += amplitude * amplitude;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const volume = Math.min(1, Math.max(0, rms - 0.005) * 6);
        dispatch(updateVoiceState({ userId, partialState: { volume } }));
      });
      animationFrameRef.current = requestAnimationFrame(analyze);
    };
    animationFrameRef.current = requestAnimationFrame(analyze);
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [dispatch]);

  React.useEffect(() => {
    remoteAudioTracks.forEach(({ userId, stream }) => {
      const audioEl = audioRefs.current.get(userId);
      const userState = voiceStates[userId];
      if (audioEl) {
          if (audioEl.srcObject !== stream) {
            audioEl.srcObject = stream;
            audioEl.play().catch(e => console.warn("Audio play error:", e));
          }
          if (outputDeviceId && (audioEl as any).setSinkId) {
              if ((audioEl as any).sinkId !== outputDeviceId) {
                  (audioEl as any).setSinkId(outputDeviceId).catch((e: any) => console.error("setSinkId error:", e));
              }
          }
          if (userState) {
              const vol = (userState.localVolume ?? 100) / 100;
              audioEl.volume = isDeafened ? 0 : vol;
              audioEl.muted = userState.isMuted || isDeafened;
          }
      }
    });
  }, [remoteAudioTracks, voiceStates, isDeafened, outputDeviceId]);

  // Debug function to force audio playback
  const forceAudioRepair = async () => {
      console.log("[DEBUG] FORCING AUDIO REPAIR...");
      await resumeAudioContext();
      audioRefs.current.forEach((el, id) => {
          console.log(`[DEBUG] Resuming audio for ${id}. Current volume: ${el.volume}, Muted: ${el.muted}`);
          el.play().catch(e => console.error("Force play failed", e));
      });
      alert(`Debug: ${remoteAudioTracks.length} remote tracks active. Context: ${audioContextRef.current?.state}`);
  };

  return (
    <>
      <div style={{ display: 'none' }}>
        {remoteAudioTracks.map(({ userId }) => (
          <audio
            key={userId}
            ref={el => { 
                if (el) audioRefs.current.set(userId, el);
                else audioRefs.current.delete(userId);
            }}
            autoPlay
            playsInline
          />
        ))}
      </div>
      
      {/* Hidden/Floating Debug Button */}
      {remoteAudioTracks.length > 0 && (
          <button 
            onClick={forceAudioRepair}
            style={{
                position: 'fixed',
                bottom: '80px',
                right: '20px',
                zIndex: 9999,
                padding: '10px',
                background: 'rgba(255,0,0,0.5)',
                color: 'white',
                borderRadius: '5px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '10px'
            }}
          >
            FIX AUDIO
          </button>
      )}
    </>
  );
};

export default VoiceManager;