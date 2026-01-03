"use client";
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export const BackgroundBeams = ({ className }: { className?: string }) => {
  return (
    <div className={cn("absolute h-full w-full inset-0 overflow-hidden bg-slate-950", className)}>
      <div className="absolute h-full w-full bg-slate-950 mask-[radial-gradient(transparent,white)] pointer-events-none" />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.5 }}
        className="absolute inset-0 m-auto h-120 w-120 rounded-full bg-blue-500/20 blur-[100px]"
      />
      <Beams />
    </div>
  );
};

const Beams = () => {
  const [beams, setBeams] = useState<{ left: string; delay: number; duration: number }[]>([]);

  useEffect(() => {
    const newBeams = Array.from({ length: 20 }).map(() => ({
      left: `${Math.random() * 100}%`,
      delay: Math.random() * 5,
      duration: Math.random() * 3 + 2,
    }));
    setBeams(newBeams);
  }, []);

  return (
    <div className="absolute inset-0 h-full w-full mask-[radial-gradient(100%_100%_at_top_center,white,transparent)]">
      {beams.map((beam, i) => (
        <motion.div
          key={i}
          initial={{ top: "-10%", left: beam.left, opacity: 0 }}
          animate={{ top: "120%", opacity: [0, 1, 0] }}
          transition={{
            duration: beam.duration,
            repeat: Infinity,
            delay: beam.delay,
            ease: "linear",
          }}
          className="absolute w-px h-40 bg-linear-to-b from-transparent via-cyan-500 to-transparent"
        />
      ))}
    </div>
  );
};