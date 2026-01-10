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

    useEffect(() => {
        if (!socket || !isRecording) {
            // Cleanup if recording stops
            if (stopRecordingRef.current) {
                stopRecordingRef.current();
                stopRecordingRef.current = null;
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

        console.log("[GuestRecorder] Starting rrweb recording for session:", sessionId);

        // --- RRWEB RECORDING ---
        const stopFn = record({
            emit(event) {
                try {
                    // Compress event data with pako
                    const eventString = JSON.stringify(event);
                    const compressed = pako.deflate(eventString);
                    // Convert to base64 for safe transmission
                    const base64 = btoa(String.fromCharCode(...compressed));

                    socket.emit("rrweb:event", {
                        sessionId,
                        event: base64,
                        timestamp: Date.now(),
                    });

                    console.log("[GuestRecorder] Sent rrweb event, type:", event.type, "size:", base64.length);
                } catch (err) {
                    console.error("[GuestRecorder] Failed to emit rrweb event:", err);
                }
            },
            // Capture all events for real-time mirroring
            checkoutEveryNms: 5000, // Full snapshot every 5 seconds
            blockClass: "devoptic-block",
            maskInputOptions: {
                password: true, // Mask password inputs
            },
        });

        if (stopFn) {
            stopRecordingRef.current = stopFn;
            console.log("[GuestRecorder] Recording started successfully");
        } else {
            console.error("[GuestRecorder] Failed to start recording - stopFn is undefined");
        }

        const handleSnapshotRequest = (data: { requestorId: string }) => {
            console.log("[GuestRecorder] Received snapshot request from:", data.requestorId);
            // This forces rrweb to create a 'Full Snapshot' event immediately.
            // It will automatically pass through your existing 'emit' function defined above!
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
