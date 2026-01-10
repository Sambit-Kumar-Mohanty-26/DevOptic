"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import type { Socket } from "socket.io-client";

interface CursorControlProps {
    sessionId: string;
    socket: Socket | null;
    controlGranted: boolean;
}

interface CursorEvent {
    type: "click" | "move" | "scroll";
    x?: number;
    y?: number;
    button?: number;
    deltaX?: number;
    deltaY?: number;
    normalizedX?: number;
    normalizedY?: number;
}

export const CursorControl = ({ sessionId, socket, controlGranted }: CursorControlProps) => {
    const [remoteCursor, setRemoteCursor] = useState<{ x: number; y: number; clicking: boolean } | null>(null);
    const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

    // Initialize BroadcastChannel for cross-origin iframe communication
    useEffect(() => {
        try {
            broadcastChannelRef.current = new BroadcastChannel('devoptic-cursor');
            console.log("[CursorControl] BroadcastChannel initialized");
        } catch (e) {
            console.log("[CursorControl] BroadcastChannel not available");
        }
        return () => {
            broadcastChannelRef.current?.close();
        };
    }, []);

    // Send command to iframe via BroadcastChannel (works cross-origin!)
    const sendToIframe = useCallback((action: string, pageX: number, pageY: number, extra?: { deltaX?: number; deltaY?: number; button?: number }) => {
        // Find the iframe and calculate relative coordinates
        const iframes = document.querySelectorAll('iframe');

        iframes.forEach((iframe) => {
            const rect = iframe.getBoundingClientRect();
            const iframeX = pageX - rect.left;
            const iframeY = pageY - rect.top;

            // Check if click is within iframe bounds
            if (iframeX >= 0 && iframeY >= 0 && iframeX <= rect.width && iframeY <= rect.height) {
                console.log("[CursorControl] Sending to iframe via BroadcastChannel:", action, Math.round(iframeX), Math.round(iframeY));

                // Use BroadcastChannel (works cross-origin within same browser)
                broadcastChannelRef.current?.postMessage({
                    action,
                    x: iframeX,
                    y: iframeY,
                    ...extra
                });

                // Also try postMessage as fallback
                try {
                    iframe.contentWindow?.postMessage({
                        type: 'DEVOPTIC_CURSOR',
                        payload: { action, x: iframeX, y: iframeY, ...extra }
                    }, '*');
                } catch (err) {
                    // Cross-origin blocked - BroadcastChannel should work
                }
            }
        });
    }, []);

    // Simulate click
    const simulateClick = useCallback((x: number, y: number, button: number = 0) => {
        x = Math.max(0, Math.min(x, window.innerWidth - 1));
        y = Math.max(0, Math.min(y, window.innerHeight - 1));

        // Show visual click feedback
        setRemoteCursor({ x, y, clicking: true });
        setTimeout(() => setRemoteCursor(prev => prev ? { ...prev, clicking: false } : null), 200);

        const element = document.elementFromPoint(x, y) as HTMLElement;
        if (!element) return;

        console.log("[CursorControl] Click on:", element.tagName);

        // For iframes, send via BroadcastChannel with CORRECT coordinates
        if (element.tagName === 'IFRAME') {
            sendToIframe('click', x, y, { button });
            return;
        }

        // For regular elements
        const eventOptions: MouseEventInit = {
            bubbles: true, cancelable: true, view: window,
            clientX: x, clientY: y, button, buttons: button === 0 ? 1 : button,
        };

        element.dispatchEvent(new MouseEvent("mousedown", eventOptions));
        element.dispatchEvent(new MouseEvent("mouseup", eventOptions));
        element.dispatchEvent(new MouseEvent("click", eventOptions));

        const clickable = element.closest("button, a, [role='button']") as HTMLElement;
        if (clickable?.click) {
            try { clickable.click(); } catch (e) { }
        }
    }, [sendToIframe]);

    // Simulate scroll
    const simulateScroll = useCallback((deltaX: number, deltaY: number, x?: number, y?: number) => {
        if (x !== undefined && y !== undefined) {
            const element = document.elementFromPoint(x, y);
            if (element?.tagName === 'IFRAME') {
                sendToIframe('scroll', x, y, { deltaX, deltaY });
                return;
            }
        }
        window.scrollBy({ left: deltaX, top: deltaY, behavior: "auto" });
    }, [sendToIframe]);

    useEffect(() => {
        if (!socket || !controlGranted) {
            setRemoteCursor(null);
            return;
        }

        console.log("[CursorControl] Active");

        const handleCursorEvent = (data: CursorEvent) => {
            let x: number, y: number;

            if (data.normalizedX !== undefined && data.normalizedY !== undefined) {
                const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
                const viewportHeight = document.documentElement.clientHeight || window.innerHeight;

                x = data.normalizedX * viewportWidth;
                y = data.normalizedY * viewportHeight;
            } else {
                x = data.x || 0;
                y = data.y || 0;
            }

            // Update cursor position
            if (data.type === "move" || data.type === "click") {
                setRemoteCursor(prev => ({
                    x,
                    y,
                    clicking: data.type === "click" ? true : (prev?.clicking || false)
                }));
            }

            switch (data.type) {
                case "click":
                    simulateClick(x, y, data.button || 0);
                    break;
                case "scroll":
                    simulateScroll(data.deltaX || 0, data.deltaY || 0, x, y);
                    break;
            }
        };

        socket.on("control:cursor", handleCursorEvent);
        return () => {
            socket.off("control:cursor", handleCursorEvent);
            setRemoteCursor(null);
        };
    }, [socket, controlGranted, simulateClick, simulateScroll]);

    // Render remote cursor overlay
    if (!controlGranted || !remoteCursor) return null;

    return (
        <div
            style={{
                position: 'fixed',
                left: remoteCursor.x,
                top: remoteCursor.y,
                pointerEvents: 'none',
                zIndex: 99999,
                transform: 'translate(-2px, -2px)',
            }}
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))', transform: remoteCursor.clicking ? 'scale(0.9)' : 'scale(1)', transition: 'transform 0.1s' }}>
                <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.86a.5.5 0 0 0-.85.35Z" fill="#8B5CF6" stroke="#fff" strokeWidth="1.5" />
            </svg>
            {remoteCursor.clicking && (
                <div style={{ position: 'absolute', width: 40, height: 40, borderRadius: '50%', background: 'rgba(139, 92, 246, 0.4)', top: -8, left: -8, animation: 'ping 0.3s ease-out forwards' }} />
            )}
            <span style={{ position: 'absolute', left: 20, top: 8, background: '#8B5CF6', color: 'white', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 'bold' }}>HOST</span>
            <style>{`@keyframes ping { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(2); opacity: 0; } }`}</style>
        </div>
    );
};
