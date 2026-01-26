import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import dotenv from 'dotenv';
import path from 'path';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(stealthPlugin());

import { HistoryManager } from './browser/HistoryManager.js';
import { BookmarkManager } from './browser/BookmarkManager.js';

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

app.get('/health', (req, res) => {
  const activeSessions = browserSessions?.size || 0;
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    activeBrowserSessions: activeSessions,
    memoryUsage: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true
  }
});
const sessionState = {};
class InputQueue {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.pendingScroll = { x: 0, y: 0 };
    this.hasPendingScroll = false;
    this.processingScroll = false;
    this.scrollInterval = setInterval(() => this.flushScroll(), 16);
  }

  addScroll(deltaX, deltaY) {
    this.pendingScroll.x += deltaX;
    this.pendingScroll.y += deltaY;
    this.hasPendingScroll = true;
  }

  async flushScroll() {
    if (!this.hasPendingScroll || this.processingScroll) return;

    const session = browserSessions.get(this.sessionId);
    if (!session || !session.page) return;

    this.processingScroll = true;
    const { x, y } = this.pendingScroll;

    this.pendingScroll = { x: 0, y: 0 };
    this.hasPendingScroll = false;

    try {
      if (x !== 0 || y !== 0) {
        await session.page.mouse.wheel(x, y);
        session.ghostDOMDirty = true;
      }
    } catch (err) {
      // console.warn(`[InputQueue] Scroll failed: ${err.message}`);
    } finally {
      this.processingScroll = false;
    }
  }

  destroy() {
    if (this.scrollInterval) {
      clearInterval(this.scrollInterval);
    }
  }
}

const inputQueues = new Map();

function getInputQueue(sessionId) {
  if (!inputQueues.has(sessionId)) {
    inputQueues.set(sessionId, new InputQueue(sessionId));
  }
  return inputQueues.get(sessionId);
}

const browserSessions = new Map();
let playwrightBrowser = null;

const pageIdMap = new WeakMap();
let pageIdCounter = 0;

function getPageId(page) {
  if (!pageIdMap.has(page)) {
    pageIdMap.set(page, `page-${++pageIdCounter}`);
  }
  return pageIdMap.get(page);
}

async function initializeBrowser() {
  if (playwrightBrowser) return;

  console.log('[BrowserEngine] Initializing Playwright browser (Persistent Profile)...');

  // We use a persistent profile directory to accumulate "trust" score with Google
  const userDataDir = path.join(process.cwd(), 'chrome_data');

  try {
    playwrightBrowser = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      // channel: 'chrome', // Use bundled Chromium for better stability
      ignoreDefaultArgs: ['--enable-automation'],
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York',
      bypassCSP: true,
      ignoreHTTPSErrors: true,
      deviceScaleFactor: 1,
      hasTouch: false,
      isMobile: false,
      permissions: ['geolocation', 'notifications'],
      args: [
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
        '--start-maximized',
        '--disable-infobars',
        '--no-default-browser-check',
        '--no-first-run',
        '--disable-extensions-except=',
        '--disable-dev-shm-usage',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    });
    console.log('[BrowserEngine] Browser initialized successfully (Bundled Chromium, Persistent)');
  } catch (error) {
    console.error('[BrowserEngine] Failed to initialize browser:', error);
    throw error;
  }
}

