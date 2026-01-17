"use client";

import { useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";

interface NetworkCaptureProps {
    sessionId: string;
    socket: Socket | null;
    isActive: boolean;
}

export const NetworkCapture = ({ sessionId, socket, isActive }: NetworkCaptureProps) => {
    const isPatchedRef = useRef(false);

    useEffect(() => {
        if (!socket || !isActive) return;
        if (isPatchedRef.current) return;

        console.log("[NetworkCapture] Initializing Deep Capture...");
        isPatchedRef.current = true;

        const originalFetch = window.fetch;
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;

        const tryParse = (data: any) => {
            try { return JSON.parse(data); } catch { return data; }
        };

        const emitRequest = (data: any) => {
            socket.emit("network:request", { sessionId, request: data });
        };
        window.fetch = async (...args) => {
            const startTime = performance.now();
            const [resource, config] = args;
            const url = typeof resource === 'string' ? resource : resource instanceof Request ? resource.url : '';
            const method = typeof resource === 'object' && 'method' in resource ? resource.method : (config?.method || 'GET');

            let requestBody = config?.body;
            if (requestBody && typeof requestBody !== 'string') {
                requestBody = '[Binary/Stream Data]';
            }

            try {
                const response = await originalFetch(...args);
                const clone = response.clone();
                const endTime = performance.now();

                clone.text().then((text) => {
                    emitRequest({
                        url: url.slice(0, 150),
                        method: method.toUpperCase(),
                        status: response.status,
                        type: "Fetch",
                        size: text.length,
                        duration: Math.round(endTime - startTime),
                        timestamp: Date.now(),
                        requestHeaders: config?.headers || {},
                        responseHeaders: Object.fromEntries(response.headers.entries()),
                        requestBody: tryParse(requestBody),
                        responseBody: tryParse(text.slice(0, 10000)),
                    });
                }).catch(() => {});

                return response;
            } catch (err: any) {
                emitRequest({
                    url: url.slice(0, 150),
                    method: method.toUpperCase(),
                    status: 0,
                    type: "Fetch",
                    size: 0,
                    duration: Math.round(performance.now() - startTime),
                    timestamp: Date.now(),
                    error: err.message
                });
                throw err;
            }
        };

        XMLHttpRequest.prototype.open = function (method: string, url: string | URL) {
            this._method = method;
            this._url = typeof url === 'string' ? url : url.toString();
            this._startTime = performance.now();
            return originalXHROpen.apply(this, arguments as any);
        };

        XMLHttpRequest.prototype.send = function (body) {
            this._requestBody = body;
            
            this.addEventListener('loadend', () => {
                const endTime = performance.now();
                const headerString = this.getAllResponseHeaders() || "";
                const responseHeaders = headerString.split('\r\n').reduce((acc: any, line) => {
                    const [key, val] = line.split(': ');
                    if(key) acc[key] = val;
                    return acc;
                }, {});

                let responseBody = this.response;
                if(this.responseType === '' || this.responseType === 'text') responseBody = this.responseText;
                if(this.responseType === 'json') responseBody = this.response;

                emitRequest({
                    url: (this._url || '').slice(0, 150),
                    method: (this._method || 'GET').toUpperCase(),
                    status: this.status,
                    type: "XHR",
                    size: (typeof responseBody === 'string' ? responseBody.length : 0),
                    duration: Math.round(endTime - (this._startTime || endTime)),
                    timestamp: Date.now(),
                    requestHeaders: {},
                    responseHeaders: responseHeaders,
                    requestBody: tryParse(this._requestBody),
                    responseBody: tryParse(typeof responseBody === 'string' ? responseBody.slice(0, 10000) : '[Binary]'),
                });
            });

            return originalXHRSend.apply(this, arguments as any);
        };

        const handleReplay = async (data: { url: string, method: string, body?: any, headers?: any }) => {
            console.log("[Network] Replaying Request:", data.url);
            toast.info(`Replaying ${data.method} ${data.url}`);
            
            try {
                await originalFetch(data.url, {
                    method: data.method,
                    headers: data.headers,
                    body: data.body ? JSON.stringify(data.body) : undefined
                });
                toast.success("Replay Successful (Check Network Tab)");
            } catch (err) {
                toast.error("Replay Failed");
            }
        };

        socket.on("network:replay", handleReplay);

        return () => {
            window.fetch = originalFetch;
            XMLHttpRequest.prototype.open = originalXHROpen;
            XMLHttpRequest.prototype.send = originalXHRSend;
            socket.off("network:replay", handleReplay);
            isPatchedRef.current = false;
        };
    }, [socket, sessionId, isActive]);

    return null;
};

declare global {
    interface XMLHttpRequest {
        _method?: string;
        _url?: string;
        _startTime?: number;
        _requestBody?: any;
    }
}