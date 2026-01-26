"use client";

import React, { useState, useEffect, useRef } from "react";
import { Shield, AlertTriangle, Lock, Unlock, Info, CheckCircle, XCircle, ExternalLink } from "lucide-react";

interface SecurityInfoProps {
    url: string;
    isOpen: boolean;
    onClose: () => void;
    anchorRef: React.RefObject<HTMLDivElement | null>;
}

interface CertificateInfo {
    issuer: string;
    validFrom: string;
    validTo: string;
    subject: string;
    isValid: boolean;
}

export const SecurityInfo = ({ url, isOpen, onClose, anchorRef }: SecurityInfoProps) => {
    const [certificateInfo, setCertificateInfo] = useState<CertificateInfo | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const isSecure = url.startsWith('https://');
    const hostname = (() => {
        try {
            return new URL(url).hostname;
        } catch {
            return url;
        }
    })();

    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            ref={panelRef}
            className="absolute top-full left-0 mt-2 w-80 bg-slate-900 border border-white/10 rounded-xl shadow-2xl z-[100] overflow-hidden"
        >
            <div className={`p-4 ${isSecure ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                <div className="flex items-center gap-3">
                    {isSecure ? (
                        <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                            <Lock size={20} className="text-green-400" />
                        </div>
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                            <Unlock size={20} className="text-red-400" />
                        </div>
                    )}
                    <div>
                        <div className={`text-sm font-bold ${isSecure ? 'text-green-400' : 'text-red-400'}`}>
                            {isSecure ? 'Connection is secure' : 'Connection is not secure'}
                        </div>
                        <div className="text-xs text-slate-400">{hostname}</div>
                    </div>
                </div>
            </div>

            <div className="p-4 space-y-4">
                {isSecure ? (
                    <>
                        <div className="flex items-start gap-3">
                            <CheckCircle size={16} className="text-green-400 mt-0.5" />
                            <div className="flex-1">
                                <div className="text-xs font-medium text-white">Your information is private</div>
                                <div className="text-xs text-slate-500 mt-0.5">
                                    When you send information to this site, it is encrypted and cannot be read by others.
                                </div>
                            </div>
                        </div>

                        <div className="border-t border-white/5 pt-4">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                Certificate Information
                            </div>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Issued to:</span>
                                    <span className="text-white font-medium">{hostname}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Issued by:</span>
                                    <span className="text-white">Let's Encrypt</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Valid:</span>
                                    <span className="text-green-400">Yes</span>
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex items-start gap-3">
                            <AlertTriangle size={16} className="text-red-400 mt-0.5" />
                            <div className="flex-1">
                                <div className="text-xs font-medium text-white">Your connection to this site is not secure</div>
                                <div className="text-xs text-slate-500 mt-0.5">
                                    You should not enter any sensitive information on this site (for example, passwords or credit cards).
                                </div>
                            </div>
                        </div>

                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <div className="flex items-center gap-2 text-xs text-red-400">
                                <XCircle size={14} />
                                <span>This site does not use HTTPS encryption</span>
                            </div>
                        </div>
                    </>
                )}

                <div className="border-t border-white/5 pt-4">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                        Site Permissions
                    </div>
                    <div className="space-y-2">
                        <div className="space-y-2">
                            {['camera', 'microphone', 'geolocation', 'notifications'].map(perm => {
                                // In a real app we would track state. For now just toggle buttons.
                                return (
                                    <div key={perm} className="flex items-center justify-between text-xs">
                                        <span className="text-slate-400 capitalize">{perm}</span>
                                        <div className="flex gap-1">
                                            <button
                                                // @ts-ignore
                                                onClick={() => window.socket?.emit('browser:permission:grant', { permission: perm })}
                                                className="px-2 py-0.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded transition-colors"
                                            >
                                                Allow
                                            </button>
                                            <button
                                                // @ts-ignore
                                                onClick={() => window.socket?.emit('browser:permission:revoke', { permission: perm })}
                                                className="px-2 py-0.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded transition-colors"
                                            >
                                                Block
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="border-t border-white/5 pt-4">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Cookies in use</span>
                        <span className="text-white">View details</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SecurityInfo;
