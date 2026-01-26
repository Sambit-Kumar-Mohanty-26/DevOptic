/**
 * BrowserManager - Core service for managing Playwright browser instances
 * 
 * Features:
 * - Spawns isolated browser contexts per session
 * - Handles storage state (cookies/localStorage) persistence
 * - Manages browser lifecycle (create, destroy, reconnect)
 * - Auto-cleanup: Destroys context if socket disconnects for >2 minutes
 */

import { chromium, Browser, BrowserContext, Page, CDPSession } from 'playwright';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { defaultConfig, BrowserConfig, QUALITY_PRESETS } from './config.js';

export interface BrowserSession {
    sessionId: string;
    context: BrowserContext;
    page: Page;
    cdpSession: CDPSession | null;
    storageStatePath: string;
    createdAt: Date;
    lastActiveAt: Date;
    cleanupTimer: NodeJS.Timeout | null;
    quality: 'low' | 'medium' | 'high';
    isPrivacyMode: boolean;
}

export interface CursorEvent {
    type: 'click' | 'move' | 'scroll';
    x: number;
    y: number;
    button?: number;
    deltaX?: number;
    deltaY?: number;
    normalizedX?: number;
    normalizedY?: number;
}

export class BrowserManager extends EventEmitter {
    private browser: Browser | null = null;
    private sessions: Map<string, BrowserSession> = new Map();
    private config: BrowserConfig;
    private isInitialized: boolean = false;

    constructor(config: Partial<BrowserConfig> = {}) {
        super();
        this.config = { ...defaultConfig, ...config };

        // Ensure storage directory exists
        this.ensureStorageDir();
    }

    private ensureStorageDir(): void {
        const dir = path.resolve(this.config.storageDir);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Initialize the browser instance
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        console.log('[BrowserManager] Initializing Playwright browser...');

        this.browser = await chromium.launch({
            headless: true,
            args: [
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        });

        this.isInitialized = true;
        console.log('[BrowserManager] Browser initialized successfully');
    }

    /**
     * Create a new browser session for a user
     */
    async createSession(sessionId: string): Promise<BrowserSession> {
        if (!this.browser) {
            await this.initialize();
        }

        // Check if session already exists
        if (this.sessions.has(sessionId)) {
            console.log(`[BrowserManager] Session ${sessionId} already exists, returning existing`);
            const session = this.sessions.get(sessionId)!;
            session.lastActiveAt = new Date();
            this.cancelCleanup(sessionId);
            return session;
        }

        // Check max sessions limit
        if (this.sessions.size >= this.config.maxSessions) {
            throw new Error(`Maximum sessions limit (${this.config.maxSessions}) reached`);
        }

        console.log(`[BrowserManager] Creating new session: ${sessionId}`);

        const storageStatePath = path.resolve(
            this.config.storageDir,
            `${sessionId}.json`
        );

        // Check for existing storage state (persistent login)
        let storageState = undefined;
        if (fs.existsSync(storageStatePath)) {
            try {
                storageState = JSON.parse(fs.readFileSync(storageStatePath, 'utf-8'));
                console.log(`[BrowserManager] Loaded existing storage state for ${sessionId}`);
            } catch (err) {
                console.warn(`[BrowserManager] Failed to load storage state: ${err}`);
            }
        }

        // Create isolated browser context
        const context = await this.browser!.newContext({
            viewport: this.config.viewport,
            userAgent: this.config.userAgent,
            storageState: storageState,
            bypassCSP: true,
            ignoreHTTPSErrors: true
        });

        // Create new page
        const page = await context.newPage();

        // Create CDP session for advanced features
        const cdpSession = await context.newCDPSession(page);

        // Inject cursor hiding CSS
        await this.injectCursorHider(page);

        const session: BrowserSession = {
            sessionId,
            context,
            page,
            cdpSession,
            storageStatePath,
            createdAt: new Date(),
            lastActiveAt: new Date(),
            cleanupTimer: null,
            quality: 'high',
            isPrivacyMode: false
        };

        this.sessions.set(sessionId, session);

        // Setup page event listeners
        this.setupPageListeners(session);

        console.log(`[BrowserManager] Session ${sessionId} created successfully`);
        return session;
    }

    /**
     * Navigate to a URL in a session
     */
    async navigate(sessionId: string, url: string): Promise<Page> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        console.log(`[BrowserManager] Navigating ${sessionId} to: ${url}`);

        session.lastActiveAt = new Date();

        await session.page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Re-inject cursor hider after navigation
        await this.injectCursorHider(session.page);

        // Save storage state after navigation
        await this.saveStorageState(session);

        return session.page;
    }

