import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { webRTCService } from '../services/webrtc';
import { mediasoupService } from '../services/mediasoup'; 
import webSocketService from '../services/websocket';
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
  gain: GainNode; // Control volume via Web Audio
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
  // Get outputDeviceId from the first selector
  const outputDeviceId = useSelector((state: RootState) => state.settings.outputDeviceId);
  
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
    audioContextRef.current = getAudioContext();
  }, []);

  React.useEffect(() => {
    const handleTrack = async (stream: MediaStream, userId: string, metadata?: any) => {
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

      // --- Web Audio API Routing (Playback + Visualizer) ---
      if (!audioContextRef.current) return;
      const audioContext = audioContextRef.current;

      await resumeAudioContext();

      const existingNode = audioNodesRef.current.get(userId);
      if (existingNode && (existingNode as any).originalStream === stream) {
          return;
      }

      if (existingNode) {
        existingNode.source.disconnect();
        existingNode.gain.disconnect();
      }
      
      // Use the stream directly. 
      // Note: connecting to 'destination' effectively plays it.
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      const gain = audioContext.createGain();
      
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      
      // Routing: Source -> Gain -> Destination (Speakers)
      //          Source -> Analyser (Visuals)
      source.connect(gain);
      source.connect(analyser);
      
      // If it's a remote user, connect to speakers.
      // If it's local user, DO NOT connect to speakers (self-loop/echo), just analyser.
      if (!isLocal) {
          gain.connect(audioContext.destination);
      } else {
          // Local user: only visuals, mute playback
          gain.gain.value = 0; 
      }
      
      const nodeMap = { source, analyser, gain };
      (nodeMap as any).originalStream = stream;
      audioNodesRef.current.set(userId, nodeMap);
    };

    const handleLocalStream = async (stream: MediaStream) => {
        // Reuse general handler, it handles isLocal logic
        handleTrack(stream, authUserIdRef.current || 'local', { source: 'mic' });
    };

    const handleConnectionState = (state: RTCIceConnectionState, userId: string) => {
        if (state === 'disconnected' || state === 'closed' || state === 'failed') {
            setRemoteAudioTracks(prev => prev.filter(t => t.userId !== userId));
            if (audioNodesRef.current.has(userId)) {
                const nodes = audioNodesRef.current.get(userId);
                nodes?.source.disconnect();
                nodes?.gain.disconnect();
                audioNodesRef.current.delete(userId);
            }
        }
    };

    const handleTrackRemoved = (userId: string, metadata?: any) => {
        if (!metadata || metadata.source === 'mic') {
             setRemoteAudioTracks(prev => prev.filter(t => t.userId !== userId));
             if (audioNodesRef.current.has(userId)) {
                 const nodes = audioNodesRef.current.get(userId);
                 nodes?.source.disconnect();
                 nodes?.gain.disconnect();
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
        const isLocal = userId === authUserIdRef.current;
        
        // 1. Calculate Visuals (RMS)
        const dataArray = new Uint8Array(nodes.analyser.frequencyBinCount);
        nodes.analyser.getByteTimeDomainData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const amplitude = (dataArray[i] - 128) / 128;
          sum += amplitude * amplitude;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const cleanedRms = Math.max(0, rms - 0.002); // Lower noise floor for visuals
        const visualVolume = Math.min(1, cleanedRms * 6); 

        // 2. Control Playback Volume (GainNode)
        if (nodes.gain) {
            let playbackVolume = 1.0;
            
            if (isLocal || (userState?.isMuted) || isDeafened) {
                playbackVolume = 0;
            } else if (userState?.localVolume !== undefined) {
                playbackVolume = userState.localVolume / 100;
            }
            
            // Smooth volume transition
            nodes.gain.gain.setTargetAtTime(playbackVolume, audioContextRef.current!.currentTime, 0.1);
        }

        if (userId === authUserIdRef.current && heartbeatCounterRef.current % 300 === 0) {
            console.log(`[VoiceManager] Heartbeat: Local volume=${visualVolume.toFixed(4)}, CleanRMS=${cleanedRms.toFixed(4)}, RawRMS=${rms.toFixed(4)}, AudioContext=${audioContextRef.current?.state}`);
        }
        
        dispatch(updateVoiceState({ userId, partialState: { volume: visualVolume } }));
      });
      animationFrameRef.current = requestAnimationFrame(analyze);
    };

    animationFrameRef.current = requestAnimationFrame(analyze);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      audioNodesRef.current.forEach(nodes => {
          nodes.source.disconnect();
          nodes.gain.disconnect();
      });
      audioNodesRef.current.clear();
    };
  }, [dispatch]);

  const { inputDeviceId, vadThreshold } = useSelector((state: RootState) => state.settings);

  // --- NEW: Sync AudioContext Output Device ---
  React.useEffect(() => {
      const ctx = audioContextRef.current;
      if (ctx && outputDeviceId && (ctx as any).setSinkId) {
          console.log(`[VoiceManager] Switching AudioContext output to: ${outputDeviceId}`);
          (ctx as any).setSinkId(outputDeviceId)
              .then(() => console.log(`[VoiceManager] AudioContext output updated successfully.`))
              .catch((err: any) => console.error(`[VoiceManager] Failed to set AudioContext output:`, err));
      }
  }, [outputDeviceId]);

  // HTML Audio Elements (Fallback + SinkID)
  // We MUTE these because we are playing audio via WebAudio API above.
  // But we keep them because 'setSinkId' works best on HTMLAudioElements in Electron/Chrome.
  React.useEffect(() => {
    remoteAudioTracks.forEach(({ userId, stream }) => {
      const audioEl = audioRefs.current.get(userId);
      
      if (audioEl) {
          // Ensure it's playing (even if muted) to keep the stream alive
          if (audioEl.srcObject !== stream) {
            audioEl.srcObject = stream;
            audioEl.muted = true; // IMPORTANT: Mute to avoid echo/double audio
            audioEl.play().catch(e => console.error("AudioEl play error", e));
          }

          // Apply Output Device preference
          if (outputDeviceId && (audioEl as any).setSinkId) {
              if ((audioEl as any).sinkId !== outputDeviceId) {
                  console.log(`[VoiceManager] Setting output device for ${userId} to ${outputDeviceId}`);
                  (audioEl as any).setSinkId(outputDeviceId)
                      .catch((e: any) => console.error("Failed to set sinkId:", e));
              }
          }
      }
    });
  }, [remoteAudioTracks, outputDeviceId]); // Added outputDeviceId dependency

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