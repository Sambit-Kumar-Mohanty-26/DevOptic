/**
 * Browser Service Configuration
 * Defines settings for the headless browser engine
 */

export interface BrowserConfig {
    // Browser context settings
    viewport: {
        width: number;
        height: number;
    };

    // User agent to use for requests
    userAgent: string;

    // Session storage directory
    storageDir: string;

    // Auto-cleanup timeout in milliseconds (default: 2 minutes)
    cleanupTimeoutMs: number;

    // Maximum concurrent sessions
    maxSessions: number;

    // Frame capture settings
    capture: {
        fps: number;
        quality: 'low' | 'medium' | 'high';
    };
}

export const defaultConfig: BrowserConfig = {
    viewport: {
        width: 1920,
        height: 1080
    },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    storageDir: './server/storage/sessions',
    cleanupTimeoutMs: 120000, // 2 minutes
    maxSessions: 10,
    capture: {
        fps: 30,
        quality: 'high'
    }
};

// Quality presets for dynamic resolution scaling
export const QUALITY_PRESETS = {
    low: {
        width: 1280,
        height: 720,
        fps: 15,
        jpegQuality: 50
    },
    medium: {
        width: 1600,
        height: 900,
        fps: 30,
        jpegQuality: 80
    },
    high: {
        width: 1920,
        height: 1080,
        fps: 40,
        jpegQuality: 95
    }
} as const;

// Sensitive field patterns for privacy detection
export const SENSITIVE_PATTERNS = /password|passwd|secret|card|cc|cvv|token|auth|login|credential|ssn|social.*security/i;
