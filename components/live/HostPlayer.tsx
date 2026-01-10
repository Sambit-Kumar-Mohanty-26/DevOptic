"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import pako from "pako";
import type { Socket } from "socket.io-client";

interface HostPlayerProps {
    sessionId: string;
    socket: Socket | null;
}

// rrweb event types
const EventType = {
    Meta: 4,
    FullSnapshot: 2,
    IncrementalSnapshot: 3,
};

export const HostPlayer = ({ sessionId, socket }: HostPlayerProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [status, setStatus] = useState<"waiting" | "connected" | "playing">("waiting");
    const [eventCount, setEventCount] = useState(0);
    const [lastEvent, setLastEvent] = useState<any>(null);
    const eventsRef = useRef<any[]>([]);

    // Process and render the snapshot
    const renderSnapshot = useCallback((snapshotEvent: any) => {
        if (!iframeRef.current || !snapshotEvent?.data?.node) return;

        try {
            const iframe = iframeRef.current;
            const doc = iframe.contentDocument;
            if (!doc) return;

            // Build HTML from the snapshot node tree
            const buildHTML = (node: any): string => {
                if (!node) return "";

                if (node.type === 3) { // Text node
                    return node.textContent || "";
                }

                if (node.type === 2) { // Element node
                    const tagName = node.tagName?.toLowerCase() || "div";

                    // Skip script tags for safety
                    if (tagName === "script") return "";

                    let attrs = "";
                    if (node.attributes) {
                        for (const [key, value] of Object.entries(node.attributes)) {
                            if (key !== "src" || tagName !== "script") {
                                attrs += ` ${key}="${String(value).replace(/"/g, "&quot;")}"`;
                            }
                        }
                    }

                    let children = "";
                    if (node.childNodes) {
                        children = node.childNodes.map(buildHTML).join("");
                    }

                    // Self-closing tags
                    if (["img", "br", "hr", "input", "meta", "link"].includes(tagName)) {
                        return `<${tagName}${attrs} />`;
                    }

                    return `<${tagName}${attrs}>${children}</${tagName}>`;
                }

                if (node.type === 0) { // Document
                    if (node.childNodes) {
                        return node.childNodes.map(buildHTML).join("");
                    }
                }

                return "";
            };

            const html = buildHTML(snapshotEvent.data.node);

            // Write to iframe
            doc.open();
            doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            * { box-sizing: border-box; }
            body { 
              margin: 0; 
              transform: scale(0.25); 
              transform-origin: top left; 
              width: 400%; 
              height: 400%;
              overflow: hidden;
            }
            img { max-width: 100%; height: auto; }
          </style>
        </head>
        <body>
          ${html}
        </body>
        </html>
      `);
            doc.close();

            setStatus("playing");
        } catch (err) {
            console.error("[HostPlayer] Render error:", err);
        }
    }, []);

    useEffect(() => {
        if (!socket) return;
        console.log("[HostPlayer] Requesting full snapshot...");
        socket.emit("rrweb:request-snapshot", sessionId);

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
                setLastEvent({ type: event.type, time: Date.now() });

                // When we get a FullSnapshot, render it
                if (event.type === EventType.FullSnapshot) {
                    renderSnapshot(event);
                }
            } catch (err) {
                console.error("[HostPlayer] Event error:", err);
            }
        };

        socket.on("rrweb:event", handleRrwebEvent);

        return () => {
            socket.off("rrweb:event", handleRrwebEvent);
        };
    }, [socket, sessionId, status, renderSnapshot]);

    return (
        <div className="w-full h-full relative bg-slate-950 rounded-lg overflow-hidden border border-white/10">
            {/* Status indicator */}
            <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${status === "playing" ? "bg-emerald-500" :
                        status === "connected" ? "bg-amber-500 animate-pulse" :
                            "bg-slate-600"
                    }`} />
                <span className="text-[8px] font-mono text-slate-500">
                    {eventCount > 0 ? `${eventCount} events` : ""}
                </span>
            </div>

            {/* Waiting overlay */}
            {status !== "playing" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-slate-950">
                    {status === "waiting" ? (
                        <>
                            <div className="relative mb-3">
                                <div className="w-8 h-8 border-2 border-violet-500/20 rounded-full" />
                                <div className="absolute inset-0 w-8 h-8 border-2 border-t-violet-500 rounded-full animate-spin" />
                            </div>
                            <p className="text-violet-400 text-[9px] font-mono tracking-widest uppercase">
                                Waiting for Guest...
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="w-2 h-2 bg-amber-500 rounded-full mb-2 animate-pulse" />
                            <p className="text-amber-400 text-[9px] font-mono tracking-widest uppercase">
                                Receiving data...
                            </p>
                            <p className="text-slate-500 text-[8px] font-mono mt-1">
                                {eventCount} events
                            </p>
                        </>
                    )}
                </div>
            )}

            {/* Iframe for rendering */}
            <iframe
                ref={iframeRef}
                className="w-full h-full border-none bg-white"
                style={{
                    opacity: status === "playing" ? 1 : 0,
                    transition: "opacity 0.3s ease",
                }}
                sandbox="allow-same-origin"
                title="Screen Mirror"
            />
        </div>
    );
};
