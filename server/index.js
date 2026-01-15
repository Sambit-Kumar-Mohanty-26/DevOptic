import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const CLERK_ISSUER = process.env.CLERK_ISSUER_URL;

app.use(cors({
  origin: FRONTEND_ORIGIN,
  methods: ["GET", "POST"],
  credentials: true
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true
  }
});

const sessionState = {};

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error: No token provided"));
  const decoded = jwt.decode(token, { complete: true });

  if (!decoded || !decoded.payload || !decoded.payload.iss) {
    console.error("Auth Failed: Could not decode token issuer");
    return next(new Error("Authentication error: Malformed token"));
  }

  if (CLERK_ISSUER && !decoded.payload.iss.startsWith(CLERK_ISSUER)) {
     console.error(`Blocked malicious issuer: ${decoded.payload.iss}`);
     return next(new Error("Authentication error: Invalid Issuer"));
  }

  const client = jwksClient({
    jwksUri: `${decoded.payload.iss}/.well-known/jwks.json`,
    cache: true,
    rateLimit: true
  });

  const getKey = (header, callback) => {
    client.getSigningKey(header.kid, function (err, key) {
      if (err) {
        console.error("JWKS Fetch Error:", err.message);
        return callback(err);
      }
      const signingKey = key.publicKey || key.rsaPublicKey;
      callback(null, signingKey);
    });
  };

  jwt.verify(token, getKey, { algorithms: ['RS256'] }, (err, verifiedDecoded) => {
    if (err) {
      console.error("Token Verification Failed:", err.message);
      return next(new Error("Authentication error: Invalid token"));
    }
    socket.user = verifiedDecoded;
    next();
  });
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id} (User: ${socket.user?.sub})`);

  socket.on('join-session', (sessionId) => {
    if (!sessionId || typeof sessionId !== 'string') return;
    socket.join(sessionId);
    console.log(`User ${socket.id} joined room: ${sessionId}`);

    if (!sessionState[sessionId]) sessionState[sessionId] = { guestSocketId: null, controllerSocketId: null };

    const currentGuest = sessionState[sessionId]?.guestSocketId;
    if (currentGuest) {
      socket.emit('role:state', { guestTaken: true, guestId: currentGuest });
    } else {
      socket.emit('role:state', { guestTaken: false, guestId: null });
    }
  });

  // --- Role Management ---
  socket.on('role:claim-guest', (sessionId) => {
    if (!sessionState[sessionId]) sessionState[sessionId] = {};

    // If already taken by someone else
    if (sessionState[sessionId].guestSocketId && sessionState[sessionId].guestSocketId !== socket.id) {
      socket.emit('role:error', 'Guest role is already taken by another user.');
      return;
    }

    // Grant Role
    sessionState[sessionId].guestSocketId = socket.id;

    io.to(sessionId).emit('role:update', {
      role: 'guest',
      status: 'taken',
      userId: socket.id
    });

    // Confirm to sender
    socket.emit('role:granted', 'guest');
  });

  socket.on('role:release-guest', (sessionId) => {
    if (sessionState[sessionId]?.guestSocketId === socket.id) {
      delete sessionState[sessionId].guestSocketId;

      // Broadcast to everyone: "Guest role is now FREE"
      io.to(sessionId).emit('role:update', {
        role: 'guest',
        status: 'free',
        userId: null
      });
    }
  });


  const relay = (event) => (data) => socket.to(data.sessionId).emit(event, data);
  const relayObj = (event) => (data) => socket.to(data.sessionId).emit(event, data.object);
  const relayId = (event) => (data) => socket.to(data.sessionId).emit(event, data.objectId);

  socket.on('cursor:down', relay('cursor:down'));
  socket.on('cursor:move', relay('cursor:move'));
  socket.on('cursor:up', relay('cursor:up'));

  socket.on('draw:add', relayObj('draw:add'));
  socket.on('draw:remove', relayId('draw:remove'));
  socket.on('canvas:clear', (sessionId) => socket.to(sessionId).emit('canvas:clear'));

  // --- SESSION RECORDING (RRWEB) ---
  socket.on('rrweb:event', relay('rrweb:event'));

  // --- LATE JOINER SNAPSHOT LOGIC ---
  socket.on('rrweb:request-snapshot', (sessionId) => {
    console.log(`[RRWEB] User ${socket.id} requesting snapshot for ${sessionId}`);
    const guestId = sessionState[sessionId]?.guestSocketId;
     if (guestId) {
        io.to(guestId).emit('rrweb:request-snapshot', { requestorId: socket.id });
     } else {
        // Fallback broadcast if state missing
        socket.to(sessionId).emit('rrweb:request-snapshot', { requestorId: socket.id });
     }
  });

  socket.on('rrweb:snapshot', (data) => {
    console.log(`[RRWEB] Relaying snapshot to ${data.targetId}`);
    io.to(data.targetId).emit('rrweb:snapshot', data);
  });

  // --- CONSOLE STREAMING ---
  socket.on('console:log', relay('console:log'));
  socket.on('console:warn', relay('console:warn'));
  socket.on('console:error', relay('console:error'));
  socket.on('console:info', relay('console:info'));

  // --- WEBRTC SIGNALING ---
  socket.on('webrtc:offer', relay('webrtc:offer'));
  socket.on('webrtc:answer', relay('webrtc:answer'));
  socket.on('webrtc:ice-candidate', relay('webrtc:ice-candidate'));
  socket.on('webrtc:stop', relay('webrtc:stop'));
  socket.on('webrtc:request-stream', relay('webrtc:request-stream'));

  // --- NETWORK TAB STREAMING ---
  socket.on('network:request', relay('network:request'));

  // --- REMOTE CONTROL ---
  socket.on('control:grant', (data) => {
     // Only the current Guest can grant control
     if (sessionState[data.sessionId]?.guestSocketId === socket.id) {
         sessionState[data.sessionId].controllerSocketId = data.targetUserId;
         io.to(data.sessionId).emit('control:grant', data);
         console.log(`Control granted to ${data.targetUserId} in ${data.sessionId}`);
     }
  });

  //  Guest Revokes Control
  socket.on('control:revoke', (data) => {
     if (sessionState[data.sessionId]?.guestSocketId === socket.id) {
         sessionState[data.sessionId].controllerSocketId = null;
         io.to(data.sessionId).emit('control:revoke', data);
     }
  });

  // Host Sends Control Commands (Cursor/Scroll/Click)
  // We check if the sender is the authorized controller
  socket.on('control:cursor', (data) => {
      const authorizedController = sessionState[data.sessionId]?.controllerSocketId;
      
      if (socket.id === authorizedController) {
          socket.to(data.sessionId).emit('control:cursor', data);
      } else {
          console.warn(`Unauthorized control attempt from ${socket.id}`);
      }
  });

  socket.on('control:request', relay('control:request'));
  socket.on('control:deny', relay('control:deny'));

  // --- MAGIC BRUSH SYNC ---
  socket.on('magic:highlight', relay('magic:highlight'));
  socket.on('magic:clear', relay('magic:clear'));

  // --- SCROLL SYNC ---
  socket.on('pixel:scroll', relay('pixel:scroll'));
  socket.on('pixel:mode', relay('pixel:mode'));
  socket.on('privacy:sync', (data) => socket.to(data.sessionId).emit('privacy:sync', data));
  socket.on('rrweb:batch', relay('rrweb:batch'));

  // --- MODE SYNC (Guest -> Host) ---
  socket.on('mode:switch', (data) => {
    console.log(`[MODE] User ${socket.id} switched to ${data.mode} in session ${data.sessionId}`);
    socket.to(data.sessionId).emit('mode:switch', data);
  });

  socket.on('disconnect', () => {
    for (const [sessionId, state] of Object.entries(sessionState)) {
      if (state.guestSocketId === socket.id) {
        state.guestSocketId = null;
        state.controllerSocketId = null;
        io.to(sessionId).emit('role:update', {
          role: 'guest',
          status: 'free',
          userId: null
        });
        console.log(`Guest ${socket.id} disconnected, role freed for session ${sessionId}`);
      }
       if (state.controllerSocketId === socket.id) {
        state.controllerSocketId = null;
       }
    }
    console.log('User disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Secure Server running on port ${PORT}`);
});