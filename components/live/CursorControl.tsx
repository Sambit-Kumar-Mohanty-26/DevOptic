"use client";

import { useEffect, useCallback, useState } from "react";
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

    const sendToIframe = useCallback((action: string, pageX: number, pageY: number, extra?: { deltaX?: number; deltaY?: number; button?: number }) => {
        const iframes = document.querySelectorAll('iframe');

        iframes.forEach((iframe) => {
            const rect = iframe.getBoundingClientRect();
            const iframeX = pageX - rect.left;
            const iframeY = pageY - rect.top;

            if (iframeX >= 0 && iframeY >= 0 && iframeX <= rect.width && iframeY <= rect.height) {

                if (iframe.contentWindow) {
                    iframe.contentWindow.postMessage({
                        type: 'DEVOPTIC_CURSOR',
                        payload: { action, x: iframeX, y: iframeY, ...extra }
                    }, '*'); // '*' allows sending to the proxy even if origin state is flux
                }
            }
        });
    }, []);

    // Simulate click on the Guest's machine
    const simulateClick = useCallback((x: number, y: number, button: number = 0) => {
        // Clamp coordinates to screen bounds
        x = Math.max(0, Math.min(x, window.innerWidth - 1));
        y = Math.max(0, Math.min(y, window.innerHeight - 1));

        setRemoteCursor(prev => prev ? { ...prev, x, y, clicking: true } : { x, y, clicking: true });
        setTimeout(() => setRemoteCursor(prev => prev ? { ...prev, clicking: false } : null), 200);

        const element = document.elementFromPoint(x, y) as HTMLElement;
        console.log("[CursorControl] Element from point:", element?.tagName, element?.className);
        if (!element) return;

        if (element.tagName === 'IFRAME') {
            console.log("[CursorControl] Sending click to IFRAME");
            sendToIframe('click', x, y, { button });
            return;
        }

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

            if (data.type === "move" || data.type === "click" || data.type === "scroll") {
                setRemoteCursor(prev => ({
                    x,
                    y,
                    clicking: data.type === "click" ? true : (prev?.clicking || false)
                }));
            }

            switch (data.type) {
                case "click":
                    console.log("[CursorControl] Simulating click at", x, y);
                    simulateClick(x, y, data.button || 0);
                    break;
                case "scroll":
                    console.log("[CursorControl] Simulating scroll", data.deltaX, data.deltaY);
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

    if (!controlGranted || !remoteCursor) return null;

    return (
        <div
            style={{
                position: 'fixed',
                left: remoteCursor.x,
                top: remoteCursor.y,
                pointerEvents: 'none',
                zIndex: 99999,
                transform: 'translate(-5px, -3px)',
                transition: 'top 0.05s linear, left 0.05s linear'
            }}
        >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                style={{
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
                    transform: remoteCursor.clicking ? 'scale(0.8)' : 'scale(1)',
                    transition: 'transform 0.1s'
                }}>
                <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.86a.5.5 0 0 0-.85.35Z" fill="#8B5CF6" stroke="#fff" strokeWidth="1.5" />
            </svg>
            <span style={{
                position: 'absolute',
                left: 16,
                top: 12,
                background: '#8B5CF6',
                color: 'white',
                padding: '2px 6px',
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 'bold',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}>
                HOST
            </span>
        </div>
    );
};