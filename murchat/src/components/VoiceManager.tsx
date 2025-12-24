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
  streamClone: MediaStream; // Keep ref to stop tracks
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

  // Ref to hold latest userId/voiceStates for closures
  const authUserIdRef = React.useRef(authUserId);
  const voiceStatesRef = React.useRef(voiceStates);
  
  React.useEffect(() => { authUserIdRef.current = authUserId; }, [authUserId]);
  React.useEffect(() => { voiceStatesRef.current = voiceStates; }, [voiceStates]);

  // Initialize AudioContext
  React.useEffect(() => {
    audioContextRef.current = getAudioContext();
  }, []);

  React.useEffect(() => {
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

      // --- Visualizer Logic (Clone Strategy) ---
      if (!audioContextRef.current) return;
      const ctx = audioContextRef.current;
      await resumeAudioContext();

      // Clean up old nodes for this user
      if (audioNodesRef.current.has(userId)) {
          const oldNode = audioNodesRef.current.get(userId);
          oldNode?.source.disconnect();
          oldNode?.streamClone.getTracks().forEach(t => t.stop());
          audioNodesRef.current.delete(userId);
      }

      // CRITICAL: Clone the stream for the analyser. 
      // This allows the original stream to play via <audio> element without interference.
      const streamClone = stream.clone();
      const source = ctx.createMediaStreamSource(streamClone);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);

      audioNodesRef.current.set(userId, { source, analyser, streamClone });
    };

    const handleLocalStream = async (stream: MediaStream) => {
        handleTrack(stream, authUserIdRef.current || 'local', { source: 'mic' });
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

    // Subscriptions
    const unsubscribeRemote = webRTCService.onRemoteTrack(handleTrack);
    const unsubscribeRemoved = webRTCService.onRemoteTrackRemoved(handleTrackRemoved);
    const unsubscribeLocal = webRTCService.onLocalStream(handleLocalStream);
    
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

  // Animation Loop for Visualizer
  const heartbeatCounterRef = React.useRef(0);
  React.useEffect(() => {
    const analyze = () => {
      heartbeatCounterRef.current++;
      
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

        if (userId === authUserIdRef.current && heartbeatCounterRef.current % 300 === 0) {
             console.log(`[VoiceManager] Visualizer Heartbeat: RMS=${rms.toFixed(4)}, Vol=${volume.toFixed(2)}`);
        }
        
        dispatch(updateVoiceState({ userId, partialState: { volume } }));
      });
      animationFrameRef.current = requestAnimationFrame(analyze);
    };
    animationFrameRef.current = requestAnimationFrame(analyze);
    return () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [dispatch]);

  // Audio Element Management (Playback)
  React.useEffect(() => {
    remoteAudioTracks.forEach(({ userId, stream }) => {
      const audioEl = audioRefs.current.get(userId);
      const userState = voiceStates[userId];
      
      if (audioEl) {
          // 1. Assign Stream
          if (audioEl.srcObject !== stream) {
            console.log(`[VoiceManager] Assigning stream to <audio> for ${userId}`);
            audioEl.srcObject = stream;
            audioEl.play().catch(e => console.warn("Audio play error:", e));
          }

          // 2. Set Output Device
          if (outputDeviceId && (audioEl as any).setSinkId) {
              if ((audioEl as any).sinkId !== outputDeviceId) {
                  (audioEl as any).setSinkId(outputDeviceId).catch((e: any) => console.error("setSinkId error:", e));
              }
          }
          
          // 3. Control Volume / Mute
          if (userState) {
              // Calculate volume
              const vol = (userState.localVolume ?? 100) / 100;
              if (Math.abs(audioEl.volume - vol) > 0.01) audioEl.volume = vol;
              
              // Mute logic: User muted OR Deafened OR (Self - unlikely here as removed from list)
              const shouldMute = userState.isMuted || isDeafened;
              if (audioEl.muted !== shouldMute) audioEl.muted = shouldMute;
          }
      }
    });
  }, [remoteAudioTracks, voiceStates, isDeafened, outputDeviceId]);

  return (
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
  );
};

export default VoiceManager;