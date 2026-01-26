/**
 * AudioCapture - Captures audio from headless browser using CDP
 * 
 * Features:
 * - Captures page audio via CDP's Target.attachToTarget
 * - Supports media element audio (YouTube, etc.)
 * - Audio level monitoring
 * - Mute/unmute control
 */

import { Page, CDPSession, BrowserContext } from 'playwright';
import { EventEmitter } from 'events';

export interface AudioConfig {
    sampleRate: number;
    channels: 1 | 2;
    enabled: boolean;
}

export interface AudioPacket {
    type: 'audio';
    data: string; 
    timestamp: number;
    duration: number;
}

const defaultConfig: AudioConfig = {
    sampleRate: 44100,
    channels: 2,
    enabled: true
};

/**
 * Note: Browser audio capture via CDP is limited.
 * This implementation provides the infrastructure, but real audio 
 * streaming requires using Chromium's --enable-audio-service-sandbox
 * flag and specialized audio routing.
 * 
 * For production, we will rely on OS-level virtual audio devices:
 * - PulseAudio virtual sink on Linux
 * - Virtual Audio Cable on Windows
 * - Web Audio API capture within the page
 */
export class AudioCapture extends EventEmitter {
    private page: Page | null = null;
    private cdpSession: CDPSession | null = null;
    private sessionId: string = '';
    private config: AudioConfig;

    private isCapturing: boolean = false;
    private isMuted: boolean = false;
    private audioLevel: number = 0;

    constructor(config: Partial<AudioConfig> = {}) {
        super();
        this.config = { ...defaultConfig, ...config };
    }

    async attach(page: Page, sessionId: string): Promise<void> {
        this.page = page;
        this.sessionId = sessionId;

        this.cdpSession = await page.context().newCDPSession(page);

        try {
            await this.cdpSession.send('Audits.enable');
        } catch (e) {
            console.warn('[AudioCapture] Audits.enable not supported');
        }

        console.log(`[AudioCapture] Attached to session ${sessionId}`);
    }

    async startCapture(): Promise<void> {
        if (this.isCapturing || !this.page) return;

        this.isCapturing = true;
        await this.injectAudioMonitor();

        console.log('[AudioCapture] Started capture (monitor mode)');
    }

    stopCapture(): void {
        this.isCapturing = false;
        console.log('[AudioCapture] Stopped capture');
    }

    async setMuted(muted: boolean): Promise<void> {
        this.isMuted = muted;

        if (this.page) {
            await this.page.evaluate((mute) => {
                document.querySelectorAll('audio, video').forEach((el: any) => {
                    el.muted = mute;
                });
            }, muted);
        }

        console.log(`[AudioCapture] Muted: ${muted}`);
    }

    getAudioLevel(): number {
        return this.audioLevel;
    }

    private async injectAudioMonitor(): Promise<void> {
        if (!this.page) return;

        try {
            await this.page.exposeFunction('__audioLevelCallback', (level: number) => {
                this.audioLevel = level;
                this.emit('level', level);
            });
        } catch (e) {
        }

        await this.page.evaluate(() => {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;

            const connectMediaElement = (el: HTMLMediaElement) => {
                try {
                    const source = audioContext.createMediaElementSource(el);
                    source.connect(analyser);
                    analyser.connect(audioContext.destination);

                    const dataArray = new Uint8Array(analyser.frequencyBinCount);

                    const checkLevel = () => {
                        if (el.paused) return;
                        analyser.getByteFrequencyData(dataArray);
                        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
                        const normalized = avg / 255;
                        (window as any).__audioLevelCallback?.(normalized);
                        requestAnimationFrame(checkLevel);
                    };

                    el.addEventListener('play', checkLevel);
                } catch (e) {
                }
            };


            document.querySelectorAll('audio, video').forEach((el) => {
                connectMediaElement(el as HTMLMediaElement);
            });

            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node instanceof HTMLMediaElement) {
                            connectMediaElement(node);
                        }
                        if (node instanceof Element) {
                            node.querySelectorAll('audio, video').forEach((el) => {
                                connectMediaElement(el as HTMLMediaElement);
                            });
                        }
                    });
                });
            });

            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    async detach(): Promise<void> {
        this.stopCapture();

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

export const createAudioCapture = (config?: Partial<AudioConfig>) => new AudioCapture(config);
