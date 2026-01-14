"use client";

import { useEffect, useRef } from "react";
import { record } from "rrweb";
import pako from "pako";
import type { Socket } from "socket.io-client";

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

    useEffect(() => {
        if (!socket || !isRecording) {
            // Cleanup if recording stops
            if (stopRecordingRef.current) {
                stopRecordingRef.current();
                stopRecordingRef.current = null;
            }
            // Cleanup batch interval
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            // Restore console
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

        // The Batch Flush Loop
        intervalRef.current = setInterval(() => {
            if (eventBuffer.current.length === 0) return;

            try {
                // Compress the Entire batch at once
                const payload = JSON.stringify(eventBuffer.current);
                const compressed = pako.deflate(payload);
                const CHUNK_SIZE = 0x8000;
                let result = '';
                for (let i = 0; i < compressed.length; i += CHUNK_SIZE) {
                    const chunk = compressed.subarray(i, i + CHUNK_SIZE);
                    result += String.fromCharCode.apply(null, Array.from(chunk));
                }
                const base64 = btoa(result);

                // Emit as a 'batch' event
                socket.emit("rrweb:batch", {
                    sessionId,
                    batch: base64,
                    timestamp: Date.now(),
                });
                
                eventBuffer.current = [];
            } catch (err) {
                console.error("[GuestRecorder] Failed to emit batch:", err);
                eventBuffer.current = [];
            }
        }, 500);

        // --- RRWEB RECORDING ---
        const stopFn = record({
            emit(event) {
                eventBuffer.current.push(event);
            },
            // Capture all events for real-time mirroring
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
            console.error("[GuestRecorder] Failed to start recording - stopFn is undefined");
        }

        const handleSnapshotRequest = (data: { requestorId: string }) => {
            console.log("[GuestRecorder] Received snapshot request from:", data.requestorId);
            record.takeFullSnapshot(true); 
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
            socket.emit("console:log", {
                sessionId,
                args: serializeArgs(args),
                timestamp: Date.now(),
            });
            originalLog.apply(console, args);
        };

        console.warn = (...args: unknown[]) => {
            socket.emit("console:warn", {
                sessionId,
                args: serializeArgs(args),
                timestamp: Date.now(),
            });
            originalWarn.apply(console, args);
        };

        console.error = (...args: unknown[]) => {
            socket.emit("console:error", {
                sessionId,
                args: serializeArgs(args),
                timestamp: Date.now(),
            });
            originalError.apply(console, args);
        };

        console.info = (...args: unknown[]) => {
            socket.emit("console:info", {
                sessionId,
                args: serializeArgs(args),
                timestamp: Date.now(),
            });
            originalInfo.apply(console, args);
        };

        return () => {
            // Cleanup on unmount
            console.log("[GuestRecorder] Stopping recording");
            socket.off('rrweb:request-snapshot', handleSnapshotRequest);           
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