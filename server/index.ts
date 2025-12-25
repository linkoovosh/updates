import { WebSocketServer, WebSocket } from 'ws';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import express from 'express';
import cors from 'cors';
import multer from 'multer';

// Add a custom serializer for BigInt to JSON.stringify
(BigInt.prototype as any).toJSON = function() {
  return this.toString();
};

import {
  C2S_MSG_TYPE,
  S2C_MSG_TYPE,
  WebSocketMessage,
  ChannelMessage, // Изменено с Message
  Server,
  Channel,
  User,
  SendMessagePayload,
  CreateServerPayload,
  CreateChannelPayload,
  RegisterPayload,
  LoginPayload,
  LoginWithTokenPayload,
  AuthSuccessPayload,
  AuthErrorPayload,
  UpdateProfilePayload,
  UpdateStatusPayload,
  UpdateServerProfilePayload,
  WebRtcJoinVoiceChannelPayload,
  WebRtcLeaveVoiceChannelPayload,
  WebRtcOfferPayload,
  WebRtcAnswerPayload,
  WebRtcIceCandidatePayload,
  NewMessagePayload,
  InitialStatePayload,
  ServerCreatedPayload,
  ServerUpdatedPayload,
  ServerDeletedPayload,
  ChannelCreatedPayload,
  DeleteServerPayload,
  UpdateServerPayload,
  WebRtcUserJoinedVoiceChannelPayload,
  WebRtcUserLeftVoiceChannelPayload,
  WebRtcExistingMembersPayload,
  WebRtcOfferPayloadS2C,
  WebRtcAnswerPayloadS2C,
  WebRtcIceCandidatePayloadS2C,
  UserUpdatedPayload,
  PresenceUpdatePayload,
  AddFriendPayload,
  AcceptFriendRequestPayload,
  RejectFriendRequestPayload,
  RemoveFriendPayload,
  FriendRequestSentPayload,
  FriendRequestReceivedPayload,
  FriendsListPayload,
  FriendRequestAcceptedPayload,
  FriendRequestRejectedPayload,
  FriendRemovedPayload,
  CreateInvitePayload,
  GetInvitesPayload,
  DeleteInvitePayload,
  InviteCreatedPayload,
  InvitesListPayload,
  Invite,
  SetSelectedServerPayload,
  LeaveServerPayload,
  ServerMembersPayload,
  InviteFriendsToServerPayload,
  SendDmPayload,
  ReceiveDmPayload,
  GetDmHistoryPayload, DmHistoryPayload, DirectMessage, // Изменено с DmMessage
  EditMessagePayload, DeleteMessagePayload, MessageUpdatedPayload, MessageDeletedPayload, // New Types
  CallRequestPayload, CallResponsePayload, CallHangupPayload, IncomingCallPayload, S2CCallResponsePayload, CallEndedPayload,
  ChangePasswordPayload, VerifyEmailPayload, ResendVerificationCodePayload, VerificationRequiredPayload,
  GetChannelMessagesPayload, ChannelMessagesPayload, MarkChannelReadPayload,
  StartSharedBrowserPayload, StopSharedBrowserPayload, SharedBrowserInputPayload, SharedBrowserStartedPayload, SharedBrowserStoppedPayload,
  TypingPayload // NEW
} from '../murchat/common/types.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { prisma, connectPrisma, disconnectPrisma } from './prisma.js'; // UPDATED
import { mediasoupManager } from './mediasoup-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const app = express();

// Enable CORS for file uploads
app.use(cors());
app.use(express.json({ limit: '2560mb' }));
app.use(express.urlencoded({ limit: '2560mb', extended: true }));

// Serve static files from uploads
app.use('/uploads', express.static(uploadDir));

// Multer Config
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        // Generate unique filename: timestamp + uuid + extension
        const uniqueSuffix = Date.now() + '-' + uuidv4();
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 2560 * 1024 * 1024 } // 2.5 GB limit
});

// File Upload Endpoint
app.post('/upload', async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }
    const token = authHeader.split(' ')[1];
    
    try {
        const user = await prisma.user.findFirst({ where: { token: token } });
        if (!user) {
            return res.status(403).json({ error: 'Unauthorized: Invalid token' });
        }
        next();
    } catch (err) {
        console.error('Auth check failed:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Construct public URL (assuming server is accessible via the same host)
    // Client should prepend server URL if needed, or we return relative path
    const fileUrl = `/uploads/${req.file.filename}`;
    
    res.json({ 
        url: fileUrl, 
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
    });
});

