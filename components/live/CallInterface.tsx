"use client";

import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Mic, MicOff, Video as VideoIcon, VideoOff, Move, ArrowDownRight } from "lucide-react";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";

interface CallInterfaceProps {
    sessionId: string;
    socket: Socket | null;
    role: "host" | "guest" | null;
}

export interface CallInterfaceRef {
    startCall: (type: 'audio' | 'video') => void;
}

const rtcConfig: RTCConfiguration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export const CallInterface = forwardRef<CallInterfaceRef, CallInterfaceProps>(({ sessionId, socket, role }, ref) => {
    const [callStatus, setCallStatus] = useState<"idle" | "incoming" | "calling" | "connected">("idle");
    const [callType, setCallType] = useState<"audio" | "video">("video");
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoOff, setIsVideoOff] = useState(false);
    
    const [win, setWin] = useState({ x: 0, y: 0, w: 320, h: 240, initialized: false });
    const interactionMode = useRef<string | null>(null);
    const startPos = useRef({ x: 0, y: 0, winX: 0, winY: 0, winW: 0, winH: 0 });

    const localStreamRef = useRef<MediaStream | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (!win.initialized && typeof window !== 'undefined') {
            setWin({
                x: window.innerWidth - 340,
                y: window.innerHeight - 300,
                w: 320,
                h: 240,
                initialized: true
            });
        }
    }, [win.initialized]);

    useImperativeHandle(ref, () => ({
        startCall: (type: 'audio' | 'video') => {
            setCallType(type);
            setCallStatus("calling");
            socket?.emit("call:request", { sessionId, type });
        }
    }));

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!interactionMode.current) return;
            e.preventDefault();

            const dx = e.clientX - startPos.current.x;
            const dy = e.clientY - startPos.current.y;
            const s = startPos.current;

            setWin(prev => {
                let { x, y, w, h } = prev;
                const mode = interactionMode.current;

                if (mode === 'move') {
                    x = s.winX + dx;
                    y = s.winY + dy;
                }
                else if (mode === 'br') {
                    w = Math.max(200, s.winW + dx);
                    h = Math.max(150, s.winH + dy);
                }
                else if (mode === 'bl') {
                    const newW = Math.max(200, s.winW - dx);
                    x = s.winX + (s.winW - newW);
                    w = newW;
                    h = Math.max(150, s.winH + dy);
                }
                else if (mode === 'tr') {
                    w = Math.max(200, s.winW + dx);
                    const newH = Math.max(150, s.winH - dy);
                    y = s.winY + (s.winH - newH);
                    h = newH;
                }
                else if (mode === 'tl') {
                    const newW = Math.max(200, s.winW - dx);
                    const newH = Math.max(150, s.winH - dy);
                    x = s.winX + (s.winW - newW);
                    y = s.winY + (s.winH - newH);
                    w = newW;
                    h = newH;
                }

                return { ...prev, x, y, w, h };
            });
        };

        const handleMouseUp = () => {
            interactionMode.current = null;
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const startInteraction = (e: React.MouseEvent, mode: string) => {
        e.preventDefault();
        e.stopPropagation();
        interactionMode.current = mode;
        startPos.current = {
            x: e.clientX,
            y: e.clientY,
            winX: win.x,
            winY: win.y,
            winW: win.w,
            winH: win.h
        };
        
        document.body.style.userSelect = 'none';
        if (mode === 'move') document.body.style.cursor = 'grabbing';
        if (mode === 'tl' || mode === 'br') document.body.style.cursor = 'nwse-resize';
        if (mode === 'tr' || mode === 'bl') document.body.style.cursor = 'nesw-resize';
    };

    const startLocalStream = async (type: 'audio' | 'video') => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: type === 'video', 
                audio: true 
            });
            
            localStreamRef.current = stream;
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            
            setIsVideoOff(type === 'audio'); 
            return stream;

        } catch (err: any) {
            console.error("Media Error:", err.name);
            
            if (type === 'video' && (err.name === 'NotReadableError' || err.name === 'TrackStartError')) {
                toast.warning("Camera unavailable. Switching to Audio Only.");
                try {
                    const audioStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                    localStreamRef.current = audioStream;
                    setCallType('audio');
                    return audioStream;
                } catch (audioErr) {
                    toast.error("Could not access Microphone either.");
                    return null;
                }
            }
            
            toast.error("Could not access media devices.");
            return null;
        }
    };

    const stopLocalStream = () => {
        localStreamRef.current?.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
    };

    const createPeerConnection = useCallback((stream: MediaStream) => {
        const pc = new RTCPeerConnection(rtcConfig);
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.ontrack = (event) => {
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0];
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) socket?.emit('call:ice-candidate', { sessionId, candidate: event.candidate });
        };

        peerConnectionRef.current = pc;
        return pc;
    }, [sessionId, socket]);

    const acceptCall = async () => {
        const stream = await startLocalStream(callType);
        if (!stream) return;

        setCallStatus("connected");
        socket?.emit("call:accept", { sessionId });
    };

    const rejectCall = () => {
        setCallStatus("idle");
        socket?.emit("call:reject", { sessionId });
    };

    const endCall = () => {
        stopLocalStream();
        if (peerConnectionRef.current) peerConnectionRef.current.close();
        setCallStatus("idle");
        socket?.emit("call:end", { sessionId });
    };

    const toggleMute = () => {
        if (localStreamRef.current) {
            const track = localStreamRef.current.getAudioTracks()[0];
            if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled); }
        }
    };

    const toggleVideo = () => {
        if (localStreamRef.current) {
            const track = localStreamRef.current.getVideoTracks()[0];
            if (track) { 
                track.enabled = !track.enabled; 
                setIsVideoOff(!track.enabled); 
            } else if (callType === 'audio') {
                toast.info("This is an audio-only call.");
            }
        }
    };

    useEffect(() => {
        if (!socket) return;

        socket.on('call:incoming', (data) => {
            if (callStatus === "idle") {
                setCallType(data.type);
                setCallStatus("incoming");
            }
        });

        socket.on('call:accepted', async () => {
            if (callStatus === "calling") {
                setCallStatus("connected");
                const stream = await startLocalStream(callType);
                if (!stream) return;

                const pc = createPeerConnection(stream);
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('call:offer', { sessionId, offer });
            }
        });

        socket.on('call:rejected', () => {
            toast.info("Call declined");
            setCallStatus("idle");
        });

        socket.on('call:ended', () => {
            stopLocalStream();
            if (peerConnectionRef.current) peerConnectionRef.current.close();
            setCallStatus("idle");
            toast.info("Call ended");
        });

        socket.on('call:offer', async (data) => {
            if (callStatus === "connected") {
                let stream = localStreamRef.current;
                if (!stream) stream = await startLocalStream(callType);
                if (!stream) return;

                const pc = createPeerConnection(stream);
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('call:answer', { sessionId, answer });
            }
        });

        socket.on('call:answer', async (data) => {
            if (peerConnectionRef.current) {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            }
        });

        socket.on('call:ice-candidate', async (data) => {
            if (peerConnectionRef.current) {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        });

        return () => {
            socket.off('call:incoming');
            socket.off('call:accepted');
            socket.off('call:rejected');
            socket.off('call:ended');
            socket.off('call:offer');
            socket.off('call:answer');
            socket.off('call:ice-candidate');
        };
    }, [socket, sessionId, callStatus, callType, createPeerConnection]);

    return (
        <>
            <AnimatePresence>
                {callStatus === "incoming" && (
                    <motion.div
                        initial={{ y: -100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -100, opacity: 0 }}
                        className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] bg-slate-900 border border-white/10 rounded-2xl p-4 shadow-2xl flex items-center gap-6"
                    >
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-white">Incoming Call...</span>
                            <span className="text-xs text-slate-400">Requesting {callType} chat</span>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={rejectCall} className="p-3 bg-red-500/20 text-red-400 rounded-full hover:bg-red-500 hover:text-white transition-colors">
                                <PhoneOff size={20} />
                            </button>
                            <button onClick={acceptCall} className="p-3 bg-emerald-500 text-white rounded-full hover:bg-emerald-400 animate-pulse">
                                {callType === 'video' ? <VideoIcon size={20} /> : <Phone size={20} />}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {callStatus === "calling" && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-slate-900/80 backdrop-blur border border-white/10 rounded-full px-6 py-2 flex items-center gap-3">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                    <span className="text-sm text-slate-200">Calling...</span>
                    <button onClick={endCall} className="p-1.5 bg-red-500/20 text-red-400 rounded-full hover:bg-red-500 hover:text-white ml-2">
                        <XIcon size={14} />
                    </button>
                </div>
            )}

            <AnimatePresence>
                {callStatus === "connected" && win.initialized && (
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        style={{ 
                            position: 'fixed', 
                            left: win.x, 
                            top: win.y, 
                            width: win.w, 
                            height: win.h,
                            zIndex: 100
                        }}
                        className="bg-slate-950 rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex flex-col min-w-[200px] min-h-[150px]"
                    >
                        <div 
                            onMouseDown={(e) => startInteraction(e, 'move')}
                            className="bg-slate-900/80 p-2 flex justify-center cursor-move active:cursor-grabbing border-b border-white/5 shrink-0"
                        >
                            <Move size={14} className="text-slate-600" />
                        </div>

                        <div className="relative flex-1 bg-black group overflow-hidden">
                            {callType === 'audio' ? (
                                <div className="w-full h-full flex items-center justify-center bg-slate-900">
                                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center animate-pulse">
                                        <Mic size={32} className="text-emerald-500" />
                                    </div>
                                </div>
                            ) : (
                                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                            )}
                            
                            {callType === 'video' && (
                                <div className="absolute bottom-2 right-2 w-[30%] aspect-video bg-slate-800 rounded-lg overflow-hidden border border-white/20 shadow-lg">
                                    <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
                                </div>
                            )}
                        </div>

                        <div className="p-3 flex justify-center gap-4 bg-slate-900 shrink-0 relative">
                            <button onClick={toggleMute} className={`p-2 rounded-full transition-colors ${isMuted ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-white hover:bg-slate-700'}`}>
                                {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
                            </button>
                            <button onClick={endCall} className="p-2 bg-red-600 text-white rounded-full hover:bg-red-500 shadow-lg">
                                <PhoneOff size={20} />
                            </button>
                            <button onClick={toggleVideo} disabled={callType === 'audio'} className={`p-2 rounded-full transition-colors ${isVideoOff || callType === 'audio' ? 'bg-red-500/20 text-red-400' : 'bg-slate-800 text-white hover:bg-slate-700'} ${callType === 'audio' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                {isVideoOff ? <VideoOff size={18} /> : <VideoIcon size={18} />}
                            </button>

                            <div 
                                onMouseDown={(e) => startInteraction(e, 'tl')}
                                className="absolute -top-[40px] left-0 w-6 h-6 cursor-nwse-resize z-50 bg-transparent" 
                                style={{ top: -35 }}
                            />
                            
                            <div 
                                onMouseDown={(e) => startInteraction(e, 'tr')}
                                className="absolute -top-[40px] right-0 w-6 h-6 cursor-nesw-resize z-50 bg-transparent"
                                style={{ top: -35 }}
                            />
                            
                            <div 
                                onMouseDown={(e) => startInteraction(e, 'bl')}
                                className="absolute bottom-0 left-0 w-6 h-6 cursor-nesw-resize z-50 bg-transparent"
                            />

                            <div 
                                onMouseDown={(e) => startInteraction(e, 'br')}
                                className="absolute bottom-0 right-0 p-1 cursor-nwse-resize hover:text-emerald-400 text-slate-600 transition-colors z-50"
                            >
                                <ArrowDownRight size={16} />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
});

CallInterface.displayName = "CallInterface";

const XIcon = ({ size }: { size: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
);