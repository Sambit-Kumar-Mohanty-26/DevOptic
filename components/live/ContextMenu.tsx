"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
    Copy, Clipboard, Scissors, ExternalLink, Image, Code2,
    Bookmark, RefreshCw, ArrowLeft, ArrowRight, Search, Download
} from "lucide-react";
import type { Socket } from "socket.io-client";

interface ContextMenuProps {
    sessionId: string;
    socket: Socket | null;
    position: { x: number; y: number } | null;
    targetElement?: {
        tagName: string;
        isLink: boolean;
        isImage: boolean;
        isEditable: boolean;
        href?: string;
        src?: string;
        text?: string;
    };
    onClose: () => void;
    onInspect?: () => void;
}

interface MenuItem {
    label: string;
    icon: React.ReactNode;
    action: () => void;
    disabled?: boolean;
    divider?: boolean;
}

export const ContextMenu = ({
    sessionId,
    socket,
    position,
    targetElement,
    onClose,
    onInspect
}: ContextMenuProps) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [adjustedPosition, setAdjustedPosition] = useState(position);

    useEffect(() => {
        if (!position || !menuRef.current) return;

        const menu = menuRef.current;
        const rect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let x = position.x;
        let y = position.y;

        if (x + rect.width > viewportWidth) {
            x = viewportWidth - rect.width - 10;
        }
        if (y + rect.height > viewportHeight) {
            y = viewportHeight - rect.height - 10;
        }

        setAdjustedPosition({ x, y });
    }, [position]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    const handleCopy = useCallback(() => {
        socket?.emit('browser:context:copy', { sessionId });
        onClose();
    }, [socket, sessionId, onClose]);

    const handlePaste = useCallback(() => {
        socket?.emit('browser:context:paste', { sessionId });
        onClose();
    }, [socket, sessionId, onClose]);

    const handleCut = useCallback(() => {
        socket?.emit('browser:context:cut', { sessionId });
        onClose();
    }, [socket, sessionId, onClose]);

    const handleOpenLinkNewTab = useCallback(() => {
        if (targetElement?.href) {
            socket?.emit('browser:tabs:new', { sessionId, url: targetElement.href });
        }
        onClose();
    }, [socket, sessionId, targetElement, onClose]);

    const handleSaveImage = useCallback(() => {
        if (targetElement?.src) {
            socket?.emit('browser:download:image', { sessionId, url: targetElement.src });
        }
        onClose();
    }, [socket, sessionId, targetElement, onClose]);

    const handleCopyLink = useCallback(() => {
        if (targetElement?.href) {
            navigator.clipboard.writeText(targetElement.href);
        }
        onClose();
    }, [targetElement, onClose]);

    const handleCopyImage = useCallback(() => {
        if (targetElement?.src) {
            navigator.clipboard.writeText(targetElement.src);
        }
        onClose();
    }, [targetElement, onClose]);

    const handleBack = useCallback(() => {
        socket?.emit('browser:back', { sessionId });
        onClose();
    }, [socket, sessionId, onClose]);

    const handleForward = useCallback(() => {
        socket?.emit('browser:forward', { sessionId });
        onClose();
    }, [socket, sessionId, onClose]);

    const handleReload = useCallback(() => {
        socket?.emit('browser:reload', { sessionId });
        onClose();
    }, [socket, sessionId, onClose]);

    const handleBookmark = useCallback(() => {
        socket?.emit('browser:bookmark:add', { sessionId });
        onClose();
    }, [socket, sessionId, onClose]);

    const handleViewSource = useCallback(() => {
        socket?.emit('browser:viewsource', { sessionId });
        onClose();
    }, [socket, sessionId, onClose]);

    const handleInspect = useCallback(() => {
        onInspect?.();
        onClose();
    }, [onInspect, onClose]);

    const handleSearchSelection = useCallback(() => {
        if (targetElement?.text) {
            socket?.emit('browser:search', { sessionId, query: targetElement.text });
        }
        onClose();
    }, [socket, sessionId, targetElement, onClose]);

    if (!position) return null;

    const menuItems: MenuItem[] = [];

    menuItems.push(
        { label: 'Back', icon: <ArrowLeft size={14} />, action: handleBack },
        { label: 'Forward', icon: <ArrowRight size={14} />, action: handleForward },
        { label: 'Reload', icon: <RefreshCw size={14} />, action: handleReload, divider: true }
    );

    if (targetElement?.isLink && targetElement.href) {
        menuItems.push(
            { label: 'Open Link in New Tab', icon: <ExternalLink size={14} />, action: handleOpenLinkNewTab },
            { label: 'Copy Link Address', icon: <Copy size={14} />, action: handleCopyLink, divider: true }
        );
    }

    if (targetElement?.isImage && targetElement.src) {
        menuItems.push(
            { label: 'Save Image As...', icon: <Download size={14} />, action: handleSaveImage },
            { label: 'Copy Image Address', icon: <Image size={14} />, action: handleCopyImage, divider: true }
        );
    }

    if (targetElement?.text) {
        menuItems.push(
            { label: `Search "${targetElement.text.slice(0, 20)}..."`, icon: <Search size={14} />, action: handleSearchSelection, divider: true }
        );
    }

    menuItems.push(
        { label: 'Cut', icon: <Scissors size={14} />, action: handleCut, disabled: !targetElement?.isEditable },
        { label: 'Copy', icon: <Copy size={14} />, action: handleCopy },
        { label: 'Paste', icon: <Clipboard size={14} />, action: handlePaste, disabled: !targetElement?.isEditable, divider: true }
    );

    menuItems.push(
        { label: 'Bookmark This Page', icon: <Bookmark size={14} />, action: handleBookmark },
        { label: 'View Page Source', icon: <Code2 size={14} />, action: handleViewSource },
        { label: 'Inspect Element', icon: <Code2 size={14} />, action: handleInspect }
    );

    return (
        <div
            ref={menuRef}
            className="fixed z-[200] min-w-[200px] bg-slate-900/98 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl py-1 overflow-hidden"
            style={{
                left: adjustedPosition?.x ?? 0,
                top: adjustedPosition?.y ?? 0
            }}
        >
            {menuItems.map((item, index) => (
                <React.Fragment key={index}>
                    <button
                        onClick={item.action}
                        disabled={item.disabled}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-xs text-left transition-colors ${item.disabled
                            ? 'text-slate-600 cursor-not-allowed'
                            : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            }`}
                    >
                        <span className={item.disabled ? 'text-slate-600' : 'text-slate-500'}>
                            {item.icon}
                        </span>
                        {item.label}
                    </button>
                    {item.divider && <div className="h-px bg-white/5 my-1" />}
                </React.Fragment>
            ))}
        </div>
    );
};

export default ContextMenu;
