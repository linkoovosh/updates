import { audioProcessor } from './AudioProcessor';

type ConnectionStateCallback = (state: RTCIceConnectionState, userId: string) => void;
type LocalStreamCallback = (stream: MediaStream) => void;
type AudioLevelCallback = (level: number) => void;
type RemoteTrackRemovedCallback = (userId: string, metadata?: any) => void;

class WebRTCService {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private bufferedIceCandidates: Map<string, RTCIceCandidate[]> = new Map(); // NEW: Buffer for ICE candidates
  
  // Legacy VAD internals (Moved to AudioProcessor, but we need volume for UI)
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private vadInterval: number | null = null;

  private onTrackCallbacks: Set<(stream: MediaStream, userId: string, metadata?: any) => void> = new Set();
  private onTrackRemovedCallbacks: Set<RemoteTrackRemovedCallback> = new Set();
  private onConnectionStateChangeCallbacks: Set<ConnectionStateCallback> = new Set();
  public onLocalStreamCallbacks: Set<LocalStreamCallback> = new Set();
  private onAudioLevelCallbacks: Set<AudioLevelCallback> = new Set();

  constructor() {}

  public setLocalStream(stream: MediaStream | null) {
    this.localStream = stream;
    if (stream) {
      this.onLocalStreamCallbacks.forEach(cb => cb(stream));
    }
  }

  // 1. Get local media stream with processing
  public async startLocalStream(audioConstraints?: MediaTrackConstraints, volume: number = 100, threshold: number = 10): Promise<MediaStream> {
    // Stop old tracks but KEEP context
    this.stopLocalStream();
    
    // Update Processor Settings
    audioProcessor.setVadThreshold(threshold);
    
    console.log('[WebRTC] Requesting new media stream...');

    const constraints = {
      audio: {
          ...audioConstraints,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          // @ts-ignore
          googNoiseSuppression: true,
          googExperimentalNoiseSuppression: true,
      },
      video: false,
    };

    try {
        const rawStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('[WebRTC] Raw stream acquired:', rawStream.id);
        
        // Pass through MurClear AI Processor
        const processedStream = await audioProcessor.processStream(rawStream);
        this.localStream = processedStream;

        // --- UI Visualization Only ---
        if (!this.audioContext) {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            this.audioContext = new AudioContextClass();
        }
        
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        this.sourceNode = this.audioContext.createMediaStreamSource(processedStream);
        this.analyserNode = this.audioContext.createAnalyser();
        this.sourceNode.connect(this.analyserNode);
        this.analyserNode.fftSize = 512;
        
        this.startVisualizationLoop();

        console.log(`WebRTCService: Stream processed. Notifying listeners.`);
        this.onLocalStreamCallbacks.forEach(cb => cb(this.localStream!));

        return this.localStream;

    } catch (err) {
        console.error("Error starting local stream:", err);
        throw err;
    }
  }

  private startVisualizationLoop() {
      if (this.vadInterval) clearInterval(this.vadInterval);
      const dataArray = new Uint8Array(this.analyserNode!.frequencyBinCount);

      this.vadInterval = window.setInterval(() => {
          if (!this.analyserNode) return;
          this.analyserNode.getByteFrequencyData(dataArray);
          
          let sum = 0;
          for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const average = sum / dataArray.length;
          const normalizedVolume = (average / 255) * 100;
          
          this.onAudioLevelCallbacks.forEach(cb => cb(normalizedVolume));
      }, 50);
  }
  
  public onAudioLevel(callback: AudioLevelCallback) {
      this.onAudioLevelCallbacks.add(callback);
      return () => this.onAudioLevelCallbacks.delete(callback);
  }

  public updateAudioSettings(volume: number, threshold: number) {
      // Update Processor VAD
      audioProcessor.setVadThreshold(threshold);
      // Volume is handled UI-side or via Gain if implemented later
  }

  public muteLocalStream(muted: boolean) {
      if (this.localStream) {
          this.localStream.getAudioTracks().forEach(track => {
              track.enabled = !muted;
          });
      }
  }

  private stopLocalStream() {
      if (this.vadInterval) {
          clearInterval(this.vadInterval);
          this.vadInterval = null;
      }
      if (this.localStream) {
          // IMPORTANT: Check if this stream is the global processor output.
          // If it is, we DON'T stop its tracks, we just nullify the reference.
          if (this.localStream === audioProcessor.outputStream) {
              console.log('[WebRTC] Detaching from global processor stream (keeping tracks alive)');
          } else {
              this.localStream.getTracks().forEach(track => {
                  track.stop();
                  console.log(`[WebRTC] Stopped track: ${track.label}`);
              });
              
              if ((this.localStream as any).originalTracks) {
                  (this.localStream as any).originalTracks.forEach((t: MediaStreamTrack) => {
                      t.stop();
                      console.log(`[WebRTC] Stopped original track: ${t.label}`);
                  });
              }
          }
          this.localStream = null;
      }
      // Note: We keep this.audioContext ALIVE to avoid expensive re-initialization 
      // and potential hardware access issues. We only disconnect nodes.
      if (this.sourceNode) {
          this.sourceNode.disconnect();
          this.sourceNode = null;
      }
  }

