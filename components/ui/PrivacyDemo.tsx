"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Shield, Lock } from "lucide-react";

export const PrivacyDemo = () => {
    const [privacyEnabled, setPrivacyEnabled] = useState(true);

    return (
        <div className="w-full max-w-lg mx-auto bg-white rounded-xl overflow-hidden shadow-2xl relative">
            {/* Header */}
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                    <Lock size={16} /> Secure Form
                </div>
                <button
                    onClick={() => setPrivacyEnabled(!privacyEnabled)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${privacyEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}
                >
                    {privacyEnabled ? <><Shield size={12} /> Privacy ON</> : <><Eye size={12} /> Privacy OFF</>}
                </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
                <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Email</label>
                    <input type="text" value="alice@devoptic.com" readOnly className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-slate-700 text-sm" />
                </div>

                <div className="space-y-1 relative group">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Password</label>
                    <div className="relative">
                        <input type="password" value="supersecret123" readOnly className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-slate-700 text-sm" />
                        {privacyEnabled && (
                            <div className="absolute inset-0 bg-slate-200/50 backdrop-blur-sm flex items-center justify-center border border-slate-300 rounded">
                                <span className="text-xs font-mono text-slate-500 flex items-center gap-1"><EyeOff size={10} /> [HIDDEN]</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="space-y-1 relative">
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">API Key</label>
                    <div className="relative">
                        <div className="w-full p-2 bg-slate-50 border border-slate-200 rounded text-slate-700 text-sm font-mono overflow-hidden text-ellipsis whitespace-nowrap">
                            sk_live_51Mz...Xy92
                        </div>
                        {privacyEnabled && (
                            <div className="absolute inset-0 bg-slate-200/50 backdrop-blur-sm flex items-center justify-center border border-slate-300 rounded">
                                <span className="text-xs font-mono text-slate-500 flex items-center gap-1"><EyeOff size={10} /> [HIDDEN]</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="pt-4">
                    <button className="w-full py-2 bg-blue-600 text-white rounded font-medium text-sm hover:bg-blue-700 transition-colors">
                        Submit
                    </button>
                    {privacyEnabled && (
                        <p className="mt-2 text-xs text-center text-emerald-600 flex items-center justify-center gap-1">
                            <Shield size={10} /> Sensitive inputs masked from viewers
                        </p>
                    )}
                </div>
            </div>

            {/* Simulated Cursor */}
            <motion.div
                className="absolute w-4 h-4 pointer-events-none z-50"
                animate={{
                    x: [100, 200, 150, 300],
                    y: [100, 150, 300, 200],
                }}
                transition={{
                    duration: 4,
                    repeat: Infinity,
                    repeatType: "reverse",
                    ease: "easeInOut"
                }}
            >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19177L11.7841 12.3673H5.65376Z" fill="#EC4899" stroke="white" />
                </svg>
                <div className="absolute left-4 top-4 bg-pink-500 text-white text-[10px] px-1 rounded shadow whitespace-nowrap">
                    Jane (Viewer)
                </div>
            </motion.div>
        </div>
    );
};
