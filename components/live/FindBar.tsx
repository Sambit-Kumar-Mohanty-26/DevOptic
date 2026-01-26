"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, ChevronUp, ChevronDown, Search } from "lucide-react";
import type { Socket } from "socket.io-client";

interface FindBarProps {
    sessionId: string;
    socket: Socket | null;
    isOpen: boolean;
    onClose: () => void;
}

export const FindBar = ({ sessionId, socket, isOpen, onClose }: FindBarProps) => {
    const [query, setQuery] = useState("");
    const [currentMatch, setCurrentMatch] = useState(0);
    const [totalMatches, setTotalMatches] = useState(0);
    const [isSearching, setIsSearching] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isOpen]);

    useEffect(() => {
        if (!socket) return;

        const handleFindResult = (data: { matches: number; current: number }) => {
            setTotalMatches(data.matches);
            setCurrentMatch(data.current);
            setIsSearching(false);
        };

        socket.on('browser:find:result', handleFindResult);
        return () => {
            socket.off('browser:find:result', handleFindResult);
        };
    }, [socket]);

    const handleSearch = useCallback(() => {
        if (!socket || !query.trim()) return;
        setIsSearching(true);
        socket.emit('browser:find', { sessionId, query: query.trim() });
    }, [socket, sessionId, query]);

    const handleNext = useCallback(() => {
        if (!socket) return;
        socket.emit('browser:find:next', { sessionId });
    }, [socket, sessionId]);

    const handlePrevious = useCallback(() => {
        if (!socket) return;
        socket.emit('browser:find:prev', { sessionId });
    }, [socket, sessionId]);

    const handleClose = useCallback(() => {
        setQuery("");
        setCurrentMatch(0);
        setTotalMatches(0);
        socket?.emit('browser:find:clear', { sessionId });
        onClose();
    }, [socket, sessionId, onClose]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (e.shiftKey) {
                handlePrevious();
            } else if (query && totalMatches > 0) {
                handleNext();
            } else {
                handleSearch();
            }
        }
        if (e.key === 'Escape') {
            handleClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="absolute top-0 right-0 z-[100] m-4 flex items-center gap-2 bg-slate-900/95 backdrop-blur-xl border border-white/10 rounded-xl p-2 shadow-2xl">
            <Search size={14} className="text-slate-500 ml-1" />

            <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    if (e.target.value.length >= 2) {
                        setTimeout(handleSearch, 300);
                    }
                }}
                onKeyDown={handleKeyDown}
                placeholder="Find in page..."
                className="w-48 bg-slate-800/80 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-500 outline-none focus:border-emerald-500/50 transition-all"
            />

            <div className="text-xs text-slate-500 min-w-[60px] text-center">
                {isSearching ? (
                    <span className="animate-pulse">...</span>
                ) : totalMatches > 0 ? (
                    <span className="text-emerald-400">{currentMatch}/{totalMatches}</span>
                ) : query ? (
                    <span className="text-red-400">0 found</span>
                ) : null}
            </div>

            <div className="flex items-center gap-0.5 border-l border-white/10 pl-2">
                <button
                    onClick={handlePrevious}
                    disabled={totalMatches === 0}
                    className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Previous (Shift+Enter)"
                >
                    <ChevronUp size={14} className="text-slate-400" />
                </button>
                <button
                    onClick={handleNext}
                    disabled={totalMatches === 0}
                    className="p-1 rounded hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title="Next (Enter)"
                >
                    <ChevronDown size={14} className="text-slate-400" />
                </button>
            </div>

            <button
                onClick={handleClose}
                className="p-1 rounded hover:bg-white/10 transition-colors"
                title="Close (Escape)"
            >
                <X size={14} className="text-slate-400" />
            </button>
        </div>
    );
};

export default FindBar;
