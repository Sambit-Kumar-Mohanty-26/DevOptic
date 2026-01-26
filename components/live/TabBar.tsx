"use client";

import React, { useState, useRef, useEffect } from "react";
import { Plus, X, Globe, Lock, ChevronLeft, ChevronRight } from "lucide-react";
import type { Socket } from "socket.io-client";

interface Tab {
    id: string;
    title: string;
    url?: string;
    active: boolean;
    favicon?: string;
    isLoading?: boolean;
}

interface TabBarProps {
    sessionId: string;
    socket: Socket | null;
    tabs: Tab[];
    onTabChange: (tabs: Tab[]) => void;
}

export const TabBar = ({ sessionId, socket, tabs, onTabChange }: TabBarProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [draggedTab, setDraggedTab] = useState<string | null>(null);
    const [dragOverTab, setDragOverTab] = useState<string | null>(null);
    const [previewTabId, setPreviewTabId] = useState<string | null>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const checkScroll = () => {
            setCanScrollLeft(container.scrollLeft > 0);
            setCanScrollRight(container.scrollLeft < container.scrollWidth - container.clientWidth);
        };

        checkScroll();
        container.addEventListener('scroll', checkScroll);
        window.addEventListener('resize', checkScroll);

        return () => {
            container.removeEventListener('scroll', checkScroll);
            window.removeEventListener('resize', checkScroll);
        };
    }, [tabs]);

    useEffect(() => {
        if (!socket) return;

        const handleTabsList = (data: { tabs: Tab[] }) => {
            onTabChange(data.tabs || []);
        };

        socket.on('browser:tabs:list', handleTabsList);

        socket.on('browser:tab:preview', (data: { pageId: string, image: string }) => {
            if (data.pageId === previewTabId) {
                setPreviewImage(data.image);
            }
        });

        return () => {
            socket.off('browser:tabs:list', handleTabsList);
            socket.off('browser:tab:preview');
        };
    }, [socket, onTabChange, previewTabId]);

    const handleNewTab = () => {
        socket?.emit('browser:tabs:new', { sessionId });
    };

    const handleSwitchTab = (tabId: string) => {
        socket?.emit('browser:tabs:switch', { sessionId, pageId: tabId });
    };

    const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
        e.stopPropagation();
        socket?.emit('browser:tabs:close', { sessionId, pageId: tabId });
    };

    const scrollLeft = () => {
        containerRef.current?.scrollBy({ left: -200, behavior: 'smooth' });
    };

    const scrollRight = () => {
        containerRef.current?.scrollBy({ left: 200, behavior: 'smooth' });
    };

    const handleDragStart = (e: React.DragEvent, tabId: string) => {
        setDraggedTab(tabId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent, tabId: string) => {
        e.preventDefault();
        if (tabId !== draggedTab) {
            setDragOverTab(tabId);
        }
    };

    const handleDragEnd = () => {
        if (draggedTab && dragOverTab && draggedTab !== dragOverTab) {
            const newTabs = [...tabs];
            const draggedIndex = newTabs.findIndex(t => t.id === draggedTab);
            const targetIndex = newTabs.findIndex(t => t.id === dragOverTab);

            if (draggedIndex !== -1 && targetIndex !== -1) {
                const [removed] = newTabs.splice(draggedIndex, 1);
                newTabs.splice(targetIndex, 0, removed);
                onTabChange(newTabs);
                socket?.emit('browser:tabs:reorder', { sessionId, tabs: newTabs.map(t => t.id) });
            }
        }
        setDraggedTab(null);
        setDragOverTab(null);
    };

    const handleMouseEnter = (tabId: string) => {
        if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
        setPreviewTabId(tabId);
        setPreviewImage(null);

        previewTimeoutRef.current = setTimeout(() => {
            socket?.emit('browser:tab:preview', { sessionId, pageId: tabId });
        }, 600);
    };

    const handleMouseLeave = () => {
        if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current);
        setPreviewTabId(null);
        setPreviewImage(null);
    };

    const getHostname = (url?: string) => {
        if (!url) return '';
        try {
            return new URL(url).hostname;
        } catch {
            return url;
        }
    };

    return (
        <div className="flex items-center h-9 bg-slate-950/50 border-b border-white/5">
            {canScrollLeft && (
                <button
                    onClick={scrollLeft}
                    className="flex-shrink-0 p-1.5 text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                >
                    <ChevronLeft size={14} />
                </button>
            )}

            <div
                ref={containerRef}
                className="flex-1 flex items-center overflow-x-auto scrollbar-hide"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, tab.id)}
                        onDragOver={(e) => handleDragOver(e, tab.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => handleSwitchTab(tab.id)}
                        onMouseEnter={() => handleMouseEnter(tab.id)}
                        onMouseLeave={handleMouseLeave}
                        className={`group flex items-center gap-2 h-8 px-3 min-w-[120px] max-w-[200px] cursor-pointer transition-all border-r border-white/5 relative
                            ${tab.active
                                ? 'bg-slate-900/80 text-white'
                                : 'bg-slate-950/50 text-slate-400 hover:bg-slate-900/50 hover:text-slate-300'
                            }
                            ${dragOverTab === tab.id ? 'border-l-2 border-l-blue-500' : ''}
                        `}
                    >
                        {tab.active && (
                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500" />
                        )}

                        <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                            {tab.isLoading ? (
                                <div className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin" />
                            ) : tab.favicon ? (
                                <img src={tab.favicon} alt="" className="w-3.5 h-3.5 object-contain" />
                            ) : tab.url?.startsWith('https://') ? (
                                <Lock size={10} className="text-emerald-500" />
                            ) : (
                                <Globe size={10} className="text-slate-500" />
                            )}
                        </div>

                        <span className="flex-1 truncate text-xs select-none">
                            {tab.title || getHostname(tab.url) || 'New Tab'}
                        </span>

                        <button
                            onClick={(e) => handleCloseTab(e, tab.id)}
                            className="flex-shrink-0 p-0.5 opacity-0 group-hover:opacity-100 hover:bg-white/10 rounded transition-all"
                        >
                            <X size={12} className="text-slate-500 hover:text-white" />
                        </button>

                        {previewTabId === tab.id && previewImage && (
                            <div className="absolute top-full left-0 mt-1 z-[100] bg-slate-900 border border-white/20 shadow-xl rounded-lg overflow-hidden pointer-events-none w-[200px] aspect-video animate-in fade-in zoom-in-95 duration-200">
                                <img src={`data:image/jpeg;base64,${previewImage}`} alt="Preview" className="w-full h-full object-cover" />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {canScrollRight && (
                <button
                    onClick={scrollRight}
                    className="flex-shrink-0 p-1.5 text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                >
                    <ChevronRight size={14} />
                </button>
            )}

            <button
                onClick={handleNewTab}
                className="flex-shrink-0 p-1.5 mx-1 text-slate-500 hover:text-white hover:bg-white/10 rounded transition-colors"
                title="New Tab (Ctrl+T)"
            >
                <Plus size={14} />
            </button>
        </div>
    );
};

export default TabBar;
