import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
// @ts-ignore
import ssrfFilter from "ssrf-req-filter";

export const runtime = 'nodejs'; 

// --- INJECTED SCRIPT GENERATOR ---
const getInjectedScript = (socketUrl: string) => `
  <script>
    (function() {
      window.DEVOPTIC_SOCKET_URL = "${socketUrl}";
      console.log('[DevOptic] Connecting to:', window.DEVOPTIC_SOCKET_URL);
      
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
      
      function handleClick(x, y, button) {
        showRipple(x, y);

        var element = document.elementFromPoint(x, y);
        if (element) {
          if (element.focus) element.focus();
          var opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: button || 0 };
          element.dispatchEvent(new MouseEvent('mousedown', opts));
          element.dispatchEvent(new MouseEvent('mouseup', opts));
          element.dispatchEvent(new MouseEvent('click', opts));
          if (element.click) { try { element.click(); } catch(e) {} }
          if (element.tagName === 'A' && element.href) { window.location.href = element.href; }
        }
      }
      
      function handleScroll(deltaX, deltaY) { 
        var x = deltaX || 0;
        var y = deltaY || 0;
        window.scrollBy({ left: x, top: y, behavior: 'auto' });
        if (document.documentElement) document.documentElement.scrollBy(x, y);
        if (document.body) document.body.scrollBy(x, y);
      }
      
      var sessionId = 'session-1';
      try {
        if (document.referrer) {
          var match = document.referrer.match(/\\/live\\/([^/?]+)/);
          if (match) sessionId = match[1];
        }
      } catch(e) {}
      
      var script = document.createElement('script');
      script.src = 'https://cdn.socket.io/4.6.0/socket.io.min.js';
      script.onload = function() {
        var socket = io(window.DEVOPTIC_SOCKET_URL, { transports: ['websocket'] });
        socket.on('connect', function() { socket.emit('join-session', sessionId); });
        
        socket.on('control:cursor', function(data) {
          if (data.type === 'scroll') handleScroll(data.deltaX, data.deltaY);
          if (data.type === 'click') {
             var x, y;
             if (data.iframeX !== undefined) {
               x = data.iframeX;
               y = data.iframeY;
             } else if (data.normalizedX !== undefined) {
               x = data.normalizedX * document.documentElement.clientWidth;
               y = data.normalizedY * document.documentElement.clientHeight;
             }
             if (x !== undefined) handleClick(x, y, data.button);
          }
        });
      };
      document.head.appendChild(script);

      try {
        var bc = new BroadcastChannel('devoptic-cursor');
        bc.onmessage = function(event) { 
            var p = event.data;
            if (p.action === 'click') handleClick(p.x, p.y, p.button); 
            if (p.action === 'scroll') handleScroll(p.deltaX, p.deltaY);
        };
      } catch(e) {}

      window.addEventListener('message', function(event) {
        if (event.data?.type === 'DEVOPTIC_CURSOR') {
           var p = event.data.payload;
           if (p.action === 'click') handleClick(p.x, p.y, p.button);
           if (p.action === 'scroll') handleScroll(p.deltaX, p.deltaY);
        }
      }, false);

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

      let lastTarget = null;
      document.addEventListener('DOMContentLoaded', function() {
        document.body.addEventListener('mouseover', function(e) {
          e.stopPropagation();
          if (e.target === lastTarget) return;
          lastTarget = e.target;
          if (['HTML', 'BODY', 'IFRAME'].includes(e.target.tagName)) return;
          var rect = e.target.getBoundingClientRect();
          try {
            window.parent.postMessage({
              type: 'DEVOPTIC_HOVER',
              payload: { rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }, selector: getCssPath(e.target), tagName: e.target.tagName }
            }, '*');
          } catch(err) {}
        }, true);
      });
    })();
  </script>
`;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse("URL parameter is required", { status: 400 });

  try {
    const response = await axios.get(url, {
      httpAgent: ssrfFilter.http,
      httpsAgent: ssrfFilter.https,
      headers: { 'User-Agent': 'Mozilla/5.0 (DevOptic Bot)', 'Accept': 'text/html' },
      timeout: 5000
    });

    const contentType = response.headers['content-type'];
    if (!contentType || !contentType.includes('text/html')) {
        return new NextResponse("Target is not a webpage", { status: 400 });
    }

    const $ = cheerio.load(response.data);
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
    
    const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
    const FRONTEND_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const rewrite = (tag: string, attr: string) => {
      $(tag).each((i, el) => {
        const val = $(el).attr(attr);
        if (val && !val.startsWith('http') && !val.startsWith('//') && !val.startsWith('data:')) {
          try {
            $(el).attr(attr, new URL(val, baseUrl).href);
          } catch (e) {
            console.warn('Rewrite warn:', val);
          }
        }
      });
    };
    rewrite('link', 'href');
    rewrite('script', 'src');
    rewrite('img', 'src');
    rewrite('a', 'href');

    const csp = `default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src *; frame-ancestors 'self' ${FRONTEND_ORIGIN};`;

    $('head').append(getInjectedScript(SOCKET_SERVER_URL));
    
    if ($('head').find('base').length === 0) {
        $('head').prepend(`<base href="${baseUrl}/">`);
    }

    const html = $.html();
    const finalHtml = html.trim().toLowerCase().startsWith('<!doctype')
      ? html
      : `<!DOCTYPE html>${html}`;

    return new NextResponse(finalHtml, {
        headers: {
            "Content-Type": "text/html",
            "Content-Security-Policy": csp,
            "X-Content-Type-Options": "nosniff"
        }
    });

  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' || (error.message && error.message.includes('SSRF'))) {
       return new NextResponse("Forbidden: Internal Resource", { status: 403 });
    }
    console.error("Proxy Error:", error.message);
    return new NextResponse("Error loading target website", { status: 500 });
  }
}