"use client";

import { useEffect, useState } from "react";
import type { Socket } from "socket.io-client";
import { Cloud, Radio, Download, Terminal, ChevronRight, Activity, X, Globe, Check } from "lucide-react";

interface AgentConnectionProps {
    sessionId: string;
    socket: Socket | null;
}

export const AgentConnection = ({ sessionId, socket }: AgentConnectionProps) => {
    const [agentStatus, setAgentStatus] = useState<"offline" | "online">("offline");
    const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!socket) return;

        // Check initial status
        socket.emit("agent:check");

        socket.on("agent:status", (data: { status: "online" | "offline" }) => {
            setAgentStatus(data.status);
            if (data.status === "online") {
                // Keep collapsed but status will update to green
            }
        });

        socket.on("tunnel:ready", (data: { url: string }) => {
            setTunnelUrl(data.url);
            setIsStarting(false);
            setAgentStatus("online");
            setExpanded(true); // Expand to show tunnel active
        });

        socket.on("tunnel:start", () => {
            setIsStarting(true);
            setExpanded(true);
        });

        return () => {
            socket.off("agent:status");
            socket.off("tunnel:ready");
            socket.off("tunnel:start");
        };
    }, [socket]);

    const handleStartTunnel = () => {
        if (!socket) return;
        setIsStarting(true);
        socket.emit("tunnel:start", { sessionId });
    };

    if (!socket) return null;

    return (
        <div className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2">

            {/* Collapsed State / Toggle Trigger */}
            <button
                onClick={() => setExpanded(!expanded)}
                className={`
                    group flex items-center gap-2 px-3 py-2 rounded-full border shadow-2xl backdrop-blur-md transition-all duration-300
                    ${agentStatus === "online"
                        ? "bg-slate-900 border-emerald-500/50 text-emerald-400 hover:bg-slate-800 hover:border-emerald-500"
                        : "bg-slate-900 border-red-500/50 text-red-400 hover:bg-slate-800 hover:border-red-500"}
                    ${expanded ? "opacity-0 pointer-events-none absolute" : "opacity-100"}
                `}
            >
                <div className={`w-2 h-2 rounded-full ${agentStatus === "online" ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                <span className="text-xs font-bold font-mono uppercase tracking-wider max-w-0 overflow-hidden group-hover:max-w-[100px] transition-all duration-500 whitespace-nowrap">
                    {agentStatus === "online" ? "Agent Active" : "Agent Offline"}
                </span>
                <Activity size={14} className={agentStatus === "online" ? "text-emerald-400" : "text-red-400"} />
            </button>


            {/* Expanded Panel */}
            <div className={`
                flex flex-col gap-2 transition-all duration-300 origin-bottom-left
                ${expanded ? "scale-100 opacity-100 translate-y-0" : "scale-90 opacity-0 translate-y-4 pointer-events-none absolute"}
            `}>
                <div className={`
                    flex items-center justify-between px-4 py-2 rounded-full border shadow-lg backdrop-blur-md
                    ${agentStatus === "online"
                        ? "bg-slate-900 border-emerald-500/50 text-emerald-400"
                        : "bg-slate-900/90 border-white/10 text-slate-300"}
                `}>
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${agentStatus === "online" ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
                        <span className="text-xs font-bold font-mono uppercase tracking-wider">
                            {agentStatus === "online" ? "Agent Connected" : "Agent Offline"}
                        </span>
                    </div>
                    <button onClick={() => setExpanded(false)} className="ml-4 hover:bg-white/10 p-1 rounded-full text-slate-400 hover:text-white">
                        <X size={12} />
                    </button>
                </div>

                {agentStatus === "offline" && (
                    <div className="bg-slate-900/95 border border-white/10 rounded-xl p-4 w-80 shadow-2xl backdrop-blur-md">
                        <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                            <Terminal size={14} className="text-purple-400" />
                            Run Local Agent
                        </h3>
                        <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                            Run this command in your terminal to enable file access and cloud tunneling.
                        </p>

                        <div className="bg-black/50 rounded border border-white/5 p-3 mb-3 relative group">
                            <code className="text-[10px] font-mono text-emerald-400 block break-all select-all">
                                node agent.js {sessionId}
                            </code>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(`node agent.js ${sessionId}`);
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2000);
                                }}
                                className={`absolute right-2 top-2 text-[10px] px-2 py-1 rounded transition-all ${copied
                                        ? "bg-emerald-500 text-white"
                                        : "bg-white/10 hover:bg-white/20 text-white opacity-0 group-hover:opacity-100"
                                    }`}
                            >
                                {copied ? "Copied!" : "Copy"}
                            </button>
                        </div>

                        <div className="flex gap-2">
                            <a href="/api/agent/download" download="agent.js" className="flex-1 bg-white/5 hover:bg-white/10 border border-white/5 text-slate-300 hover:text-white text-xs py-2 rounded flex items-center justify-center gap-2 transition-all">
                                <Download size={12} />
                                Download agent.js
                            </a>
                        </div>
                    </div>
                )}

                {/* Online Actions */}
                {agentStatus === "online" && (
                    <div className="ml-1 mt-1">
                        {!tunnelUrl ? (
                            <div className="bg-slate-900/90 border border-white/10 p-4 rounded-2xl shadow-2xl backdrop-blur-xl w-72 flex flex-col gap-3">
                                <div className="text-xs text-slate-400 font-medium px-1">
                                    Share your localhost with the world securely.
                                </div>
                                <button
                                    onClick={handleStartTunnel}
                                    disabled={isStarting}
                                    className="
                                        relative w-full overflow-hidden
                                        bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500
                                        text-white px-5 py-3 rounded-xl text-sm font-bold shadow-lg shadow-violet-500/20
                                        flex items-center justify-center gap-3 transition-all duration-300
                                        hover:shadow-violet-500/40 hover:scale-[1.02] active:scale-[0.98]
                                        disabled:opacity-70 disabled:grayscale disabled:pointer-events-none
                                        group border border-white/10
                                    "
                                >
                                    {isStarting ? (
                                        <>
                                            <div className="absolute inset-0 bg-white/20 animate-pulse" />
                                            <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin relative z-10" />
                                            <span className="relative z-10">Starting Tunnel...</span>
                                        </>
                                    ) : (
                                        <>
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                                            <Cloud size={18} className="group-hover:rotate-12 transition-transform duration-300" />
                                            <span>Go Public</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        ) : (
                            <div className="bg-slate-900/95 border border-purple-500/30 p-3 rounded-xl shadow-2xl backdrop-blur-xl flex flex-col gap-3 w-72">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse shadow-[0_0_10px_rgba(192,132,252,0.5)]" />
                                        <span className="text-xs font-bold text-purple-200 tracking-wide">TUNNEL ACTIVE</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            socket.emit("tunnel:stop", { sessionId });
                                            setTunnelUrl(null);
                                        }}
                                        className="text-[10px] bg-red-500/10 hover:bg-red-500/20 text-red-400 px-2 py-1 rounded border border-red-500/20 transition-colors uppercase font-bold"
                                    >
                                        Stop
                                    </button>
                                </div>

                                <div className="bg-black/50 rounded border border-white/5 p-2 flex items-center gap-2 group relative">
                                    <Globe size={12} className="text-slate-500 shrink-0" />
                                    <code className="text-[10px] font-mono text-purple-300 truncate flex-1">
                                        {tunnelUrl}
                                    </code>
                                    <button
                                        onClick={() => {
                                            if (tunnelUrl) {
                                                navigator.clipboard.writeText(tunnelUrl);
                                                setCopied(true);
                                                setTimeout(() => setCopied(false), 2000);
                                            }
                                        }}
                                        className={`absolute right-1 top-1 bottom-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-all border border-white/10 text-[10px] font-bold
                                            ${copied
                                                ? "bg-emerald-500 text-white"
                                                : "bg-slate-800 hover:bg-slate-700 text-white"
                                            }
                                        `}
                                    >
                                        {copied ? "Copied!" : "Copy"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
