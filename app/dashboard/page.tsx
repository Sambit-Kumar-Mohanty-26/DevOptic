"use client";
import { UserButton, useUser } from "@clerk/nextjs";
import { BackgroundBeams } from "@/components/ui/BackgroundBeams";
import { BorderCard } from "@/components/ui/BorderCard";
import { Plus, Activity, Github } from "lucide-react";

export default function Dashboard() {
  const { user } = useUser();

  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
      <BackgroundBeams className="opacity-20" />
      
      <nav className="relative z-10 border-b border-white/5 bg-slate-950/50 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <span className="text-xl font-bold tracking-tighter">DevOptic_</span>
          <UserButton />
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-12">

        <div className="flex justify-between items-end mb-12">
            <div>
                <h1 className="text-4xl font-bold mb-2">Command Center</h1>
                <p className="text-slate-400 font-mono text-sm">USER: {user?.firstName?.toUpperCase()}</p>
            </div>
            
            <button className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white px-6 py-3 rounded-full font-bold shadow-[0_0_20px_rgba(8,145,178,0.5)] transition-all hover:scale-105">
                <Plus size={18} /> INITIALIZE_SESSION
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <BorderCard>
                <div className="text-slate-500 text-xs font-mono mb-1">ACTIVE_SESSIONS</div>
                <div className="text-4xl font-bold text-white">0</div>
            </BorderCard>
            <BorderCard>
                <div className="text-slate-500 text-xs font-mono mb-1">TOTAL_BUGS_KILLED</div>
                <div className="text-4xl font-bold text-white">0</div>
            </BorderCard>
            <BorderCard>
                 <div className="text-slate-500 text-xs font-mono mb-1">SYSTEM_STATUS</div>
                 <div className="flex items-center gap-2 text-emerald-400 font-bold mt-2">
                    <Activity size={16} /> OPERATIONAL
                 </div>
            </BorderCard>
        </div>

        <div className="border border-white/10 rounded-2xl p-12 bg-white/5 backdrop-blur-sm flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
                <Github className="text-slate-600" size={32} />
            </div>
            <h3 className="text-xl font-bold mb-2">No Active Streams</h3>
            <p className="text-slate-400 max-w-md">Initialize a new session to begin streaming DOM mutations and pixel data.</p>
        </div>

      </main>
    </div>
  );
}