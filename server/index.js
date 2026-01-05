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

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const INJECTED_SCRIPT = `
  <script>
    (function() {
      function getCssPath(el) {
        if (!(el instanceof Element)) return;
        var path = [];
        while (el.nodeType === Node.ELEMENT_NODE) {
            var selector = el.nodeName.toLowerCase();
            if (el.id) { selector += '#' + el.id; path.unshift(selector); break; } 
            else {
                var sib = el, nth = 1;
                while (sib = sib.previousElementSibling) { if (sib.nodeName.toLowerCase() == selector) nth++; }
                if (nth != 1) selector += ":nth-of-type("+nth+")";
            }
            path.unshift(selector);
            el = el.parentNode;
        }
        return path.join(" > ");
      }
      window.addEventListener('DOMContentLoaded', () => {
          if (!document.body) return;
          document.body.addEventListener('mouseover', function(e) {
            e.stopPropagation();
            const rect = e.target.getBoundingClientRect();
            window.parent.postMessage({
                type: 'DEVOPTIC_HOVER',
                payload: {
                    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
                    selector: getCssPath(e.target),
                    tagName: e.target.tagName
                }
            }, '*');
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
        res.send($.html());
    } catch (error) {
        console.error("Proxy Error:", error.message);
        res.status(500).send('Error loading the target website');
    }
});

server.listen(PORT, () => {
    console.log(`🚀 Professional Sync Server running on http://localhost:${PORT}`);
});