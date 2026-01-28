"use client";

import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Socket } from "socket.io-client";
import { MousePointer2, Check, X, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface RemoteControlProps {
    sessionId: string;
    socket: Socket | null;
    role: "guest" | "host" | null;
    onControlStatusChange?: (hasControl: boolean) => void;
    onControlGrantedChange?: (granted: boolean) => void;
}

export const RemoteControlRequest = ({
    sessionId,
    socket,
    role,
    onControlStatusChange,
    onControlGrantedChange
}: RemoteControlProps) => {
    const [showRequest, setShowRequest] = useState(false);
    const [hasControl, setHasControl] = useState(false);
    const [controlGranted, setControlGranted] = useState(false);
    const [requestPending, setRequestPending] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Host: Request control
    const requestControl = useCallback(() => {
        if (!socket || role !== "host") return;
        setRequestPending(true);
        socket.emit("control:request", { sessionId });
    }, [socket, sessionId, role]);

    // Host: Release control
    const releaseControl = useCallback(() => {
        if (!socket || role !== "host") return;
        setHasControl(false);
        onControlStatusChange?.(false);
        socket.emit("control:revoke", { sessionId });
    }, [socket, sessionId, role, onControlStatusChange]);

    // Guest: Grant control
    const grantControl = useCallback(() => {
        if (!socket || role !== "guest") return;
        setShowRequest(false);
        setControlGranted(true);
        onControlGrantedChange?.(true);
        socket.emit("control:grant", { sessionId });
    }, [socket, sessionId, role, onControlGrantedChange]);

    // Guest: Deny control
    const denyControl = useCallback(() => {
        if (!socket || role !== "guest") return;
        setShowRequest(false);
        socket.emit("control:deny", { sessionId });
    }, [socket, sessionId, role]);

    // Guest: Revoke control
    const revokeControl = useCallback(() => {
        if (!socket || role !== "guest") return;
        setControlGranted(false);
        onControlGrantedChange?.(false);
        socket.emit("control:revoke", { sessionId });
    }, [socket, sessionId, role, onControlGrantedChange]);

    useEffect(() => {
        if (!socket) return;

        // Guest: Handle control request from Host
        const handleRequest = () => {
            console.log("[RemoteControl] Received control:request");
            if (role === "guest") {
                setShowRequest(true);
            }
        };

        // Host: Handle control granted
        const handleGrant = () => {
            console.log("[RemoteControl] Received control:grant");
            if (role === "host") {
                setRequestPending(false);
                setHasControl(true);
                onControlStatusChange?.(true);
            }
        };

        // Host: Handle control denied
        const handleDeny = () => {
            if (role === "host") {
                setRequestPending(false);
                setHasControl(false);
                onControlStatusChange?.(false);
            }
        };

        // Both: Handle control revoked
        const handleRevoke = () => {
            console.log("[RemoteControl] Received control:revoke");
            setHasControl(false);
            setControlGranted(false);
            setRequestPending(false);
            onControlStatusChange?.(false);
        };

        socket.on("control:request", handleRequest);
        socket.on("control:grant", handleGrant);
        socket.on("control:deny", handleDeny);
        socket.on("control:revoke", handleRevoke);

        return () => {
            socket.off("control:request", handleRequest);
            socket.off("control:grant", handleGrant);
            socket.off("control:deny", handleDeny);
            socket.off("control:revoke", handleRevoke);
        };
    }, [socket, role, onControlStatusChange]);

    // Host UI: Request/Release Control Button
    if (role === "host") {
        return (
            <div className="flex items-center gap-2">
                {hasControl ? (
                    <button
                        onClick={releaseControl}
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 border border-red-500/50 rounded-full text-red-400 text-xs font-bold hover:bg-red-500/30 transition-colors"
                    >
                        <MousePointer2 size={12} className="animate-pulse" />
                        <span>CONTROLLING</span>
                        <X size={12} />
                    </button>
                ) : requestPending ? (
                    <button
                        disabled
                        className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/20 border border-amber-500/50 rounded-full text-amber-400 text-xs font-bold animate-pulse"
                    >
                        <MousePointer2 size={12} />
                        <span>REQUESTING...</span>
                    </button>
                ) : (
                    <button
                        onClick={requestControl}
                        className="flex items-center gap-2 px-3 py-1.5 bg-violet-500/20 border border-violet-500/50 rounded-full text-violet-400 text-xs font-bold hover:bg-violet-500/30 transition-colors"
                    >
                        <MousePointer2 size={12} />
                        <span>Request Control</span>
                    </button>
                )}
            </div>
        );
    }

    // Guest UI: Authorization Popup + Revoke Button
    if (role === "guest") {
        return (
            <>
                {/* Control Granted Indicator */}
                {controlGranted && (
                    <button
                        onClick={revokeControl}
                        className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 border border-red-500/50 rounded-full text-red-400 text-xs font-bold hover:bg-red-500/30 transition-colors"
                    >
                        <MousePointer2 size={12} className="animate-pulse" />
                        <span>HOST HAS CONTROL</span>
                        <X size={12} />
                    </button>
                )}

                {mounted && createPortal(
                    <AnimatePresence>
                        {showRequest && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm"
                            >
                                <motion.div
                                    initial={{ y: 20 }}
                                    animate={{ y: 0 }}
                                    className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-md shadow-2xl"
                                >
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-3 rounded-full bg-amber-500/20">
                                            <AlertTriangle size={24} className="text-amber-500" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-white">Control Request</h3>
                                            <p className="text-sm text-slate-400">The host wants to control your screen</p>
                                        </div>
                                    </div>

                                    <p className="text-sm text-slate-400 mb-6">
                                        If you allow this, the host will be able to move your cursor and click on elements.
                                        You can revoke access at any time.
                                    </p>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={denyControl}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-slate-300 font-bold hover:bg-slate-700 transition-colors"
                                        >
                                            <X size={16} />
                                            Deny
                                        </button>
                                        <button
                                            onClick={grantControl}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 rounded-xl text-white font-bold hover:bg-emerald-500 transition-colors"
                                        >
                                            <Check size={16} />
                                            Allow
                                        </button>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body
                )}
            </>
        );
    }

    return null;
};
