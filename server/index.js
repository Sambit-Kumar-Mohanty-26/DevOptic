const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3001;

// THE SPY SCRIPT (Injected into every website)
// It detects elements and talks to the Parent (DevOptic)
const INJECTED_SCRIPT = `
  <script>
    (function() {
      // Helper to generate a unique CSS Selector
      function getCssPath(el) {
        if (!(el instanceof Element)) return;
        var path = [];
        while (el.nodeType === Node.ELEMENT_NODE) {
            var selector = el.nodeName.toLowerCase();
            if (el.id) {
                selector += '#' + el.id;
                path.unshift(selector);
                break;
            } else {
                var sib = el, nth = 1;
                while (sib = sib.previousElementSibling) {
                    if (sib.nodeName.toLowerCase() == selector)
                       nth++;
                }
                if (nth != 1)
                    selector += ":nth-of-type("+nth+")";
            }
            path.unshift(selector);
            el = el.parentNode;
        }
        return path.join(" > ");
      }

      window.addEventListener('DOMContentLoaded', () => {
          
          // Listen for Hover Events
          document.body.addEventListener('mouseover', function(e) {
            e.stopPropagation();
            const rect = e.target.getBoundingClientRect();
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
          }, true);

          //  Prevent Links from navigating away
          document.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log("DevOptic: Click intercepted");
          }, true);
      });

    })();
  </script>
`;

app.get('/api/proxy', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('URL parameter is required');

    try {
        const response = await axios.get(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
        });

        const $ = cheerio.load(response.data);
        const urlObj = new URL(targetUrl);
        const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

        const rewrite = (tag, attr) => {
            $(tag).each((i, el) => {
                const val = $(el).attr(attr);
                if (val && !val.startsWith('http') && !val.startsWith('//') && !val.startsWith('data:')) {
                    $(el).attr(attr, new URL(val, baseUrl).href);
                }
            });
        };
        rewrite('link', 'href');
        rewrite('script', 'src');
        rewrite('img', 'src');
        rewrite('a', 'href');

        $('head').append(INJECTED_SCRIPT);

        res.setHeader('Content-Type', 'text/html');
        res.send($.html());

    } catch (error) {
        console.error("Proxy Error:", error.message);
        res.status(500).send('Error loading the target website');
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Proxy Server running on http://localhost:${PORT}`);
});