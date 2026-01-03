"use client";
import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

export const InteractiveGrid = ({ children }: { children: React.ReactNode }) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="relative min-h-screen w-full bg-[#020617] text-white overflow-x-hidden selection:bg-blue-500/30">
      
      <div 
        className="fixed inset-0 z-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}
      />

      <motion.div
        className="fixed inset-0 z-0 pointer-events-none"
        animate={{
          background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, rgba(56, 189, 248, 0.15), transparent 40%)`
        }}
        transition={{ type: "tween", ease: "backOut", duration: 0 }}
      />

      <div 
        className="fixed inset-0 z-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, #38bdf8 1px, transparent 1px), linear-gradient(to bottom, #38bdf8 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
          maskImage: `radial-gradient(300px circle at ${mousePos.x}px ${mousePos.y}px, black, transparent)`
        }}
      />

      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};