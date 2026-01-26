/**
 * StreamingService - Manages WebRTC streaming from headless browser to clients
 * 
 * This module handles:
 * - Real-time frame capture using requestAnimationFrame-style polling
 * - WebRTC peer connection management for streaming
 * - DataChannel for Ghost DOM metadata
 * - Adaptive quality based on network conditions
 */

import { Page, CDPSession } from 'playwright';
import { EventEmitter } from 'events';
import { QUALITY_PRESETS } from './config.js';

export interface StreamConfig {
    fps: number;
    quality: 'low' | 'medium' | 'high';
    enableGhostDOM: boolean;
    ghostDOMIntervalMs: number;
}

export interface FramePacket {
    type: 'frame';
    data: string; // base64 JPEG
    timestamp: number;
    width: number;
    height: number;
    sequence: number;
}

export interface GhostDOMPacket {
    type: 'ghostdom';
    elements: any[];
    timestamp: number;
}

const defaultConfig: StreamConfig = {
    fps: 30,
    quality: 'high',
    enableGhostDOM: true,
    ghostDOMIntervalMs: 200
};

export class StreamingService extends EventEmitter {
    private page: Page | null = null;
    private cdpSession: CDPSession | null = null;
    private sessionId: string = '';
    private config: StreamConfig;

    private isStreaming: boolean = false;
    private frameInterval: NodeJS.Timeout | null = null;
    private ghostDOMInterval: NodeJS.Timeout | null = null;
    private frameSequence: number = 0;
    private lastFrameTime: number = 0;

    private isPrivacyMode: boolean = false;
    private ghostDOMDirty: boolean = true;
    private cachedGhostDOM: any[] = [];

    constructor(config: Partial<StreamConfig> = {}) {
        super();
        this.config = { ...defaultConfig, ...config };
    }

    /**
     * Attach to a page and prepare for streaming
     */
    async attach(page: Page, sessionId: string): Promise<void> {
        this.page = page;
        this.sessionId = sessionId;

        // Create CDP session for low-latency screenshot capture
        this.cdpSession = await page.context().newCDPSession(page);

        // Setup page event listeners for Ghost DOM invalidation
        page.on('domcontentloaded', () => this.markGhostDOMDirty());
        page.on('load', () => this.markGhostDOMDirty());

        // Expose function for scroll/mutation events
        try {
            await page.exposeFunction('__streamingMarkDirty', () => {
                this.markGhostDOMDirty();
            });
        } catch (e) {
            // Already exposed
        }

        // Setup scroll listener
        await page.evaluate(() => {
            let scrollTimer: any = null;
            window.addEventListener('scroll', () => {
                if (scrollTimer) clearTimeout(scrollTimer);
                scrollTimer = setTimeout(() => {
                    (window as any).__streamingMarkDirty?.();
                }, 50);
            }, true);
        });

        console.log(`[StreamingService] Attached to session ${sessionId}`);
    }

    /**
     * Start streaming frames and Ghost DOM
     */
    startStreaming(): void {
        if (this.isStreaming) return;

        this.isStreaming = true;
        this.frameSequence = 0;

        const preset = QUALITY_PRESETS[this.config.quality];
        const frameIntervalMs = 1000 / preset.fps;

        console.log(`[StreamingService] Starting stream at ${preset.fps}fps, ${preset.width}x${preset.height}`);

        // Frame capture loop
        this.frameInterval = setInterval(async () => {
            if (!this.isStreaming || this.isPrivacyMode) return;

            const frame = await this.captureFrame();
            if (frame) {
                this.emit('frame', frame);
            }
        }, frameIntervalMs);

        // Ghost DOM capture loop (less frequent)
        if (this.config.enableGhostDOM) {
            this.ghostDOMInterval = setInterval(async () => {
                if (!this.isStreaming || this.isPrivacyMode) return;

                const ghostDOM = await this.extractGhostDOM();
                if (ghostDOM && ghostDOM.length > 0) {
                    const packet: GhostDOMPacket = {
                        type: 'ghostdom',
                        elements: ghostDOM,
                        timestamp: Date.now()
                    };
                    this.emit('ghostdom', packet);
                }
            }, this.config.ghostDOMIntervalMs);
        }
    }

