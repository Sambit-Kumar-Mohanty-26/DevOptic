"use client";

import { useEffect, useState, useRef } from "react";
import type { Socket } from "socket.io-client";
import { Wifi, ChevronUp, ChevronDown, Trash2 } from "lucide-react";

interface NetworkRequest {
    url: string;
    method: string;
    status: number;
    type: string;
    size: number;
    duration: number;
    timestamp: number;
    id: string;
}

interface RemoteNetworkProps {
    sessionId: string;
    socket: Socket | null;
}

export const RemoteNetwork = ({ sessionId, socket }: RemoteNetworkProps) => {
    const [requests, setRequests] = useState<NetworkRequest[]>([]);
    const [isExpanded, setIsExpanded] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!socket) return;

        const handleRequest = (data: { request: Omit<NetworkRequest, "id"> }) => {
            const newRequest: NetworkRequest = {
                ...data.request,
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            };

            setRequests(prev => [...prev.slice(-99), newRequest]);
        };

        socket.on("network:request", handleRequest);

        return () => {
            socket.off("network:request", handleRequest);
        };
    }, [socket]);

    useEffect(() => {
        if (scrollRef.current && isExpanded) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [requests, isExpanded]);

    const formatSize = (bytes: number) => {
        if (bytes === 0) return "-";
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    };

    const getStatusColor = (status: number) => {
        if (status >= 200 && status < 300) return "text-emerald-400";
        if (status >= 300 && status < 400) return "text-amber-400";
        if (status >= 400) return "text-red-400";
        return "text-slate-400";
    };

    const getTypeColor = (type: string) => {
        switch (type) {
            case "XHR":
            case "Fetch":
                return "bg-violet-500/20 text-violet-400";
            case "JS":
                return "bg-amber-500/20 text-amber-400";
            case "CSS":
                return "bg-blue-500/20 text-blue-400";
            case "IMG":
                return "bg-emerald-500/20 text-emerald-400";
            default:
                return "bg-slate-500/20 text-slate-400";
        }
    };

    return (
        <div className="border-b border-white/5">
            <div
                className="p-3 flex items-center justify-between cursor-pointer hover:bg-white/5"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-2 tracking-widest uppercase">
                    <Wifi size={14} /> Network
                </span>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">{requests.length} requests</span>
                    <button
                        onClick={(e) => { e.stopPropagation(); setRequests([]); }}
                        className="p-1 hover:bg-white/10 rounded"
                    >
                        <Trash2 size={12} className="text-slate-500" />
                    </button>
                    {isExpanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                </div>
            </div>

            {isExpanded && (
                <div ref={scrollRef} className="max-h-48 overflow-y-auto">
                    {requests.length === 0 ? (
                        <div className="p-4 text-center text-slate-600 text-xs">
                            No network requests captured yet
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {requests.map((req) => (
                                <div key={req.id} className="px-3 py-2 hover:bg-white/5 flex items-center gap-2 text-[10px] font-mono">
                                    <span className={`font-bold ${req.method === "GET" ? "text-blue-400" : "text-amber-400"}`}>
                                        {req.method}
                                    </span>

                                    <span className={getStatusColor(req.status)}>{req.status}</span>

                                    <span className={`px-1.5 py-0.5 rounded text-[8px] ${getTypeColor(req.type)}`}>
                                        {req.type}
                                    </span>

                                    <span className="text-slate-400 truncate flex-1" title={req.url}>
                                        {req.url}
                                    </span>

                                    <span className="text-slate-600">{formatSize(req.size)}</span>
                                    <span className="text-slate-600">{req.duration}ms</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
