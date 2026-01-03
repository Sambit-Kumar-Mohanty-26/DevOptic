"use client";

import { motion } from "framer-motion";
import { useState } from "react";

export const Lens = ({ mode, setMode }: { mode: "debug" | "pixel"; setMode: any }) => {
  return (
    <div className="relative z-20 flex flex-col items-center justify-center">
      <motion.div
        animate={{
          boxShadow: mode === "debug" 
            ? "0px 0px 50px -10px rgba(0, 255, 100, 0.3)"
            : "0px 0px 50px -10px rgba(255, 0, 100, 0.3)",
        }}
        className="relative w-64 h-64 md:w-96 md:h-96 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 flex items-center justify-center overflow-hidden"
      >
        <div className="absolute inset-0 bg-linear-to-tr from-white/5 to-transparent rounded-full pointer-events-none" />
        
        <div className="text-center z-10 p-6">
          <motion.h1 
            key={mode}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="text-4xl md:text-6xl font-bold tracking-tighter text-white"
          >
            {mode === "debug" ? "DEBUGER" : "DESIGNER"}
          </motion.h1>
          <p className="text-white/50 text-sm tracking-widest mt-2 uppercase">
            {mode === "debug" ? "Analyze the Code" : "Perfect the Pixels"}
          </p>
        </div>

        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"
        />
      </motion.div>

      <div className="mt-12 p-1 bg-zinc-900/80 backdrop-blur-md border border-white/5 rounded-full flex gap-1 relative">
        <motion.div
          animate={{
            x: mode === "debug" ? 0 : "100%",
          }}
          className="absolute left-1 top-1 w-30 h-10 bg-zinc-800 rounded-full z-0"
        />

        <button
          onClick={() => setMode("debug")}
          className={`relative z-10 w-30 py-2 text-sm font-medium transition-colors rounded-full ${
            mode === "debug" ? "text-white" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Debug Mode
        </button>
        <button
          onClick={() => setMode("pixel")}
          className={`relative z-10 w-30 py-2 text-sm font-medium transition-colors rounded-full ${
            mode === "pixel" ? "text-white" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Pixel Mode
        </button>
      </div>
    </div>
  );
};