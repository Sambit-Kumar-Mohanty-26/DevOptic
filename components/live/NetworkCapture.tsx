"use client";

import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";

interface NetworkCaptureProps {
    sessionId: string;
    socket: Socket | null;
    isActive: boolean;
}

interface NetworkRequest {
    url: string;
    method: string;
    status: number;
    type: string;
    size: number;
    duration: number;
    timestamp: number;
}

export const NetworkCapture = ({ sessionId, socket, isActive }: NetworkCaptureProps) => {
    const observerRef = useRef<PerformanceObserver | null>(null);
    const sentRequestsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!socket || !isActive) return;

        console.log("[NetworkCapture] Starting network monitoring");

        // Use Performance Observer to capture resource timing
        const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();

            entries.forEach((entry) => {
                if (entry.entryType === "resource") {
                    const resourceEntry = entry as PerformanceResourceTiming;

                    // Create unique key for this request
                    const requestKey = `${resourceEntry.name}-${resourceEntry.startTime}`;

                    // Skip if already sent
                    if (sentRequestsRef.current.has(requestKey)) return;
                    sentRequestsRef.current.add(requestKey);

                    // Extract URL info
                    let url = resourceEntry.name;
                    try {
                        const urlObj = new URL(url);
                        url = urlObj.pathname + urlObj.search;
                    } catch {
                    }

                    // Determine request type from initiatorType
                    let type = resourceEntry.initiatorType || "other";
                    if (type === "xmlhttprequest" || type === "fetch") {
                        type = "XHR";
                    } else if (type === "script") {
                        type = "JS";
                    } else if (type === "link" || type === "css") {
                        type = "CSS";
                    } else if (type === "img") {
                        type = "IMG";
                    }

                    const request: NetworkRequest = {
                        url: url.slice(0, 100), // Truncate long URLs
                        method: "GET",
                        status: 200,
                        type,
                        size: resourceEntry.transferSize || 0,
                        duration: Math.round(resourceEntry.duration),
                        timestamp: Date.now(),
                    };

                    socket.emit("network:request", {
                        sessionId,
                        request,
                    });
                }
            });
        });

        // Observe resource timing entries
        try {
            observer.observe({ entryTypes: ["resource"] });
            observerRef.current = observer;
        } catch (err) {
            console.error("[NetworkCapture] Failed to start observer:", err);
        }

        // Also capture XHR/Fetch by monkey-patching
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const startTime = performance.now();
            const url = typeof args[0] === "string" ? args[0] : args[0] instanceof Request ? args[0].url : "";
            const method = typeof args[1]?.method === "string" ? args[1].method : "GET";

            try {
                const response = await originalFetch(...args);
                const endTime = performance.now();

                let displayUrl = url;
                try {
                    const urlObj = new URL(url, window.location.origin);
                    displayUrl = urlObj.pathname + urlObj.search;
                } catch { }

                const request: NetworkRequest = {
                    url: displayUrl.slice(0, 100),
                    method: method.toUpperCase(),
                    status: response.status,
                    type: "Fetch",
                    size: 0,
                    duration: Math.round(endTime - startTime),
                    timestamp: Date.now(),
                };

                socket.emit("network:request", { sessionId, request });

                return response;
            } catch (err) {
                throw err;
            }
        };

        return () => {
            console.log("[NetworkCapture] Stopping network monitoring");
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }
            window.fetch = originalFetch;
            sentRequestsRef.current.clear();
        };
    }, [socket, sessionId, isActive]);

    return null;
};
