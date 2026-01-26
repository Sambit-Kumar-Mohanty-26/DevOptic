"use client";

import React, { useState, useEffect } from "react";
import { Download, X, Pause, Play, Trash2, CheckCircle, AlertCircle, FileIcon, ExternalLink } from "lucide-react";
import type { Socket } from "socket.io-client";

interface DownloadItem {
    id: string;
    filename: string;
    url: string;
    size: number;
    downloadedBytes: number;
    status: 'downloading' | 'paused' | 'completed' | 'failed';
    startedAt: string;
    data?: string;
    error?: string;
}

interface DownloadManagerProps {
    sessionId: string;
    socket: Socket | null;
}

export const DownloadManager = ({ sessionId, socket }: DownloadManagerProps) => {
    const [downloads, setDownloads] = useState<DownloadItem[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [hasNew, setHasNew] = useState(false);

    useEffect(() => {
        if (!socket) return;

        const handleDownload = (data: {
            sessionId: string;
            filename: string;
            data: string;
            size: number;
        }) => {
            const newDownload: DownloadItem = {
                id: Date.now().toString(),
                filename: data.filename,
                url: '',
                size: data.size,
                downloadedBytes: data.size,
                status: 'completed',
                startedAt: new Date().toISOString(),
                data: data.data
            };

            setDownloads(prev => [newDownload, ...prev]);
            setHasNew(true);
            setIsOpen(true);

            triggerDownload(data.filename, data.data);
        };

        const handleProgress = (data: {
            id: string;
            downloadedBytes: number;
            totalBytes: number;
        }) => {
            setDownloads(prev => prev.map(d =>
                d.id === data.id
                    ? { ...d, downloadedBytes: data.downloadedBytes, size: data.totalBytes }
                    : d
            ));
        };

        socket.on('browser:download', handleDownload);
        socket.on('browser:download:progress', handleProgress);

        return () => {
            socket.off('browser:download', handleDownload);
            socket.off('browser:download:progress', handleProgress);
        };
    }, [socket]);

    const triggerDownload = (filename: string, base64Data: string) => {
        try {
            const link = document.createElement('a');
            link.href = `data:application/octet-stream;base64,${base64Data}`;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error('Download trigger failed:', err);
        }
    };

    const handleRetryDownload = (item: DownloadItem) => {
        if (item.data) {
            triggerDownload(item.filename, item.data);
        }
    };

    const handleClearCompleted = () => {
        setDownloads(prev => prev.filter(d => d.status !== 'completed'));
    };

    const handleRemove = (id: string) => {
        setDownloads(prev => prev.filter(d => d.id !== id));
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const getProgress = (item: DownloadItem) => {
        if (item.size === 0) return 0;
        return Math.round((item.downloadedBytes / item.size) * 100);
    };

    if (downloads.length === 0 && !isOpen) return null;

    return (
        <>
            <button
                onClick={() => { setIsOpen(!isOpen); setHasNew(false); }}
                className={`relative p-1.5 rounded-lg transition-colors ${isOpen ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-slate-400'
                    }`}
                title="Downloads"
            >
                <Download size={14} />
                {hasNew && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                )}
                {downloads.length > 0 && (
                    <span className="absolute -bottom-1 -right-1 text-[8px] bg-slate-700 text-white px-1 rounded">
                        {downloads.length}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute top-full mt-2 right-0 w-80 bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[100]">
                    <div className="flex items-center justify-between p-3 border-b border-white/10">
                        <span className="text-sm font-bold text-white">Downloads</span>
                        <div className="flex items-center gap-1">
                            {downloads.some(d => d.status === 'completed') && (
                                <button
                                    onClick={handleClearCompleted}
                                    className="text-xs text-slate-500 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
                                >
                                    Clear Completed
                                </button>
                            )}
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 text-slate-500 hover:text-white rounded transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>

                    <div className="max-h-80 overflow-y-auto">
                        {downloads.length === 0 ? (
                            <div className="p-6 text-center text-slate-500">
                                <Download size={32} className="mx-auto mb-2 opacity-50" />
                                <p className="text-xs">No downloads yet</p>
                            </div>
                        ) : (
                            downloads.map((item) => (
                                <div key={item.id} className="p-3 border-b border-white/5 hover:bg-white/5 transition-colors">
                                    <div className="flex items-start gap-3">
                                        <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center flex-shrink-0">
                                            {item.status === 'completed' ? (
                                                <CheckCircle size={14} className="text-green-400" />
                                            ) : item.status === 'failed' ? (
                                                <AlertCircle size={14} className="text-red-400" />
                                            ) : (
                                                <FileIcon size={14} className="text-blue-400" />
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs text-white truncate font-medium">
                                                {item.filename}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-0.5">
                                                {item.status === 'completed' ? (
                                                    formatBytes(item.size)
                                                ) : item.status === 'failed' ? (
                                                    <span className="text-red-400">{item.error || 'Download failed'}</span>
                                                ) : (
                                                    `${formatBytes(item.downloadedBytes)} / ${formatBytes(item.size)}`
                                                )}
                                            </div>

                                            {item.status === 'downloading' && (
                                                <div className="mt-2 h-1 bg-slate-800 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-blue-500 transition-all"
                                                        style={{ width: `${getProgress(item)}%` }}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1">
                                            {item.status === 'completed' && item.data && (
                                                <button
                                                    onClick={() => handleRetryDownload(item)}
                                                    className="p-1 text-slate-500 hover:text-blue-400 rounded transition-colors"
                                                    title="Download Again"
                                                >
                                                    <Download size={12} />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleRemove(item.id)}
                                                className="p-1 text-slate-500 hover:text-red-400 rounded transition-colors"
                                                title="Remove"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default DownloadManager;
