/**
 * PrivacyGuard - Enhanced privacy protection for server-side browser
 * 
 * Features:
 * - Detects sensitive input fields (password, credit card, SSN)
 * - Pauses frame streaming during sensitive input
 * - Disables Ghost DOM transmission for metadata privacy
 * - Blurs existing frames when in privacy mode
 */

import { Page } from 'playwright';
import { EventEmitter } from 'events';
import { SENSITIVE_PATTERNS } from './config.js';

export interface PrivacyConfig {
    // Sensitive field patterns (regex)
    sensitivePatterns: RegExp;
    // Debounce time before exiting privacy mode
    exitDelayMs: number;
    // Additional sensitive input types
    sensitiveInputTypes: string[];
}

export interface PrivacyState {
    isActive: boolean;
    reason: string;
    triggeredAt: number | null;
}

const defaultConfig: PrivacyConfig = {
    sensitivePatterns: SENSITIVE_PATTERNS,
    exitDelayMs: 500,
    sensitiveInputTypes: ['password', 'email']
};

export class PrivacyGuard extends EventEmitter {
    private page: Page | null = null;
    private sessionId: string = '';
    private config: PrivacyConfig;

    private state: PrivacyState = {
        isActive: false,
        reason: '',
        triggeredAt: null
    };

    private exitTimer: NodeJS.Timeout | null = null;

    constructor(config: Partial<PrivacyConfig> = {}) {
        super();
        this.config = { ...defaultConfig, ...config };
    }

    /**
     * Attach to a page and start monitoring
     */
    async attach(page: Page, sessionId: string): Promise<void> {
        this.page = page;
        this.sessionId = sessionId;

        await this.setupMonitoring();

        console.log(`[PrivacyGuard] Attached to session ${sessionId}`);
    }

    /**
     * Setup privacy monitoring on the page
     */
    private async setupMonitoring(): Promise<void> {
        if (!this.page) return;

        // Expose callback function
        try {
            await this.page.exposeFunction('__privacyGuardCallback', (data: { active: boolean; reason: string }) => {
                this.handlePrivacyChange(data.active, data.reason);
            });
        } catch (e) {
            // Already exposed
        }

        // Inject monitoring script
        await this.page.evaluate((patterns) => {
            const SENSITIVE_REGEX = new RegExp(patterns, 'i');

            const isSensitiveElement = (el: HTMLElement | null): { sensitive: boolean; reason: string } => {
                if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
                    return { sensitive: false, reason: '' };
                }

                const input = el as HTMLInputElement;
                const type = (input.type || '').toLowerCase();
                const name = (input.name || '').toLowerCase();
                const id = (input.id || '').toLowerCase();
                const placeholder = (input.placeholder || '').toLowerCase();
                const autocomplete = (input.autocomplete || '').toLowerCase();

                // Check type
                if (type === 'password') {
                    return { sensitive: true, reason: 'Password input' };
                }

                // Check autocomplete hints
                if (autocomplete.includes('cc-') || autocomplete.includes('credit')) {
                    return { sensitive: true, reason: 'Credit card input' };
                }
                if (autocomplete === 'current-password' || autocomplete === 'new-password') {
                    return { sensitive: true, reason: 'Password input' };
                }

                // Check name/id patterns
                if (SENSITIVE_REGEX.test(name)) {
                    return { sensitive: true, reason: `Sensitive field: ${name}` };
                }
                if (SENSITIVE_REGEX.test(id)) {
                    return { sensitive: true, reason: `Sensitive field: ${id}` };
                }
                if (SENSITIVE_REGEX.test(placeholder)) {
                    return { sensitive: true, reason: `Sensitive placeholder: ${placeholder}` };
                }

                return { sensitive: false, reason: '' };
            };

            // Focus event handler
            document.addEventListener('focusin', (e) => {
                const result = isSensitiveElement(e.target as HTMLElement);
                if (result.sensitive) {
                    (window as any).__privacyGuardCallback({ active: true, reason: result.reason });
                }
            }, true);

            // Blur event handler
            document.addEventListener('focusout', () => {
                // Small delay to check if focus moved to another sensitive field
                setTimeout(() => {
                    const active = document.activeElement as HTMLElement;
                    const result = isSensitiveElement(active);
                    if (!result.sensitive) {
                        (window as any).__privacyGuardCallback({ active: false, reason: '' });
                    }
                }, 100);
            }, true);

            // Also check on page load for auto-focused sensitive fields
            setTimeout(() => {
                const active = document.activeElement as HTMLElement;
                const result = isSensitiveElement(active);
                if (result.sensitive) {
                    (window as any).__privacyGuardCallback({ active: true, reason: result.reason });
                }
            }, 500);

        }, this.config.sensitivePatterns.source);

        // Re-setup on navigation
        this.page.on('domcontentloaded', () => {
            this.setupMonitoring();
        });
    }

    /**
     * Handle privacy state change
     */
    private handlePrivacyChange(active: boolean, reason: string): void {
        if (active) {
            // Clear any pending exit timer
            if (this.exitTimer) {
                clearTimeout(this.exitTimer);
                this.exitTimer = null;
            }

            if (!this.state.isActive) {
                this.state = {
                    isActive: true,
                    reason,
                    triggeredAt: Date.now()
                };

                console.log(`[PrivacyGuard] Activated: ${reason}`);
                this.emit('privacy:change', {
                    sessionId: this.sessionId,
                    active: true,
                    reason
                });
            }
        } else {
            // Debounce exit to prevent flickering
            if (this.exitTimer) return;

            this.exitTimer = setTimeout(() => {
                this.exitTimer = null;

                if (this.state.isActive) {
                    this.state = {
                        isActive: false,
                        reason: '',
                        triggeredAt: null
                    };

                    console.log('[PrivacyGuard] Deactivated');
                    this.emit('privacy:change', {
                        sessionId: this.sessionId,
                        active: false,
                        reason: ''
                    });
                }
            }, this.config.exitDelayMs);
        }
    }

    /**
     * Get current privacy state
     */
    getState(): PrivacyState {
        return { ...this.state };
    }

    /**
     * Check if currently in privacy mode
     */
    isActive(): boolean {
        return this.state.isActive;
    }

    /**
     * Force privacy mode (e.g., when user manually activates)
     */
    forceActivate(reason: string = 'Manual activation'): void {
        this.handlePrivacyChange(true, reason);
    }

    /**
     * Force deactivate privacy mode
     */
    forceDeactivate(): void {
        if (this.exitTimer) {
            clearTimeout(this.exitTimer);
            this.exitTimer = null;
        }

        this.state = {
            isActive: false,
            reason: '',
            triggeredAt: null
        };

        this.emit('privacy:change', {
            sessionId: this.sessionId,
            active: false,
            reason: ''
        });
    }

    /**
     * Detach from page
     */
    detach(): void {
        if (this.exitTimer) {
            clearTimeout(this.exitTimer);
            this.exitTimer = null;
        }

        this.page = null;
        this.sessionId = '';
        this.state = {
            isActive: false,
            reason: '',
            triggeredAt: null
        };
    }
}

export const createPrivacyGuard = (config?: Partial<PrivacyConfig>) => new PrivacyGuard(config);
