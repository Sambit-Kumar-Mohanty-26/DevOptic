"use client";
import { motion } from "framer-motion";

export const AuroraBackground = ({ mode, children }: { mode: "debug" | "pixel"; children: React.ReactNode }) => {
  return (
    <div className="relative min-h-screen w-full bg-black text-white overflow-x-hidden selection:bg-white/20">
      <div className="fixed inset-0 z-0">
        <motion.div
          animate={{
            background: mode === "debug"
              ? "radial-gradient(circle at 50% 50%, rgba(20, 255, 100, 0.15), transparent 60%)"
              : "radial-gradient(circle at 50% 50%, rgba(255, 20, 100, 0.15), transparent 60%)"
          }}
          transition={{ duration: 2 }}
          className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full blur-[100px] opacity-60 animate-pulse"
        />
        <motion.div
           animate={{
            background: mode === "debug"
              ? "radial-gradient(circle at 50% 50%, rgba(0, 100, 255, 0.1), transparent 60%)"
              : "radial-gradient(circle at 50% 50%, rgba(100, 50, 255, 0.1), transparent 60%)"
          }}
          transition={{ duration: 2 }}
          className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] rounded-full blur-[120px] opacity-40"
        />
      </div>

      <div className="fixed inset-0 z-1 opacity-20 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

      <div className="fixed inset-0 z-1 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-size-[24px_24px] mask-[radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};