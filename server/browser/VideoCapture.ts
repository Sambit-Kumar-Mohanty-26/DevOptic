/**
 * VideoCapture - Captures browser frames for WebRTC streaming
 * 
 * Features:
 * - Uses Chrome DevTools Protocol (CDP) for frame capture
 * - Dynamic resolution scaling based on packet loss
 * - Configurable FPS and quality
 */

import { Page, CDPSession } from 'playwright';
import { EventEmitter } from 'events';
import { QUALITY_PRESETS } from './config.js';

export interface CaptureConfig {
    width: number;
    height: number;
    fps: number;
    jpegQuality: number;
}

export interface FrameData {
    data: Buffer;
    timestamp: number;
    width: number;
    height: number;
}

export class VideoCapture extends EventEmitter {
    private cdpSession: CDPSession | null = null;
    private page: Page | null = null;
    private sessionId: string = '';
    private config: CaptureConfig;
    private isCapturing: boolean = false;
    private captureInterval: NodeJS.Timeout | null = null;
    private frameCount: number = 0;
    private lastFrameTime: number = 0;

    constructor(config?: Partial<CaptureConfig>) {
        super();
        this.config = {
            width: QUALITY_PRESETS.high.width,
            height: QUALITY_PRESETS.high.height,
            fps: QUALITY_PRESETS.high.fps,
            jpegQuality: QUALITY_PRESETS.high.jpegQuality,
            ...config
        };
    }

    /**
     * Attach to a page and prepare for capture
     */
    async attach(page: Page, cdpSession: CDPSession, sessionId: string): Promise<void> {
        this.page = page;
        this.cdpSession = cdpSession;
        this.sessionId = sessionId;

        console.log(`[VideoCapture] Attached to session ${sessionId}`);
    }

    /**
     * Start capturing frames
     */
    async startCapture(): Promise<void> {
        if (this.isCapturing || !this.cdpSession) {
            return;
        }

        this.isCapturing = true;
        this.frameCount = 0;

        console.log(`[VideoCapture] Starting capture at ${this.config.fps}fps`);

        const frameInterval = 1000 / this.config.fps;

        this.captureInterval = setInterval(async () => {
            if (!this.isCapturing) return;

            try {
                const frame = await this.captureFrame();
                if (frame) {
                    this.emit('frame', frame);
                    this.frameCount++;
                }
            } catch (err) {
                // Suppress frame capture errors during navigation
            }
        }, frameInterval);
    }

    /**
     * Stop capturing frames
     */
    stopCapture(): void {
        this.isCapturing = false;

        if (this.captureInterval) {
            clearInterval(this.captureInterval);
            this.captureInterval = null;
        }

        console.log(`[VideoCapture] Stopped capture, total frames: ${this.frameCount}`);
    }

    /**
     * Capture a single frame
     */
    async captureFrame(): Promise<FrameData | null> {
        if (!this.cdpSession || !this.page) {
            return null;
        }

        const now = Date.now();

        // Enforce minimum frame interval
        const minInterval = 1000 / this.config.fps;
        if (now - this.lastFrameTime < minInterval * 0.8) {
            return null;
        }

        try {
            // Use CDP to capture screenshot
            const result = await this.cdpSession.send('Page.captureScreenshot', {
                format: 'jpeg',
                quality: this.config.jpegQuality,
                clip: {
                    x: 0,
                    y: 0,
                    width: this.config.width,
                    height: this.config.height,
                    scale: 1
                },
                captureBeyondViewport: false
            });

            this.lastFrameTime = now;

            return {
                data: Buffer.from(result.data, 'base64'),
                timestamp: now,
                width: this.config.width,
                height: this.config.height
            };

        } catch (err) {
            // Frame capture can fail during navigation
            return null;
        }
    }

    /**
     * Set capture quality (for dynamic resolution scaling)
     */
    setQuality(quality: 'low' | 'medium' | 'high'): void {
        const preset = QUALITY_PRESETS[quality];

        this.config.width = preset.width;
        this.config.height = preset.height;
        this.config.fps = preset.fps;
        this.config.jpegQuality = preset.jpegQuality;

        // Update viewport to match
        if (this.page) {
            this.page.setViewportSize({
                width: preset.width,
                height: preset.height
            }).catch(() => { });
        }

        console.log(`[VideoCapture] Quality set to ${quality}: ${preset.width}x${preset.height}@${preset.fps}fps`);
    }

    /**
     * Adapt quality based on network conditions
     * Called by the streaming layer with packet loss stats
     */
    adaptQuality(packetLossPercent: number): void {
        if (packetLossPercent > 5) {
            this.setQuality('low');
        } else if (packetLossPercent > 2) {
            this.setQuality('medium');
        } else {
            this.setQuality('high');
        }
    }

    /**
     * Get current capture stats
     */
    getStats(): { frameCount: number; fps: number; quality: CaptureConfig } {
        return {
            frameCount: this.frameCount,
            fps: this.config.fps,
            quality: { ...this.config }
        };
    }

    /**
     * Detach from the page
     */
    detach(): void {
        this.stopCapture();
        this.cdpSession = null;
        this.page = null;
        this.sessionId = '';
    }
}

export const createVideoCapture = (config?: Partial<CaptureConfig>) => new VideoCapture(config);
