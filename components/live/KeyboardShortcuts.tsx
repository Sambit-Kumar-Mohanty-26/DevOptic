"use client";

import { useEffect, useCallback } from "react";
import type { Socket } from "socket.io-client";

interface KeyboardShortcutsProps {
    sessionId: string;
    socket: Socket | null;
    isServerBrowserMode: boolean;
    onFindOpen: () => void;
    onNewTab: () => void;
    onCloseTab: () => void;
    onFocusUrl: () => void;
    onFullscreen: () => void;
}

export const KeyboardShortcuts = ({
    sessionId,
    socket,
    isServerBrowserMode,
    onFindOpen,
    onNewTab,
    onCloseTab,
    onFocusUrl,
    onFullscreen
}: KeyboardShortcutsProps) => {

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!isServerBrowserMode || !socket) return;

        const isCtrl = e.ctrlKey || e.metaKey;
        const isShift = e.shiftKey;
        const key = e.key.toLowerCase();

        // Ctrl+T - New Tab
        if (isCtrl && key === 't') {
            e.preventDefault();
            onNewTab();
            socket.emit('browser:tabs:new', { sessionId });
        }

        // Ctrl+W - Close Tab
        if (isCtrl && key === 'w') {
            e.preventDefault();
            onCloseTab();
        }

        // Ctrl+L - Focus URL Bar
        if (isCtrl && key === 'l') {
            e.preventDefault();
            onFocusUrl();
        }

        // Ctrl+R or F5 - Reload
        if ((isCtrl && key === 'r') || key === 'f5') {
            e.preventDefault();
            socket.emit('browser:reload', { sessionId });
        }

        // Ctrl+Shift+T - Reopen Closed Tab
        if (isCtrl && isShift && key === 't') {
            e.preventDefault();
            socket.emit('browser:tabs:reopen', { sessionId });
        }

        // Ctrl+F - Find in Page
        if (isCtrl && key === 'f') {
            e.preventDefault();
            onFindOpen();
        }

        // F11 - Fullscreen
        if (key === 'f11') {
            e.preventDefault();
            onFullscreen();
        }

        // Escape - Stop loading or close panels
        if (key === 'escape') {
            socket.emit('browser:stop', { sessionId });
        }

        // Alt+Left - Back
        if (e.altKey && key === 'arrowleft') {
            e.preventDefault();
            socket.emit('browser:back', { sessionId });
        }

        // Alt+Right - Forward
        if (e.altKey && key === 'arrowright') {
            e.preventDefault();
            socket.emit('browser:forward', { sessionId });
        }

        // Ctrl+Plus/Minus - Zoom
        if (isCtrl && (key === '=' || key === '+')) {
            e.preventDefault();
            socket.emit('browser:zoom', { sessionId, delta: 10 });
        }
        if (isCtrl && key === '-') {
            e.preventDefault();
            socket.emit('browser:zoom', { sessionId, delta: -10 });
        }

        // Ctrl+0 - Reset Zoom
        if (isCtrl && key === '0') {
            e.preventDefault();
            socket.emit('browser:zoom', { sessionId, zoom: 100 });
        }

        // Ctrl+Tab - Next Tab
        if (isCtrl && key === 'tab' && !isShift) {
            e.preventDefault();
            socket.emit('browser:tabs:next', { sessionId });
        }

        // Ctrl+Shift+Tab - Previous Tab
        if (isCtrl && key === 'tab' && isShift) {
            e.preventDefault();
            socket.emit('browser:tabs:prev', { sessionId });
        }

    }, [sessionId, socket, isServerBrowserMode, onFindOpen, onNewTab, onCloseTab, onFocusUrl, onFullscreen]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return null;
};

export default KeyboardShortcuts;
