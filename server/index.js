const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    console.log(`User ${socket.id} joined room: ${sessionId}`);
  });

  socket.on('cursor:down', (data) => {
    socket.to(data.sessionId).emit('cursor:down', data);
  });

  socket.on('cursor:move', (data) => {
    socket.to(data.sessionId).emit('cursor:move', data);
  });

  socket.on('cursor:up', (data) => {
    socket.to(data.sessionId).emit('cursor:up', data);
  });

  socket.on('draw:add', (data) => {
    socket.to(data.sessionId).emit('draw:add', data.object);
  });

  socket.on('draw:remove', (data) => {
    socket.to(data.sessionId).emit('draw:remove', data.objectId);
  });

  socket.on('canvas:clear', (sessionId) => {
    socket.to(sessionId).emit('canvas:clear');
  });

  // --- RRWEB SCREEN MIRRORING (Day 10-11) ---
  socket.on('rrweb:event', (data) => {
    // Relay compressed rrweb events to other users in the session
    console.log(`[RRWEB] Received event from ${socket.id} for session ${data.sessionId}`);
    socket.to(data.sessionId).emit('rrweb:event', data);
  });

  // --- REMOTE CONSOLE STREAMING (Day 12) ---
  socket.on('console:log', (data) => {
    socket.to(data.sessionId).emit('console:log', data);
  });

  socket.on('console:warn', (data) => {
    socket.to(data.sessionId).emit('console:warn', data);
  });

  socket.on('console:error', (data) => {
    socket.to(data.sessionId).emit('console:error', data);
  });

  socket.on('console:info', (data) => {
    socket.to(data.sessionId).emit('console:info', data);
  });

  // --- WEBRTC SCREEN SHARING SIGNALING ---
  socket.on('webrtc:offer', (data) => {
    console.log(`[WebRTC] Offer from ${socket.id} for session ${data.sessionId}`);
    socket.to(data.sessionId).emit('webrtc:offer', data);
  });

  socket.on('webrtc:answer', (data) => {
    console.log(`[WebRTC] Answer from ${socket.id} for session ${data.sessionId}`);
    socket.to(data.sessionId).emit('webrtc:answer', data);
  });

  socket.on('webrtc:ice-candidate', (data) => {
    socket.to(data.sessionId).emit('webrtc:ice-candidate', data);
  });

  socket.on('webrtc:stop', (data) => {
    console.log(`[WebRTC] Stop from ${socket.id} for session ${data.sessionId}`);
    socket.to(data.sessionId).emit('webrtc:stop', data);
  });

  // --- NETWORK TAB STREAMING ---
  socket.on('network:request', (data) => {
    socket.to(data.sessionId).emit('network:request', data);
  });

  // --- REMOTE CURSOR CONTROL ---
  socket.on('control:request', (data) => {
    console.log(`[Control] Request from ${socket.id} for session ${data.sessionId}`);
    socket.to(data.sessionId).emit('control:request', data);
  });

  socket.on('control:grant', (data) => {
    console.log(`[Control] Granted by ${socket.id} for session ${data.sessionId}`);
    socket.to(data.sessionId).emit('control:grant', data);
  });

  socket.on('control:deny', (data) => {
    console.log(`[Control] Denied by ${socket.id} for session ${data.sessionId}`);
    socket.to(data.sessionId).emit('control:deny', data);
  });

  socket.on('control:revoke', (data) => {
    console.log(`[Control] Revoked by ${socket.id} for session ${data.sessionId}`);
    socket.to(data.sessionId).emit('control:revoke', data);
  });

  socket.on('control:cursor', (data) => {
    // Stream cursor position and clicks from Host to Guest
    console.log(`[Control] Cursor event from ${socket.id}:`, data.type);
    socket.to(data.sessionId).emit('control:cursor', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const INJECTED_SCRIPT = `
  <script>
    (function() {
      console.log('[DevOptic Iframe] Script loaded');
      
      // Add ripple animation style
      var style = document.createElement('style');
      style.innerHTML = \`
        html, body { margin: 0 !important; padding: 0 !important; transform: none !important; zoom: 1 !important; }
        @keyframes devoptic-ripple {
            0% { transform: scale(0); opacity: 1; }
            100% { transform: scale(2.5); opacity: 0; }
        }
      \`;
      document.head.appendChild(style);
      
      // Show click ripple at position
      function showRipple(x, y) {
        var ripple = document.createElement('div');
        ripple.style.cssText = 'position:fixed; left:'+(x-20)+'px; top:'+(y-20)+'px; width:40px; height:40px; border-radius:50%; background:rgba(139,92,246,0.6); pointer-events:none; z-index:2147483647; animation: devoptic-ripple 0.4s ease-out forwards;';
        document.body.appendChild(ripple);
        setTimeout(function() { ripple.remove(); }, 500);
      }
      
      // Handle click at position (coordinates are already relative to iframe!)
      function handleClick(x, y, button) {
        console.log('[DevOptic Iframe] CLICK at', Math.round(x), Math.round(y));
        
        var element = document.elementFromPoint(x, y);
        if (element) {
          console.log('[DevOptic Iframe] Element:', element.tagName, (element.textContent || '').slice(0,30));
          
          if (element.focus) element.focus();
          
          var opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: button || 0 };
          element.dispatchEvent(new MouseEvent('mousedown', opts));
          element.dispatchEvent(new MouseEvent('mouseup', opts));
          element.dispatchEvent(new MouseEvent('click', opts));
          
          // Native click for buttons/links
          if (element.click) { try { element.click(); } catch(e) {} }
          
          // Direct navigation for links
          if (element.tagName === 'A' && element.href) {
            console.log('[DevOptic Iframe] Navigate to:', element.href);
            window.location.href = element.href;
          }
        } else {
          console.log('[DevOptic Iframe] No element at', x, y);
        }
      }
      
      // Handle scroll
      function handleScroll(deltaX, deltaY) {
        console.log('[DevOptic Iframe] SCROLL', deltaY);
        window.scrollBy({ left: deltaX || 0, top: deltaY || 0, behavior: 'auto' });
      }
      
      // Get session ID for socket connection
      var sessionId = 'session-1';
      try {
        if (document.referrer) {
          var match = document.referrer.match(/\\/live\\/([^/?]+)/);
          if (match) sessionId = match[1];
        }
      } catch(e) {}
      
      // Load socket.io and connect for SCROLL events (scroll doesn't need coordinate transform)
      var script = document.createElement('script');
      script.src = 'https://cdn.socket.io/4.6.0/socket.io.min.js';
      script.onload = function() {
        var socket = io('http://localhost:3001', { transports: ['websocket'] });
        socket.on('connect', function() {
          console.log('[DevOptic Iframe] Socket connected');
          socket.emit('join-session', sessionId);
        });
        socket.on('control:cursor', function(data) {
          if (data.type === 'scroll') {
            handleScroll(data.deltaX, data.deltaY);
          }
          // Handle clicks
          if (data.type === 'click') {
            var x, y;
            if (data.iframeX !== undefined) {
              // Use pre-calculated iframe coords if available
              x = data.iframeX;
              y = data.iframeY;
            } else if (data.normalizedX !== undefined) {
              // Calculate from normalized coords - scale to IFRAME size directly
              // This assumes the iframe content spans the full shared area
              x = data.normalizedX * window.innerWidth;
              y = data.normalizedY * window.innerHeight;
            } else {
              return; // No usable coords
            }
            console.log('[DevOptic Iframe] Click at:', Math.round(x), Math.round(y));
            handleClick(x, y, data.button);
          }
        });
      };
      document.head.appendChild(script);
      
      // Listen for BroadcastChannel for CLICK events (has correct iframe-relative coords)
      try {
        var bc = new BroadcastChannel('devoptic-cursor');
        bc.onmessage = function(event) {
          var p = event.data;
          if (p.action === 'click') {
            console.log('[DevOptic Iframe] BroadcastChannel click:', p.x, p.y);
            handleClick(p.x, p.y, p.button);
          }
        };
      } catch(e) {}
      
      // Also listen for postMessage for CLICK events
      window.addEventListener('message', function(event) {
        if (!event.data || event.data.type !== 'DEVOPTIC_CURSOR') return;
        var p = event.data.payload;
        if (p.action === 'click') {
          console.log('[DevOptic Iframe] postMessage click:', p.x, p.y);
          handleClick(p.x, p.y, p.button);
        }
      }, false);
      
      // CSS path helper for hover inspector
      function getCssPath(el) {
        if (!(el instanceof Element)) return '';
        var path = [];
        while (el && el.nodeType === Node.ELEMENT_NODE) {
          var selector = el.nodeName.toLowerCase();
          if (el.id) { selector += '#' + el.id; path.unshift(selector); break; }
          var sib = el, nth = 1;
          while (sib = sib.previousElementSibling) { if (sib.nodeName.toLowerCase() === selector) nth++; }
          if (nth !== 1) selector += ':nth-of-type(' + nth + ')';
          path.unshift(selector);
          el = el.parentNode;
        }
        return path.join(' > ');
      }

      // 2. Main Logic: Listen for Hover and send Coordinates
      let lastTarget = null;
      document.addEventListener('DOMContentLoaded', function() {
        document.body.addEventListener('mouseover', function(e) {
          e.stopPropagation();
          if (e.target === lastTarget) return;
          lastTarget = e.target;

          // Filter out root elements that cause full-page flashes
          if (['HTML', 'BODY', 'IFRAME'].includes(e.target.tagName)) return;

          // Get coordinates relative to the VIEWPORT (Standard Mode)
          var rect = e.target.getBoundingClientRect();
          
          try {
            window.parent.postMessage({
              type: 'DEVOPTIC_HOVER',
              payload: { 
                rect: { 
                  top: rect.top, 
                  left: rect.left, 
                  width: rect.width, 
                  height: rect.height 
                }, 
                selector: getCssPath(e.target), 
                tagName: e.target.tagName 
              }
            }, '*');
          } catch(err) {}
        }, true);
      });
    })();
  </script>
`;

app.get('/api/proxy', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send('URL parameter is required');

  try {
    const response = await axios.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(response.data);
    const urlObj = new URL(targetUrl);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

    const rewrite = (tag, attr) => {
      $(tag).each((i, el) => {
        const val = $(el).attr(attr);
        if (val && !val.startsWith('http') && !val.startsWith('//') && !val.startsWith('data:')) {
          try {
            $(el).attr(attr, new URL(val, baseUrl).href);
          } catch (e) {
            console.warn('Invalid URL for rewrite:', val);
          }
        }
      });
    };
    rewrite('link', 'href');
    rewrite('script', 'src');
    rewrite('img', 'src');
    rewrite('a', 'href');

    $('head').append(INJECTED_SCRIPT);
    const html = $.html();
    const finalHtml = html.trim().toLowerCase().startsWith('<!doctype')
      ? html
      : `<!DOCTYPE html>${html}`;

    res.send(finalHtml);
  } catch (error) {
    console.error("Proxy Error:", error.message);
    res.status(500).send('Error loading the target website');
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Professional Sync Server running on http://localhost:${PORT}`);
});