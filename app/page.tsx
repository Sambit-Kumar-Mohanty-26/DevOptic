"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, Cpu, Eye, Layers,
  Terminal, Paintbrush, AlertTriangle,
  Code2, Palette, Component, Bug, Github, Twitter, Disc,
  Globe, Shield, Wifi, PenTool
} from "lucide-react";
import { BackgroundBeams } from "@/components/ui/BackgroundBeams";
import { Spotlight } from "@/components/ui/Spotlight";
import { StarsBackground } from "@/components/ui/StarsBackground";
import { ShootingStars } from "@/components/ui/ShootingStars";
import { TerminalDemo } from "@/components/ui/TerminalDemo";
import { PrivacyDemo } from "@/components/ui/PrivacyDemo";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Capabilities", href: "#capabilities" },
  { label: "Integrations", href: "#integrations" },
  { label: "Security", href: "#security" },
];

export default function Home() {
  const [mode, setMode] = useState<"debug" | "design">("debug");
  const [particles, setParticles] = useState<{ id: number; x: number; icon: any }[]>([]);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

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
        <StarsBackground />
        <ShootingStars />
        <BackgroundBeams className="opacity-30" />
        <Spotlight
          className="-top-40 left-0 md:left-60 md:-top-20 transition-all duration-1000"
          fill={mode === "debug" ? "cyan" : "magenta"}
        />
      </div>

      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={`fixed top-0 w-full z-50 transition-all duration-500 ${scrolled
          ? "bg-slate-950/70 backdrop-blur-xl border-b border-white/5 shadow-[0_4px_30px_rgba(0,0,0,0.5)]"
          : "bg-transparent"
          }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-16 md:h-20 flex items-center justify-between">

          <a
            href="#"
            onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="flex items-center gap-3 group"
          >
            <Image
              src="/Logo_491_first.png"
              alt="Logo"
              width={32}
              height={32}
              className="object-contain mix-blend-screen group-hover:scale-110 transition-transform duration-300"
            />
            <span
              className="text-xl md:text-2xl font-bold tracking-tighter bg-clip-text text-transparent bg-[length:200%_auto] animate-[gradient-shift_4s_ease_infinite] drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] group-hover:drop-shadow-[0_0_20px_rgba(255,255,255,0.5)] transition-all"
              style={{ backgroundImage: "linear-gradient(90deg, #22d3ee, #3b82f6, #ec4899, #f43f5e, #3b82f6, #22d3ee)" }}
            >
              DevOptic
            </span>
          </a>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => scrollToSection(e, link.href)}
                className="relative px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors duration-300 rounded-full hover:bg-white/5 group"
              >
                {link.label}
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 group-hover:w-4/5 h-px bg-gradient-to-r from-transparent via-cyan-400 to-transparent transition-all duration-300" />
              </a>
            ))}
          </div>

          <Link href="/login">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="px-6 py-2 text-sm font-medium border border-white/10 bg-white/5 backdrop-blur-sm rounded-full hover:bg-white/10 hover:border-white/20 transition-all text-white hover:shadow-[0_0_20px_rgba(6,182,212,0.15)]"
            >
              Login
            </motion.button>
          </Link>
        </div>
      </motion.nav>

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

        <section id="features" className="py-32 px-6 max-w-7xl mx-auto scroll-mt-24">
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

        <section id="capabilities" className="py-32 relative border-t border-white/5 scroll-mt-24">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-blue-900/20 via-slate-950 to-slate-950 pointer-events-none" />

          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-linear-to-b from-white to-slate-500">
                Core Capabilities
              </h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <MovingBorderCard className="h-full bg-slate-900/50 backdrop-blur-sm border-slate-800">
                <div className="p-8 relative z-20 h-full flex flex-col">
                  <Globe className="text-emerald-400 mb-6" size={32} />
                  <h3 className="text-xl font-bold mb-2 text-white">Real-time Presence</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    See exactly where your team is looking. Mouse movements, clicks, and scroll positions are synced with &lt; 30ms latency.
                  </p>
                </div>
              </MovingBorderCard>

              <MovingBorderCard className="h-full bg-slate-900/50 backdrop-blur-sm border-slate-800">
                <div className="p-8 relative z-20 h-full flex flex-col">
                  <Shield className="text-cyan-400 mb-6" size={32} />
                  <h3 className="text-xl font-bold mb-2 text-white">Privacy Guard</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Sensitive data fields are automatically masked for viewers. Your PII and auth tokens never leave your local session.
                  </p>
                </div>
              </MovingBorderCard>

              <MovingBorderCard className="h-full bg-slate-900/50 backdrop-blur-sm border-slate-800">
                <div className="p-8 relative z-20 h-full flex flex-col">
                  <Wifi className="text-purple-400 mb-6" size={32} />
                  <h3 className="text-xl font-bold mb-2 text-white">Network Monitor</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Capture and inspect every network request from the guest&apos;s browser. Replay API calls directly from the host side.
                  </p>
                </div>
              </MovingBorderCard>

              <MovingBorderCard className="h-full bg-slate-900/50 backdrop-blur-sm border-slate-800">
                <div className="p-8 relative z-20 h-full flex flex-col">
                  <Terminal className="text-amber-400 mb-6" size={32} />
                  <h3 className="text-xl font-bold mb-2 text-white">Console Streaming</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Stream your browser console logs to the shared session. View errors, warnings, and network requests in real-time.
                  </p>
                </div>
              </MovingBorderCard>

              <MovingBorderCard className="h-full bg-slate-900/50 backdrop-blur-sm border-slate-800">
                <div className="p-8 relative z-20 h-full flex flex-col">
                  <Layers className="text-pink-400 mb-6" size={32} />
                  <h3 className="text-xl font-bold mb-2 text-white">DOM Inspector</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Inspect and modify the DOM tree live. Changes are reflected instantly for all participants.
                  </p>
                </div>
              </MovingBorderCard>

              <MovingBorderCard className="h-full bg-slate-900/50 backdrop-blur-sm border-slate-800">
                <div className="p-8 relative z-20 h-full flex flex-col">
                  <PenTool className="text-rose-400 mb-6" size={32} />
                  <h3 className="text-xl font-bold mb-2 text-white">Drawing Tools</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Annotate directly on the shared viewport. Circle bugs, draw arrows, and highlight areas for your team in real-time.
                  </p>
                </div>
              </MovingBorderCard>
            </div>
          </div>
        </section>

        <section id="integrations" className="py-32 relative border-t border-white/5 bg-slate-900/20 scroll-mt-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">The Universal Adapter</h2>
                <p className="text-slate-400 text-lg mb-8 leading-relaxed">
                  DevOptic isn't just for React. It works with any stack.
                  <span className="text-white font-medium"> Next.js, Django, Rails, Laravel, Go.</span>
                  If it runs on localhost, we can connect to it.
                </p>
                <ul className="space-y-4 mb-8">
                  <li className="flex items-center gap-3 text-slate-300">
                    <div className="w-6 h-6 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400"><Terminal size={14} /></div>
                    <span>Download & run the agent: <code className="bg-slate-800 px-2 py-1 rounded text-sm mx-1">node agent.js &lt;session-id&gt;</code></span>
                  </li>
                  <li className="flex items-center gap-3 text-slate-300">
                    <div className="w-6 h-6 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400"><Globe size={14} /></div>
                    <span>Tunnels localhost via Cloudflare automatically</span>
                  </li>
                  <li className="flex items-center gap-3 text-slate-300">
                    <div className="w-6 h-6 rounded-full bg-cyan-500/10 flex items-center justify-center text-cyan-400"><Layers size={14} /></div>
                    <span>Real-time file system access over WebSockets</span>
                  </li>
                </ul>
              </div>
              <div>
                <TerminalDemo />
              </div>
            </div>
          </div>
        </section>

        <section id="security" className="py-32 relative border-t border-white/5 scroll-mt-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div className="order-2 md:order-1">
                <PrivacyDemo />
              </div>
              <div className="order-1 md:order-2">
                <div className="inline-block px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-mono mb-6 border border-emerald-500/20">
                  SOC2 COMPLIANT ARCHITECTURE
                </div>
                <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">The Zero-Trust Viewport</h2>
                <p className="text-slate-400 text-lg mb-8 leading-relaxed">
                  We invite guests to your localhost, but we don't give them the keys.
                  <span className="text-white font-medium"> Sensitive inputs (passwords, API keys, tokens) are automatically detected and masked </span>
                  before they leave your machine.
                </p>
                <ul className="space-y-4">
                  <li className="flex items-center gap-3 text-slate-300">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400"><Shield size={14} /></div>
                    <span>PII never touches our servers. Pixels only.</span>
                  </li>
                  <li className="flex items-center gap-3 text-slate-300">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400"><Eye size={14} /></div>
                    <span>Full audit logs of every interaction.</span>
                  </li>
                </ul>
              </div>
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
                  <li className="hover:text-cyan-400 cursor-pointer transition-colors">Network Monitor</li>
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

interface MovingBorderCardProps {
  children: React.ReactNode;
  className?: string;
}

const MovingBorderCard = ({ children, className }: MovingBorderCardProps) => {
  return (
    <div className={`relative group p-px rounded-2xl overflow-hidden ${className}`}>
      <div className="absolute inset-[-1000%] bg-[conic-gradient(from_90deg_at_50%_50%,#E2CBFF_0%,#393BB2_50%,#E2CBFF_100%)] opacity-100 transition-opacity duration-500 animate-[spin_2s_linear_infinite]" />
      <div className="relative h-full bg-slate-950 rounded-2xl z-10 overflow-hidden">
        {children}
      </div>
    </div>
  )
}

interface SocialIconProps {
  icon: any;
}

const SocialIcon = ({ icon: Icon }: SocialIconProps) => (
  <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 hover:scale-110 transition-all cursor-pointer">
    <Icon size={18} />
  </div>
)

interface ScannerCardProps {
  side: "left" | "right";
  active: boolean;
  color: "cyan" | "pink";
  icon: any;
  title: string;
  lines: string[];
}

const ScannerCard = ({ side, active, color, icon: Icon, title, lines }: ScannerCardProps) => {
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