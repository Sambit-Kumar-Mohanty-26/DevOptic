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

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error: No token provided"));
  const decoded = jwt.decode(token, { complete: true });
  
  if (!decoded || !decoded.payload || !decoded.payload.iss) {
      console.error("Auth Failed: Could not decode token issuer");
      return next(new Error("Authentication error: Malformed token"));
  }

  const client = jwksClient({
    jwksUri: `${decoded.payload.iss}/.well-known/jwks.json`,
    cache: true,
    rateLimit: true
  });

  const getKey = (header, callback) => {
    client.getSigningKey(header.kid, function(err, key) {
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
    socket.to(sessionId).emit('rrweb:request-snapshot', { requestorId: socket.id });
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
  socket.on('control:request', relay('control:request'));
  socket.on('control:grant', relay('control:grant'));
  socket.on('control:deny', relay('control:deny'));
  socket.on('control:revoke', relay('control:revoke'));
  socket.on('control:cursor', relay('control:cursor'));

  socket.on('disconnect', () => console.log('User disconnected:', socket.id));
});

server.listen(PORT, () => {
  console.log(`🚀 Secure Server running on port ${PORT}`);
});