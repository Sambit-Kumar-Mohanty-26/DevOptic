"use client";

import { useEffect, useState } from "react";
import { EyeOff, Shield } from "lucide-react";
import type { Socket } from "socket.io-client";

interface PrivacyOverlayProps {
    sessionId: string;
    socket: Socket | null;
}

export const PrivacyOverlay = ({ sessionId, socket }: PrivacyOverlayProps) => {
    const [isPrivacyMode, setIsPrivacyMode] = useState(false);

    useEffect(() => {
        if (!socket) return;

        const handlePrivacySync = (data: { active: boolean }) => {
            setIsPrivacyMode(data.active);
        };

        socket.on("privacy:sync", handlePrivacySync);
        return () => { socket.off("privacy:sync", handlePrivacySync); };
    }, [socket]);

    if (!isPrivacyMode) return null;

    return (
        <div className="absolute inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-200">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4 border border-white/10 shadow-2xl">
                <EyeOff size={32} className="text-slate-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Sensitive Content Hidden</h3>
            <p className="text-sm text-slate-400 max-w-xs">
                The screen is temporarily hidden because a sensitive field (like a password) is focused.
            </p>
            <div className="mt-6 flex items-center gap-2 text-xs text-emerald-500 font-mono bg-emerald-500/10 px-3 py-1.5 rounded-full">
                <Shield size={12} />
                <span>Privacy Protection Active</span>
            </div>
        </div>
    );
};
