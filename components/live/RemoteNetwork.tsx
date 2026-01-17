"use client";

import { useEffect, useState, useRef } from "react";
import type { Socket } from "socket.io-client";
import { Wifi, ChevronUp, ChevronDown, Trash2, Play, AlertCircle, X, ChevronLeft } from "lucide-react";

interface NetworkRequest {
    id: string;
    url: string;
    method: string;
    status: number;
    type: string;
    size: number;
    duration: number;
    timestamp: number;
    requestHeaders?: any;
    responseHeaders?: any;
    requestBody?: any;
    responseBody?: any;
    error?: string;
}

interface RemoteNetworkProps {
    sessionId: string;
    socket: Socket | null;
}

export const RemoteNetwork = ({ sessionId, socket }: RemoteNetworkProps) => {
    const [requests, setRequests] = useState<NetworkRequest[]>([]);
    const [isExpanded, setIsExpanded] = useState(true);
    const [selectedRequest, setSelectedRequest] = useState<NetworkRequest | null>(null);
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
        return () => { socket.off("network:request", handleRequest); };
    }, [socket]);

    useEffect(() => {
        if (scrollRef.current && isExpanded && !selectedRequest) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [requests, isExpanded, selectedRequest]);

    const handleReplay = (req: NetworkRequest) => {
        if (!socket) return;
        socket.emit("network:replay", {
            sessionId,
            url: req.url,
            method: req.method,
            body: req.requestBody,
            headers: req.requestHeaders
        });
    };

    const getStatusColor = (status: number) => {
        if (status === 0) return "text-red-500";
        if (status >= 200 && status < 300) return "text-emerald-400";
        if (status >= 400) return "text-red-400";
        return "text-amber-400";
    };

    return (
        <div className="flex flex-col h-full w-full relative">
            <div className="p-3 flex items-center justify-between cursor-pointer hover:bg-white/5 bg-slate-900"
                onClick={() => setIsExpanded(!isExpanded)}>
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-2 tracking-widest uppercase">
                    <Wifi size={14} /> Network
                </span>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">{requests.length} reqs</span>
                    <button onClick={(e) => { e.stopPropagation(); setRequests([]); }} className="p-1 hover:bg-white/10 rounded">
                        <Trash2 size={12} className="text-slate-500" />
                    </button>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
            </div>

            {isExpanded && !selectedRequest && (
                <div ref={scrollRef} className="flex-1 overflow-y-auto">
                    {requests.length === 0 ? (
                        <div className="p-4 text-center text-slate-600 text-xs">Waiting for traffic...</div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {requests.map((req) => (
                                <div key={req.id} 
                                     onClick={() => setSelectedRequest(req)}
                                     className="px-3 py-2 hover:bg-white/5 cursor-pointer flex items-center gap-2 text-[10px] font-mono group">
                                    <span className={`font-bold w-8 ${req.method === "GET" ? "text-blue-400" : "text-amber-400"}`}>{req.method}</span>
                                    <span className={`w-8 ${getStatusColor(req.status)}`}>{req.status || 'ERR'}</span>
                                    <span className="text-slate-400 truncate flex-1" title={req.url}>
                                        {req.url.split('?')[0].split('/').pop() || req.url}
                                    </span>
                                    <span className="text-slate-600 w-10 text-right">{req.duration}ms</span>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleReplay(req); }}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-emerald-500/20 text-emerald-400 rounded"
                                        title="Replay on Guest"
                                    >
                                        <Play size={10} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {selectedRequest && (
                <div className="absolute inset-0 bg-slate-900 z-10 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between p-2 border-b border-white/10 bg-slate-800">
                        <button onClick={() => setSelectedRequest(null)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white">
                            <ChevronLeft size={12} /> Back
                        </button>
                        <span className={`text-xs font-mono font-bold ${getStatusColor(selectedRequest.status)}`}>
                            {selectedRequest.method} {selectedRequest.status}
                        </span>
                        <button onClick={() => handleReplay(selectedRequest)} className="text-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-1 bg-emerald-500/10 px-2 py-1 rounded">
                            <Play size={10} /> Replay
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 text-[10px] font-mono space-y-4">
                        <div>
                            <div className="text-slate-500 uppercase tracking-wider mb-1">URL</div>
                            <div className="text-slate-300 break-all bg-black/30 p-2 rounded">{selectedRequest.url}</div>
                        </div>
                        {selectedRequest.error && (
                             <div className="text-red-400 bg-red-500/10 p-2 rounded flex items-center gap-2">
                                <AlertCircle size={12} /> {selectedRequest.error}
                             </div>
                        )}
                        {selectedRequest.requestBody && (
                            <div>
                                <div className="text-slate-500 uppercase tracking-wider mb-1">Payload</div>
                                <pre className="text-amber-400 bg-black/30 p-2 rounded overflow-x-auto">
                                    {JSON.stringify(selectedRequest.requestBody, null, 2)}
                                </pre>
                            </div>
                        )}
                        <div>
                            <div className="text-slate-500 uppercase tracking-wider mb-1">Response</div>
                            <pre className="text-blue-300 bg-black/30 p-2 rounded overflow-x-auto">
                                {typeof selectedRequest.responseBody === 'object' 
                                    ? JSON.stringify(selectedRequest.responseBody, null, 2) 
                                    : selectedRequest.responseBody || 'No Content'}
                            </pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
