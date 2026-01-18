"use client";

import { useEffect, useRef } from "react";
import { record } from "rrweb";
import pako from "pako";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";

interface GuestRecorderProps {
    sessionId: string;
    socket: Socket | null;
    isRecording: boolean;
}

export const GuestRecorder = ({ sessionId, socket, isRecording }: GuestRecorderProps) => {
    const stopRecordingRef = useRef<(() => void) | null>(null);
    const consoleOverridesRef = useRef<{
        log: typeof console.log;
        warn: typeof console.warn;
        error: typeof console.error;
        info: typeof console.info;
    } | null>(null);

    const eventBuffer = useRef<any[]>([]);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const hasErrorRef = useRef(false);

    useEffect(() => {
        if (!socket || !isRecording) {
            if (stopRecordingRef.current) {
                stopRecordingRef.current();
                stopRecordingRef.current = null;
            }
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            if (consoleOverridesRef.current) {
                console.log = consoleOverridesRef.current.log;
                console.warn = consoleOverridesRef.current.warn;
                console.error = consoleOverridesRef.current.error;
                console.info = consoleOverridesRef.current.info;
                consoleOverridesRef.current = null;
            }
            return;
        }

        console.log("[GuestRecorder] Starting Batched rrweb recording for session:", sessionId);
        hasErrorRef.current = false;

        // The Batch Flush Loop
        intervalRef.current = setInterval(() => {
            if (eventBuffer.current.length === 0) return;

            try {
                const payload = JSON.stringify(eventBuffer.current);
                const compressed = pako.deflate(payload);
                const CHUNK_SIZE = 0x8000;
                let result = '';
                for (let i = 0; i < compressed.length; i += CHUNK_SIZE) {
                    const chunk = compressed.subarray(i, i + CHUNK_SIZE);
                    result += String.fromCharCode.apply(null, Array.from(chunk));
                }
                const base64 = btoa(result);

                socket.emit("rrweb:batch", {
                    sessionId,
                    batch: base64,
                    timestamp: Date.now(),
                });
                
                hasErrorRef.current = false; 
                eventBuffer.current = [];
            } catch (err) {
                console.error("[GuestRecorder] Failed to emit batch:", err);
                
                if (!hasErrorRef.current) {
                    toast.error("Recording Error: Failed to send data. Check connection.");
                    hasErrorRef.current = true;
                }
                
                eventBuffer.current = [];
            }
        }, 500);

        // --- RRWEB RECORDING ---
        try {
            const stopFn = record({
                emit(event) {
                    eventBuffer.current.push(event);
                },
                checkoutEveryNms: 5000,
                blockClass: "devoptic-block",
                maskTextClass: "devoptic-mask", 
                maskInputOptions: {
                    password: true,
                    email: true,
                    tel: true,
                    color: false,
                    date: false,
                    "datetime-local": false,
                    time: false,
                    month: false,
                    number: false,
                    range: false,
                    search: false,
                    text: false,
                    url: false,
                    week: false,
                    textarea: false,
                    select: false,
                },
                maskTextFn: (text: string) => {
                    const ccRegex = /\b(?:\d[ -]*?){13,16}\b/g;
                    if (ccRegex.test(text)) {
                        return text.replace(ccRegex, '****-****-****-****');
                    }
                    return text;
                }
            });

            if (stopFn) {
                stopRecordingRef.current = stopFn;
                console.log("[GuestRecorder] Recording started successfully");
            } else {
                // Manually throw if stopFn is undefined
                throw new Error("rrweb returned undefined stop function");
            }
        } catch (err) {
            console.error("[GuestRecorder] Failed to start recording:", err);
            toast.error("Failed to initialize screen recording. Please refresh.");
        }

        const handleSnapshotRequest = (data: { requestorId: string }) => {
            console.log("[GuestRecorder] Received snapshot request from:", data.requestorId);
            try {
                record.takeFullSnapshot(true);
            } catch (err) {
                console.error("Snapshot failed:", err);
                toast.error("Sync Error: Failed to generate snapshot.");
            }
        };

        socket.on('rrweb:request-snapshot', handleSnapshotRequest);

        // --- CONSOLE OVERRIDE ---
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;
        const originalInfo = console.info;

        consoleOverridesRef.current = {
            log: originalLog,
            warn: originalWarn,
            error: originalError,
            info: originalInfo,
        };

        const handleRemoteExecute = (data: { command: string }) => {
            console.log("[Guest] Bridging command to iframe:", data.command);
            
            const iframe = document.querySelector('iframe');
            
            // If iframe exists, tunnel the code inside
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    type: 'DEVOPTIC_CURSOR',
                    payload: { action: 'eval', code: data.command }
                }, '*');
            } else {
                //Fallback: If no iframe (rare), run locally but warn
                try {
                    const result = (0, eval)(data.command);
                    socket.emit("console:result", { sessionId, args: [String(result)], timestamp: Date.now() });
                } catch (e: any) {
                    socket.emit("console:error", { sessionId, args: [e.toString()], timestamp: Date.now() });
                }
            }
        };

        // Listen for Results coming back from the Iframe
        const handleIframeResult = (event: MessageEvent) => {
            if (event.data?.type === 'DEVOPTIC_EVAL_RESULT') {
                socket.emit("console:result", {
                    sessionId,
                    args: [event.data.payload.result],
                    timestamp: Date.now()
                });
            }
            if (event.data?.type === 'DEVOPTIC_EVAL_ERROR') {
                socket.emit("console:error", {
                    sessionId,
                    args: [event.data.payload.error],
                    timestamp: Date.now()
                });
            }
        };

        window.addEventListener('message', handleIframeResult);
        socket.on('console:execute', handleRemoteExecute);

        const serializeArgs = (args: unknown[]) => {
            return args.map((arg) => {
                if (arg === null) return "null";
                if (arg === undefined) return "undefined";
                if (typeof arg === "object") {
                    try {
                        return JSON.stringify(arg, null, 2);
                    } catch {
                        return String(arg);
                    }
                }
                return String(arg);
            });
        };

        console.log = (...args: unknown[]) => {
            socket.emit("console:log", { sessionId, args: serializeArgs(args), timestamp: Date.now() });
            originalLog.apply(console, args);
        };
        console.warn = (...args: unknown[]) => {
            socket.emit("console:warn", { sessionId, args: serializeArgs(args), timestamp: Date.now() });
            originalWarn.apply(console, args);
        };
        console.error = (...args: unknown[]) => {
            socket.emit("console:error", { sessionId, args: serializeArgs(args), timestamp: Date.now() });
            originalError.apply(console, args);
        };
        console.info = (...args: unknown[]) => {
            socket.emit("console:info", { sessionId, args: serializeArgs(args), timestamp: Date.now() });
            originalInfo.apply(console, args);
        };

        return () => {
            console.log("[GuestRecorder] Stopping recording");
            socket.off('rrweb:request-snapshot', handleSnapshotRequest);
            socket.off('console:execute', handleRemoteExecute);
            window.removeEventListener('message', handleIframeResult);         
            if (stopRecordingRef.current) {
                stopRecordingRef.current();
                stopRecordingRef.current = null;
            }
            
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }

            if (consoleOverridesRef.current) {
                console.log = consoleOverridesRef.current.log;
                console.warn = consoleOverridesRef.current.warn;
                console.error = consoleOverridesRef.current.error;
                console.info = consoleOverridesRef.current.info;
                consoleOverridesRef.current = null;
            }
        };
    }, [socket, sessionId, isRecording]);

    return null;
};