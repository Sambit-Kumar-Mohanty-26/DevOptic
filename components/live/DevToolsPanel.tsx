"use client";

import React, { useState } from "react";
import { Terminal, Wifi, Layout, X, ChevronUp, ChevronDown } from "lucide-react";
import { RemoteConsole } from "./RemoteConsole";
import { RemoteNetwork } from "./RemoteNetwork";
import type { Socket } from "socket.io-client";

interface DevToolsPanelProps {
    sessionId: string;
    socket: Socket | null;
    isOpen: boolean;
    onClose: () => void;
}

export const DevToolsPanel = ({ sessionId, socket, isOpen, onClose }: DevToolsPanelProps) => {
    const [activeTab, setActiveTab] = useState<"console" | "network" | "elements">("console");
    const [height, setHeight] = useState(300);

    if (!isOpen) return null;

    return (
        <div
            className="flex flex-col border-t border-white/10 bg-slate-950 absolute bottom-0 left-0 right-0 z-50 shadow-2xl transition-all"
            style={{ height: `${height}px` }}
        >
            <div className="flex items-center justify-between px-2 bg-slate-900 border-b border-white/10 shrink-0 h-9">
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setActiveTab("elements")}
                        className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors flex items-center gap-2 ${activeTab === "elements" ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"}`}
                    >
                        <Layout size={12} /> Elements
                    </button>
                    <button
                        onClick={() => setActiveTab("console")}
                        className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors flex items-center gap-2 ${activeTab === "console" ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"}`}
                    >
                        <Terminal size={12} /> Console
                    </button>
                    <button
                        onClick={() => setActiveTab("network")}
                        className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors flex items-center gap-2 ${activeTab === "network" ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"}`}
                    >
                        <Wifi size={12} /> Network
                    </button>
                </div>

                <div className="flex items-center gap-1">
                    <div
                        className="cursor-ns-resize px-2 py-1 text-slate-600 hover:text-white"
                        onMouseDown={(e) => {
                            const startY = e.clientY;
                            const startHeight = height;

                            const onMouseMove = (ev: MouseEvent) => {
                                const newHeight = startHeight - (ev.clientY - startY);
                                setHeight(Math.max(100, Math.min(newHeight, window.innerHeight - 100)));
                            };

                            const onMouseUp = () => {
                                window.removeEventListener("mousemove", onMouseMove);
                                window.removeEventListener("mouseup", onMouseUp);
                            };

                            window.addEventListener("mousemove", onMouseMove);
                            window.addEventListener("mouseup", onMouseUp);
                        }}
                    >
                        <ChevronUp size={14} />
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded text-slate-500 hover:text-white">
                        <X size={14} />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-hidden bg-slate-950 relative">
                {activeTab === "console" && (
                    <RemoteConsole sessionId={sessionId} socket={socket} />
                )}
                {activeTab === "network" && (
                    <RemoteNetwork sessionId={sessionId} socket={socket} />
                )}
                {activeTab === "elements" && (
                    <div className="p-4 text-center text-slate-500 text-xs font-mono">
                        <div className="mb-2 text-slate-400">DOM Inspector</div>
                        Use the overlay inspector to select elements. Full tree view coming soon.
                    </div>
                )}
            </div>
        </div>
    );
};
