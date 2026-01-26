/**
 * Browser Module Index
 * Exports all browser engine components
 */

// Core session management
export { BrowserSession, createBrowserSession, type SessionState, type SessionOptions } from './BrowserSession.js';

// Individual services
export { StreamingService, createStreamingService, type StreamConfig, type FramePacket, type GhostDOMPacket } from './StreamingService.js';
export { AudioCapture, createAudioCapture, type AudioConfig, type AudioPacket } from './AudioCapture.js';
export { PrivacyGuard, createPrivacyGuard, type PrivacyConfig, type PrivacyState } from './PrivacyGuard.js';

// Legacy exports (for backward compatibility)
export { BrowserManager, browserManager, type CursorEvent } from './BrowserManager.js';
export { GhostDOM, createGhostDOM, type ElementMetadata, type GhostDOMConfig } from './GhostDOM.js';
export { VideoCapture, createVideoCapture, type CaptureConfig, type FrameData } from './VideoCapture.js';

// Configuration
export { defaultConfig, QUALITY_PRESETS, SENSITIVE_PATTERNS, type BrowserConfig } from './config.js';
