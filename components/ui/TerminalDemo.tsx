"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Terminal } from "lucide-react";

export const TerminalDemo = () => {
    const [lines, setLines] = useState<string[]>([
        "Initialize DevOptic environment...",
    ]);
    const [currentCommand, setCurrentCommand] = useState("");

    useEffect(() => {
        let isMounted = true;

        const typeCommand = async (cmd: string) => {
            if (!isMounted) return;
            setCurrentCommand("");
            for (let i = 0; i <= cmd.length; i++) {
                if (!isMounted) return;
                setCurrentCommand(cmd.slice(0, i));
                await new Promise(r => setTimeout(r, 50));
            }
            await new Promise(r => setTimeout(r, 200));
            if (isMounted) {
                setLines(prev => [...prev, `$ ${cmd}`]);
                setCurrentCommand("");
            }
        };

        const addLog = (log: string) => {
            if (isMounted) setLines(prev => [...prev, log]);
        };

        const sequence = async () => {
            await new Promise(r => setTimeout(r, 1000));
            if (!isMounted) return;
            await typeCommand("node agent.js xp-928");
            addLog("> Connecting to: https://devoptic.com");
            await new Promise(r => setTimeout(r, 500));
            addLog("> Connected! Joining session: xp-928");
            addLog("> File System Agent Ready.");
            addLog("> [TUNNEL] Tunnel Active: https://xp-928.devoptic.dev");

            await new Promise(r => setTimeout(r, 4000));
            if (isMounted) {
                setLines(["Initialize DevOptic environment..."]); // Reset
                sequence();
            }
        };

        sequence();

        return () => { isMounted = false; };
    }, []);

    return (
        <div className="w-full max-w-2xl mx-auto bg-[#0d1117] rounded-xl overflow-hidden border border-slate-800 shadow-2xl font-mono text-sm relative group hover:border-slate-700 transition-colors">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-0 pointer-events-none" />

            {/* Title Bar */}
            <div className="relative z-10 bg-slate-900/80 p-3 flex items-center justify-between border-b border-slate-800">
                <div className="flex gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                    <Terminal size={12} />
                    <span>devoptic-agent</span>
                </div>
                <div className="w-12" />
            </div>

            {/* Terminal Content */}
            <div className="relative z-10 p-6 h-80 flex flex-col justify-end text-slate-300 font-mono">
                {lines.map((line, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={line.startsWith(">") ? "text-emerald-400" : line.startsWith("$") ? "text-white" : "text-slate-400"}
                    >
                        {line}
                    </motion.div>
                ))}
                <div className="flex items-center gap-2 text-white h-6">
                    <span className="text-cyan-400">$</span>
                    <span>{currentCommand}</span>
                    <motion.div
                        animate={{ opacity: [0, 1] }}
                        transition={{ repeat: Infinity, duration: 0.8 }}
                        className="w-2 h-4 bg-slate-400"
                    />
                </div>
            </div>
        </div>
    );
};