    /**
     * Execute input event in the headless browser
     */
    async executeInput(sessionId: string, event: CursorEvent): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.lastActiveAt = new Date();

        const { page } = session;
        const viewport = page.viewportSize();
        if (!viewport) return;

        // Calculate actual coordinates from normalized values if provided
        let x = event.x;
        let y = event.y;

        if (event.normalizedX !== undefined && event.normalizedY !== undefined) {
            x = event.normalizedX * viewport.width;
            y = event.normalizedY * viewport.height;
        }

        try {
            switch (event.type) {
                case 'click':
                    await page.mouse.click(x, y, {
                        button: event.button === 2 ? 'right' : 'left'
                    });
                    break;

                case 'move':
                    await page.mouse.move(x, y);
                    break;

                case 'scroll':
                    await page.mouse.wheel(event.deltaX || 0, event.deltaY || 0);
                    break;
            }
        } catch (err) {
            console.warn(`[BrowserManager] Input execution failed: ${err}`);
        }
    }

    /**
     * Execute keyboard input
     */
    async executeKeyboard(sessionId: string, key: string, type: 'press' | 'down' | 'up' = 'press'): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.lastActiveAt = new Date();

        try {
            switch (type) {
                case 'press':
                    await session.page.keyboard.press(key);
                    break;
                case 'down':
                    await session.page.keyboard.down(key);
                    break;
                case 'up':
                    await session.page.keyboard.up(key);
                    break;
            }
        } catch (err) {
            console.warn(`[BrowserManager] Keyboard execution failed: ${err}`);
        }
    }

    /**
     * Type text into focused element
     */
    async typeText(sessionId: string, text: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.lastActiveAt = new Date();
        await session.page.keyboard.type(text);
    }

    /**
     * Apply style to an element
     */
    async applyStyle(sessionId: string, elementId: string, property: string, value: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.lastActiveAt = new Date();

        await session.page.evaluate(({ id, prop, val }) => {
            const el = document.querySelector(`[data-devoptic-id="${id}"]`) as HTMLElement;
            if (el) {
                (el.style as any)[prop] = val;
                // Flash to show change
                el.style.outline = '2px dashed #4ade80';
                setTimeout(() => { el.style.outline = ''; }, 500);
            }
        }, { id: elementId, prop: property, val: value });
    }

    /**
     * Schedule cleanup for a session (called when socket disconnects)
     */
    scheduleCleanup(sessionId: string, timeoutMs?: number): void {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        const timeout = timeoutMs || this.config.cleanupTimeoutMs;

        console.log(`[BrowserManager] Scheduling cleanup for ${sessionId} in ${timeout}ms`);

        // Clear any existing timer
        this.cancelCleanup(sessionId);

        session.cleanupTimer = setTimeout(async () => {
            console.log(`[BrowserManager] Auto-cleanup triggered for ${sessionId}`);
            await this.destroySession(sessionId);
        }, timeout);
    }

    /**
     * Cancel scheduled cleanup (called when socket reconnects)
     */
    cancelCleanup(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (session?.cleanupTimer) {
            clearTimeout(session.cleanupTimer);
            session.cleanupTimer = null;
            console.log(`[BrowserManager] Cleanup cancelled for ${sessionId}`);
        }
    }

    /**
     * Destroy a browser session
     */
    async destroySession(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        console.log(`[BrowserManager] Destroying session: ${sessionId}`);

        // Save storage state before destruction
        await this.saveStorageState(session);

        // Clear cleanup timer
        if (session.cleanupTimer) {
            clearTimeout(session.cleanupTimer);
        }

        // Close CDP session
        if (session.cdpSession) {
            try {
                await session.cdpSession.detach();
            } catch (err) {
                // Ignore errors during cleanup
            }
        }

        // Close page and context
        try {
            await session.page.close();
            await session.context.close();
        } catch (err) {
            // Ignore errors during cleanup
        }

        this.sessions.delete(sessionId);
        this.emit('session:destroyed', sessionId);

        console.log(`[BrowserManager] Session ${sessionId} destroyed`);
    }

    /**
     * Get a session by ID
     */
    getSession(sessionId: string): BrowserSession | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * Get all active sessions
     */
    getActiveSessions(): string[] {
        return Array.from(this.sessions.keys());
    }

    /**
     * Set quality for a session (dynamic resolution scaling)
     */
    setSessionQuality(sessionId: string, quality: 'low' | 'medium' | 'high'): void {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.quality = quality;
        const preset = QUALITY_PRESETS[quality];

        // Resize viewport based on quality
        session.page.setViewportSize({
            width: preset.width,
            height: preset.height
        });

        console.log(`[BrowserManager] Session ${sessionId} quality set to ${quality}`);
    }

    /**
     * Set privacy mode for a session
     */
    setPrivacyMode(sessionId: string, isPrivate: boolean): void {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        session.isPrivacyMode = isPrivate;
        this.emit('privacy:change', { sessionId, isPrivate });

        console.log(`[BrowserManager] Session ${sessionId} privacy mode: ${isPrivate}`);
    }

    /**
     * Shutdown the browser manager
     */
    async shutdown(): Promise<void> {
        console.log('[BrowserManager] Shutting down...');

        // Destroy all sessions
        for (const sessionId of this.sessions.keys()) {
            await this.destroySession(sessionId);
        }

        // Close browser
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }

        this.isInitialized = false;
        console.log('[BrowserManager] Shutdown complete');
    }

    // ============ Private Methods ============

    /**
     * Inject CSS to hide the remote browser's cursor
     */
    private async injectCursorHider(page: Page): Promise<void> {
        const HIDE_CURSOR_CSS = `
      * { cursor: none !important; }
      *::selection { background: rgba(139, 92, 246, 0.3) !important; }
    `;

        await page.addStyleTag({ content: HIDE_CURSOR_CSS });

        // Re-inject on navigation
        page.on('domcontentloaded', async () => {
            try {
                await page.addStyleTag({ content: HIDE_CURSOR_CSS });
            } catch (err) {
                // Page might have navigated away
            }
        });
    }

    /**
     * Save storage state to disk
     */
    private async saveStorageState(session: BrowserSession): Promise<void> {
        try {
            const state = await session.context.storageState();
            fs.writeFileSync(session.storageStatePath, JSON.stringify(state, null, 2));
        } catch (err) {
            console.warn(`[BrowserManager] Failed to save storage state: ${err}`);
        }
    }

    /**
     * Setup event listeners for a page
     */
    private setupPageListeners(session: BrowserSession): void {
        const { page, sessionId } = session;

        // Monitor for sensitive input focus (privacy mode)
        page.on('framenavigated', () => {
            this.setupPrivacyMonitor(session);
        });

        // Initial privacy monitor setup
        this.setupPrivacyMonitor(session);

        // Page errors
        page.on('pageerror', (err) => {
            this.emit('page:error', { sessionId, error: err.message });
        });

        // Console messages
        page.on('console', (msg) => {
            if (!session.isPrivacyMode) {
                this.emit('page:console', {
                    sessionId,
                    type: msg.type(),
                    text: msg.text()
                });
            }
        });
    }

    /**
     * Setup privacy detection in the page
     */
    private async setupPrivacyMonitor(session: BrowserSession): Promise<void> {
        try {
            await session.page.exposeFunction('__devopticPrivacyCallback', (isPrivate: boolean) => {
                this.setPrivacyMode(session.sessionId, isPrivate);
            });
        } catch (err) {
            // Function might already be exposed
        }

        await session.page.evaluate(() => {
            const SENSITIVE_REGEX = /password|passwd|secret|card|cc|cvv|token|auth|credential|ssn/i;

            const checkPrivacy = (el: HTMLElement | null) => {
                if (!el) return false;
                const input = el as HTMLInputElement;
                const type = (input.type || '').toLowerCase();
                const name = (input.name || '').toLowerCase();
                const id = (input.id || '').toLowerCase();

                return type === 'password' ||
                    type === 'email' ||
                    SENSITIVE_REGEX.test(name) ||
                    SENSITIVE_REGEX.test(id);
            };

            document.addEventListener('focusin', (e) => {
                if (checkPrivacy(e.target as HTMLElement)) {
                    (window as any).__devopticPrivacyCallback(true);
                }
            }, true);

            document.addEventListener('focusout', () => {
                const active = document.activeElement as HTMLElement;
                if (!checkPrivacy(active)) {
                    (window as any).__devopticPrivacyCallback(false);
                }
            }, true);
        });
    }
}

// Export singleton instance
export const browserManager = new BrowserManager();