    /**
     * Stop streaming
     */
    stopStreaming(): void {
        this.isStreaming = false;

        if (this.frameInterval) {
            clearInterval(this.frameInterval);
            this.frameInterval = null;
        }

        if (this.ghostDOMInterval) {
            clearInterval(this.ghostDOMInterval);
            this.ghostDOMInterval = null;
        }

        console.log(`[StreamingService] Stopped streaming`);
    }

    /**
     * Capture a single frame using CDP
     */
    private async captureFrame(): Promise<FramePacket | null> {
        if (!this.cdpSession || !this.page) return null;

        const now = Date.now();
        const preset = QUALITY_PRESETS[this.config.quality];
        const minInterval = 1000 / preset.fps;

        // Throttle
        if (now - this.lastFrameTime < minInterval * 0.8) {
            return null;
        }

        try {
            const result = await this.cdpSession.send('Page.captureScreenshot', {
                format: 'jpeg',
                quality: preset.jpegQuality,
                captureBeyondViewport: false
            });

            this.lastFrameTime = now;
            this.frameSequence++;

            return {
                type: 'frame',
                data: result.data,
                timestamp: now,
                width: preset.width,
                height: preset.height,
                sequence: this.frameSequence
            };
        } catch (err) {
            // Page might be navigating
            return null;
        }
    }

    /**
     * Extract Ghost DOM metadata
     */
    private async extractGhostDOM(): Promise<any[] | null> {
        if (!this.page || !this.ghostDOMDirty) {
            return this.cachedGhostDOM;
        }

        try {
            const metadata = await this.page.evaluate(() => {
                const generateId = (el: Element): string => {
                    let id = el.getAttribute('data-devoptic-id');
                    if (!id) {
                        id = Math.random().toString(36).slice(2, 10);
                        el.setAttribute('data-devoptic-id', id);
                    }
                    return id;
                };

                const isInViewport = (rect: DOMRect): boolean => {
                    return rect.top < window.innerHeight &&
                        rect.bottom > 0 &&
                        rect.left < window.innerWidth &&
                        rect.right > 0;
                };

                const elements = document.querySelectorAll('*');
                const result: any[] = [];

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

            this.cachedGhostDOM = metadata;
            this.ghostDOMDirty = false;
            return metadata;

        } catch (err) {
            return this.cachedGhostDOM;
        }
    }

    /**
     * Mark Ghost DOM as needing refresh
     */
    markGhostDOMDirty(): void {
        this.ghostDOMDirty = true;
    }

    /**
     * Set privacy mode (stops frame capture, clears ghost DOM)
     */
    setPrivacyMode(enabled: boolean): void {
        this.isPrivacyMode = enabled;
        if (enabled) {
            this.cachedGhostDOM = [];
        }
        console.log(`[StreamingService] Privacy mode: ${enabled}`);
    }

    /**
     * Update streaming quality
     */
    setQuality(quality: 'low' | 'medium' | 'high'): void {
        this.config.quality = quality;

        // Restart streaming with new quality if active
        if (this.isStreaming) {
            this.stopStreaming();
            this.startStreaming();
        }

        console.log(`[StreamingService] Quality set to: ${quality}`);
    }

    /**
     * Get streaming stats
     */
    getStats(): { fps: number; quality: string; framesCapture: number } {
        return {
            fps: QUALITY_PRESETS[this.config.quality].fps,
            quality: this.config.quality,
            framesCapture: this.frameSequence
        };
    }

    /**
     * Detach from page
     */
    async detach(): Promise<void> {
        this.stopStreaming();

        if (this.cdpSession) {
            try {
                await this.cdpSession.detach();
            } catch (e) { }
            this.cdpSession = null;
        }

        this.page = null;
        this.sessionId = '';
    }
}

export const createStreamingService = (config?: Partial<StreamConfig>) => new StreamingService(config);
