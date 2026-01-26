/**
 * BrowserSession - Comprehensive session manager for server-side browser
 * 
 * Orchestrates:
 * - Browser context and page lifecycle
 * - Streaming service (frames + Ghost DOM)
 * - Audio capture
 * - Privacy guard
 * - Input relay
 * - Storage persistence
 */

import { chromium, Browser, BrowserContext, Page, CDPSession } from 'playwright';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { StreamingService } from './StreamingService.js';
import { AudioCapture } from './AudioCapture.js';
import { PrivacyGuard } from './PrivacyGuard.js';
import { defaultConfig, QUALITY_PRESETS, type BrowserConfig } from './config.js';

export interface SessionState {
    sessionId: string;
    url: string;
    quality: 'low' | 'medium' | 'high';
    isPrivacyMode: boolean;
    isStreaming: boolean;
    audioLevel: number;
    frameCount: number;
    createdAt: number;
    lastActiveAt: number;
}

export interface SessionOptions {
    viewport?: { width: number; height: number };
    userAgent?: string;
    storageDir?: string;
    autoCleanupMs?: number;
}

export class BrowserSession extends EventEmitter {
    // Core Playwright objects
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private cdpSession: CDPSession | null = null;

    // Services
    private streamingService: StreamingService;
    private audioCapture: AudioCapture;
    private privacyGuard: PrivacyGuard;

    // State
    readonly sessionId: string;
    private options: SessionOptions;
    private storageStatePath: string;
    private cleanupTimer: NodeJS.Timeout | null = null;
    private state: SessionState;

    constructor(sessionId: string, options: SessionOptions = {}) {
        super();

        this.sessionId = sessionId;
        this.options = {
            viewport: options.viewport || { width: 1920, height: 1080 },
            userAgent: options.userAgent || defaultConfig.userAgent,
            storageDir: options.storageDir || defaultConfig.storageDir,
            autoCleanupMs: options.autoCleanupMs || defaultConfig.cleanupTimeoutMs
        };

        this.storageStatePath = path.resolve(
            this.options.storageDir!,
            `${sessionId}.json`
        );

        // Initialize services
        this.streamingService = new StreamingService();
        this.audioCapture = new AudioCapture();
        this.privacyGuard = new PrivacyGuard();

        // Initialize state
        this.state = {
            sessionId,
            url: '',
            quality: 'high',
            isPrivacyMode: false,
            isStreaming: false,
            audioLevel: 0,
            frameCount: 0,
            createdAt: Date.now(),
            lastActiveAt: Date.now()
        };

        // Wire up service events
        this.setupEventListeners();
    }

    /**
     * Initialize the browser session
     */
    async initialize(browser: Browser): Promise<void> {
        console.log(`[BrowserSession] Initializing session ${this.sessionId}`);

        // Ensure storage directory exists
        const storageDir = path.dirname(this.storageStatePath);
        if (!fs.existsSync(storageDir)) {
            fs.mkdirSync(storageDir, { recursive: true });
        }

        // Load existing storage state if available
        let storageState = undefined;
        if (fs.existsSync(this.storageStatePath)) {
            try {
                storageState = JSON.parse(fs.readFileSync(this.storageStatePath, 'utf-8'));
                console.log(`[BrowserSession] Loaded storage state for ${this.sessionId}`);
            } catch (err) {
                console.warn(`[BrowserSession] Failed to load storage state: ${err}`);
            }
        }

        // Create browser context
        this.context = await browser.newContext({
            viewport: this.options.viewport,
            userAgent: this.options.userAgent,
            storageState: storageState,
            bypassCSP: true,
            ignoreHTTPSErrors: true
        });

        // Create page
        this.page = await this.context.newPage();

        // Create CDP session
        this.cdpSession = await this.context.newCDPSession(this.page);

        // Inject cursor hider
        await this.injectCursorHider();

        // Attach services
        await this.streamingService.attach(this.page, this.sessionId);
        await this.audioCapture.attach(this.page, this.sessionId);
        await this.privacyGuard.attach(this.page, this.sessionId);

        console.log(`[BrowserSession] Session ${this.sessionId} initialized`);
    }

