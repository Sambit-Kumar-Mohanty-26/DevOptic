"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowRight, Cpu, Eye, Layers, Zap, 
  Terminal, Paintbrush, AlertTriangle, 
  Code2, Palette, Component, Bug, Github, Twitter, Disc
} from "lucide-react";
import { BackgroundBeams } from "@/components/ui/BackgroundBeams";
import { Spotlight } from "@/components/ui/Spotlight";
import { BorderCard } from "@/components/ui/BorderCard";

export default function Home() {
  const [mode, setMode] = useState<"debug" | "design">("debug");
  const [particles, setParticles] = useState<{ id: number; x: number; icon: any }[]>([]);

  const triggerParticles = (newMode: "debug" | "design") => {
    setMode(newMode);
    const newParticles = Array.from({ length: 5 }).map((_, i) => ({
      id: Date.now() + i,
      x: Math.random() * 100 - 50, 
      icon: newMode === "debug" 
        ? [Code2, Terminal, Bug][i % 3] 
        : [Palette, Paintbrush, Component][i % 3] 
    }));
    setParticles(newParticles);
    setTimeout(() => setParticles([]), 1000);
  };

  return (
    <main className="min-h-screen w-full bg-slate-950 relative overflow-hidden flex flex-col items-center antialiased selection:bg-cyan-500/30 text-white">
      
      <div className="fixed inset-0 z-0 pointer-events-none">
        <BackgroundBeams className="opacity-30" />
        <Spotlight 
          className="-top-40 left-0 md:left-60 md:-top-20 transition-all duration-1000"
          fill={mode === "debug" ? "cyan" : "magenta"} 
        />
      </div>

      <nav className="absolute top-0 w-full z-50 pt-10">
        <div className="max-w-7xl mx-auto px-6 h-20 relative flex items-center justify-between">
          
          <div className="w-20"></div>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-4">
             <img 
               src="/logo.png" 
               alt="Logo" 
               className="w-10 h-10 object-contain mix-blend-screen" 
             />
             <span className="text-3xl md:text-4xl font-bold tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]">
              DevOptic
            </span>
          </div>

          <Link href="/login">
            <button className="px-8 py-2.5 text-sm font-medium border border-white/10 bg-white/5 backdrop-blur-sm rounded-full hover:bg-white/10 hover:border-white/20 transition-all text-white">
              Login
            </button>
          </Link>
        </div>
      </nav>

      <div className="relative z-10 w-full">

        <section className="relative min-h-screen flex flex-col items-center justify-center pt-20 px-4">

          <div className="relative mb-12">

            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none">
              <AnimatePresence>
                {particles.map((p) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, y: 0, x: 0, scale: 0.5 }}
                    animate={{ opacity: [0, 1, 0], y: -100, x: p.x, scale: 1.2 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className={`absolute top-0 left-1/2 ${mode === 'debug' ? 'text-cyan-400' : 'text-pink-400'}`}
                  >
                    <p.icon size={24} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="p-1 bg-slate-900/80 border border-white/10 rounded-full flex relative backdrop-blur-md">
              <motion.div 
                className={`absolute top-1 bottom-1 w-35 rounded-full z-0 ${mode === 'debug' ? 'bg-cyan-900/50' : 'bg-pink-900/50'}`}
                animate={{ x: mode === "debug" ? 0 : 140 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
              
              <button 
                onClick={() => triggerParticles("debug")}
                className={`relative z-10 w-35 py-3 rounded-full flex items-center justify-center gap-2 font-medium transition-colors ${mode === 'debug' ? 'text-cyan-400' : 'text-slate-500'}`}
              >
                <Terminal size={18} /> Debugger
              </button>
              <button 
                onClick={() => triggerParticles("design")}
                className={`relative z-10 w-35 py-3 rounded-full flex items-center justify-center gap-2 font-medium transition-colors ${mode === 'design' ? 'text-pink-400' : 'text-slate-500'}`}
              >
                <Paintbrush size={18} /> Designer
              </button>
            </div>
          </div>

          <div className="text-center max-w-5xl mx-auto">
            <h1 className="text-6xl md:text-8xl font-bold tracking-tighter mb-6">
              <span className="block text-slate-400 text-4xl md:text-5xl font-light mb-4 tracking-normal">The Unified Viewport for</span>
              <AnimatePresence mode="wait">
                {mode === "debug" ? (
                  <motion.span 
                    key="code"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="bg-clip-text text-transparent bg-linear-to-b from-cyan-300 to-blue-600 block"
                  >
                    Code & Logic
                  </motion.span>
                ) : (
                  <motion.span 
                    key="pixel"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="bg-clip-text text-transparent bg-linear-to-b from-pink-300 to-rose-600 block"
                  >
                    Pixels & Flow
                  </motion.span>
                )}
              </AnimatePresence>
            </h1>
            
            <p className="mt-8 text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
              Stop fighting over screenshots. Inspect the 
              <span className={`mx-1 font-mono ${mode === 'debug' ? 'text-cyan-400' : 'text-pink-400'}`}>
                {mode === 'debug' ? ' DOM Tree ' : ' Visual Layer '}
              </span>
              together in real-time.
            </p>
          </div>

          <div className="mt-12">
            <Link href="/login">
              <button className={`group relative px-8 py-4 font-bold text-black rounded-full transition-all hover:scale-105 ${mode === 'debug' ? 'bg-cyan-400 hover:bg-cyan-300' : 'bg-pink-400 hover:bg-pink-300'}`}>
                <span className="flex items-center gap-2">
                  Initialize Session <ArrowRight size={18} />
                </span>
                <div className="absolute inset-0 rounded-full blur-lg opacity-50 bg-inherit z-[-1]" />
              </button>
            </Link>
          </div>

          <ScannerCard 
            side="left" 
            active={mode === "debug"}
            color="cyan"
            icon={Cpu}
            title="SYSTEM_LOGS"
            lines={["> GET /api/v1/user [200]", "> ERR: Hydration Mismatch", "> WSS: Connected 24ms"]}
          />

          <ScannerCard 
            side="right" 
            active={mode === "design"}
            color="pink"
            icon={Eye}
            title="VISUAL_DIFF"
            lines={["padding-top: 24px;", "font-weight: 600;", "gap: 1.5rem /* FIX */"]}
          />

        </section>

        <section className="py-32 px-6 max-w-7xl mx-auto">
          <div className="mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4 relative inline-block">
              Screenshots are 
              <span className="relative inline-block ml-3 text-red-500">
                 Dead Data.
                 <motion.span 
                    initial={{ width: 0 }}
                    whileInView={{ width: "100%" }}
                    viewport={{ once: false }}
                    transition={{ duration: 0.8, ease: "circOut", delay: 0.2 }}
                    className="absolute top-1/2 left-0 h-2 bg-red-600 -translate-y-1/2 rounded-full opacity-80"
                 />
              </span>
            </h2>
            <p className="text-slate-400 text-xl">Static images don't tell the full story. You need live telemetry.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">

            <div className="md:col-span-2">
                <MovingBorderCard className="h-full bg-slate-900/50 backdrop-blur-sm border-slate-800">
                    <div className="p-8 relative z-20">
                        <AlertTriangle className="text-red-400 mb-6" size={40} />
                        <h3 className="text-2xl font-bold mb-2 text-white">The "It Works on My Machine" Paradox</h3>
                        <p className="text-slate-400 leading-relaxed">
                        When a QA finds a bug, they send a PNG. The developer can't see the Console Logs, the Network Requests, or the LocalStorage. DevOptic streams the actual code environment.
                        </p>
                    </div>
                </MovingBorderCard>
            </div>

            <div>
                <MovingBorderCard className="h-full bg-slate-900/50 backdrop-blur-sm border-slate-800">
                    <div className="p-8 relative z-20">
                        <Layers className="text-cyan-400 mb-6" size={40} />
                        <h3 className="text-2xl font-bold mb-2 text-white">Ghost Overlay</h3>
                        <p className="text-slate-400">
                        Overlay Figma designs directly on the DOM. Pixel-perfect comparison with 50% opacity.
                        </p>
                    </div>
                </MovingBorderCard>
            </div>
          </div>
        </section>

        <section className="py-32 relative border-t border-white/5">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 pointer-events-none" />
          
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-linear-to-b from-white to-slate-500">
                The Protocol
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <BorderCard>
                <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center mb-6 text-white font-bold text-xl">1</div>
                <h3 className="text-xl font-bold mb-2 text-white">Inject Proxy</h3>
                <p className="text-slate-400">Enter your localhost or staging URL. We bypass CORS and load it into the collaborative viewport.</p>
              </BorderCard>
              <BorderCard>
                <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center mb-6 text-white font-bold text-xl">2</div>
                <h3 className="text-xl font-bold mb-2 text-white">Sync Reality</h3>
                <p className="text-slate-400">Invite your team. Cursors, clicks, scroll positions, and inputs are mirrored instantly via WebSockets.</p>
              </BorderCard>
              <BorderCard>
                <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center mb-6 text-white font-bold text-xl">3</div>
                <h3 className="text-xl font-bold mb-2 text-white">Resolve</h3>
                <p className="text-slate-400">Fix the CSS with drawing tools. Fix the Logic with console streaming. Push the fix.</p>
              </BorderCard>
            </div>
          </div>
        </section>

        <footer className="relative pt-24 pb-12 overflow-hidden border-t border-white/10 bg-slate-950">
           <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px] mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
           
           <div className="max-w-7xl mx-auto px-6 relative z-10">
              <div className="grid md:grid-cols-4 gap-12 mb-16">
                 <div className="md:col-span-2">
                    <span className="text-2xl font-bold tracking-tighter text-white">DevOptic.</span>
                    <p className="mt-4 text-slate-500 max-w-sm">
                       The first collaborative viewport built for the modern product stack. Synchronizing Engineering and Design logic in real-time.
                    </p>
                    <div className="flex gap-4 mt-6">
                       <SocialIcon icon={Github} />
                       <SocialIcon icon={Twitter} />
                       <SocialIcon icon={Disc} />
                    </div>
                 </div>
                 
                 <div>
                    <h4 className="font-bold text-white mb-4">Product</h4>
                    <ul className="space-y-2 text-slate-500 text-sm">
                       <li className="hover:text-cyan-400 cursor-pointer transition-colors">Debug Engine</li>
                       <li className="hover:text-cyan-400 cursor-pointer transition-colors">Pixel Overlay</li>
                       <li className="hover:text-cyan-400 cursor-pointer transition-colors">Session Replay</li>
                       <li className="hover:text-cyan-400 cursor-pointer transition-colors">Integrations</li>
                    </ul>
                 </div>

                 <div>
                    <h4 className="font-bold text-white mb-4">Company</h4>
                    <ul className="space-y-2 text-slate-500 text-sm">
                       <li className="hover:text-cyan-400 cursor-pointer transition-colors">Changelog</li>
                       <li className="hover:text-cyan-400 cursor-pointer transition-colors">Documentation</li>
                       <li className="hover:text-cyan-400 cursor-pointer transition-colors">Careers</li>
                       <li className="hover:text-cyan-400 cursor-pointer transition-colors">Contact</li>
                    </ul>
                 </div>
              </div>

              <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-600">
                 <p>© 2026 DevOptic Inc. All systems nominal.</p>
                 <div className="flex gap-6">
                    <span>Privacy Policy</span>
                    <span>Terms of Service</span>
                 </div>
              </div>
           </div>
        </footer>

      </div>
    </main>
  );
}

const MovingBorderCard = ({ children, className }: any) => {
  return (
    <div className={`relative group p-px rounded-2xl overflow-hidden ${className}`}>
      <div className="absolute inset-[-1000%] bg-[conic-gradient(from_90deg_at_50%_50%,#E2CBFF_0%,#393BB2_50%,#E2CBFF_100%)] opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-[spin_2s_linear_infinite]" />
      <div className="relative h-full bg-slate-950 rounded-2xl z-10 overflow-hidden">
         {children}
      </div>
    </div>
  )
}

const SocialIcon = ({ icon: Icon }: any) => (
   <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 hover:scale-110 transition-all cursor-pointer">
      <Icon size={18} />
   </div>
)

const ScannerCard = ({ side, active, color, icon: Icon, title, lines }: any) => {
  const isLeft = side === "left";
  const colorClass = color === "cyan" ? "text-cyan-400" : "text-pink-400";
  const borderClass = color === "cyan" ? "border-cyan-500/30" : "border-pink-500/30";
  
  return (
    <motion.div 
      initial={{ opacity: 0, x: isLeft ? -50 : 50 }}
      animate={{ 
        opacity: active ? 1 : 0.3, 
        x: active ? 0 : (isLeft ? -20 : 20),
        scale: active ? 1 : 0.9,
        filter: active ? "blur(0px)" : "blur(4px)" 
      }}
      transition={{ duration: 0.5 }}
      className={`absolute top-1/2 -translate-y-1/2 ${isLeft ? 'left-4 xl:left-20' : 'right-4 xl:right-20'} hidden lg:block`}
    >
      <div className={`w-72 bg-slate-900/90 backdrop-blur-xl border ${borderClass} rounded-lg p-5 overflow-hidden relative shadow-2xl`}>
        {active && (
          <div className="absolute top-0 left-[-150%] w-[50%] h-full bg-linear-to-r from-transparent via-white/10 to-transparent transform skew-x-[-20deg] animate-[shine_3s_infinite]" />
        )}
        
        <div className={`flex items-center gap-2 mb-4 ${colorClass} font-mono text-sm tracking-widest`}>
          <Icon size={16} /> {title}
        </div>
        
        <div className="space-y-2 font-mono text-xs text-slate-400">
          {lines.map((line: string, i: number) => (
            <div key={i} className="border-b border-white/5 pb-1 last:border-0">{line}</div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
            <span className="text-[10px] text-slate-600">STATUS</span>
            <div className={`w-2 h-2 rounded-full ${color === 'cyan' ? 'bg-cyan-500' : 'bg-pink-500'} animate-pulse shadow-[0_0_10px_currentColor]`} />
        </div>
      </div>
    </motion.div>
  )
}