async function configurePage(page, sessionId) {
  if (page._configured) return;
  page._configured = true;

  if (!page.id) page.id = Math.random().toString(36).substring(2, 10);

  const HIDE_CURSOR_CSS = '* { cursor: none !important; }';
  await page.addStyleTag({ content: HIDE_CURSOR_CSS });

  await page.addInitScript(() => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/lenis@1.0.42/dist/lenis.min.js';
    script.onload = () => {
      // @ts-ignore
      if (typeof Lenis !== 'undefined') {
        const lenis = new Lenis({ duration: 1.5, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
        function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
        requestAnimationFrame(raf);
      }
    };
    document.head.appendChild(script);
  });

  await setupPrivacyMonitor(sessionId, page);

  await page.addInitScript(() => {
    let lastCursor = 'default';
    document.addEventListener('mouseover', (e) => {
      const target = e.target;
      if (target instanceof Element) {
        const cursor = window.getComputedStyle(target).cursor;
        if (cursor && cursor !== lastCursor && cursor !== 'none') {
          lastCursor = cursor;
          // @ts-ignore
          window.dispatchEvent(new CustomEvent('devoptic-cursor', { detail: cursor }));
        }
      }
    }, { capture: true });
  });

  // Navigation Events
  page.on('framenavigated', async (frame) => {
    if (frame === page.mainFrame()) {
      const session = browserSessions.get(sessionId);
      if (session) session.isNavigating = true;

      const url = frame.url();
      const title = await page.title().catch(() => '');
      io.to(sessionId).emit('browser:navigate', { sessionId, url, title });
      io.to(sessionId).emit('browser:loading', { sessionId, isLoading: true });
    }
  });

  page.on('domcontentloaded', async () => {
    try {
      const session = browserSessions.get(sessionId);
      if (session) session.isNavigating = false;

      await page.addStyleTag({ content: HIDE_CURSOR_CSS });
      const title = await page.title();
      const url = page.url();
      io.to(sessionId).emit('browser:title', { sessionId, title });
      io.to(sessionId).emit('browser:loaded', { sessionId, url, title });
      io.to(sessionId).emit('browser:loading', { sessionId, isLoading: false });
      if (session) emitTabsList(sessionId, session.context);
    } catch (e) { }
  });

  page.on('load', () => {
    const session = browserSessions.get(sessionId);
    if (session) session.isNavigating = false;
    io.to(sessionId).emit('browser:loading', { sessionId, isLoading: false });
  });

  // Handle Downloads
  page.on('download', async (download) => {
    const downloadId = crypto.randomUUID();
    const suggestedFilename = download.suggestedFilename();

    // Notify clients
    io.to(sessionId).emit('browser:download:start', {
      id: downloadId,
      filename: suggestedFilename,
      totalBytes: 0
    });

    try {
      const path = await download.path();

      // Emit complete
      io.to(sessionId).emit('browser:download:complete', {
        id: downloadId,
        path: path
      });
    } catch (e) {
      io.to(sessionId).emit('browser:download:failure', {
        id: downloadId,
        error: e.message
      });
    }
  });

  page.on('close', () => {
    const session = browserSessions.get(sessionId);
    if (session) emitTabsList(sessionId, session.context);
  });
}

async function emitTabsList(sessionId, context) {
  if (!context) return;
  const pages = context.pages();
  const session = browserSessions.get(sessionId);
  const activePage = session ? session.page : null;
  const tabOrder = session ? (session.tabOrder || []) : [];

  // Safety check for pages that might have closed
  const validPages = pages.filter(p => !p.isClosed());

  // Sort pages based on tabOrder
  validPages.sort((a, b) => {
    const idA = getPageId(a);
    const idB = getPageId(b);
    const idxA = tabOrder.indexOf(idA);
    const idxB = tabOrder.indexOf(idB);
    // If both in order, sort by index
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    // If only A in order, A comes first
    if (idxA !== -1) return -1;
    // If only B in order, B comes first
    if (idxB !== -1) return 1;
    // If neither, keep original order (creation order)
    return 0;
  });

  const tabs = await Promise.all(validPages.map(async (p) => {
    let title = 'New Tab';
    try { title = await p.title() || p.url(); } catch { }
    let favicon = null;
    try {
    } catch { }

    return {
      id: getPageId(p),
      title,
      url: p.url(),
      active: p === activePage
    };
  }));

  io.to(sessionId).emit('browser:tabs:list', { tabs });
}

// Helper to safely update session page and ID (Standalone)
async function updateSessionPage(sessionId, context, page) {
  const session = browserSessions.get(sessionId);
  if (!session || !page || page.isClosed()) return;

  session.page = page;
  session.activePageId = getPageId(page);
  session.ghostDOMDirty = true;
  await page.bringToFront().catch(() => { });

  emitTabsList(sessionId, context);
  startStreaming(sessionId);

  const title = await page.title().catch(() => '');
  io.to(sessionId).emit('browser:navigate', { sessionId, url: page.url(), title });
  io.to(sessionId).emit('browser:loading', { sessionId, isLoading: false });
}

// Attach socket handlers for a session (Must be called on every connection)
function attachSessionHandlers(sessionId, socket, context) {
  // Tab Management Handlers
  socket.on('browser:tabs:new', async () => {
    const newPage = await context.newPage();
    await configurePage(newPage, sessionId);
    await updateSessionPage(sessionId, context, newPage);
  });

  socket.on('browser:tabs:switch', async (data) => {
    const session = browserSessions.get(sessionId);
    if (!session) return;

    // LOCK: Stop all frame capture immediately
    session.pageSwitchLock = true;
    stopStreaming(sessionId);

    const pages = context.pages();
    const targetPage = pages.find(p => getPageId(p) === data.pageId);
    if (targetPage) {
      await updateSessionPage(sessionId, context, targetPage);
      // Unlock is done inside updateSessionPage implicit via startStreaming, 
      // but let's be safe about lock state
      session.pageSwitchLock = false; // Ensure unlocked
    } else {
      // UNLOCK and resume streaming if tab not found
      session.pageSwitchLock = false;
      startStreaming(sessionId);
    }
  });

  socket.on('browser:tabs:close', async (data) => {
    const pages = context.pages();
    const targetPage = pages.find(p => getPageId(p) === data.pageId);
    if (targetPage) {
      await targetPage.close();
      const session = browserSessions.get(sessionId);
      if (session) {
        if (session.tabOrder) {
          session.tabOrder = session.tabOrder.filter(id => id !== data.pageId);
        }

        // If we closed the active page, switch to another
        if (getPageId(session.page) === data.pageId || session.page.isClosed()) {
          const remaining = context.pages().filter(p => !p.isClosed());
          if (remaining.length > 0) {
            const nextInfo = remaining[remaining.length - 1];
            await updateSessionPage(sessionId, context, nextInfo);
          } else {
            const newPage = await context.newPage();
            await configurePage(newPage, sessionId);
            await updateSessionPage(sessionId, context, newPage);
          }
        } else {
          emitTabsList(sessionId, session.context);
        }
      }
    }
  });

  socket.on('browser:tabs:reorder', (data) => {
    const session = browserSessions.get(sessionId);
    if (session && Array.isArray(data.tabs)) {
      session.tabOrder = data.tabs;
      emitTabsList(sessionId, session.context);
    }
  });

  socket.on('browser:tab:preview', async (data) => {
    const session = browserSessions.get(sessionId);
    if (!session) return;
    const pages = context.pages();
    const targetPage = pages.find(p => getPageId(p) === data.pageId);
    if (targetPage) {
      try {
        const buffer = await targetPage.screenshot({
          type: 'jpeg',
          quality: 50,
          scale: 'css'
        });
        socket.emit('browser:tab:preview', {
          pageId: data.pageId,
          image: buffer.toString('base64')
        });
      } catch (e) { }
    }
  });

}

async function createBrowserSession(sessionId, socket) {
  if (!playwrightBrowser) {
    await initializeBrowser();
  }

  if (browserSessions.has(sessionId)) {
    const session = browserSessions.get(sessionId);
    session.lastActiveAt = Date.now();
    clearTimeout(session.cleanupTimer);
    session.cleanupTimer = null;

    console.log(`[BrowserEngine] Session ${sessionId} reconnected. Attaching handlers.`);
    attachSessionHandlers(sessionId, socket, session.context);

    return session;
  }

  console.log(`[BrowserEngine] Creating new browser session: ${sessionId}`);
  const context = playwrightBrowser;
  const page = await context.newPage();
  await configurePage(page, sessionId);
  attachSessionHandlers(sessionId, socket, context) 

  const session = {
    sessionId,
    context,
    page,
    cdpSession: null,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    cleanupTimer: null,
    quality: 'high',
    isPrivacyMode: false,
    ghostDOMData: [],
    ghostDOMDirty: true,
    pendingFileChooser: null,
    isNavigating: false,
    pageSwitchLock: false,
    activePageId: getPageId(page),
    isActive: true,
    tabOrder: [],
    handlingNewPage: false,
    _pageListenerAttached: false
  };

  browserSessions.set(sessionId, session);

  await setupPrivacyMonitor(sessionId, page);
  if (!session._pageListenerAttached) {
    session._pageListenerAttached = true;

    context.on('page', async (newPage) => {
      // Check for session validity
      const sess = browserSessions.get(sessionId);
      if (!sess) return;
      if (sess.handlingNewPage) return;
      if (newPage === sess.page) return;

      sess.handlingNewPage = true;

      sess.pageSwitchLock = true;
      stopStreaming(sessionId);

      await new Promise(r => setTimeout(r, 300));
      if (newPage.isClosed()) {
        sess.pageSwitchLock = false;
        sess.handlingNewPage = false;
        startStreaming(sessionId);
        return;
      }

      if (newPage.url() === 'about:blank') {
        await new Promise(r => setTimeout(r, 500));
        if (newPage.url() === 'about:blank' || newPage.isClosed()) {
          sess.pageSwitchLock = false;
          sess.handlingNewPage = false;
          startStreaming(sessionId);
          return;
        }
      }

      console.log(`[BrowserEngine] Switching to new page: ${newPage.url()}`);

      await configurePage(newPage, sessionId);
      await updateSessionPage(sessionId, context, newPage);

      sess.isNavigating = false;
      sess.pageSwitchLock = false;
      sess.handlingNewPage = false;
    });
  }

  await page.exposeFunction('onCursorChange', (cursor) => {
    io.to(sessionId).emit('browser:cursor', { sessionId, cursor });
  });

  await page.addInitScript(() => {
    window.addEventListener('devoptic-cursor', (e) => {
      // @ts-ignore
      window.onCursorChange(e.detail);
    });
  });

  page.on('console', async (msg) => {
    const type = msg.type();
    const location = msg.location();

    let text = '';
    try {
      const args = await Promise.all(msg.args().map(async (arg) => {
        try {
          return await arg.jsonValue();
        } catch {
          return arg.toString();
        }
      }));
      text = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    } catch {
      text = msg.text();
    }

    io.to(sessionId).emit('browser:console', {
      sessionId,
      type,
      text,
      url: location.url,
      line: location.lineNumber,
      timestamp: Date.now()
    });
  });

  // --- DEVTOOLS: Network Request Monitoring ---
  page.on('request', (request) => {
    io.to(sessionId).emit('browser:network:request', {
      sessionId,
      id: request.url() + '-' + Date.now(),
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      headers: request.headers(),
      timestamp: Date.now()
    });
  });

  page.on('response', async (response) => {
    const request = response.request();
    let size = 0;
    try {
      const body = await response.body();
      size = body.length;
    } catch { }

    io.to(sessionId).emit('browser:network:response', {
      sessionId,
      url: request.url(),
      status: response.status(),
      statusText: response.statusText(),
      headers: response.headers(),
      size,
      timing: request.timing(),
      timestamp: Date.now()
    });
  });

  page.on('requestfailed', (request) => {
    io.to(sessionId).emit('browser:network:failed', {
      sessionId,
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText || 'Unknown error',
      timestamp: Date.now()
    });
  });

  // Handle file upload dialogs
  page.on('filechooser', async (fileChooser) => {
    console.log(`[BrowserEngine] File chooser opened for session ${sessionId}`);
    const session = browserSessions.get(sessionId);
    if (session) {
      session.pendingFileChooser = fileChooser;
      io.to(sessionId).emit('browser:filechooser', {
        sessionId,
        multiple: fileChooser.isMultiple(),
        accept: fileChooser.element()?.getAttribute('accept') || '*'
      });
    }
  });

  // Handle downloads
  page.on('download', async (download) => {
    console.log(`[BrowserEngine] Download started: ${download.suggestedFilename()}`);
    try {
      const path = await download.path();
      const buffer = require('fs').readFileSync(path);
      const base64 = buffer.toString('base64');

      io.to(sessionId).emit('browser:download', {
        sessionId,
        filename: download.suggestedFilename(),
        data: base64,
        size: buffer.length,
        mimeType: 'application/octet-stream'
      });

      console.log(`[BrowserEngine] Download ready: ${download.suggestedFilename()} (${buffer.length} bytes)`);
    } catch (err) {
      console.warn(`[BrowserEngine] Download failed: ${err.message}`);
      io.to(sessionId).emit('browser:error', { message: `Download failed: ${err.message}` });
    }
  });

  console.log(`[BrowserEngine] Session ${sessionId} created`);
  return session;
}

async function navigateSession(sessionId, url) {
  const session = browserSessions.get(sessionId);
  if (!session) return null;

  session.isNavigating = true;
  console.log(`[BrowserEngine] Navigating ${sessionId} to: ${url}`);
  session.lastActiveAt = Date.now();

  try {
    await session.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
  } catch (err) {
    console.warn(`[BrowserEngine] Navigation failed: ${err.message}`);
  }

  const HIDE_CURSOR_CSS = '* { cursor: none !important; }';
  try {
    await session.page.addStyleTag({ content: HIDE_CURSOR_CSS });
  } catch (e) { }

  session.ghostDOMDirty = true;
  session.isNavigating = false;

  let title = '';
  let currentUrl = url;
  try {
    title = await session.page.title();
    currentUrl = session.page.url();
  } catch (e) { }

  // Extract favicon
  let favicon = null;
  try {
    favicon = await session.page.evaluate(() => {
      const iconLink = document.querySelector('link[rel="icon"]') ||
        document.querySelector('link[rel="shortcut icon"]') ||
        document.querySelector('link[rel="apple-touch-icon"]');
      if (iconLink) {
        return iconLink.href;
      }
      return new URL('/favicon.ico', window.location.origin).href;
    });
  } catch (e) {
    favicon = null;
  }

  return { page: session.page, url: currentUrl, title, favicon };
}

// Execute input in browser session
async function executeInput(sessionId, event) {
  const session = browserSessions.get(sessionId);
  if (!session) {
    console.warn(`[BrowserEngine] No session found for ${sessionId}`);
    return;
  }

  session.lastActiveAt = Date.now();
  const { page } = session;
  const viewport = page.viewportSize();
  if (!viewport) {
    console.warn(`[BrowserEngine] No viewport for ${sessionId}`);
    return;
  }

  let x = event.x;
  let y = event.y;

  if (event.normalizedX !== undefined && event.normalizedY !== undefined) {
    x = event.normalizedX * viewport.width;
    y = event.normalizedY * viewport.height;
  }

  const getButton = (btn) => {
    if (btn === 1) return 'middle';
    if (btn === 2) return 'right';
    return 'left';
  };

  try {
    switch (event.type) {
      case 'click':
        console.log(`[BrowserEngine] Click at (${Math.round(x)}, ${Math.round(y)}), button: ${event.button || 0}`);
        await page.mouse.click(x, y, {
          button: getButton(event.button),
          clickCount: 1
        });
        session.ghostDOMDirty = true;
        break;

      case 'dblclick':
        console.log(`[BrowserEngine] Double-click at (${Math.round(x)}, ${Math.round(y)})`);
        await page.mouse.click(x, y, {
          button: 'left',
          clickCount: 2
        });
        session.ghostDOMDirty = true;
        break;

      case 'mousedown':
        console.log(`[BrowserEngine] MouseDown at (${Math.round(x)}, ${Math.round(y)}), button: ${event.button || 0}`);
        await page.mouse.move(x, y);
        await page.mouse.down({
          button: getButton(event.button)
        });
        break;

      case 'mouseup':
        console.log(`[BrowserEngine] MouseUp at (${Math.round(x)}, ${Math.round(y)}), button: ${event.button || 0}`);
        await page.mouse.move(x, y);
        await page.mouse.up({
          button: getButton(event.button)
        });
        session.ghostDOMDirty = true;
        break;

      case 'move':
        await page.mouse.move(x, y);
        break;

      case 'scroll':
        const queue = getInputQueue(sessionId);
        queue.addScroll(event.deltaX || 0, event.deltaY || 0);
        break;
    }
  } catch (err) {
    console.warn(`[BrowserEngine] Input execution failed: ${err.message}`);
  }
}

async function extractGhostDOM(sessionId) {
  const session = browserSessions.get(sessionId);
  if (!session || session.isPrivacyMode) return [];

  if (session.isNavigating) {
    return session.ghostDOMData || [];
  }

  if (!session.ghostDOMDirty && session.ghostDOMData.length > 0) {
    return session.ghostDOMData;
  }

  try {
    const metadata = await session.page.evaluate(() => {
      const generateId = (el) => {
        let id = el.getAttribute('data-devoptic-id');
        if (!id) {
          id = Math.random().toString(36).slice(2, 10);
          el.setAttribute('data-devoptic-id', id);
        }
        return id;
      };

      const isInViewport = (rect) => {
        return rect.top < window.innerHeight &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.right > 0;
      };

      const elements = document.querySelectorAll('*');
      const result = [];

      for (const el of elements) {
        if (result.length >= 500) break;

        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (!isInViewport(rect)) continue;
        if (rect.width < 5 || rect.height < 5) continue;

        result.push({
          id: generateId(el),
          tagName: el.tagName.toLowerCase(),
          classes: el.className?.toString() || '',
          idAttr: el.id || '',
          rect: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left
          },
          isInteractive: ['button', 'a', 'input', 'select', 'textarea', 'label'].includes(el.tagName.toLowerCase())
        });
      }

      return result;
    });

    session.ghostDOMData = metadata;
    session.ghostDOMDirty = false;
    return metadata;

  } catch (err) {
    if (!err.message.includes('context was destroyed') &&
      !err.message.includes('Execution context') &&
      !err.message.includes('navigation')) {
      console.warn(`[BrowserEngine] Ghost DOM extraction failed: ${err.message}`);
    }
    return session.ghostDOMData || [];
  }
}

