// src/services/webrtc.ts

type ConnectionStateCallback = (state: RTCIceConnectionState, userId: string) => void;
type LocalStreamCallback = (stream: MediaStream) => void;
type AudioLevelCallback = (level: number) => void;
type RemoteTrackRemovedCallback = (userId: string, metadata?: any) => void;

class WebRTCService {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private bufferedIceCandidates: Map<string, RTCIceCandidate[]> = new Map(); // NEW: Buffer for ICE candidates
  
  // Web Audio API nodes
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private vadInterval: number | null = null;

  private currentVolume: number = 100; // 0-200
  private currentThreshold: number = 5; // 0-100

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
    this.currentVolume = volume;
    this.currentThreshold = threshold;

    // Always stop previous stream to ensure fresh AudioContext and tracks.
    // Reusing streams causes issues with "dead" tracks or suspended AudioContexts on subsequent calls.
    if (this.localStream) {
        console.log('WebRTCService: Stopping old local stream before creating new one.');
        this.stopLocalStream();
    }
    
    console.log('Requesting new media stream with constraints:', audioConstraints);

    const constraints = {
      audio: audioConstraints || true,
      video: false,
    };

    try {
        const rawStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Debug: Inspect captured tracks
        const tracks = rawStream.getTracks();
        if (tracks.length > 0) {
             const t = tracks[0];
             console.log(`[WebRTC] Captured ${tracks.length} tracks. First track: "${t.label}" (Enabled: ${t.enabled}, Muted: ${t.muted}, ReadyState: ${t.readyState}, ID: ${t.id})`);
        } else {
             console.error("[WebRTC] Captured stream has NO tracks!");
        }

        // Initialize Web Audio Context
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // CRITICAL FIX: Ensure Context is running
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
            console.log('[WebRTC] AudioContext resumed manually. State:', this.audioContext.state);
        }

        this.sourceNode = this.audioContext.createMediaStreamSource(rawStream);
        this.gainNode = this.audioContext.createGain();
        this.analyserNode = this.audioContext.createAnalyser();
        this.destinationNode = this.audioContext.createMediaStreamDestination();

        // Configure Analyser
        this.analyserNode.fftSize = 512;
        this.analyserNode.smoothingTimeConstant = 0.4;

        // Connect Graph: Source -> Analyser (for VAD) -> Gain (Volume/Gate) -> Destination
        this.sourceNode.connect(this.analyserNode);
        this.analyserNode.connect(this.gainNode);
        this.gainNode.connect(this.destinationNode);

        // Start VAD Loop
        this.startVadLoop();

        // The processed stream is what we send to peers
        this.localStream = this.destinationNode.stream;
        
        // We need to keep the raw tracks alive too
        const originalTracks = rawStream.getAudioTracks();
        (this.localStream as any).originalTracks = originalTracks; 

        console.log(`WebRTCService: Local stream processed. Notifying ${this.onLocalStreamCallbacks.size} listeners.`);
        this.onLocalStreamCallbacks.forEach(cb => cb(this.localStream!));

        return this.localStream;

    } catch (err) {
        console.error("Error starting local stream:", err);
        throw err;
    }
  }

  private startVadLoop() {
      if (this.vadInterval) window.clearInterval(this.vadInterval);
      
      const dataArray = new Uint8Array(this.analyserNode!.frequencyBinCount);

      this.vadInterval = window.setInterval(() => {
          if (!this.analyserNode || !this.gainNode) return;

          this.analyserNode.getByteFrequencyData(dataArray);
          
          // Calculate average volume
          let sum = 0;
          for(let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
          }
          const average = sum / dataArray.length;
          
          // Normalize 0-255 to 0-100 for threshold comparison
          const normalizedVolume = (average / 255) * 100;
          
          // Emit volume for UI
          this.onAudioLevelCallbacks.forEach(cb => cb(normalizedVolume));
          
          // Apply simple VAD Gate
          const targetGain = (this.currentVolume / 100);

          if (normalizedVolume > this.currentThreshold) {
              // Open Gate (Smooth transition)
              this.gainNode.gain.setTargetAtTime(targetGain, this.audioContext!.currentTime, 0.05);
          } else {
              // Close Gate (Mute) - DISABLED FOR DEBUGGING
              // this.gainNode.gain.setTargetAtTime(0, this.audioContext!.currentTime, 0.1);
              // Keep gate open but maybe slightly lower? No, let's keep it FULL OPEN to verify mic.
              this.gainNode.gain.setTargetAtTime(targetGain, this.audioContext!.currentTime, 0.05);
          }

      }, 50); // Check every 50ms
  }
  
  public onAudioLevel(callback: AudioLevelCallback) {
      this.onAudioLevelCallbacks.add(callback);
      return () => this.onAudioLevelCallbacks.delete(callback);
  }

  public updateAudioSettings(volume: number, threshold: number) {
      this.currentVolume = volume;
      this.currentThreshold = threshold;
      // console.log(`Updated Audio Settings: Vol=${volume}, Thresh=${threshold}`);
  }

  public muteLocalStream(muted: boolean) {
      if (this.localStream) {
          this.localStream.getAudioTracks().forEach(track => {
              track.enabled = !muted;
          });
      }
      // Also update Web Audio API gain if needed (double safety)
      if (this.gainNode && this.audioContext) {
          if (muted) {
              this.gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
          } else {
              this.gainNode.gain.setValueAtTime(this.currentVolume / 100, this.audioContext.currentTime);
          }
      }
  }

  private stopLocalStream() {
      if (this.vadInterval) {
          clearInterval(this.vadInterval);
          this.vadInterval = null;
      }
      if (this.localStream) {
          this.localStream.getTracks().forEach(track => track.stop());
          if ((this.localStream as any).originalTracks) {
              (this.localStream as any).originalTracks.forEach((t: MediaStreamTrack) => t.stop());
          }
          this.localStream = null;
      }
      if (this.audioContext) {
          this.audioContext.close();
          this.audioContext = null;
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