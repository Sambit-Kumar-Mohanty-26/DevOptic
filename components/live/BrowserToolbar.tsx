"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
    ArrowLeft,
    ArrowRight,
    RotateCw,
    Globe,
    Lock,
    Loader2,
    Home,
    Printer,
    ZoomIn,
    ZoomOut,
    Maximize2,
    RotateCcw,
    Layers,
    Plus,
    X,
    History,
    Star,
    Search,
    Bookmark,
    Terminal
} from "lucide-react";
import { DownloadManager } from "./DownloadManager";
import { SecurityInfo } from "./SecurityInfo";
import type { Socket } from "socket.io-client";

interface Tab {
    id: string;
    title: string;
    url?: string;
    active: boolean;
}

interface BrowserToolbarProps {
    sessionId: string;
    socket: Socket | null;
    isActive: boolean;
    onFullscreen?: () => void;
    onHistoryOpen?: () => void;
    onBookmarksOpen?: () => void;
    onFindOpen?: () => void;
    onDevToolsToggle?: () => void;
}

export const BrowserToolbar = ({
    sessionId,
    socket,
    isActive,
    onFullscreen,
    onHistoryOpen,
    onBookmarksOpen,
    onFindOpen,
    onDevToolsToggle
}: BrowserToolbarProps) => {
    const [url, setUrl] = useState("");
    const [inputUrl, setInputUrl] = useState("");
    const [title, setTitle] = useState("");
    const [favicon, setFavicon] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSecure, setIsSecure] = useState(false);
    const [zoom, setZoom] = useState(100);
    const [isSecurityOpen, setIsSecurityOpen] = useState(false);
    const [suggestions, setSuggestions] = useState<Array<{ url: string, title?: string }>>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const lockRef = useRef<HTMLDivElement>(null);
    const wrapperRef = useRef<HTMLFormElement>(null);

    // Autocomplete Logic
    useEffect(() => {
        if (!inputUrl || !socket || inputUrl.length < 2) {
            setSuggestions([]);
            return;
        }

        // Only search if user typed (not on navigation update which sets inputUrl)
        // But here we can't distinguish easily. 
        // We can rely on showSuggestions being true (set on focus/change).

        const timer = setTimeout(() => {
            socket.emit('browser:history:search', { sessionId, query: inputUrl });
        }, 300);

        return () => clearTimeout(timer);
    }, [inputUrl, socket, sessionId]);

    useEffect(() => {
        if (!socket) return;
        const handleHistoryData = (data: { history: any[] }) => {
            if (data.history) {
                setSuggestions(data.history.slice(0, 5).map(h => ({ url: h.url, title: h.title })));
            }
        };
        socket.on('browser:history:data', handleHistoryData);
        return () => { socket.off('browser:history:data', handleHistoryData); };
    }, [socket]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (!socket) return;

        const handleNavigate = (data: { url: string; title?: string; favicon?: string }) => {
            setUrl(data.url);
            setInputUrl(data.url);
            if (data.title) setTitle(data.title);
            if (data.favicon) setFavicon(data.favicon);
            setIsSecure(data.url.startsWith('https://'));
            setShowSuggestions(false);
        };

        const handleLoaded = (data: { url: string; title?: string; favicon?: string }) => {
            setUrl(data.url);
            setInputUrl(data.url);
            if (data.title) setTitle(data.title);
            if (data.favicon) setFavicon(data.favicon);
            setIsLoading(false);
        };

        const handleNavigated = (data: { url: string; title?: string; favicon?: string }) => {
            setUrl(data.url);
            setInputUrl(data.url);
            if (data.title) setTitle(data.title);
            if (data.favicon) setFavicon(data.favicon);
            setIsLoading(false);
        };

        const handleLoading = (data: { isLoading: boolean }) => {
            setIsLoading(data.isLoading);
        };

        const handleTitle = (data: { title: string }) => {
            setTitle(data.title);
        };

        socket.on("browser:navigate", handleNavigate);
        socket.on("browser:loaded", handleLoaded);
        socket.on("browser:navigated", handleNavigated);
        socket.on("browser:loading", handleLoading);
        socket.on("browser:title", handleTitle);
        socket.on("browser:status", (data) => {
            if (data.active && data.url) {
                setUrl(data.url);
                setInputUrl(data.url);
            }
        });

        const handleZoomed = (data: { zoom: number }) => {
            setZoom(data.zoom);
        };
        socket.on("browser:zoomed", handleZoomed);

        return () => {
            socket.off("browser:navigate", handleNavigate);
            socket.off("browser:loaded", handleLoaded);
            socket.off("browser:navigated", handleNavigated);
            socket.off("browser:loading", handleLoading);
            socket.off("browser:title", handleTitle);
            socket.off("browser:status");
            socket.off("browser:zoomed", handleZoomed);
        };
    }, [socket]);

    const handleNavigate = useCallback((e?: React.FormEvent, overrideUrl?: string) => {
        e?.preventDefault();
        if (!socket) return;

        const urlToUse = overrideUrl || inputUrl;
        if (!urlToUse.trim()) return;

        let formattedUrl = urlToUse.trim();
        if (!/^https?:\/\//i.test(formattedUrl)) {
            formattedUrl = "https://" + formattedUrl;
        }

        setIsLoading(true);
        setUrl(formattedUrl);
        setInputUrl(formattedUrl);
        setShowSuggestions(false);
        socket.emit("browser:navigate", { sessionId, url: formattedUrl });
    }, [socket, sessionId, inputUrl]);

    const handleHome = useCallback(() => {
        if (socket) {
            setIsLoading(true);
            socket.emit("browser:navigate", { sessionId, url: "https://www.bing.com" });
        }
    }, [socket, sessionId]);

    const handlePrint = useCallback(() => {
        if (!socket || isLoading) return;
        socket.emit("browser:print", { sessionId });
    }, [socket, sessionId, isLoading]);

    const handleZoomIn = useCallback(() => {
        if (!socket) return;
        const newZoom = Math.min(zoom + 25, 200);
        socket.emit("browser:zoom", { sessionId, zoom: newZoom });
    }, [socket, sessionId, zoom]);

    const handleZoomOut = useCallback(() => {
        if (!socket) return;
        const newZoom = Math.max(zoom - 25, 50);
        socket.emit("browser:zoom", { sessionId, zoom: newZoom });
    }, [socket, sessionId, zoom]);

    const handleZoomReset = useCallback(() => {
        if (!socket) return;
        socket.emit("browser:zoom", { sessionId, zoom: 100 });
    }, [socket, sessionId]);

    const handleBack = useCallback(() => {
        if (!socket || isLoading) return;
        socket.emit("browser:back", { sessionId });
    }, [socket, sessionId, isLoading]);

    const handleForward = useCallback(() => {
        if (!socket || isLoading) return;
        socket.emit("browser:forward", { sessionId });
    }, [socket, sessionId, isLoading]);

    const handleReload = useCallback(() => {
        if (!socket || isLoading) return;
        socket.emit("browser:reload", { sessionId });
    }, [socket, sessionId, isLoading]);

    const handleBookmarkAdd = useCallback(() => {
        socket?.emit('browser:bookmark:add', { sessionId });
    }, [socket, sessionId]);


    if (!isActive) return null;

    return (
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/95 backdrop-blur border-b border-white/10 relative w-full z-50">
            {isLoading && (
                <div className="absolute bottom-0 left-0 h-[2px] bg-blue-500 animate-progress w-full origin-left z-50"></div>
            )}

            <div className="flex-shrink-0 w-5 h-5 rounded overflow-hidden bg-slate-800 flex items-center justify-center">
                {favicon ? (
                    <img
                        src={favicon}
                        alt=""
                        className="w-4 h-4 object-contain"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                    />
                ) : (
                    <Globe size={12} className="text-slate-500" />
                )}
            </div>

            <div className="flex items-center gap-0.5">
                <button onClick={handleBack} disabled={isLoading} className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Go Back">
                    <ArrowLeft size={14} className="text-slate-400" />
                </button>
                <button onClick={handleForward} disabled={isLoading} className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Go Forward">
                    <ArrowRight size={14} className="text-slate-400" />
                </button>
                <button onClick={handleReload} disabled={isLoading} className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Reload">
                    {isLoading ? <Loader2 size={14} className="text-emerald-400 animate-spin" /> : <RotateCw size={14} className="text-slate-400" />}
                </button>
                <button onClick={handleHome} disabled={isLoading} className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Home">
                    <Home size={14} className="text-slate-400" />
                </button>
            </div>

            {/* URL Bar */}
            <form onSubmit={handleNavigate} className="flex-1 flex items-center gap-2 relative" ref={wrapperRef}>
                <div className="flex-1 flex items-center gap-2 bg-slate-800/80 border border-white/10 rounded-full px-3 py-1 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/20 transition-all">
                    <div className="flex-shrink-0 cursor-pointer" ref={lockRef} onClick={() => setIsSecurityOpen(!isSecurityOpen)}>
                        {isSecure ? <Lock size={12} className="text-emerald-500" /> : <Globe size={12} className="text-slate-500" />}
                    </div>
                    <SecurityInfo url={url} isOpen={isSecurityOpen} onClose={() => setIsSecurityOpen(false)} anchorRef={lockRef} />

                    {/* URL Input */}
                    <input
                        type="text"
                        value={inputUrl}
                        onChange={(e) => { setInputUrl(e.target.value); setShowSuggestions(true); }}
                        onFocus={() => setShowSuggestions(true)}
                        placeholder="Enter URL or search..."
                        className="flex-1 bg-transparent text-xs text-white placeholder:text-slate-500 outline-none"
                    />

                    {/* Bookmark Button */}
                    <button type="button" onClick={handleBookmarkAdd} className="p-0.5 hover:bg-white/10 rounded text-slate-500 hover:text-yellow-400 transition-colors" title="Bookmark this page">
                        <Bookmark size={12} />
                    </button>
                </div>

                <button type="submit" disabled={isLoading || !inputUrl.trim()} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-xs font-medium rounded-full transition-colors">
                    Go
                </button>

                {/* Suggestions Dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-white/10 rounded-lg shadow-xl overflow-hidden z-[100]">
                        {suggestions.map((s, idx) => (
                            <div
                                key={idx}
                                onClick={() => handleNavigate(undefined, s.url)}
                                className="px-3 py-2 hover:bg-white/5 cursor-pointer flex items-center gap-2 group"
                            >
                                <History size={12} className="text-slate-500 group-hover:text-emerald-400" />
                                <div className="flex flex-col overflow-hidden">
                                    <span className="text-xs text-white truncate">{s.title || s.url}</span>
                                    <span className="text-[10px] text-emerald-500/70 truncate">{s.url}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </form>

            <div className="flex items-center gap-0.5 border-l border-white/10 pl-2">
                <button onClick={onHistoryOpen} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="History">
                    <History size={14} className="text-slate-400" />
                </button>
                <button onClick={onBookmarksOpen} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Bookmarks">
                    <Star size={14} className="text-slate-400" />
                </button>
                <DownloadManager sessionId={sessionId} socket={socket} />
                <button onClick={onFindOpen} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Find in Page (Ctrl+F)">
                    <Search size={14} className="text-slate-400" />
                </button>
                {/* DevTools Toggle */}
                {onDevToolsToggle && (
                    <button onClick={onDevToolsToggle} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors group" title="Developer Tools">
                        <Terminal size={14} className="text-slate-400 group-hover:text-emerald-400" />
                    </button>
                )}
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center gap-0.5 border-l border-white/10 pl-2">
                <button onClick={handleZoomOut} disabled={zoom <= 50} className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Zoom Out">
                    <ZoomOut size={14} className="text-slate-400" />
                </button>
                <button onClick={handleZoomReset} className="px-2 py-0.5 text-[10px] font-mono text-slate-400 hover:bg-white/10 rounded transition-colors min-w-[40px] text-center" title="Reset Zoom">
                    {zoom}%
                </button>
                <button onClick={handleZoomIn} disabled={zoom >= 200} className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Zoom In">
                    <ZoomIn size={14} className="text-slate-400" />
                </button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-0.5 border-l border-white/10 pl-2">
                <button onClick={handlePrint} disabled={isLoading} className="p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title="Print to PDF">
                    <Printer size={14} className="text-slate-400" />
                </button>
                {onFullscreen && (
                    <button onClick={onFullscreen} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="Fullscreen">
                        <Maximize2 size={14} className="text-slate-400" />
                    </button>
                )}
            </div>
        </div>
    );
};