// Capture frame from browser
async function captureFrame(sessionId) {
  const session = browserSessions.get(sessionId);
  if (!session || session.isPrivacyMode) return null;

  try {
    const screenshot = await session.page.screenshot({
      type: 'jpeg',
      quality: 70
    });

    return {
      data: screenshot.toString('base64'),
      timestamp: Date.now(),
      width: 1920,
      height: 1080
    };
  } catch (err) {
    return null;
  }
}

// Schedule session cleanup on disconnect
function scheduleSessionCleanup(sessionId, timeoutMs = 120000) {
  const session = browserSessions.get(sessionId);
  if (!session) return;

  console.log(`[BrowserEngine] Scheduling cleanup for ${sessionId} in ${timeoutMs}ms`);

  if (session.cleanupTimer) {
    clearTimeout(session.cleanupTimer);
  }

  session.cleanupTimer = setTimeout(async () => {
    console.log(`[BrowserEngine] Auto-cleanup triggered for ${sessionId}`);
    await destroyBrowserSession(sessionId);
  }, timeoutMs);
}

// Destroy browser session
async function destroyBrowserSession(sessionId) {
  const session = browserSessions.get(sessionId);
  if (!session) return;

  console.log(`[BrowserEngine] Destroying session: ${sessionId}`);

  if (session.cleanupTimer) {
    clearTimeout(session.cleanupTimer);
  }

  try {
    await session.page.close();
  } catch (err) { }

  // Clean up input queue
  const inputQueue = inputQueues.get(sessionId);
  if (inputQueue) {
    inputQueue.destroy();
    inputQueues.delete(sessionId);
  }

  browserSessions.delete(sessionId);
  console.log(`[BrowserEngine] Session ${sessionId} destroyed`);
}

