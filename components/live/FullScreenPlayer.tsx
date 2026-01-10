"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import pako from "pako";
import type { Socket } from "socket.io-client";

interface FullScreenPlayerProps {
    sessionId: string;
    socket: Socket | null;
}

// rrweb event types
const EventType = {
    Meta: 4,
    FullSnapshot: 2,
    IncrementalSnapshot: 3,
};

export const FullScreenPlayer = ({ sessionId, socket }: FullScreenPlayerProps) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const eventsRef = useRef<any[]>([]);
    const [status, setStatus] = useState<"waiting" | "connected" | "playing">("waiting");
    const [eventCount, setEventCount] = useState(0);
    const [hasFullSnapshot, setHasFullSnapshot] = useState(false);
    const [cursorPos, setCursorPos] = useState<{ x: number, y: number } | null>(null);
    const scaleRef = useRef(1);

    // Build HTML from rrweb snapshot node tree
    const buildHTML = useCallback((node: any): string => {
        if (!node) return "";

        if (node.type === 3) { // Text node
            return node.textContent || "";
        }

        if (node.type === 2) { // Element node
            const tagName = node.tagName?.toLowerCase() || "div";

            // Skip script tags for safety
            if (tagName === "script" || tagName === "noscript") return "";

            let attrs = "";
            if (node.attributes) {
                for (const [key, value] of Object.entries(node.attributes)) {
                    if (key === "src" && tagName === "script") continue;
                    // Handle srcset and src for images
                    if ((key === "src" || key === "srcset") && tagName === "img") {
                        attrs += ` ${key}="${String(value)}"`;
                    } else if (key !== "onclick" && key !== "onload" && key !== "onerror") {
                        attrs += ` ${key}="${String(value).replace(/"/g, "&quot;")}"`;
                    }
                }
            }

            let children = "";
            if (node.childNodes) {
                children = node.childNodes.map(buildHTML).join("");
            }

            // Self-closing tags
            if (["img", "br", "hr", "input", "meta", "link", "area", "base", "col", "embed", "source", "track", "wbr"].includes(tagName)) {
                return `<${tagName}${attrs} />`;
            }

            return `<${tagName}${attrs}>${children}</${tagName}>`;
        }

        if (node.type === 0 || node.type === 1) { // Document or DocumentType
            if (node.childNodes) {
                return node.childNodes.map(buildHTML).join("");
            }
        }

        return "";
    }, []);

    // Render snapshot to iframe
    const renderSnapshot = useCallback((snapshotEvent: any) => {
        if (!iframeRef.current || !snapshotEvent?.data?.node) return;

        try {
            const iframe = iframeRef.current;
            const doc = iframe.contentDocument;
            if (!doc) return;

            const html = buildHTML(snapshotEvent.data.node);

            // Calculate scale based on container size
            const container = iframe.parentElement;
            if (container) {
                const containerWidth = container.clientWidth;
                const containerHeight = container.clientHeight;
                // Assume recorded page is ~1920x1080
                scaleRef.current = Math.min(containerWidth / 1920, containerHeight / 1080, 1);
            }

            // Write to iframe with scaled body
            doc.open();
            doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <base href="https://nextjs.org" />
          <style>
            * { box-sizing: border-box; }
            html, body { 
              margin: 0; 
              padding: 0;
              overflow: hidden;
              background: white;
            }
            body {
              transform: scale(${scaleRef.current});
              transform-origin: top left;
              width: ${100 / scaleRef.current}%;
              height: ${100 / scaleRef.current}%;
            }
            img { max-width: 100%; height: auto; }
            a { pointer-events: none; }
          </style>
        </head>
        <body>${html}</body>
        </html>
      `);
            doc.close();

            setStatus("playing");
        } catch (err) {
            console.error("[FullScreenPlayer] Render error:", err);
        }
    }, [buildHTML]);

    // Handle incremental events (cursor movement, scrolls, etc)
    const handleIncrementalEvent = useCallback((event: any) => {
        if (!event.data) return;

        if (event.data.source === 1 || event.data.source === 6) {
            if (event.data.positions && event.data.positions.length > 0) {
                const lastPos = event.data.positions[event.data.positions.length - 1];
                setCursorPos({
                    x: lastPos.x * scaleRef.current,
                    y: lastPos.y * scaleRef.current
                });
            }
        }

        if (event.data.source === 3 && iframeRef.current?.contentDocument) {
            const doc = iframeRef.current.contentDocument;
            const el = doc.querySelector(`[data-rr-id="${event.data.id}"]`) || doc.documentElement;
            if (el) {
                el.scrollTop = event.data.y;
                el.scrollLeft = event.data.x;
            }
        }
    }, []);

    useEffect(() => {
        if (!socket) return;

        console.log("[FullScreenPlayer] Setting up for session:", sessionId);

        const handleRrwebEvent = async (data: { event: string; timestamp: number }) => {
            try {
                // Decode and decompress
                const binaryString = atob(data.event);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                const decompressed = pako.inflate(bytes, { to: "string" });
                const event = JSON.parse(decompressed);

                if (status === "waiting") setStatus("connected");

                eventsRef.current.push(event);
                setEventCount(eventsRef.current.length);

                // Handle different event types
                if (event.type === EventType.Meta) {
                    console.log("[FullScreenPlayer] New session");
                    eventsRef.current = [event];
                    setEventCount(1);
                    setHasFullSnapshot(false);
                    setStatus("connected");
                    setCursorPos(null);
                    return;
                }

                if (event.type === EventType.FullSnapshot) {
                    console.log("[FullScreenPlayer] FullSnapshot received");
                    setHasFullSnapshot(true);
                    renderSnapshot(event);
                }

                if (event.type === EventType.IncrementalSnapshot) {
                    handleIncrementalEvent(event);
                }
            } catch (err) {
                console.error("[FullScreenPlayer] Event error:", err);
            }
        };

        socket.on("rrweb:event", handleRrwebEvent);

        return () => {
            socket.off("rrweb:event", handleRrwebEvent);
        };
    }, [socket, sessionId, status, renderSnapshot, handleIncrementalEvent]);

    return (
        <div className="w-full h-full relative bg-slate-900 overflow-hidden rounded-2xl border border-white/10">
            {/* Status Header */}
            <div className="absolute top-4 left-4 z-30 flex items-center gap-3 bg-slate-900/90 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10">
                <div className={`w-2 h-2 rounded-full ${status === "playing" ? "bg-emerald-500 shadow-[0_0_10px_#10b981]" :
                        status === "connected" ? "bg-amber-500 animate-pulse" :
                            "bg-slate-600"
                    }`} />
                <span className="text-xs font-mono text-slate-400">
                    {status === "playing" ? "LIVE" : status === "connected" ? "SYNCING..." : "WAITING"}
                </span>
                <span className="text-xs font-mono text-slate-600">{eventCount} events</span>
            </div>

            {/* Waiting Overlay */}
            {status !== "playing" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-slate-900">
                    <div className="relative mb-6">
                        <div className="w-16 h-16 border-4 border-violet-500/20 rounded-full" />
                        <div className="absolute inset-0 w-16 h-16 border-4 border-t-violet-500 rounded-full animate-spin" />
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">
                        {status === "waiting" ? "Waiting for Guest" : "Receiving Screen Data..."}
                    </h2>
                    <p className="text-slate-500 text-sm">
                        {status === "waiting"
                            ? "The guest needs to click 'Guest' to share their screen"
                            : `${eventCount} events received${hasFullSnapshot ? " ✓" : ""}`
                        }
                    </p>
                </div>
            )}

            {/* Remote Cursor */}
            {status === "playing" && cursorPos && (
                <div
                    className="absolute z-30 pointer-events-none transition-all duration-75"
                    style={{ left: cursorPos.x, top: cursorPos.y }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M4 4L20 12L12 14L10 22L4 4Z" fill="#a855f7" stroke="#fff" strokeWidth="1" />
                    </svg>
                </div>
            )}

            <iframe
                ref={iframeRef}
                className="absolute inset-0 w-full h-full border-none"
                style={{
                    opacity: status === "playing" ? 1 : 0,
                    transition: "opacity 0.3s ease",
                    background: "white",
                }}
                sandbox="allow-same-origin"
                title="Screen Mirror"
            />
        </div>
    );
};
