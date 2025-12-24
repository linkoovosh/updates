import os from 'os';

export const config = {
  // Listen on all available interfaces.
  listenIp: '0.0.0.0',
  listenPort: 3016,
  
  // Mediasoup settings
  mediasoup: {
    // Number of mediasoup workers to launch.
    numWorkers: Object.keys(os.cpus()).length,
    // Mediasoup Worker settings.
    worker: {
      rtcMinPort: 40000,
      rtcMaxPort: 40030, // Restricted to match router forwarding
      logLevel: 'warn',
      logTags: [
        'info',
        'ice',
        'dtls',
        'rtp',
        'srtp',
        'rtcp',
      ],
    },
    // Mediasoup Router settings.
    router: {
      mediaCodecs: [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
          parameters: {
            useinbandfec: 1
          }
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters:
            {
              'x-google-start-bitrate': 1000
            }
        },
        {
          kind: 'video',
          mimeType: 'video/H264',
          clockRate: 90000,
          parameters:
            {
              'packetization-mode': 1,
              'profile-level-id': '42e01f',
              'level-asymmetry-allowed': 1,
              'x-google-start-bitrate': 1000
            }
        },
      ]
    },
    // Mediasoup WebRtcTransport settings
    webRtcTransport: {
      listenIps: [
        {
          ip: '0.0.0.0',
          announcedIp: '89.221.20.26' 
        },
        {
          ip: '127.0.0.1',
          announcedIp: '127.0.0.1'
        }
      ],
      minimumAvailableOutgoingBitrate: 600000,
      maxSctpMessageSize: 262144,
      maxIncomingBitrate: 1500000,
      enableUdp: true,  // RE-ENABLE UDP: Essential for real-time media
      enableTcp: true,
      preferUdp: true,  // PREFER UDP: Lower latency, better stability for audio
      initialAvailableOutgoingBitrate: 600000 
    }
  }
};