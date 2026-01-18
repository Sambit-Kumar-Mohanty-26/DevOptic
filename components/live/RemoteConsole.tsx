"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, AlertTriangle, AlertCircle, Info, ChevronDown, Trash2, ChevronRight } from "lucide-react";
import type { Socket } from "socket.io-client";

interface ConsoleEntry {
    id: string;
    type: "log" | "warn" | "error" | "info" | "command" | "result";
    args: string[];
    timestamp: number;
}

interface RemoteConsoleProps {
    sessionId: string;
    socket: Socket | null;
}

export const RemoteConsole = ({ sessionId, socket }: RemoteConsoleProps) => {
    const [entries, setEntries] = useState<ConsoleEntry[]>([]);
    const [input, setInput] = useState("");
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!socket) return;

        const createHandler = (type: ConsoleEntry["type"]) => (data: { args: string[]; timestamp: number }) => {
            const entry: ConsoleEntry = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                type,
                args: data.args,
                timestamp: data.timestamp,
            };
            setEntries((prev) => [...prev.slice(-200), entry]); // Keep last 200 logs
        };

        socket.on("console:log", createHandler("log"));
        socket.on("console:warn", createHandler("warn"));
        socket.on("console:error", createHandler("error"));
        socket.on("console:info", createHandler("info"));
        
        socket.on("console:result", createHandler("result"));

        return () => {
            socket.off("console:log");
            socket.off("console:warn");
            socket.off("console:error");
            socket.off("console:info");
            socket.off("console:result");
        };
    }, [socket, sessionId]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [entries]);

    const executeCommand = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !socket) return;

        const commandEntry: ConsoleEntry = {
            id: Date.now().toString(),
            type: "command",
            args: [input],
            timestamp: Date.now()
        };
        setEntries(prev => [...prev, commandEntry]);

        setHistory(prev => [input, ...prev]);
        setHistoryIndex(-1);

        socket.emit("console:execute", {
            sessionId,
            command: input
        });

        setInput("");
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowUp") {
            e.preventDefault();
            if (historyIndex < history.length - 1) {
                const newIndex = historyIndex + 1;
                setHistoryIndex(newIndex);
                setInput(history[newIndex]);
            }
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            if (historyIndex > 0) {
                const newIndex = historyIndex - 1;
                setHistoryIndex(newIndex);
                setInput(history[newIndex]);
            } else if (historyIndex === 0) {
                setHistoryIndex(-1);
                setInput("");
            }
        }
    };

    const getTypeStyles = (type: ConsoleEntry["type"]) => {
        switch (type) {
            case "warn": return { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/5", border: "border-yellow-500/20" };
            case "error": return { icon: AlertCircle, color: "text-red-400", bg: "bg-red-500/5", border: "border-red-500/20" };
            case "info": return { icon: Info, color: "text-blue-400", bg: "bg-blue-500/5", border: "border-blue-500/20" };
            case "command": return { icon: ChevronRight, color: "text-slate-400", bg: "bg-white/5", border: "border-white/10" };
            case "result": return { icon: Terminal, color: "text-emerald-400", bg: "bg-emerald-500/5", border: "border-emerald-500/20" };
            default: return { icon: Terminal, color: "text-slate-300", bg: "transparent", border: "border-transparent" };
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-slate-950 font-mono text-[11px]">

            <div className="p-2 border-b border-white/10 flex items-center justify-between shrink-0 bg-slate-900">
                <div className="flex items-center gap-2">
                    <Terminal size={12} className="text-emerald-400" />
                    <span className="font-bold text-slate-300 uppercase tracking-wider">Remote Terminal</span>
                </div>
                <button onClick={() => setEntries([])} className="p-1 hover:bg-white/10 rounded text-slate-500 hover:text-red-400 transition-colors">
                    <Trash2 size={12} />
                </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
                {entries.length === 0 && (
                    <div className="text-center py-8 text-slate-600 italic">
                        Ready to capture logs...
                    </div>
                )}
                {entries.map((entry) => {
                    const style = getTypeStyles(entry.type);
                    const Icon = style.icon;
                    return (
                        <div key={entry.id} className={`flex items-start gap-2 p-1.5 rounded border ${style.bg} ${style.border}`}>
                            <Icon size={12} className={`mt-0.5 shrink-0 ${style.color}`} />
                            <div className={`break-all whitespace-pre-wrap ${style.color} flex-1`}>
                                {entry.type === "command" && <span className="opacity-50 mr-2">$</span>}
                                {entry.type === "result" && <span className="opacity-50 mr-2">➜</span>}
                                {entry.args.join(" ")}
                            </div>
                            <span className="text-[9px] text-slate-600 shrink-0 select-none">
                                {new Date(entry.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </span>
                        </div>
                    );
                })}
            </div>

            <form onSubmit={executeCommand} className="p-2 bg-slate-900 border-t border-white/10 shrink-0 flex items-center gap-2">
                <ChevronRight size={14} className="text-emerald-500 animate-pulse" />
                <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Execute JavaScript on Guest..."
                    className="flex-1 bg-transparent border-none outline-none text-emerald-400 placeholder:text-slate-600 font-mono"
                    autoComplete="off"
                />
            </form>
        </div>
    );
};