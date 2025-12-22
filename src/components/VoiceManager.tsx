import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { webRTCService } from '../services/webrtc';
import { mediasoupService } from '../services/mediasoup'; 
import webSocketService from '../services/websocket';
import { updateVoiceState } from '../store/slices/voiceSlice';
import type { AppDispatch, RootState } from '../store';

interface RemoteAudioTrack {
  userId: string;
  stream: MediaStream;
}

interface AudioNodeMap {
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
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
  const selfVoiceState = authUserId ? voiceStates[authUserId] : undefined;
  const isDeafened = selfVoiceState?.isDeafened || false;

  // Ref to hold latest userId for the effect closures
  const authUserIdRef = React.useRef(authUserId);
  React.useEffect(() => {
    authUserIdRef.current = authUserId;
  }, [authUserId]);

  // Ref to hold latest voiceStates for the animation loop
  const voiceStatesRef = React.useRef(voiceStates);
  React.useEffect(() => {
      voiceStatesRef.current = voiceStates;
  }, [voiceStates]);

  // Initialize AudioContext
  React.useEffect(() => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass && !audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
    }
  }, []);

  React.useEffect(() => {
    const handleTrack = (stream: MediaStream, userId: string, metadata?: any) => {
      const currentSelfId = authUserIdRef.current;
      const isLocal = userId === currentSelfId;

      console.log(`[VoiceManager] handleTrack: userId=${userId}, isLocal=${isLocal}, source=${metadata?.source || 'mic'}`);

      if (stream.getAudioTracks().length === 0) {
          console.log(`[VoiceManager] No audio tracks for ${userId}, skipping.`);
          return;
      }

      dispatch(updateVoiceState({ userId, partialState: { isConnecting: false } }));

      if (!isLocal) {
        console.log(`[VoiceManager] Registering REMOTE audio track for user: ${userId}`);
        setRemoteAudioTracks(prevTracks => {
          const index = prevTracks.findIndex(track => track.userId === userId);
          if (index !== -1) {
              const newTracks = [...prevTracks];
              newTracks[index] = { userId, stream };
              return newTracks;
          }
          return [...prevTracks, { userId, stream }];
        });
      }

      // --- Visualizer Logic (Always connect for speaking indicator) ---
      if (!audioContextRef.current) return;
      const audioContext = audioContextRef.current;

      if (audioContext.state === 'suspended') {
          audioContext.resume();
      }

      const existingNode = audioNodesRef.current.get(userId);
      // Only re-create if the stream object actually changed
      if (existingNode && (existingNode as any).originalStream === stream) {
          return;
      }

      if (existingNode) {
        existingNode.source.disconnect();
      }
      
      // IMPORTANT: Use a CLONE for the visualizer to prevent Web Audio from hijacking 
      // the stream from the <audio> element (common Chrome bug).
      const visualizerStream = stream.clone();
      const source = audioContext.createMediaStreamSource(visualizerStream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      
      const nodeMap = { source, analyser };
      (nodeMap as any).originalStream = stream; // Tag it to avoid double-processing
      (nodeMap as any).visualizerStream = visualizerStream; // Keep reference to stop later
      audioNodesRef.current.set(userId, nodeMap);
    };

    const handleLocalStream = async (stream: MediaStream) => {
        const myUserId = authUserIdRef.current;
        console.log(`[VoiceManager] handleLocalStream (visualizer only): ${myUserId}`);
        
        if (!myUserId || !audioContextRef.current) return;
        if (stream.getAudioTracks().length === 0) return;
        
        // Resume context if suspended (browser policy)
        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }
        
        if (audioNodesRef.current.has(myUserId)) {
            const existing = audioNodesRef.current.get(myUserId);
            if ((existing as any).originalStream === stream) return;
            existing?.source.disconnect();
            // Stop tracks of the old clone
            if ((existing as any).visualizerStream) {
                (existing as any).visualizerStream.getTracks().forEach((t: any) => t.stop());
            }
        }
        
        const visualizerStream = stream.clone();
        const source = audioContextRef.current.createMediaStreamSource(visualizerStream);
        const analyser = audioContextRef.current.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        
        const nodeMap = { source, analyser };
        (nodeMap as any).originalStream = stream;
        (nodeMap as any).visualizerStream = visualizerStream;
        audioNodesRef.current.set(myUserId, nodeMap);
    };

    const handleConnectionState = (state: RTCIceConnectionState, userId: string) => {
        if (state === 'disconnected' || state === 'closed' || state === 'failed') {
            setRemoteAudioTracks(prev => prev.filter(t => t.userId !== userId));
            if (audioNodesRef.current.has(userId)) {
                audioNodesRef.current.get(userId)?.source.disconnect();
                audioNodesRef.current.delete(userId);
            }
        }
    };

    const handleTrackRemoved = (userId: string, metadata?: any) => {
        if (!metadata || metadata.source === 'mic') {
             setRemoteAudioTracks(prev => prev.filter(t => t.userId !== userId));
             if (audioNodesRef.current.has(userId)) {
                 audioNodesRef.current.get(userId)?.source.disconnect();
                 audioNodesRef.current.delete(userId);
             }
        }
    };

    // --- Mediasoup Events ---
    const onMsNewStream = ({ userId, stream, appData }: any) => {
        console.log(`[VoiceManager] MS New Stream from ${userId}`, appData);
        handleTrack(stream, userId, appData);
    };

    const onMsStreamClosed = ({ userId, appData }: any) => {
        console.log(`[VoiceManager] MS Stream Closed from ${userId}`, appData);
        handleTrackRemoved(userId, appData);
    };

    // Subscriptions
    const unsubscribeRemote = webRTCService.onRemoteTrack(handleTrack);
    const unsubscribeRemoved = webRTCService.onRemoteTrackRemoved(handleTrackRemoved);
    const unsubscribeLocal = webRTCService.onLocalStream(handleLocalStream);
    const unsubscribeState = webRTCService.onConnectionStateChange(handleConnectionState);

    mediasoupService.on('newStream', onMsNewStream);
    mediasoupService.on('streamClosed', onMsStreamClosed);

    return () => {
      unsubscribeRemote();
      unsubscribeRemoved();
      unsubscribeLocal();
      unsubscribeState();
      mediasoupService.off('newStream', onMsNewStream);
      mediasoupService.off('streamClosed', onMsStreamClosed);
    };
  }, [dispatch]);

  // Main analysis loop
  const silenceCountersRef = React.useRef<Map<string, number>>(new Map());
  const heartbeatCounterRef = React.useRef(0);

  React.useEffect(() => {
    const analyze = () => {
      heartbeatCounterRef.current++;
      
      audioNodesRef.current.forEach((nodes, userId) => {
        const userState = voiceStatesRef.current[userId];
        
        if (userState?.isMuted) {
            dispatch(updateVoiceState({ userId, partialState: { volume: 0 } }));
            return;
        }

        // Use Time Domain Data for better peak/rms calculation
        const dataArray = new Uint8Array(nodes.analyser.frequencyBinCount);
        nodes.analyser.getByteTimeDomainData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const amplitude = (dataArray[i] - 128) / 128;
          sum += amplitude * amplitude;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        
        // Subtract noise floor (approx 0.005) and scale. 
        // Anything below 0.005 RMS will now result in 0 volume.
        const cleanedRms = Math.max(0, rms - 0.005);
        const volume = Math.min(1, cleanedRms * 6); 

        if (userId === authUserIdRef.current && heartbeatCounterRef.current % 300 === 0) {
            const rawValue = dataArray[0]; // Sample value to see if it's changing
            console.log(`[VoiceManager] Heartbeat: Local volume=${volume.toFixed(4)}, CleanRMS=${cleanedRms.toFixed(4)}, RawRMS=${rms.toFixed(4)}, AudioContext=${audioContextRef.current?.state}`);
        }
        
        // --- Silence Detection (Remote Only) ---
        if (userId !== authUserIdRef.current && volume < 0.005) {
            const count = (silenceCountersRef.current.get(userId) || 0) + 1;
            silenceCountersRef.current.set(userId, count);
            if (count === 300) { // Approx 5-6 seconds at 60fps
                console.warn(`[VoiceManager] User ${userId} is sending a COMPLETELY SILENT stream. Potential permission/hardware issue on their end.`);
            }
        } else {
            silenceCountersRef.current.set(userId, 0);
        }
        
        dispatch(updateVoiceState({ userId, partialState: { volume } }));
      });
      animationFrameRef.current = requestAnimationFrame(analyze);
    };

    animationFrameRef.current = requestAnimationFrame(analyze);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      audioNodesRef.current.forEach(nodes => nodes.source.disconnect());
      audioNodesRef.current.clear();
    };
  }, [dispatch]);

  // Apply volume changes to Audio Elements
  React.useEffect(() => {
    remoteAudioTracks.forEach(({ userId, stream }) => {
      const audioEl = audioRefs.current.get(userId);
      const userState = voiceStates[userId];
      
      if (audioEl) {
          // Robust stream assignment
          if (audioEl.srcObject !== stream) {
            console.log(`[VoiceManager] FORCING stream assignment for ${userId}`);
            audioEl.srcObject = stream;
            audioEl.volume = 0; // Start at 0 to avoid pops
            audioEl.play()
                .then(() => console.log(`[VoiceManager] Playback started for ${userId}`))
                .catch(error => {
                    if (error.name !== 'NotAllowedError') {
                        console.error(`[VoiceManager] Playback FAILED for ${userId}:`, error);
                    }
                });
          }
          
          if (userState) {
              const targetVolume = isDeafened ? 0 : Math.min(1, (userState.localVolume ?? 100) / 100);
              // Use a small threshold to avoid constant updates
              if (Math.abs(audioEl.volume - targetVolume) > 0.01) {
                  audioEl.volume = targetVolume;
              }
              const shouldBeMuted = userState.isMuted || isDeafened;
              if (audioEl.muted !== shouldBeMuted) {
                  audioEl.muted = shouldBeMuted;
              }
          }
      }
    });
  }, [remoteAudioTracks, voiceStates, isDeafened]);

  // "Watchdog" effect to ensure audio keeps playing
  React.useEffect(() => {
      const interval = setInterval(() => {
          remoteAudioTracks.forEach(({ userId }) => {
              const audioEl = audioRefs.current.get(userId);
              if (audioEl) {
                  if (audioEl.paused && !isDeafened) {
                      console.log(`[VoiceManager] Watchdog: Resuming stalled audio for ${userId}`);
                      audioEl.play().catch(() => {});
                  }
                  // Check if srcObject is actually set
                  if (!audioEl.srcObject) {
                      console.warn(`[VoiceManager] Watchdog: Audio element for ${userId} has NO srcObject!`);
                  }
              }
          });
          
          // Also check AudioContext
          if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
              console.log("[VoiceManager] Watchdog: Resuming suspended AudioContext");
              audioContextRef.current.resume().catch(() => {});
          }
      }, 2000); // More aggressive: 2 seconds
      return () => clearInterval(interval);
  }, [remoteAudioTracks, isDeafened]);

  // Global Resume on ANY interaction
  React.useEffect(() => {
      const resumeAll = async () => {
          if (audioContextRef.current?.state === 'suspended') {
              await audioContextRef.current.resume();
          }
          // Try to play all known audio elements
          audioRefs.current.forEach(el => {
              if (el.paused) el.play().catch(() => {});
          });
      };
      
      window.addEventListener('mousedown', resumeAll, true);
      window.addEventListener('keydown', resumeAll, true);
      window.addEventListener('touchstart', resumeAll, true);
      
      return () => {
          window.removeEventListener('mousedown', resumeAll, true);
          window.removeEventListener('keydown', resumeAll, true);
          window.removeEventListener('touchstart', resumeAll, true);
      };
  }, []);

  return (
    <div style={{ display: 'none' }}>
      {remoteAudioTracks.map(({ userId }) => (
        <audio
          key={userId}
          ref={el => { 
              if (el) {
                  audioRefs.current.set(userId, el);
              } else {
                  audioRefs.current.delete(userId);
              }
          }}
          autoPlay
          playsInline
        />
      ))}
    </div>
  );
};

export default VoiceManager;