// Setup privacy monitoring on page
async function setupPrivacyMonitor(sessionId, page) {
  try {
    await page.exposeFunction('__devopticPrivacyCallback', (isPrivate) => {
      const session = browserSessions.get(sessionId);
      if (session) {
        session.isPrivacyMode = isPrivate;
        io.to(sessionId).emit('privacy:sync', { active: isPrivate });
        console.log(`[BrowserEngine] Privacy mode for ${sessionId}: ${isPrivate}`);
      }
    });
  } catch (err) { }

  await page.addInitScript(() => {
    const SENSITIVE_REGEX = /password|passwd|secret|card|cc|cvv|token|auth|credential|ssn/i;

    const checkPrivacy = (el) => {
      if (!el) return false;
      const type = (el.type || '').toLowerCase();
      const name = (el.name || '').toLowerCase();
      const id = (el.id || '').toLowerCase();

      return type === 'password' ||
        type === 'email' ||
        SENSITIVE_REGEX.test(name) ||
        SENSITIVE_REGEX.test(id);
    };

    document.addEventListener('focusin', (e) => {
      if (checkPrivacy(e.target)) {
        // @ts-ignore
        if (window.__devopticPrivacyCallback) window.__devopticPrivacyCallback(true);
      }
    }, true);

    document.addEventListener('focusout', () => {
      const active = document.activeElement;
      if (!checkPrivacy(active)) {
        // @ts-ignore
        if (window.__devopticPrivacyCallback) window.__devopticPrivacyCallback(false);
      }
    }, true);
  });
}

const QUALITY_PRESETS = {
  low: { width: 1280, height: 720, fps: 20, jpegQuality: 55 },
  medium: { width: 1600, height: 900, fps: 40, jpegQuality: 75 },
  high: { width: 1920, height: 1080, fps: 60, jpegQuality: 80 }
};

const streamingState = new Map();
const ghostDOMIntervals = new Map();

function startStreaming(sessionId) {
  const session = browserSessions.get(sessionId);
  if (!session) return;

  console.log(`[Streaming] Starting stream for ${sessionId}`);

  stopStreaming(sessionId);

  const preset = QUALITY_PRESETS[session.quality || 'high'];
  const minFrameTime = 1000 / preset.fps;

  // Mark as active
  if (!streamingState.has(sessionId)) {
    streamingState.set(sessionId, { active: true, timer: null });
  }
  const state = streamingState.get(sessionId);
  state.active = true;

  // Capture Loop Function
  const captureLoop = async () => {
    if (!state.active) return;

    const start = Date.now();
    const sess = browserSessions.get(sessionId);

    if (!sess || sess.isPrivacyMode || sess.isNavigating || sess.pageSwitchLock) {
      state.timer = setTimeout(captureLoop, 100);
      return;
    }

    const currentPageId = getPageId(sess.page);
    if (currentPageId !== sess.activePageId) {
      state.timer = setTimeout(captureLoop, 100);
      return;
    }

    try {
      const screenshot = await sess.page.screenshot({
        type: 'jpeg',
        quality: preset.jpegQuality
      });

      io.to(sessionId).emit('browser:frame:data', {
        sessionId,
        frame: {
          data: screenshot,
          format: 'binary',
          timestamp: Date.now(),
          width: preset.width,
          height: preset.height
        }
      });
    } catch (err) {

    }
    if (state.active) {
      const elapsed = Date.now() - start;
      const delay = Math.max(0, minFrameTime - elapsed);
      state.timer = setTimeout(captureLoop, delay);
    }
  };
  captureLoop();

  const ghostDOMInterval = setInterval(async () => {
    const sess = browserSessions.get(sessionId);
    if (!sess || sess.isPrivacyMode || !sess.ghostDOMDirty) return;

    const elements = await extractGhostDOM(sessionId);
    if (elements.length > 0) {
      io.to(sessionId).emit('browser:ghostdom:data', {
        sessionId,
        elements
      });
    }
  }, 250);

  ghostDOMIntervals.set(sessionId, ghostDOMInterval);
  session.isStreaming = true;
}

