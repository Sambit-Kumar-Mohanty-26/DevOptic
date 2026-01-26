"use client";

import React, { useState, useEffect } from "react";
import { Bookmark, Search, Trash2, Edit2, Folder, Star, X, Plus, ExternalLink } from "lucide-react";
import type { Socket } from "socket.io-client";

interface BookmarkEntry {
    id: string;
    url: string;
    title: string;
    folder?: string;
    createdAt: string;
    favicon?: string;
}

interface BookmarkPanelProps {
    sessionId: string;
    socket: Socket | null;
    isOpen: boolean;
    onClose: () => void;
    onNavigate: (url: string) => void;
}

export const BookmarkPanel = ({
    sessionId,
    socket,
    isOpen,
    onClose,
    onNavigate
}: BookmarkPanelProps) => {
    const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
    const [folders, setFolders] = useState<string[]>(['Favorites', 'Other']);
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [editingBookmark, setEditingBookmark] = useState<BookmarkEntry | null>(null);

    // Fetch bookmarks on open
    useEffect(() => {
        if (!isOpen || !socket) return;

        setIsLoading(true);
        socket.emit('browser:bookmarks:list', { sessionId });

        const handleBookmarksList = (data: { bookmarks: BookmarkEntry[] }) => {
            setBookmarks(data.bookmarks || []);
            // Extract unique folders
            const uniqueFolders = [...new Set(data.bookmarks?.map(b => b.folder).filter(Boolean))] as string[];
            setFolders(['Favorites', 'Other', ...uniqueFolders]);
            setIsLoading(false);
        };

        socket.on('browser:bookmarks:data', handleBookmarksList);
        return () => {
            socket.off('browser:bookmarks:data', handleBookmarksList);
        };
    }, [isOpen, socket, sessionId]);

    const handleAddBookmark = () => {
        if (!socket) return;
        socket.emit('browser:bookmark:add', { sessionId, folder: selectedFolder || 'Other' });
    };

    const handleDeleteBookmark = (id: string) => {
        if (!socket) return;
        socket.emit('browser:bookmark:delete', { sessionId, id });
        setBookmarks(prev => prev.filter(b => b.id !== id));
    };

    const handleEditBookmark = (bookmark: BookmarkEntry) => {
        setEditingBookmark(bookmark);
    };

    const handleSaveEdit = () => {
        if (!socket || !editingBookmark) return;
        socket.emit('browser:bookmark:update', {
            sessionId,
            id: editingBookmark.id,
            title: editingBookmark.title,
            folder: editingBookmark.folder
        });
        setBookmarks(prev => prev.map(b =>
            b.id === editingBookmark.id ? editingBookmark : b
        ));
        setEditingBookmark(null);
    };

    const handleNavigate = (url: string) => {
        onNavigate(url);
        onClose();
    };

    // Filter bookmarks
    const filteredBookmarks = bookmarks.filter(b => {
        const matchesSearch = !searchQuery ||
            b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            b.url.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFolder = !selectedFolder || b.folder === selectedFolder;
        return matchesSearch && matchesFolder;
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-[700px] max-h-[80vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl flex overflow-hidden">
                <div className="w-48 bg-slate-950 border-r border-white/5 flex flex-col">
                    <div className="p-4 border-b border-white/5">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Folders</h3>
                    </div>
                    <div className="flex-1 p-2 space-y-1">
                        <button
                            onClick={() => setSelectedFolder(null)}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${!selectedFolder ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:bg-white/5'
                                }`}
                        >
                            <Star size={14} />
                            All Bookmarks
                        </button>
                        {folders.map(folder => (
                            <button
                                key={folder}
                                onClick={() => setSelectedFolder(folder)}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors ${selectedFolder === folder ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:bg-white/5'
                                    }`}
                            >
                                <Folder size={14} />
                                {folder}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 flex flex-col">
                    <div className="flex items-center justify-between p-4 border-b border-white/10">
                        <div className="flex items-center gap-3">
                            <Bookmark size={20} className="text-yellow-400" />
                            <h2 className="text-lg font-bold text-white">Bookmarks</h2>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleAddBookmark}
                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded-lg text-xs font-medium transition-colors"
                            >
                                <Plus size={14} />
                                Bookmark This Page
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
                                placeholder="Search bookmarks..."
                                className="w-full bg-slate-800/80 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-slate-500 outline-none focus:border-yellow-500/50"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : filteredBookmarks.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                                <Bookmark size={48} className="mb-4 opacity-50" />
                                <p className="text-sm">No bookmarks yet</p>
                                <p className="text-xs mt-1">Click "Bookmark This Page" to add one</p>
                            </div>
                        ) : (
                            <div className="grid gap-2">
                                {filteredBookmarks.map((bookmark) => (
                                    <div
                                        key={bookmark.id}
                                        className="group flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
                                        onClick={() => handleNavigate(bookmark.url)}
                                    >
                                        <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center flex-shrink-0">
                                            {bookmark.favicon ? (
                                                <img src={bookmark.favicon} alt="" className="w-5 h-5" />
                                            ) : (
                                                <Star size={14} className="text-yellow-400" />
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm text-white truncate font-medium">
                                                {bookmark.title || 'Untitled'}
                                            </div>
                                            <div className="text-xs text-slate-500 truncate">
                                                {bookmark.url}
                                            </div>
                                        </div>

                                        <div className="hidden group-hover:flex items-center gap-1">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleEditBookmark(bookmark);
                                                }}
                                                className="p-1.5 text-slate-500 hover:text-blue-400 rounded transition-colors"
                                                title="Edit"
                                            >
                                                <Edit2 size={12} />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteBookmark(bookmark.id);
                                                }}
                                                className="p-1.5 text-slate-500 hover:text-red-400 rounded transition-colors"
                                                title="Delete"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {editingBookmark && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50">
                    <div className="w-96 bg-slate-900 border border-white/10 rounded-xl p-6">
                        <h3 className="text-lg font-bold text-white mb-4">Edit Bookmark</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-slate-500 mb-1 block">Title</label>
                                <input
                                    type="text"
                                    value={editingBookmark.title}
                                    onChange={(e) => setEditingBookmark({ ...editingBookmark, title: e.target.value })}
                                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-500 mb-1 block">Folder</label>
                                <select
                                    value={editingBookmark.folder || 'Other'}
                                    onChange={(e) => setEditingBookmark({ ...editingBookmark, folder: e.target.value })}
                                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                                >
                                    {folders.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    onClick={() => setEditingBookmark(null)}
                                    className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveEdit}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BookmarkPanel;