  // 2. Create a peer connection for a given user
  public createPeerConnection(userId: string, onIceCandidate: (candidate: RTCIceCandidate) => void): RTCPeerConnection {
    // Close existing connection if any
    if (this.peerConnections.has(userId)) {
      this.peerConnections.get(userId)?.close();
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: [
        {
          urls: 'stun:stun.l.google.com:19302', // A public STUN server
        },
      ],
    });

    // Add local stream tracks
    if (this.localStream) {
      console.log('Adding local tracks to peer connection:', this.localStream.getTracks());
      this.localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, this.localStream!);
      });
    } else {
        console.warn('No local stream available to add to peer connection!');
    }

    // Handle incoming tracks
    peerConnection.ontrack = (event) => {
      console.log(`Received remote track from ${userId}`, event.streams[0]);
      // Standard WebRTC p2p usually implies mic/cam, but we can assume 'mic'/'webcam' default
      this.onTrackCallbacks.forEach(cb => cb(event.streams[0], userId, { source: 'p2p' }));
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        onIceCandidate(event.candidate);
      }
    };

    // ** NEW: Handle connection state changes **
    peerConnection.oniceconnectionstatechange = () => {
      const state = peerConnection.iceConnectionState;
      console.log(`ICE connection state for ${userId} changed to: ${state}`);
      this.onConnectionStateChangeCallbacks.forEach(cb => cb(state, userId));
    };

    this.peerConnections.set(userId, peerConnection);
    return peerConnection;
  }

  // NEW: Add a candidate to the buffer
  public addBufferedIceCandidate(userId: string, candidate: RTCIceCandidate) {
    if (!this.bufferedIceCandidates.has(userId)) {
      this.bufferedIceCandidates.set(userId, []);
    }
    this.bufferedIceCandidates.get(userId)?.push(candidate);
    console.log(`Buffered ICE candidate for ${userId}. Total: ${this.bufferedIceCandidates.get(userId)?.length}`);
  }

  // NEW: Drain buffered candidates for a user
  public async drainIceCandidates(userId: string) {
    const peerConnection = this.peerConnections.get(userId);
    const candidates = this.bufferedIceCandidates.get(userId);

    if (peerConnection && peerConnection.remoteDescription && candidates) {
      console.log(`Draining ${candidates.length} buffered ICE candidates for ${userId}`);
      for (const candidate of candidates) {
        try {
          await peerConnection.addIceCandidate(candidate);
        } catch (e) {
          console.error(`Error adding buffered ICE candidate for ${userId}:`, e);
        }
      }
      this.bufferedIceCandidates.delete(userId); // Clear buffer after draining
    } else if (candidates) {
      console.warn(`Cannot drain ICE candidates for ${userId}. Remote description not set yet or peer connection not found.`);
    }
  }

  // Override closePeerConnection to clear buffer
  public closePeerConnection(userId: string) {
    this.peerConnections.get(userId)?.close();
    this.peerConnections.delete(userId);
    this.bufferedIceCandidates.delete(userId); // Clear any buffered candidates too
    console.log(`Closed peer connection for ${userId}`);
  }
  
  // Override closeAllConnections to clear all buffers
  public closeAllConnections() {
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    this.bufferedIceCandidates.clear(); // Clear all buffered candidates
    this.stopLocalStream();
    console.log('All WebRTC connections closed and stream stopped.');
  }

  // 5. Register a callback for when a remote track is received
  public onRemoteTrack(callback: (stream: MediaStream, userId: string, metadata?: any) => void) {
    this.onTrackCallbacks.add(callback);
    return () => this.onTrackCallbacks.delete(callback); // Return a function to unregister
  }

  // Helper to inject tracks from SFU (Mediasoup)
  public injectRemoteTrack(stream: MediaStream, userId: string, metadata?: any) {
      console.log(`WebRTCService: Injecting remote track from SFU for ${userId}`, metadata);
      this.onTrackCallbacks.forEach(cb => cb(stream, userId, metadata));
  }

  // Notify listeners that a remote track was removed
  public removeRemoteTrack(userId: string, metadata?: any) {
      console.log(`WebRTCService: Removing remote track for ${userId}`, metadata);
      this.onTrackRemovedCallbacks.forEach(cb => cb(userId, metadata));
  }

  // Register a callback for when a remote track is removed
  public onRemoteTrackRemoved(callback: RemoteTrackRemovedCallback) {
      this.onTrackRemovedCallbacks.add(callback);
      return () => this.onTrackRemovedCallbacks.delete(callback);
  }

  // ** NEW: Register a callback for connection state changes **
  public onConnectionStateChange(callback: ConnectionStateCallback) {
    this.onConnectionStateChangeCallbacks.add(callback);
    return () => this.onConnectionStateChangeCallbacks.delete(callback);
  }

  // ** NEW: Register a callback for local stream **
  public onLocalStream(callback: LocalStreamCallback) {
    console.log('WebRTCService: Adding local stream listener');
    this.onLocalStreamCallbacks.add(callback);
    // If stream already exists, call immediately
    if (this.localStream) {
        callback(this.localStream);
    }
    return () => this.onLocalStreamCallbacks.delete(callback);
  }

  public getPeerConnection(userId: string): RTCPeerConnection | undefined {
    return this.peerConnections.get(userId);
  }
}

// Export a singleton instance
export const webRTCService = new WebRTCService();