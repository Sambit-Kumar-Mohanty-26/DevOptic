/**
 * GhostDOM - Extracts DOM metadata from headless browser for overlay rendering
 * 
 * Features:
 * - Throttled page.evaluate() to prevent server lag
 * - Event-driven updates (scroll, navigation, DOM mutations)
 * - Limits extraction to visible viewport elements
 * - Generates unique element IDs for targeting
 */

import { Page } from 'playwright';
import { EventEmitter } from 'events';

export interface ElementMetadata {
    id: string;
    tagName: string;
    classes: string;
    idAttr: string;
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
        top: number;
        left: number;
    };
    isInteractive: boolean;
    innerText?: string;
}

export interface GhostDOMConfig {
    throttleMs: number;          // Minimum time between syncs
    maxElements: number;         // Maximum elements to extract
    debounceMs: number;          // Debounce for rapid events
}

const defaultConfig: GhostDOMConfig = {
    throttleMs: 100,
    maxElements: 500,
    debounceMs: 50
};

export class GhostDOM extends EventEmitter {
    private page: Page | null = null;
    private sessionId: string = '';
    private config: GhostDOMConfig;
    private lastSyncTime: number = 0;
    private isDirty: boolean = true;
    private cachedMetadata: ElementMetadata[] = [];
    private debounceTimer: NodeJS.Timeout | null = null;
    private isEnabled: boolean = true;

    constructor(config: Partial<GhostDOMConfig> = {}) {
        super();
        this.config = { ...defaultConfig, ...config };
    }

    /**
     * Attach to a page and start monitoring
     */
    async attach(page: Page, sessionId: string): Promise<void> {
        this.page = page;
        this.sessionId = sessionId;
        this.isDirty = true;

        // Setup event listeners for smart re-sync
        await this.setupMutationObserver();

        console.log(`[GhostDOM] Attached to session ${sessionId}`);
    }

    /**
     * Detach from the page
     */
    detach(): void {
        this.page = null;
        this.sessionId = '';
        this.cachedMetadata = [];
    }

    /**
     * Enable/disable the Ghost DOM (for privacy mode)
     */
    setEnabled(enabled: boolean): void {
        this.isEnabled = enabled;
        if (!enabled) {
            this.cachedMetadata = [];
        }
        console.log(`[GhostDOM] ${enabled ? 'Enabled' : 'Disabled'}`);
    }

    /**
     * Mark the DOM as dirty (needs re-sync)
     */
    markDirty(): void {
        if (!this.isEnabled) return;

        // Debounce rapid events
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.isDirty = true;
            this.emit('dirty', this.sessionId);
        }, this.config.debounceMs);
    }

    /**
     * Extract DOM metadata (throttled)
     * Returns cached data if called too frequently
     */
    async extractMetadata(): Promise<ElementMetadata[]> {
        if (!this.page || !this.isEnabled) {
            return [];
        }

        const now = Date.now();

        // Return cached if not dirty and within throttle window
        if (!this.isDirty && now - this.lastSyncTime < this.config.throttleMs) {
            return this.cachedMetadata;
        }

        this.lastSyncTime = now;
        this.isDirty = false;

        try {
            const metadata = await this.page.evaluate((maxElements: number) => {
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

                const isInteractive = (el: Element): boolean => {
                    const tag = el.tagName.toLowerCase();
                    return ['button', 'a', 'input', 'select', 'textarea', 'label'].includes(tag) ||
                        el.getAttribute('role') === 'button' ||
                        el.getAttribute('onclick') !== null ||
                        (el as HTMLElement).onclick !== null;
                };

                const elements = document.querySelectorAll('*');
                const result: any[] = [];

                for (const el of elements) {
                    if (result.length >= maxElements) break;

                    const rect = el.getBoundingClientRect();

                    // Skip invisible or out-of-viewport elements
                    if (rect.width <= 0 || rect.height <= 0) continue;
                    if (!isInViewport(rect)) continue;

                    // Skip very small elements
                    if (rect.width < 5 || rect.height < 5) continue;

                    const htmlEl = el as HTMLElement;

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
                        isInteractive: isInteractive(el),
                        innerText: htmlEl.innerText?.slice(0, 100) || undefined
                    });
                }

                return result;
            }, this.config.maxElements);

            this.cachedMetadata = metadata;
            return metadata;

        } catch (err) {
            console.warn(`[GhostDOM] Extraction failed: ${err}`);
            return this.cachedMetadata;
        }
    }

    /**
     * Find element at a specific point
     */
    findElementAtPoint(x: number, y: number): ElementMetadata | null {
        // Find the smallest element containing the point (most specific)
        let best: ElementMetadata | null = null;
        let bestArea = Infinity;

        for (const el of this.cachedMetadata) {
            if (x >= el.rect.left && x <= el.rect.left + el.rect.width &&
                y >= el.rect.top && y <= el.rect.top + el.rect.height) {
                const area = el.rect.width * el.rect.height;
                if (area < bestArea) {
                    best = el;
                    bestArea = area;
                }
            }
        }

        return best;
    }

    /**
     * Get detailed inspection data for a specific element
     */
    async inspectElement(elementId: string): Promise<any | null> {
        if (!this.page) return null;

        try {
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
                        // Layout
                        display: s.display,
                        position: s.position,
                        width: s.width,
                        height: s.height,
                        margin: s.margin,
                        padding: s.padding,
                        // Typography
                        color: s.color,
                        fontSize: s.fontSize,
                        fontWeight: s.fontWeight,
                        fontFamily: s.fontFamily,
                        textAlign: s.textAlign,
                        lineHeight: s.lineHeight,
                        // Appearance
                        backgroundColor: s.backgroundColor,
                        borderRadius: s.borderRadius,
                        border: s.border,
                        opacity: s.opacity,
                        // Flex/Grid
                        flexDirection: s.flexDirection,
                        justifyContent: s.justifyContent,
                        alignItems: s.alignItems,
                        gap: s.gap
                    }
                };
            }, elementId);
        } catch (err) {
            console.warn(`[GhostDOM] Inspection failed: ${err}`);
            return null;
        }
    }

    /**
     * Setup mutation observer on the page for smart re-sync
     */
    private async setupMutationObserver(): Promise<void> {
        if (!this.page) return;

        try {
            // Expose callback for DOM changes
            await this.page.exposeFunction('__ghostDOMMarkDirty', () => {
                this.markDirty();
            });
        } catch (err) {
            // Function might already be exposed
        }

        await this.page.evaluate(() => {
            // Watch for DOM mutations
            const observer = new MutationObserver(() => {
                (window as any).__ghostDOMMarkDirty();
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'style', 'hidden']
            });

            // Watch for scroll
            let scrollTimer: any = null;
            window.addEventListener('scroll', () => {
                if (scrollTimer) clearTimeout(scrollTimer);
                scrollTimer = setTimeout(() => {
                    (window as any).__ghostDOMMarkDirty();
                }, 50);
            }, true);

            // Watch for resize
            window.addEventListener('resize', () => {
                (window as any).__ghostDOMMarkDirty();
            });
        });

        // Also mark dirty on navigation
        this.page.on('domcontentloaded', () => this.markDirty());
        this.page.on('load', () => this.markDirty());
    }
}

export const createGhostDOM = (config?: Partial<GhostDOMConfig>) => new GhostDOM(config);
