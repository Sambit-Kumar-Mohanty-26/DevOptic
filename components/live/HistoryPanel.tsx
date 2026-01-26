"use client";

import React, { useState, useEffect } from "react";
import { History, Search, Trash2, ExternalLink, X, Clock } from "lucide-react";
import type { Socket } from "socket.io-client";

interface HistoryEntry {
    id: string;
    url: string;
    title: string;
    visitedAt: string;
    favicon?: string;
}

interface HistoryPanelProps {
    sessionId: string;
    socket: Socket | null;
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (url: string) => void;
}

export const HistoryPanel = ({
    sessionId,
    socket,
    isOpen,
    onClose,
    onNavigate
}: HistoryPanelProps) => {
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!isOpen || !socket) return;

        setIsLoading(true);
        socket.emit('browser:history:list', { sessionId });

        const handleHistoryList = (data: { history: HistoryEntry[] }) => {
            setHistory(data.history || []);
            setIsLoading(false);
        };

        socket.on('browser:history:data', handleHistoryList);
        return () => {
            socket.off('browser:history:data', handleHistoryList);
        };
    }, [isOpen, socket, sessionId]);

    const handleSearch = () => {
        if (!socket) return;
        socket.emit('browser:history:search', { sessionId, query: searchQuery });
    };

    const handleClearHistory = () => {
        if (!socket) return;
        if (confirm('Are you sure you want to clear all browsing history?')) {
            socket.emit('browser:history:clear', { sessionId });
            setHistory([]);
        }
    };

    const handleDeleteEntry = (id: string) => {
        if (!socket) return;
        socket.emit('browser:history:delete', { sessionId, id });
        setHistory(prev => prev.filter(h => h.id !== id));
    };

    const handleNavigate = (url: string) => {
        onNavigate(url);
        onClose();
    };

    const filteredHistory = searchQuery
        ? history.filter(h =>
            h.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            h.url.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : history;

    const groupedHistory = filteredHistory.reduce((groups, entry) => {
        const date = new Date(entry.visitedAt).toLocaleDateString();
        if (!groups[date]) groups[date] = [];
        groups[date].push(entry);
        return groups;
    }, {} as Record<string, HistoryEntry[]>);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-[600px] max-h-[80vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <History size={20} className="text-blue-400" />
                        <h2 className="text-lg font-bold text-white">Browsing History</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleClearHistory}
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            title="Clear All History"
                        >
                            <Trash2 size={16} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="p-4 border-b border-white/5">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder="Search history..."
                            className="w-full bg-slate-800/80 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:border-blue-500/50"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : Object.keys(groupedHistory).length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                            <History size={48} className="mb-4 opacity-50" />
                            <p className="text-sm">No browsing history</p>
                        </div>
                    ) : (
                        Object.entries(groupedHistory).map(([date, entries]) => (
                            <div key={date} className="mb-4">
                                <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    {date}
                                </div>
                                {entries.map((entry) => (
                                    <div
                                        key={entry.id}
                                        className="group flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
                                        onClick={() => handleNavigate(entry.url)}
                                    >
                                        <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center flex-shrink-0">
                                            {entry.favicon ? (
                                                <img src={entry.favicon} alt="" className="w-4 h-4" />
                                            ) : (
                                                <ExternalLink size={12} className="text-slate-500" />
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm text-white truncate">
                                                {entry.title || 'Untitled'}
                                            </div>
                                            <div className="text-xs text-slate-500 truncate">
                                                {entry.url}
                                            </div>
                                        </div>

                                        <div className="hidden group-hover:flex items-center gap-2">
                                            <span className="text-xs text-slate-500">
                                                {new Date(entry.visitedAt).toLocaleTimeString()}
                                            </span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteEntry(entry.id);
                                                }}
                                                className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                        <Clock size={12} className="text-slate-600 group-hover:hidden" />
                                    </div>
                                ))}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default HistoryPanel;
