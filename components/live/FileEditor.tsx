"use client";

import { useState, useEffect } from "react";
import { Folder, FileCode, Save, RefreshCw, ChevronRight } from "lucide-react";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";

interface FileEditorProps {
    sessionId: string;
    socket: Socket | null;
}

export const FileEditor = ({ sessionId, socket }: FileEditorProps) => {
    const [files, setFiles] = useState<string[]>([]);
    const [activeFile, setActiveFile] = useState<string | null>(null);
    const [content, setContent] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (!socket) return;
        socket.emit("fs:list", { sessionId });

        socket.on("fs:list:response", (data) => {
            setFiles(data.files || []);
        });

        socket.on("fs:read:response", (data) => {
            if (data.path === activeFile) {
                setContent(data.content);
                setIsLoading(false);
            }
        });

        socket.on("fs:write:success", () => {
            toast.success("File Saved Successfully!");
            setIsLoading(false);
        });

        return () => {
            socket.off("fs:list:response");
            socket.off("fs:read:response");
            socket.off("fs:write:success");
        };
    }, [socket, sessionId, activeFile]);

    const loadFile = (path: string) => {
        setActiveFile(path);
        setIsLoading(true);
        setContent("Loading...");
        socket?.emit("fs:read", { sessionId, path });
    };

    const saveFile = () => {
        if (!activeFile) return;
        setIsLoading(true);
        socket?.emit("fs:write", { sessionId, path: activeFile, content });
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 font-mono text-[11px]">
            <div className="p-3 border-b border-white/10 flex items-center justify-between shrink-0 bg-slate-900">
                <div className="flex items-center gap-2 text-slate-400">
                    <Folder size={12} className="text-blue-400" />
                    <span>project-root</span>
                    {activeFile && (
                        <>
                            <ChevronRight size={10} />
                            <span className="text-emerald-400">{activeFile}</span>
                        </>
                    )}
                </div>
                {activeFile && (
                    <button 
                        onClick={saveFile} 
                        disabled={isLoading}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded text-[10px] font-bold transition-colors disabled:opacity-50"
                    >
                        {isLoading ? <RefreshCw size={10} className="animate-spin" /> : <Save size={10} />}
                        SAVE
                    </button>
                )}
            </div>

            <div className="flex-1 flex overflow-hidden min-h-0">
                {activeFile ? (
                    <textarea 
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="flex-1 w-full bg-slate-950 text-slate-300 p-4 outline-none resize-none leading-relaxed"
                        spellCheck={false}
                        autoFocus
                    />
                ) : (
                    <div className="flex-1 w-full overflow-y-auto p-2 space-y-1">
                        {files.length === 0 ? (
                            <div className="p-4 text-center text-slate-500">
                                <RefreshCw size={24} className="mx-auto mb-2 opacity-50" />
                                <p>Waiting for Agent...</p>
                                <p className="text-[9px] mt-2 opacity-70">Run `node agent.js {sessionId}` on guest machine</p>
                            </div>
                        ) : (
                            files.map(f => (
                                <button 
                                    key={f} 
                                    onClick={() => loadFile(f)}
                                    className="w-full text-left p-2 rounded hover:bg-white/5 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                                >
                                    <FileCode size={12} className="shrink-0 text-blue-400" />
                                    <span className="truncate">{f}</span>
                                </button>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};