// Stop streaming for a session  
function stopStreaming(sessionId) {
  const state = streamingState.get(sessionId);
  const ghostDOMInterval = ghostDOMIntervals.get(sessionId);

  if (state) {
    state.active = false;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    streamingState.delete(sessionId);
  }

  if (ghostDOMInterval) {
    clearInterval(ghostDOMInterval);
    ghostDOMIntervals.delete(sessionId);
  }

  const session = browserSessions.get(sessionId);
  if (session) {
    session.isStreaming = false;
  }

  console.log(`[Streaming] Stopped stream for ${sessionId}`);
}

// Update streaming quality
function setStreamingQuality(sessionId, quality) {
  const session = browserSessions.get(sessionId);
  if (!session) return;

  session.quality = quality;
  const preset = QUALITY_PRESETS[quality];

  session.page.setViewportSize({
    width: preset.width,
    height: preset.height
  }).catch(() => { });

  if (session.isStreaming) {
    startStreaming(sessionId);
  }

  console.log(`[Streaming] Quality set to ${quality} for ${sessionId}`);
}

async function inspectElement(sessionId, elementId) {
  const session = browserSessions.get(sessionId);
  if (!session) return null;

  try {
    return await session.page.evaluate((id) => {
      const el = document.querySelector(`[data-devoptic-id="${id}"]`);
      if (!el) return null;

      const htmlEl = el;
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();

      return {
        id,
        tagName: el.tagName.toLowerCase(),
        classes: el.className?.toString() || '',
        idAttr: el.id || '',
        innerText: htmlEl.innerText?.slice(0, 200) || '',
        rect: {
          width: r.width,
          height: r.height,
          top: r.top,
          left: r.left
        },
        styles: {
          display: s.display,
          position: s.position,
          width: s.width,
          height: s.height,
          margin: s.margin,
          padding: s.padding,
          color: s.color,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          fontFamily: s.fontFamily,
          textAlign: s.textAlign,
          lineHeight: s.lineHeight,
          backgroundColor: s.backgroundColor,
          borderRadius: s.borderRadius,
          border: s.border,
          opacity: s.opacity,
          flexDirection: s.flexDirection,
          justifyContent: s.justifyContent,
          alignItems: s.alignItems,
          gap: s.gap
        }
      };
    }, elementId);
  } catch (err) {
    return null;
  }
}

async function applyStyle(sessionId, elementId, property, value) {
  const session = browserSessions.get(sessionId);
  if (!session) return;

  session.lastActiveAt = Date.now();

  await session.page.evaluate(({ id, prop, val }) => {
    const el = document.querySelector(`[data-devoptic-id="${id}"]`);
    if (el) {
      el.style[prop] = val;
      el.style.outline = '2px dashed #4ade80';
      setTimeout(() => { el.style.outline = ''; }, 500);
    }
  }, { id: elementId, prop: property, val: value });

  session.ghostDOMDirty = true;
}

dotenv.config({ path: '../.env' });
if (!process.env.DEVOPTIC_AGENT_SECRET) dotenv.config();

console.log("SERVER SECRET:", process.env.DEVOPTIC_AGENT_SECRET ? "LOADED" : "MISSING");

