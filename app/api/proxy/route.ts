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
      
      // --- SMOOTH SCROLL HANDLER (Host Control) ---
      function handleScroll(deltaX, deltaY) { 
        var x = deltaX || 0;
        var y = deltaY || 0;
        
        // Use smooth scrolling for small/medium movements to hide network jitter
        // Revert to auto (instant) for massive jumps to prevent lag
        var behavior = (Math.abs(x) > 400 || Math.abs(y) > 400) ? 'auto' : 'smooth';

        window.scrollBy({ left: x, top: y, behavior: behavior });
        if (document.documentElement) document.documentElement.scrollBy({ left: x, top: y, behavior: behavior });
        if (document.body) document.body.scrollBy({ left: x, top: y, behavior: behavior });
      }
      
      var sessionId = 'session-1';
      try {
        if (window.parent !== window) {
           // Fallback logic
        }
      } catch(e) {}
      
      var script = document.createElement('script');
      script.src = 'https://cdn.socket.io/4.6.0/socket.io.min.js';
      script.onload = function() {
        var socket = io(window.DEVOPTIC_SOCKET_URL, { transports: ['websocket'] });
        socket.on('connect', function() { 
            socket.emit('join-session', sessionId); 
        });
        
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

      // --- BROADCAST CHANNEL ---
      try {
        var bc = new BroadcastChannel('devoptic-cursor');
        bc.onmessage = function(event) { 
            var p = event.data;
            if (p.action === 'click') handleClick(p.x, p.y, p.button); 
            if (p.action === 'scroll') handleScroll(p.deltaX, p.deltaY);
        };
      } catch(e) {}

      // --- POST MESSAGE LISTENER ---
      window.addEventListener('message', function(event) {
        if (event.data?.type === 'DEVOPTIC_CURSOR') {
           var p = event.data.payload;
           if (p.action === 'click') handleClick(p.x, p.y, p.button);
           if (p.action === 'scroll') handleScroll(p.deltaX, p.deltaY);
           
           // --- SMOOTH SYNC SCROLLING (Guest Sync) ---
           if (p.action === 'scroll-percent') {
              var targetEl = window;
              if (p.selector && p.selector !== 'window') {
                 try { targetEl = document.querySelector(p.selector) || window; } catch(e) {}
              }
              
              var sHeight, cHeight, sWidth, cWidth;
              if (targetEl === window) {
                 sHeight = document.documentElement.scrollHeight;
                 cHeight = document.documentElement.clientHeight;
                 sWidth = document.documentElement.scrollWidth;
                 cWidth = document.documentElement.clientWidth;
              } else {
                 sHeight = targetEl.scrollHeight;
                 cHeight = targetEl.clientHeight; 
                 sWidth = targetEl.scrollWidth;
                 cWidth = targetEl.clientWidth;
              }
              
              isProgrammaticScroll = true; 
              
              targetEl.scrollTo({
                left: p.percentX * (sWidth - cWidth),
                top: p.percentY * (sHeight - cHeight),
                behavior: 'smooth' // <--- CRITICAL FIX: Smooths out the jump
              });

              // Block echo for 500ms to allow smooth scroll animation to finish
              if (window.devopticScrollTimer) clearTimeout(window.devopticScrollTimer);
              window.devopticScrollTimer = setTimeout(function(){ isProgrammaticScroll = false; }, 500);
           }
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

      // --- SCROLL EMITTER ---
      let lastScrollTime = 0;
      let isProgrammaticScroll = false; 

      window.addEventListener('scroll', function(e) {
        if (isProgrammaticScroll) return; // Ignore our own smooth scrolls

        const now = Date.now();
        if (now - lastScrollTime < 30) return; // Increased throttle to 30ms for stability
        lastScrollTime = now;

        let scrollX, scrollY, sWidth, sHeight, cWidth, cHeight;
        const target = e.target;
        const isWindow = target === document || target === window;
        
        if (isWindow) {
           scrollX = window.scrollX;
           scrollY = window.scrollY;
           sWidth = document.documentElement.scrollWidth;
           sHeight = document.documentElement.scrollHeight;
           cWidth = document.documentElement.clientWidth;
           cHeight = document.documentElement.clientHeight;
        } else if (target instanceof Element) {
           if (target.clientWidth < window.innerWidth * 0.5 && target.clientHeight < window.innerHeight * 0.5) return;
           scrollX = target.scrollLeft;
           scrollY = target.scrollTop;
           sWidth = target.scrollWidth;
           sHeight = target.scrollHeight;
           cWidth = target.clientWidth;
           cHeight = target.clientHeight;
        } else {
           return;
        }

        const docHeight = sHeight - cHeight;
        const docWidth = sWidth - cWidth;
        
        const percentY = docHeight > 0 ? scrollY / docHeight : 0;
        const percentX = docWidth > 0 ? scrollX / docWidth : 0;
        const selector = isWindow ? 'window' : getCssPath(target);

        try {
          window.parent.postMessage({
             type: 'DEVOPTIC_SCROLL',
             payload: { percentX, percentY, selector }
          }, '*');
        } catch(e) {}
      }, true);
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
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      },
      timeout: 15000,
      validateStatus: () => true 
    });

    const contentType = response.headers['content-type'];
    if (!contentType || !contentType.includes('text/html')) {
      return NextResponse.redirect(url);
    }

    const $ = cheerio.load(response.data);
    const urlObj = new URL(url);
    const baseUrl = `${urlObj.protocol}//${urlObj.host}`;

    const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
    const FRONTEND_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const wrapUrl = (targetUrl: string) => {
      if (!targetUrl) return "";
      if (targetUrl.startsWith("data:") || targetUrl.startsWith("#") || targetUrl.startsWith("mailto:") || targetUrl.startsWith("tel:")) return targetUrl;
      
      try {
        const absoluteUrl = new URL(targetUrl, baseUrl).href;
        return `/api/proxy?url=${encodeURIComponent(absoluteUrl)}`;
      } catch (e) {
        return targetUrl;
      }
    };

    const resolveUrl = (targetUrl: string) => {
        if (!targetUrl) return "";
        if (targetUrl.startsWith("data:") || targetUrl.startsWith("http") || targetUrl.startsWith("//")) return targetUrl;
        try {
            return new URL(targetUrl, baseUrl).href;
        } catch(e) {
            return targetUrl;
        }
    };

    $('base').remove();

    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (href) {
        $(el).attr('href', wrapUrl(href));
        $(el).attr('target', '_self'); 
      }
    });

    $('form').each((i, el) => {
      const action = $(el).attr('action');
      if (action) {
        $(el).attr('action', wrapUrl(action));
      }
    });

    $('img').each((i, el) => { $(el).attr('src', resolveUrl($(el).attr('src') || '')); });
    $('script').each((i, el) => { $(el).attr('src', resolveUrl($(el).attr('src') || '')); });
    $('link').each((i, el) => { $(el).attr('href', resolveUrl($(el).attr('href') || '')); });
    
    $('iframe').each((i, el) => { 
        const src = $(el).attr('src');
        if(src) $(el).attr('src', wrapUrl(src));
    });

    const csp = `default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src *; frame-ancestors 'self' ${FRONTEND_ORIGIN};`;

    $('head').append(getInjectedScript(SOCKET_SERVER_URL));

    const html = $.html();
    
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html",
        "Content-Security-Policy": csp,
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "SAMEORIGIN"
      }
    });

  } catch (error: any) {
    if (error.code === 'ECONNREFUSED' || (error.message && error.message.includes('SSRF'))) {
      return new NextResponse("Forbidden: Internal Resource", { status: 403 });
    }
    console.error("Proxy Error:", error.message);
    return new NextResponse(`Error loading target website: ${error.message}`, { status: 500 });
  }
}