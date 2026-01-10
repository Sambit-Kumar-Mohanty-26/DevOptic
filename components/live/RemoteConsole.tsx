"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal, AlertTriangle, AlertCircle, Info, ChevronDown, Trash2 } from "lucide-react";
import type { Socket } from "socket.io-client";

interface ConsoleEntry {
    id: string;
    type: "log" | "warn" | "error" | "info";
    args: string[];
    timestamp: number;
}

interface RemoteConsoleProps {
    sessionId: string;
    socket: Socket | null;
}

export const RemoteConsole = ({ sessionId, socket }: RemoteConsoleProps) => {
    const [entries, setEntries] = useState<ConsoleEntry[]>([]);
    const [isExpanded, setIsExpanded] = useState(true);
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
            setEntries((prev) => [...prev.slice(-100), entry]);
        };

        const handleLog = createHandler("log");
        const handleWarn = createHandler("warn");
        const handleError = createHandler("error");
        const handleInfo = createHandler("info");

        socket.on("console:log", handleLog);
        socket.on("console:warn", handleWarn);
        socket.on("console:error", handleError);
        socket.on("console:info", handleInfo);

        return () => {
            socket.off("console:log", handleLog);
            socket.off("console:warn", handleWarn);
            socket.off("console:error", handleError);
            socket.off("console:info", handleInfo);
        };
    }, [socket, sessionId]);

    // Auto-scroll to bottom on new entries
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [entries]);

    const clearLogs = () => setEntries([]);

    const getTypeStyles = (type: ConsoleEntry["type"]) => {
        switch (type) {
            case "warn":
                return {
                    icon: AlertTriangle,
                    bg: "bg-yellow-500/10",
                    border: "border-yellow-500/30",
                    text: "text-yellow-400",
                    badge: "bg-yellow-500/20 text-yellow-400",
                };
            case "error":
                return {
                    icon: AlertCircle,
                    bg: "bg-red-500/10",
                    border: "border-red-500/30",
                    text: "text-red-400",
                    badge: "bg-red-500/20 text-red-400",
                };
            case "info":
                return {
                    icon: Info,
                    bg: "bg-blue-500/10",
                    border: "border-blue-500/30",
                    text: "text-blue-400",
                    badge: "bg-blue-500/20 text-blue-400",
                };
            default:
                return {
                    icon: Terminal,
                    bg: "bg-slate-800/50",
                    border: "border-slate-700/50",
                    text: "text-slate-300",
                    badge: "bg-slate-700 text-slate-300",
                };
        }
    };

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString("en-US", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    };

    return (
        <div className="flex flex-col h-full">
            <div className="p-3 border-b border-white/5 flex items-center justify-between shrink-0">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="flex items-center gap-2 text-xs font-bold text-emerald-400 tracking-widest uppercase hover:text-emerald-300 transition-colors"
                >
                    <Terminal size={14} />
                    <span>Remote Console</span>
                    <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown size={14} />
                    </motion.div>
                </button>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-500">
                        {entries.length} {entries.length === 1 ? "entry" : "entries"}
                    </span>
                    <button
                        onClick={clearLogs}
                        className="p-1 text-slate-500 hover:text-red-400 transition-colors rounded hover:bg-white/5"
                        title="Clear console"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="flex-1 overflow-hidden"
                    >
                        <div
                            ref={scrollRef}
                            className="h-full overflow-y-auto p-2 space-y-1.5 font-mono text-[11px]"
                            style={{ maxHeight: "300px" }}
                        >
                            {entries.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-slate-600">
                                    <Terminal size={24} className="mb-2 opacity-50" />
                                    <p className="text-[10px] uppercase tracking-wider">
                                        Waiting for console output...
                                    </p>
                                </div>
                            ) : (
                                entries.map((entry) => {
                                    const styles = getTypeStyles(entry.type);
                                    const Icon = styles.icon;

                                    return (
                                        <motion.div
                                            key={entry.id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            className={`p-2 rounded-lg border ${styles.bg} ${styles.border}`}
                                        >
                                            <div className="flex items-start gap-2">
                                                <Icon size={12} className={`${styles.text} shrink-0 mt-0.5`} />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${styles.badge}`}>
                                                            {entry.type}
                                                        </span>
                                                        <span className="text-[9px] text-slate-600">
                                                            {formatTime(entry.timestamp)}
                                                        </span>
                                                    </div>
                                                    <div className={`${styles.text} break-all whitespace-pre-wrap`}>
                                                        {entry.args.join(" ")}
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