io.use((socket, next) => {
  const auth = socket.handshake.auth;

  if (auth.agentSecret && auth.agentSecret === process.env.DEVOPTIC_AGENT_SECRET) {
    console.log(`[AUTH] Agent authenticated via Secret Key: ${socket.id}`);
    socket.user = { sub: 'AGENT', role: 'system' };
    socket.isAgent = true;
    return next();
  }

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

    // Sync Server Browser State
    const session = browserSessions.get(sessionId);
    if (session && session.isActive) {
      socket.emit('browser:active', { active: true });
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

  socket.on('call:request', (data) => {
    console.log(`[CALL] ${data.type} call started by ${socket.id}`);
    socket.to(data.sessionId).emit('call:incoming', {
      callerId: socket.id,
      type: data.type || 'video'
    });
  });

  socket.on('call:accept', (data) => {
    console.log(`[CALL] Call accepted by ${socket.id}`);
    socket.to(data.sessionId).emit('call:accepted', { acceptorId: socket.id });
  });

  socket.on('call:reject', (data) => {
    socket.to(data.sessionId).emit('call:rejected');
  });

  socket.on('call:end', (data) => {
    socket.to(data.sessionId).emit('call:ended');
  });


  const relay = (event) => (data) => socket.to(data.sessionId).emit(event, data);
  const relayObj = (event) => (data) => socket.to(data.sessionId).emit(event, data.object);
  const relayId = (event) => (data) => socket.to(data.sessionId).emit(event, data.objectId);
  const relayCall = (event) => (data) => socket.to(data.sessionId).emit(event, data);

  socket.on('cursor:down', relay('cursor:down'));
  socket.on('cursor:move', relay('cursor:move'));
  socket.on('cursor:up', relay('cursor:up'));

  socket.on('call:offer', relayCall('call:offer'));
  socket.on('call:answer', relayCall('call:answer'));
  socket.on('call:ice-candidate', relayCall('call:ice-candidate'));

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

  // WebRTC stats for adaptive quality
  socket.on('webrtc:stats', (data) => {
    const session = browserSessions.get(data.sessionId);
    if (session && data.packetLoss !== undefined) {
      if (data.packetLoss > 5) {
        session.quality = 'low';
      } else if (data.packetLoss > 2) {
        session.quality = 'medium';
      } else {
        session.quality = 'high';
      }
    }
  });

  // --- NETWORK TAB STREAMING ---
  socket.on('network:request', relay('network:request'));
  socket.on('network:replay', (data) => socket.to(data.sessionId).emit('network:replay', data));

  socket.on('control:request', (data) => {
    if (!sessionState[data.sessionId]) sessionState[data.sessionId] = {};
    sessionState[data.sessionId].pendingControllerSocketId = socket.id;
    console.log(`[CONTROL] Host ${socket.id} requested control in ${data.sessionId}`);
    socket.to(data.sessionId).emit('control:request', data);
  });

  socket.on('control:grant', (data) => {
    if (sessionState[data.sessionId]?.guestSocketId === socket.id) {
      const requesterId = sessionState[data.sessionId].pendingControllerSocketId;
      if (requesterId) {
        sessionState[data.sessionId].controllerSocketId = requesterId;
        console.log(`[CONTROL] Control granted to ${requesterId} in ${data.sessionId}`);
      }
      sessionState[data.sessionId].pendingControllerSocketId = null;
      io.to(data.sessionId).emit('control:grant', data);
    }
  });

  //  Guest or Host Revokes Control
  socket.on('control:revoke', (data) => {
    const state = sessionState[data.sessionId];
    if (state?.guestSocketId === socket.id || state?.controllerSocketId === socket.id) {
      sessionState[data.sessionId].controllerSocketId = null;
      sessionState[data.sessionId].pendingControllerSocketId = null;
      io.to(data.sessionId).emit('control:revoke', data);
      console.log(`[CONTROL] Control revoked in ${data.sessionId}`);
    }
  });

  // Host Sends Control Commands (Cursor/Scroll/Click)
  // Execute in headless browser if session exists, otherwise relay
  socket.on('control:cursor', async (data) => {
    const authorizedController = sessionState[data.sessionId]?.controllerSocketId;
    const hasBrowserSession = browserSessions.has(data.sessionId);

    // Allow input if: 1) user has control grant, OR 2) a server browser session exists
    if (socket.id === authorizedController || hasBrowserSession) {
      if (hasBrowserSession) {
        await executeInput(data.sessionId, data);
      }
      socket.to(data.sessionId).emit('control:cursor', data);
    } else {
      console.warn(`[CONTROL] Unauthorized control attempt from ${socket.id} (expected: ${authorizedController})`);
    }
  });

  socket.on('control:deny', relay('control:deny'));

  // --- MAGIC BRUSH SYNC ---
  socket.on('magic:highlight', relay('magic:highlight'));
  socket.on('magic:clear', relay('magic:clear'));

  socket.on('magic:select', (data) => socket.to(data.sessionId).emit('magic:select', data));
  socket.on('dom:inspected', (data) => socket.to(data.sessionId).emit('dom:inspected', data));

  // Apply style via headless browser
  socket.on('dom:apply', async (data) => {
    if (browserSessions.has(data.sessionId)) {
      await applyStyle(data.sessionId, data.id, data.property, data.value);
    }
    socket.to(data.sessionId).emit('dom:apply', data);
  });

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

  // Resume streaming (e.g. after tab switch)
  socket.on('browser:stream:resume', (data) => {
    startStreaming(data.sessionId);
  });

  socket.on('browser:create', async (data) => {
    try {
      await createBrowserSession(data.sessionId, socket);

      if (data.url) {
        const session = browserSessions.get(data.sessionId);
        if (session) session.isNavigating = true;

        io.to(data.sessionId).emit('browser:loading', { loading: true });
        const result = await navigateSession(data.sessionId, data.url);
        if (result) {
          io.to(data.sessionId).emit('browser:navigated', {
            url: result.url,
            title: result.title,
            favicon: result.favicon
          });
        }
        if (session) session.isNavigating = false;
        io.to(data.sessionId).emit('browser:loading', { loading: false });
      }

      socket.emit('browser:created', { sessionId: data.sessionId });
    } catch (err) {
      const session = browserSessions.get(data.sessionId);
      if (session) session.isNavigating = false;
      io.to(data.sessionId).emit('browser:loading', { loading: false });
      socket.emit('browser:error', { message: err.message });
    }
  });

  // Navigate browser
  socket.on('browser:navigate', async (data) => {
    try {
      const session = browserSessions.get(data.sessionId);
      if (session) session.isNavigating = true;

      io.to(data.sessionId).emit('browser:loading', { loading: true });
      const result = await navigateSession(data.sessionId, data.url);
      if (result) {
        io.to(data.sessionId).emit('browser:navigated', {
          url: result.url,
          title: result.title,
          favicon: result.favicon
        });
      }
      if (session) session.isNavigating = false;
      io.to(data.sessionId).emit('browser:loading', { loading: false });
    } catch (err) {
      const session = browserSessions.get(data.sessionId);
      if (session) session.isNavigating = false;
      io.to(data.sessionId).emit('browser:loading', { loading: false });
      socket.emit('browser:error', { message: err.message });
    }
  });

  socket.on('browser:check', (data) => {
    const session = browserSessions.get(data.sessionId);
    if (session) {
      const page = session.page;
      socket.emit('browser:status', {
        active: true,
        url: page.url(),
        title: '',
        canGoBack: page.context().pages().length > 1,
        canGoForward: false
      });
    } else {
      socket.emit('browser:status', { active: false });
    }
  });

  // Go Back
  socket.on('browser:back', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (!session) return;

    try {
      await session.page.goBack({ waitUntil: 'domcontentloaded', timeout: 10000 });
      const url = session.page.url();
      const title = await session.page.title();
      io.to(data.sessionId).emit('browser:navigated', { url, title });
      session.ghostDOMDirty = true;
    } catch (err) {
      socket.emit('browser:error', { message: 'Cannot go back' });
    }
  });

  // Go Forward
  socket.on('browser:forward', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (!session) return;

    try {
      await session.page.goForward({ waitUntil: 'domcontentloaded', timeout: 10000 });
      const url = session.page.url();
      const title = await session.page.title();
      io.to(data.sessionId).emit('browser:navigated', { url, title });
      session.ghostDOMDirty = true;
    } catch (err) {
      socket.emit('browser:error', { message: 'Cannot go forward' });
    }
  });

  // Reload Page
  socket.on('browser:reload', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (!session) return;

    try {
      io.to(data.sessionId).emit('browser:loading', { loading: true });
      stopStreaming(data.sessionId);
      await session.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
      const url = session.page.url();
      const title = await session.page.title();
      io.to(data.sessionId).emit('browser:navigated', { url, title });
      io.to(data.sessionId).emit('browser:loading', { loading: false });
      session.ghostDOMDirty = true;
      startStreaming(data.sessionId);
    } catch (err) {
      io.to(data.sessionId).emit('browser:loading', { loading: false });
      startStreaming(data.sessionId);
      socket.emit('browser:error', { message: 'Reload failed' });
    }
  });

  socket.on('browser:zoom', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (!session) return;

    const zoomLevel = (data.zoom || 100) / 100;

    try {
      await session.page.evaluate((zoom) => {
        document.documentElement.style.transform = `scale(${zoom})`;
        document.documentElement.style.transformOrigin = 'top left';
        document.documentElement.style.width = `${100 / zoom}%`;
        document.documentElement.style.height = `${100 / zoom}%`;
      }, zoomLevel);

      io.to(data.sessionId).emit('browser:zoomed', { zoom: data.zoom });
      session.ghostDOMDirty = true;
    } catch (err) {
      socket.emit('browser:error', { message: 'Zoom failed' });
    }
  });

  socket.on('browser:find', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (!session || !data.query) return;

    try {
      const results = await session.page.evaluate((query) => {
        document.querySelectorAll('.devoptic-find-highlight').forEach(el => {
          el.outerHTML = el.innerHTML;
        });

        if (!query) return { count: 0, current: 0 };

        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const textNodes = [];

        while (walker.nextNode()) {
          if (walker.currentNode.nodeValue?.match(regex)) {
            textNodes.push(walker.currentNode);
          }
        }

        let count = 0;
        textNodes.forEach(node => {
          const span = document.createElement('span');
          span.innerHTML = node.nodeValue?.replace(regex, '<mark class="devoptic-find-highlight" style="background: yellow; color: black;">$1</mark>') || '';
          node.parentNode?.replaceChild(span, node);
          count += (node.nodeValue?.match(regex) || []).length;
        });

        const firstMatch = document.querySelector('.devoptic-find-highlight');
        if (firstMatch) {
          firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        return { count, current: count > 0 ? 1 : 0 };
      }, data.query);

      socket.emit('browser:findResult', results);
      session.ghostDOMDirty = true;
    } catch (err) {
      socket.emit('browser:error', { message: 'Find failed' });
    }
  });

  socket.on('browser:findNext', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (!session) return;

    try {
      await session.page.evaluate((direction) => {
        const highlights = document.querySelectorAll('.devoptic-find-highlight');
        if (highlights.length === 0) return;
        let currentIdx = Array.from(highlights).findIndex(el =>
          el.style.background === 'orange'
        );
        highlights.forEach(el => el.style.background = 'yellow');
        if (direction === 'next') {
          currentIdx = (currentIdx + 1) % highlights.length;
        } else {
          currentIdx = currentIdx <= 0 ? highlights.length - 1 : currentIdx - 1;
        }

        highlights[currentIdx].style.background = 'orange';
        highlights[currentIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, data.direction || 'next');
    } catch (err) { }
  });

  socket.on('browser:findClear', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (!session) return;

    try {
      await session.page.evaluate(() => {
        document.querySelectorAll('.devoptic-find-highlight').forEach(el => {
          el.outerHTML = el.innerHTML;
        });
      });
      session.ghostDOMDirty = true;
    } catch (err) { }
  });

  // --- HISTORY MANAGEMENT ---
  socket.on('browser:history:list', (data) => {
    const history = HistoryManager.getHistory(data.sessionId);
    socket.emit('browser:history:data', { history });
  });

  socket.on('browser:history:search', (data) => {
    const history = HistoryManager.searchHistory(data.sessionId, data.query);
    socket.emit('browser:history:data', { history });
  });

  socket.on('browser:history:delete', (data) => {
    HistoryManager.deleteEntry(data.sessionId, data.id);
  });

  socket.on('browser:history:clear', (data) => {
    HistoryManager.clearHistory(data.sessionId);
  });

  // --- BOOKMARK MANAGEMENT ---
  socket.on('browser:bookmarks:list', (data) => {
    const bookmarks = BookmarkManager.getBookmarks(data.sessionId);
    socket.emit('browser:bookmarks:data', { bookmarks });
  });

  socket.on('browser:bookmark:add', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (!session) return;

    const url = session.page.url();
    const title = await session.page.title();

    let favicon = null;
    try {
      favicon = await session.page.evaluate(() => {
        const iconLink = document.querySelector('link[rel="icon"]') ||
          document.querySelector('link[rel="shortcut icon"]');
        return iconLink ? iconLink.href : null;
      });
    } catch (e) { }

    const bookmark = BookmarkManager.addBookmark(data.sessionId, url, title, data.folder, favicon);
    io.to(data.sessionId).emit('browser:bookmark:added', { bookmark });

    const bookmarks = BookmarkManager.getBookmarks(data.sessionId);
    io.to(data.sessionId).emit('browser:bookmarks:data', { bookmarks });
  });

  socket.on('browser:bookmark:delete', (data) => {
    BookmarkManager.deleteBookmark(data.sessionId, data.id);
    const bookmarks = BookmarkManager.getBookmarks(data.sessionId);
    io.to(data.sessionId).emit('browser:bookmarks:data', { bookmarks });
  });

  socket.on('browser:bookmark:update', (data) => {
    BookmarkManager.updateBookmark(data.sessionId, data.id, { title: data.title, folder: data.folder });
    const bookmarks = BookmarkManager.getBookmarks(data.sessionId);
    io.to(data.sessionId).emit('browser:bookmarks:data', { bookmarks });
  });

  socket.on('browser:permission:grant', async (data) => {
    const session = browserSessions.get(sessionId);
    if (!session) return;
    try {
      const origin = new URL(session.page.url()).origin;
      await session.context.grantPermissions([data.permission], { origin });
    } catch (e) {
      socket.emit('browser:error', { message: `Permission grant failed: ${e.message}` });
    }
  });

  socket.on('browser:permission:revoke', async (data) => {
    const session = browserSessions.get(sessionId);
    if (!session) return;
    try {
      await session.context.clearPermissions();
    } catch (e) { }
  });

  socket.on('browser:context:copy', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (session) {
      try {
        await session.page.evaluate(() => document.execCommand('copy'));
      } catch (e) { }
    }
  });

  socket.on('browser:context:paste', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (session) {
      try {
        await session.page.keyboard.press('Control+V');
      } catch (e) { }
    }
  });

  socket.on('browser:context:cut', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (session) {
      try {
        await session.page.evaluate(() => document.execCommand('cut'));
      } catch (e) { }
    }
  });

  socket.on('browser:viewsource', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (session) {
      const content = await session.page.content();
      socket.emit('browser:source:content', { content: content.substring(0, 10000) + '...' });
    }
  });

  socket.on('browser:download:image', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (!session) return;

    // Trigger download of image URL
    try {
      const viewSource = await session.context.newPage();
      await viewSource.goto(data.url);
      await viewSource.close();
    } catch (e) { }
  });


  socket.on('browser:copy', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (!session) return;

    try {
      const selectedText = await session.page.evaluate(() => {
        return window.getSelection()?.toString() || '';
      });
      socket.emit('browser:clipboard', { text: selectedText });
    } catch (err) {
      socket.emit('browser:error', { message: 'Copy failed' });
    }
  });

  // Paste: Insert text into remote browser
  socket.on('browser:paste', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (!session || !data.text) return;

    try {
      await session.page.keyboard.insertText(data.text);
      session.ghostDOMDirty = true;
    } catch (err) {
      socket.emit('browser:error', { message: 'Paste failed' });
    }
  });

  // Select All (Ctrl+A)
  socket.on('browser:selectAll', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (!session) return;

    try {
      await session.page.keyboard.press('Control+a');
    } catch (err) {
      socket.emit('browser:error', { message: 'Select all failed' });
    }
  });

  socket.on('browser:upload', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (!session || !session.pendingFileChooser) {
      socket.emit('browser:error', { message: 'No file upload pending' });
      return;
    }

    try {
      // data.files is an array of { name: string, data: base64, type: string }
      const tempDir = require('os').tmpdir();
      const fs = require('fs');
      const path = require('path');

      const filePaths = [];
      for (const file of data.files) {
        const tempPath = path.join(tempDir, `devoptic_${Date.now()}_${file.name}`);
        const buffer = Buffer.from(file.data, 'base64');
        fs.writeFileSync(tempPath, buffer);
        filePaths.push(tempPath);
      }

      await session.pendingFileChooser.setFiles(filePaths);
      session.pendingFileChooser = null;
      session.ghostDOMDirty = true;

      // Cleanup temp files after a delay
      setTimeout(() => {
        filePaths.forEach(fp => {
          try { fs.unlinkSync(fp); } catch (e) { }
        });
      }, 5000);

      socket.emit('browser:uploaded', { success: true, count: filePaths.length });
      console.log(`[BrowserEngine] Uploaded ${filePaths.length} files`);
    } catch (err) {
      socket.emit('browser:error', { message: `Upload failed: ${err.message}` });
    }
  });

  // Cancel pending file upload
  socket.on('browser:cancelUpload', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (session && session.pendingFileChooser) {
      try {
        await session.pendingFileChooser.setFiles([]);
      } catch (e) { }
      session.pendingFileChooser = null;
    }
  });

  // Print page to PDF
  socket.on('browser:print', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (!session) return;

    try {
      const pdfBuffer = await session.page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '1cm', right: '1cm', bottom: '1cm', left: '1cm' }
      });

      const base64 = pdfBuffer.toString('base64');
      const title = await session.page.title();
      const filename = `${title || 'page'}.pdf`.replace(/[<>:"/\\|?*]/g, '_');

      socket.emit('browser:download', {
        sessionId: data.sessionId,
        filename,
        data: base64,
        size: pdfBuffer.length,
        mimeType: 'application/pdf'
      });

      console.log(`[BrowserEngine] PDF generated: ${filename} (${pdfBuffer.length} bytes)`);
    } catch (err) {
      socket.emit('browser:error', { message: `Print failed: ${err.message}` });
    }
  });

  // Request Ghost DOM
  socket.on('browser:ghostdom', async (data) => {
    const metadata = await extractGhostDOM(data.sessionId);
    socket.emit('browser:ghostdom:data', {
      sessionId: data.sessionId,
      elements: metadata
    });
  });

  // Request frame capture
  socket.on('browser:frame', async (data) => {
    const frame = await captureFrame(data.sessionId);
    if (frame) {
      socket.emit('browser:frame:data', {
        sessionId: data.sessionId,
        frame
      });
    }
  });

  // Keyboard input
  socket.on('browser:keyboard', async (data) => {
    const session = browserSessions.get(data.sessionId);
    if (!session) return;

    const authorizedController = sessionState[data.sessionId]?.controllerSocketId;
    const hasBrowserSession = browserSessions.has(data.sessionId);

    // Allow input if: 1) user has control grant, OR 2) a server browser session exists
    if (socket.id !== authorizedController && !hasBrowserSession) return;

    session.lastActiveAt = Date.now();

    try {
      const key = data.key;

      // Special keys that need to be "pressed" not "typed"
      const specialKeys = [
        'Enter', 'Tab', 'Escape', 'Backspace', 'Delete',
        'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
        'Home', 'End', 'PageUp', 'PageDown',
        'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
        'Control', 'Alt', 'Shift', 'Meta'
      ];

      // Handle modifier combos (Ctrl+Key, etc)
      if (data.ctrlKey || data.altKey || data.metaKey) {
        let combo = '';
        if (data.ctrlKey) combo += 'Control+';
        if (data.altKey) combo += 'Alt+';
        if (data.shiftKey) combo += 'Shift+';
        if (data.metaKey) combo += 'Meta+';
        combo += key.length === 1 ? key.toLowerCase() : key;
        await session.page.keyboard.press(combo);
      }
      // Special keys
      else if (specialKeys.includes(key)) {
        await session.page.keyboard.press(key);
      }
      // Printable characters - type them
      else if (key.length === 1) {
        await session.page.keyboard.type(key);
      }
      // Other keys - try press
      else {
        await session.page.keyboard.press(key);
      }

      session.ghostDOMDirty = true;
    } catch (err) {
      console.warn(`[BrowserEngine] Keyboard input failed: ${err.message}`);
    }
  });

  // Start streaming
  socket.on('browser:stream:start', async (data) => {
    try {
      startStreaming(data.sessionId);
      socket.emit('browser:stream:started', { sessionId: data.sessionId });
    } catch (err) {
      socket.emit('browser:error', { message: err.message });
    }
  });

  // Stop streaming
  socket.on('browser:stream:stop', (data) => {
    stopStreaming(data.sessionId);
    socket.emit('browser:stream:stopped', { sessionId: data.sessionId });
  });

  // Set streaming quality
  socket.on('browser:quality', (data) => {
    if (data.quality && ['low', 'medium', 'high'].includes(data.quality)) {
      setStreamingQuality(data.sessionId, data.quality);
    }
  });

  socket.on('browser:inspect', async (data) => {
    const elementData = await inspectElement(data.sessionId, data.elementId);
    if (elementData) {
      socket.emit('browser:inspect:data', {
        sessionId: data.sessionId,
        element: elementData
      });
      // Also emit as dom:inspected for compatibility
      socket.emit('dom:inspected', elementData);
    }
  });

  // Host sends code -> Server checks permission -> Sends to Guest
  socket.on('console:execute', (data) => {
    const authorizedController = sessionState[data.sessionId]?.controllerSocketId;

    // Only the Controller can execute code
    if (socket.id === authorizedController) {
      console.log(`[EXEC] Host ${socket.id} executing code on Guest`);
      io.to(data.sessionId).emit('console:execute', data);
    } else {
      console.warn(`[EXEC] Unauthorized execution attempt from ${socket.id}`);
      socket.emit('console:error', {
        args: [" Permission Denied: You must request control first."],
        timestamp: Date.now()
      });
    }
  });

  // Guest sends result -> Server relays to Host
  socket.on('console:result', relay('console:result'));
  socket.on('fs:list', (data) => {
    io.to(data.sessionId).emit('fs:list', data);
  });

  socket.on('fs:list:response', (data) => {
    io.to(data.sessionId).emit('fs:list:response', data);
  });

  socket.on('fs:read', (data) => {
    io.to(data.sessionId).emit('fs:read', data);
  });

  socket.on('fs:read:response', (data) => {
    io.to(data.sessionId).emit('fs:read:response', data);
  });

  socket.on('fs:write', (data) => {
    const authorizedController = sessionState[data.sessionId]?.controllerSocketId;
    if (socket.id === authorizedController) {
      io.to(data.sessionId).emit('fs:write', data);
    } else {
      socket.emit('fs:error', { message: "Permission Denied: You must have control to edit files." });
    }
  });

  socket.on('fs:write:success', (data) => {
    io.to(data.sessionId).emit('fs:write:success', data);
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

      if (browserSessions.has(sessionId)) {
        scheduleSessionCleanup(sessionId, 120000);
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down...');

  for (const sessionId of browserSessions.keys()) {
    await destroyBrowserSession(sessionId);
  }

  if (playwrightBrowser) {
    await playwrightBrowser.close();
  }

  server.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Secure Server running on port ${PORT}`);
  console.log(`🌐 Browser Engine ready for session management`);
});