    /**
     * Navigate to a URL
     */
    async navigate(url: string): Promise<void> {
        if (!this.page) throw new Error('Session not initialized');

        this.updateActivity();

        console.log(`[BrowserSession] Navigating to: ${url}`);

        // Stop streaming during navigation
        const wasStreaming = this.state.isStreaming;
        if (wasStreaming) {
            this.streamingService.stopStreaming();
        }

        await this.page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        this.state.url = url;

        // Re-inject cursor hider
        await this.injectCursorHider();

        // Save storage state
        await this.saveStorageState();

        // Resume streaming
        if (wasStreaming) {
            this.streamingService.startStreaming();
        }

        this.emit('navigated', { sessionId: this.sessionId, url });
    }

    /**
     * Start streaming frames and Ghost DOM
     */
    startStreaming(): void {
        if (!this.page) return;

        this.state.isStreaming = true;
        this.streamingService.startStreaming();
        this.audioCapture.startCapture();

        this.emit('streaming:started', { sessionId: this.sessionId });
    }

    /**
     * Stop streaming
     */
    stopStreaming(): void {
        this.state.isStreaming = false;
        this.streamingService.stopStreaming();
        this.audioCapture.stopCapture();

        this.emit('streaming:stopped', { sessionId: this.sessionId });
    }

    /**
     * Execute mouse input
     */
    async executeMouseInput(event: {
        type: 'click' | 'move' | 'scroll';
        x: number;
        y: number;
        normalizedX?: number;
        normalizedY?: number;
        button?: number;
        deltaX?: number;
        deltaY?: number;
    }): Promise<void> {
        if (!this.page) return;

        this.updateActivity();

        const viewport = this.page.viewportSize();
        if (!viewport) return;

        // Calculate coordinates
        let x = event.x;
        let y = event.y;

        if (event.normalizedX !== undefined && event.normalizedY !== undefined) {
            x = event.normalizedX * viewport.width;
            y = event.normalizedY * viewport.height;
        }

        try {
            switch (event.type) {
                case 'click':
                    await this.page.mouse.click(x, y, {
                        button: event.button === 2 ? 'right' : 'left'
                    });
                    this.streamingService.markGhostDOMDirty();
                    break;

                case 'move':
                    await this.page.mouse.move(x, y);
                    break;

                case 'scroll':
                    await this.page.mouse.wheel(event.deltaX || 0, event.deltaY || 0);
                    this.streamingService.markGhostDOMDirty();
                    break;
            }
        } catch (err) {
            console.warn(`[BrowserSession] Mouse input failed: ${err}`);
        }
    }

    /**
     * Execute keyboard input
     */
    async executeKeyboardInput(event: {
        type: 'press' | 'type' | 'down' | 'up';
        key?: string;
        text?: string;
    }): Promise<void> {
        if (!this.page) return;

        this.updateActivity();

        try {
            switch (event.type) {
                case 'press':
                    if (event.key) await this.page.keyboard.press(event.key);
                    break;

                case 'type':
                    if (event.text) await this.page.keyboard.type(event.text);
                    break;

                case 'down':
                    if (event.key) await this.page.keyboard.down(event.key);
                    break;

                case 'up':
                    if (event.key) await this.page.keyboard.up(event.key);
                    break;
            }

            this.streamingService.markGhostDOMDirty();
        } catch (err) {
            console.warn(`[BrowserSession] Keyboard input failed: ${err}`);
        }
    }

    /**
     * Apply CSS style to an element
     */
    async applyStyle(elementId: string, property: string, value: string): Promise<void> {
        if (!this.page) return;

        this.updateActivity();

        await this.page.evaluate(({ id, prop, val }) => {
            const el = document.querySelector(`[data-devoptic-id="${id}"]`) as HTMLElement;
            if (el) {
                (el.style as any)[prop] = val;
                // Visual feedback
                el.style.outline = '2px dashed #4ade80';
                setTimeout(() => { el.style.outline = ''; }, 500);
            }
        }, { id: elementId, prop: property, val: value });

        this.streamingService.markGhostDOMDirty();
    }

