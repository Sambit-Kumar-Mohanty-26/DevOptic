"use client";

import { useState, useTransition, useRef } from "react";
import { BackgroundBeams } from "@/components/ui/BackgroundBeams";
import { BorderCard } from "@/components/ui/BorderCard";
import { Spotlight } from "@/components/ui/Spotlight";
import { ShootingStars } from "@/components/ui/ShootingStars";
import { StarsBackground } from "@/components/ui/StarsBackground";
import { Plus, Activity, Github, Loader2, Trash2, Globe, Monitor, Play, Calendar, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { createSession, deleteSession, getRecentSessions } from "@/app/actions";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import Image from "next/image";

interface DashboardClientProps {
    user: any;
    stats: {
        totalSessions: number;
        activeSessions: number;
    } | null;
    initialSessions: any[];
    totalSessions: number;
}

export function DashboardClient({ user, stats: initialStats, initialSessions, totalSessions: initialTotal }: DashboardClientProps) {
    const [isCreating, startCreation] = useTransition();
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [sessions, setSessions] = useState(initialSessions);
    const [page, setPage] = useState(1);
    const [totalSessions, setTotalSessions] = useState(initialTotal);
    const [stats, setStats] = useState(initialStats);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const prefetchCache = useRef<Map<number, Promise<any>>>(new Map());

    const router = useRouter();
    const ITEMS_PER_PAGE = 10;

    const handleCreate = () => {
        startCreation(async () => {
            await createSession();
        });
    };

    const handlePrefetch = (pageToPrefetch: number) => {
        if (prefetchCache.current.has(pageToPrefetch)) return;

        const promise = getRecentSessions(pageToPrefetch, ITEMS_PER_PAGE);
        prefetchCache.current.set(pageToPrefetch, promise);
    };

    const handleDelete = (sessionId: string, e: React.MouseEvent) => {
        e.stopPropagation();

        toast("End this session?", {
            description: "This will mark the session as inactive.",
            action: {
                label: "Confirm",
                onClick: async () => {
                    setIsDeleting(sessionId);
                    try {
                        const result = await deleteSession(sessionId);
                        if (result.success) {
                            toast.success("Session ended successfully");
                            setSessions(prev => prev.map(s =>
                                s.id === sessionId ? { ...s, active: false } : s
                            ));
                            setStats(prev => prev ? ({
                                ...prev,
                                activeSessions: Math.max(0, prev.activeSessions - 1)
                            }) : null);
                        } else {
                            toast.error("Failed to end session");
                        }
                    } catch (err) {
                        toast.error("An error occurred");
                    } finally {
                        setIsDeleting(null);
                    }
                }
            },
            cancel: {
                label: "Cancel",
                onClick: () => { }
            }
        });
    };

    const handlePageChange = async (newPage: number) => {
        setIsLoadingMore(true);
        try {
            let data;
            if (prefetchCache.current.has(newPage)) {
                data = await prefetchCache.current.get(newPage);
            } else {
                data = await getRecentSessions(newPage, ITEMS_PER_PAGE);
            }

            const { sessions: newSessions, total } = data;
            setSessions(newSessions);
            setTotalSessions(total);
            setPage(newPage);
        } catch (error) {
            toast.error("Failed to load sessions");
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleJoin = (sessionId: string) => {
        router.push(`/live/${sessionId}`);
    };

    const totalPages = Math.ceil(totalSessions / ITEMS_PER_PAGE);

    return (
        <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
            <div className="absolute inset-0 z-0">
                <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="white" />
                <StarsBackground />
                <ShootingStars />
                <BackgroundBeams className="opacity-20" />
            </div>

            <nav className="relative z-10">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="relative w-8 h-8">
                            <Image
                                src="/Logo_491_first.png"
                                alt="DevOptic Logo"
                                fill
                                className="object-contain"
                            />
                        </div>
                        <span className="text-xl font-bold tracking-tighter bg-clip-text text-transparent bg-linear-to-r from-cyan-400 via-blue-500 to-purple-600 drop-shadow-[0_0_10px_rgba(56,189,248,0.5)]">
                            DevOptic
                        </span>
                    </div>
                    <button
                        onClick={() => router.push('/')}
                        className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-4 py-2 rounded-full"
                    >
                        <ArrowLeft size={16} />
                        Back to Home
                    </button>
                </div>
            </nav>

            <main className="relative z-10 max-w-7xl mx-auto px-6 py-12">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-between items-end mb-12"
                >
                    <div>
                        <h1 className="text-4xl font-bold mb-2 bg-clip-text text-transparent bg-linear-to-r from-white to-slate-400">Command Center</h1>
                        <p className="text-slate-400 font-mono text-sm">USER: {user?.firstName?.toUpperCase()}</p>
                    </div>

                    <button
                        onClick={handleCreate}
                        disabled={isCreating}
                        className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white px-6 py-3 rounded-full font-bold shadow-[0_0_20px_rgba(8,145,178,0.5)] transition-all hover:scale-105 active:scale-95"
                    >
                        {isCreating ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                        {isCreating ? "INITIALIZING..." : "NEW_SESSION"}
                    </button>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                        <BorderCard>
                            <div className="text-slate-500 text-xs font-mono mb-1">ACTIVE_SESSIONS</div>
                            <div className="text-4xl font-bold text-white mb-2">{stats?.activeSessions || 0}</div>
                            <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 w-full animate-pulse" />
                            </div>
                        </BorderCard>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                        <BorderCard>
                            <div className="text-slate-500 text-xs font-mono mb-1">TOTAL_SESSIONS</div>
                            <div className="text-4xl font-bold text-white mb-2">{stats?.totalSessions || 0}</div>
                            <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500" style={{ width: '70%' }} />
                            </div>
                        </BorderCard>
                    </motion.div>

                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                        <BorderCard>
                            <div className="text-slate-500 text-xs font-mono mb-1">SYSTEM_STATUS</div>
                            <div className="flex items-center gap-2 text-emerald-400 font-bold mt-2">
                                <Activity size={16} className="animate-pulse" /> OPERATIONAL
                            </div>
                            <div className="text-xs text-slate-500 mt-2 font-mono">
                                Latency: 24ms
                            </div>
                        </BorderCard>
                    </motion.div>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                >
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <Monitor size={20} className="text-cyan-400" />
                            Recent Sessions
                        </h2>
                        {isLoadingMore && <Loader2 className="animate-spin text-slate-500" size={16} />}
                    </div>

                    {sessions.length === 0 ? (
                        <div className="border border-white/10 rounded-2xl p-12 bg-white/5 backdrop-blur-sm flex flex-col items-center justify-center text-center">
                            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
                                <Github className="text-slate-600" size={32} />
                            </div>
                            <h3 className="text-xl font-bold mb-2">No Active Streams</h3>
                            <p className="text-slate-400 max-w-md">Initialize a new session to begin streaming DOM mutations and pixel data.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            <AnimatePresence mode="popLayout">
                                {sessions.map((session) => (
                                    <motion.div
                                        key={session.id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        onClick={() => handleJoin(session.id)}
                                        className={`group relative border rounded-xl p-4 transition-all cursor-pointer ${session.active
                                            ? 'bg-slate-900/50 border-white/5 hover:border-cyan-500/50 hover:bg-slate-900/80'
                                            : 'bg-slate-900/20 border-white/5 opacity-60 hover:opacity-100'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${session.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                                                    {session.active ? <Activity size={20} /> : <Monitor size={20} />}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h3 className={`font-mono font-bold text-sm tracking-wider ${session.active ? 'text-white' : 'text-slate-500 line-through'}`}>{session.id}</h3>
                                                        {session.active ? (
                                                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">LIVE</span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 text-[10px] font-bold border border-white/10">ENDED</span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                                                        <span className="flex items-center gap-1">
                                                            <Globe size={12} />
                                                            {session.url || 'No URL'}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <Calendar size={12} />
                                                            {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleJoin(session.id);
                                                    }}
                                                    className="p-2 rounded-lg bg-white/5 hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-400 transition-colors"
                                                    title="Join Session"
                                                >
                                                    <Play size={16} />
                                                </button>
                                                {session.active && (
                                                    <button
                                                        onClick={(e) => handleDelete(session.id, e)}
                                                        disabled={isDeleting === session.id}
                                                        className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                                                        title="End Session"
                                                    >
                                                        {isDeleting === session.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {totalPages > 1 && (
                                <div className="flex justify-center items-center gap-4 mt-8">
                                    <button
                                        onClick={() => handlePageChange(page - 1)}
                                        onMouseEnter={() => handlePrefetch(page - 1)}
                                        disabled={page === 1 || isLoadingMore}
                                        className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                                    >
                                        Previous
                                    </button>
                                    <span className="text-slate-500 text-sm font-mono">
                                        Page {page} of {totalPages}
                                    </span>
                                    <button
                                        onClick={() => handlePageChange(page + 1)}
                                        onMouseEnter={() => handlePrefetch(page + 1)}
                                        disabled={page >= totalPages || isLoadingMore}
                                        className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                                    >
                                        Next
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </motion.div>
            </main>
        </div>
    );
}