// --- LOGS UPLOAD SETUP ---
const logsDir = path.join(process.cwd(), 'client_logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Log Upload Endpoint
app.post('/api/upload-log', express.json({ limit: '50mb' }), (req, res) => {
    const { filename, content } = req.body;
    
    if (!filename || !content) {
        return res.status(400).json({ error: 'Missing filename or content' });
    }

    // Sanitize filename to prevent directory traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(logsDir, safeFilename);

    // Append to file (or create if new)
    fs.appendFile(filePath, content + '\n', (err) => {
        if (err) {
            console.error('Error writing log file:', err);
            return res.status(500).json({ error: 'Failed to write log' });
        }
        console.log(`[LOG] Saved client log: ${safeFilename}`);
        res.json({ success: true });
    });
});

// Support Ticket Endpoint
const supportDir = path.join(process.cwd(), 'help');
if (!fs.existsSync(supportDir)) {
    fs.mkdirSync(supportDir, { recursive: true });
}

app.post('/api/support', upload.single('screenshot'), async (req, res) => {
    const { username, description, userId } = req.body;
    
    if (!description) {
        return res.status(400).json({ error: 'Description is required' });
    }

    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeUsername = (username || 'Anonymous').replace(/[^a-z0-9]/gi, '_');
        const folderName = `${safeUsername}_${timestamp}`;
        const ticketDir = path.join(supportDir, folderName);

        // Create folder for this ticket
        if (!fs.existsSync(ticketDir)) {
            fs.mkdirSync(ticketDir, { recursive: true });
        }

        // Save description
        const problemFile = path.join(ticketDir, 'problem.txt');
        const fileContent = `User: ${username} (ID: ${userId})\nDate: ${new Date().toLocaleString()}\n\nProblem Description:\n${description}`;
        
        fs.writeFileSync(problemFile, fileContent, 'utf8');

        // Move uploaded file if exists
        if (req.file) {
            const tempPath = req.file.path;
            const targetPath = path.join(ticketDir, req.file.originalname);
            
            // Rename (move) file
            fs.renameSync(tempPath, targetPath);
        }

        console.log(`[SUPPORT] New ticket created: ${folderName}`);
        res.json({ success: true });

    } catch (error) {
        console.error('Failed to create support ticket:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Basic root handler
app.get('/', (req, res) => {
    res.send('MurCHAT Server is running');
});

// Load Certificates
const certPath = path.join(process.cwd(), 'certs');
let httpsServer;

try {
    console.log(`Loading certificates from: ${certPath}`);
    const privateKey = fs.readFileSync(path.join(certPath, 'key.pem'), 'utf8');
    const certificate = fs.readFileSync(path.join(certPath, 'cert.pem'), 'utf8');
    const credentials = { key: privateKey, cert: certificate };
    
    // Pass Express 'app' to handle requests
    httpsServer = https.createServer(credentials, app);
    httpsServer.listen(22822, '0.0.0.0', () => {
        console.log('Secure WebSocket (WSS) & HTTPS Server started on 0.0.0.0:22822');
        
        // --- START MEDIASOUP ---
        mediasoupManager.init().catch(e => console.error("Mediasoup auto-init failed:", e));
    });
} catch (err) {
    console.error('CRITICAL ERROR: Failed to load SSL certificates.', err);
    console.error('Please ensure "certs/key.pem" and "certs/cert.pem" exist in the server root.');
    process.exit(1);
}

const wss = new WebSocketServer({
  server: httpsServer
});

import { 
    clients, 
    userConnections, 
    clientStates, 
    voiceChannels, 
    activeBrowsers, 
    peerMediasoupData,
    SharedBrowserState,
    PeerMediasoupData 
} from './state.js';

// Helper functions
async function getVoiceStates() {
    const states: { userId: string; channelId: string; username?: string; userAvatar?: string }[] = [];
    
    for (const [channelId, members] of voiceChannels.entries()) {
        const users = await prisma.user.findMany({
            where: {
                id: {
                    in: Array.from(members)
                }
            },
            select: {
                id: true,
                username: true,
                avatar: true
            }
        });

        users.forEach(user => {
            states.push({
                userId: user.id,
                channelId,
                username: user.username,
                userAvatar: user.avatar || undefined
            });
        });
    }
    return states;
}

function generateDiscriminator(): string {
    let disc: string;
    do {
        disc = Math.floor(1000 + Math.random() * 9000).toString(); // Ensure 4 digits, not '0000'
    } while (disc === '0000');
    return disc;
}

async function getUserServers(userId: string) {
    // Fetch servers where user is a member OR server is public
    const userServers = await prisma.server.findMany({
        where: {
            OR: [
                { members: { some: { userId: userId } } }, // User is a member
                { isPublic: true } // Server is public
            ]
        }
    });
    return userServers;
}

// Load email template
const verificationEmailTemplate = fs.readFileSync(path.join(process.cwd(), 'emailTemplates', 'verificationCode.html'), 'utf8');

// Load murchat.ico and convert to Base64
const murchatIconPath = path.join(process.cwd(), '..', 'public', 'murchat.ico');
let murchatIconBase64 = "https://lh3.googleusercontent.com/a-/ALV-UjXXixsPT7S50HzxmbFn0p1jcDlyDaBQKONr_RLULJDonpDgKQE=s40-p"; // Use provided public URL
try {
    // Original Base64 generation, kept in case of fallback or future use
    // murchatIconBase64 = `data:image/x-icon;base64,${fs.readFileSync(murchatIconPath).toString('base64')}`;
    // console.log('murchatIconBase64 (first 100 chars):', murchatIconBase64.substring(0, 100));
} catch (e) {
    console.error("Failed to read murchat.ico (using public URL instead):", e);
}


// --- EMAIL SETUP ---
// You MUST replace with your actual SMTP settings for real email sending.
// Example: Gmail (requires app password if 2FA is enabled)
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', // For Gmail
    port: 587, // Try 587 (STARTTLS)
    secure: false, // Use false for 587
    auth: {
        user: 'mursuportstop@gmail.com', // Your Gmail address
        pass: 'upyc yhnr piee ahxx'    // Your Gmail App Password (NOT your regular password)
    }
});

async function sendVerificationCode(email: string, code: string, username: string) { // Added username
    console.log(`[EMAIL] Attempting to send verification code to ${email}: ${code}`);
    console.log(`[DEBUG] Verification Code for ${email}: ${code}`); // DEBUG LOG
    
    // Replace placeholders in HTML template
    let htmlContent = verificationEmailTemplate
        .replace(/{{username}}/g, username)
        .replace(/{{code}}/g, code)
        .replace(/{{murchat_icon_base64}}/g, murchatIconBase64);

    try {
        await transporter.sendMail({
            from: '"MurCHAT Verification" <mursuportstop@gmail.com>',
            to: email,
            subject: 'Ваш код подтверждения MurCHAT',
            html: htmlContent
        });
        console.log(`[EMAIL] Verification code sent to ${email}`);
    } catch (e) {
        console.error(`[EMAIL ERROR] Failed to send email to ${email}:`, e);
    }
}


import { handleAuthMessage } from './handlers/authHandler.js';
import { handleMessageMessage } from './handlers/messageHandler.js';
import { handleServerMessage } from './handlers/serverHandler.js';
import { handleWebRTCMessage } from './handlers/webrtcHandler.js';
import { handleSharedBrowserMessage } from './handlers/sharedBrowserHandler.js';
import { handleCallMessage } from './handlers/callHandler.js';
import { handleUserMessage } from './handlers/userHandler.js';
import { handleFriendMessage } from './handlers/friendHandler.js';
import { handleThemeMessage } from './handlers/themeHandler.js';

const PUBLIC_SERVER_ID = 'public-default-server'; 

// ... (existing imports)

wss.on('connection', (ws: WebSocket) => {
  const tempId = uuidv4();
  console.log(`Client connected (temp ID): ${tempId}`);

  ws.on('message', async (message: string) => {
    try {
      const parsedMessage: WebSocketMessage<unknown> = JSON.parse(message);
      // const db = getDb();

      // Delegate to Auth Handler
      if (await handleAuthMessage(ws, parsedMessage)) {
          return;
      }

      // --- System: Ping/Pong ---
      if (parsedMessage.type === C2S_MSG_TYPE.PING) {
          ws.send(JSON.stringify({ type: S2C_MSG_TYPE.PONG, payload: {} }));
      }


      // --- Authenticated Actions ---

      // --- Authenticated Actions ---
      {
        const userId = clients.get(ws);
        if (!userId) return;
        
        // We need current user info for some actions
        let currentUser = await prisma.user.findUnique({ where: { id: userId } });

        // Delegate to Friend Handler
        if (await handleFriendMessage(ws, parsedMessage, userId, currentUser)) {
            return;
        }

        // Delegate to User Handler
        if (await handleUserMessage(ws, parsedMessage, userId, currentUser)) {
            return;
        }
        
        // Delegate to Call Handler
        if (await handleCallMessage(ws, parsedMessage, userId, currentUser)) {
            return;
        }

        // Delegate to Message Handler (Chat) - CRITICAL FIX
        if (await handleMessageMessage(ws, parsedMessage, userId, currentUser)) {
            return;
        }

        // Delegate to Server Handler
        if (await handleServerMessage(ws, parsedMessage, userId, currentUser)) {
            return;
        }

        // Delegate to WebRTC Handler
        if (await handleWebRTCMessage(ws, parsedMessage, userId, currentUser)) {
            return;
        }

        // Delegate to Shared Browser Handler
        if (await handleSharedBrowserMessage(ws, parsedMessage, userId, currentUser)) {
            return;
        }

        // Delegate to Theme Handler
        if (await handleThemeMessage(ws, parsedMessage, userId, currentUser)) {
            return;
        }
      } // end authenticated block

    } catch (error) {
      console.error('Error parsing message or processing:', error);
    }
  });

  ws.on('close', async () => {
    const closedUserId = clients.get(ws);
    console.log(`Client disconnected: ${closedUserId}`);
    
    if(closedUserId) {
        // Update user status to offline in DB
        await prisma.user.update({ where: { id: closedUserId }, data: { status: 'offline' } });
        console.log(`User ${closedUserId} status set to offline.`);

        voiceChannels.forEach((members, channelId) => {
            if (members.has(closedUserId)) {
                members.delete(closedUserId);
                const leaveNotificationPayload: WebRtcUserLeftVoiceChannelPayload = { channelId, userId: closedUserId };
                const leaveNotification: WebSocketMessage<WebRtcUserLeftVoiceChannelPayload> = {
                    type: S2C_MSG_TYPE.S2C_WEBRTC_USER_LEFT_VOICE_CHANNEL,
                    payload: leaveNotificationPayload,
                };
                members.forEach(memberId => {
                    const memberWs = userConnections.get(memberId);
                    if (memberWs && memberWs.readyState === WebSocket.OPEN) {
                        memberWs.send(JSON.stringify(leaveNotification));
                    }
                });
            }
        });

        // Broadcast global VOICE_STATE_UPDATE (Left)
        const voiceStateUpdateMsg: WebSocketMessage<any> = {
            type: S2C_MSG_TYPE.S2C_VOICE_STATE_UPDATE,
            payload: { userId: closedUserId, channelId: null }
        };
        clients.forEach((_, clientWs) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify(voiceStateUpdateMsg));
            }
        });

        clients.delete(ws);
        userConnections.delete(closedUserId);
        clientStates.delete(closedUserId); // NEW: Remove client state on disconnect

        // --- MEDIASOUP CLEANUP ---
        const peerData = peerMediasoupData.get(closedUserId);
        if (peerData) {
            console.log(`[SFU] Cleaning up Mediasoup data for ${closedUserId}`);
            
            // 1. Close Producers
            peerData.producers.forEach(p => p.close());
            // 2. Close Consumers
            peerData.consumers.forEach(c => c.close());
            // 3. Close Transports (This also closes associated producers/consumers, but explicit is better)
            peerData.transports.forEach(t => t.close());
            
            peerMediasoupData.delete(closedUserId);
        }
    }
  });
});

process.on('SIGINT', async () => {
    console.log('SIGINT received. Disconnecting Prisma clients.');
    await disconnectPrisma();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Disconnecting Prisma clients.');
    await disconnectPrisma();
    process.exit(0);
});