    /**
     * Get detailed inspection data for an element
     */
    async inspectElement(elementId: string): Promise<any | null> {
        if (!this.page) return null;

        this.updateActivity();

        return await this.page.evaluate((id: string) => {
            const el = document.querySelector(`[data-devoptic-id="${id}"]`);
            if (!el) return null;

            const htmlEl = el as HTMLElement;
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
    }

    /**
     * Set streaming quality
     */
    setQuality(quality: 'low' | 'medium' | 'high'): void {
        this.state.quality = quality;
        this.streamingService.setQuality(quality);

        // Update viewport to match quality
        const preset = QUALITY_PRESETS[quality];
        this.page?.setViewportSize({
            width: preset.width,
            height: preset.height
        });
    }

    /**
     * Set audio muted state
     */
    async setAudioMuted(muted: boolean): Promise<void> {
        await this.audioCapture.setMuted(muted);
    }

    /**
     * Get current session state
     */
    getState(): SessionState {
        return {
            ...this.state,
            frameCount: this.streamingService.getStats().framesCapture,
            audioLevel: this.audioCapture.getAudioLevel()
        };
    }

    /**
     * Schedule cleanup after disconnect
     */
    scheduleCleanup(delayMs?: number): void {
        const delay = delayMs || this.options.autoCleanupMs!;

        console.log(`[BrowserSession] Scheduling cleanup for ${this.sessionId} in ${delay}ms`);

        this.cancelCleanup();

        this.cleanupTimer = setTimeout(() => {
            console.log(`[BrowserSession] Auto-cleanup triggered for ${this.sessionId}`);
            this.destroy();
        }, delay);
    }

    /**
     * Cancel scheduled cleanup
     */
    cancelCleanup(): void {
        if (this.cleanupTimer) {
            clearTimeout(this.cleanupTimer);
            this.cleanupTimer = null;
            console.log(`[BrowserSession] Cleanup cancelled for ${this.sessionId}`);
        }
    }

    /**
     * Destroy the session
     */
    async destroy(): Promise<void> {
        console.log(`[BrowserSession] Destroying session ${this.sessionId}`);

        this.cancelCleanup();

        // Stop services
        this.streamingService.stopStreaming();
        this.audioCapture.stopCapture();

        // Save storage state
        await this.saveStorageState();

        // Detach services
        await this.streamingService.detach();
        await this.audioCapture.detach();
        this.privacyGuard.detach();

        // Close CDP session
        if (this.cdpSession) {
            try {
                await this.cdpSession.detach();
            } catch (e) { }
        }

        // Close page and context
        try {
            if (this.page) await this.page.close();
            if (this.context) await this.context.close();
        } catch (e) { }

        this.emit('destroyed', { sessionId: this.sessionId });

        console.log(`[BrowserSession] Session ${this.sessionId} destroyed`);
    }

    // ============ Private Methods ============

    private setupEventListeners(): void {
        // Forward streaming events
        this.streamingService.on('frame', (frame) => {
            this.state.frameCount++;
            this.emit('frame', { sessionId: this.sessionId, ...frame });
        });

        this.streamingService.on('ghostdom', (data) => {
            if (!this.state.isPrivacyMode) {
                this.emit('ghostdom', { sessionId: this.sessionId, ...data });
            }
        });

        // Forward audio events
        this.audioCapture.on('level', (level) => {
            this.state.audioLevel = level;
        });

        // Handle privacy changes
        this.privacyGuard.on('privacy:change', (data) => {
            this.state.isPrivacyMode = data.active;
            this.streamingService.setPrivacyMode(data.active);
            this.emit('privacy:sync', data);
        });
    }

    private async injectCursorHider(): Promise<void> {
        if (!this.page) return;

        const HIDE_CURSOR_CSS = `
      * { cursor: none !important; }
      *::selection { background: rgba(139, 92, 246, 0.3) !important; }
    `;

        await this.page.addStyleTag({ content: HIDE_CURSOR_CSS });

        this.page.on('domcontentloaded', async () => {
            try {
                await this.page?.addStyleTag({ content: HIDE_CURSOR_CSS });
            } catch (e) { }
        });
    }

    private async saveStorageState(): Promise<void> {
        if (!this.context) return;

        try {
            const state = await this.context.storageState();
            fs.writeFileSync(this.storageStatePath, JSON.stringify(state, null, 2));
        } catch (err) {
            console.warn(`[BrowserSession] Failed to save storage state: ${err}`);
        }
    }

    private updateActivity(): void {
        this.state.lastActiveAt = Date.now();
    }
}

export const createBrowserSession = (sessionId: string, options?: SessionOptions) =>
    new BrowserSession(sessionId, options);
