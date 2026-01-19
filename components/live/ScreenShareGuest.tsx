"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";
import { Monitor, RefreshCw } from "lucide-react";

interface ScreenShareGuestProps {
    sessionId: string;
    socket: Socket | null;
    isSharing: boolean;
    onSharingChange: (sharing: boolean) => void;
}

const rtcConfig: RTCConfiguration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
    ],
};

export const ScreenShareGuest = ({
    sessionId,
    socket,
    isSharing,
    onSharingChange
}: ScreenShareGuestProps) => {
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [status, setStatus] = useState<"idle" | "connecting" | "sharing">("idle");
    const [showManualStart, setShowManualStart] = useState(false);
    const hasStartedRef = useRef(false);

    // Cleanup function
    const cleanup = useCallback(() => {
        console.log("[ScreenShareGuest] Cleaning up");
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        setStatus("idle");
        hasStartedRef.current = false;
    }, []);

    const startSharing = useCallback(async () => {
        if (!socket) return;
        if (hasStartedRef.current) return;

        hasStartedRef.current = true;
        setShowManualStart(false);

        try {
            setStatus("connecting");

            // Request screen capture - this will show browser prompt
            console.log("[ScreenShareGuest] Requesting getDisplayMedia...");
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: 30 },
                },
                audio: false,
            });

            console.log("[ScreenShareGuest] Got stream:", stream.id);
            streamRef.current = stream;

            // Handle stream end (user clicks "Stop sharing" in browser)
            stream.getVideoTracks()[0].onended = () => {
                console.log("[ScreenShareGuest] User stopped sharing");
                cleanup();
                onSharingChange(false);
                socket.emit("webrtc:stop", { sessionId });
            };

            // Create peer connection
            console.log("[ScreenShareGuest] Creating RTCPeerConnection...");
            const pc = new RTCPeerConnection(rtcConfig);
            peerConnectionRef.current = pc;

            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            // Handle ICE candidates
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit("webrtc:ice-candidate", { sessionId, candidate: event.candidate });
                }
            };

            // Connection state changes
            pc.onconnectionstatechange = () => {
                console.log("[ScreenShareGuest] Connection state:", pc.connectionState);
                if (pc.connectionState === "connected") {
                    setStatus("sharing");
                } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
                    cleanup();
                }
            };

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("webrtc:offer", { sessionId, offer: pc.localDescription });

        } catch (err: any) {
            console.warn("[ScreenShare] Start Failed:", err.message);
            hasStartedRef.current = false;
            cleanup();
            setShowManualStart(true);
        }
    }, [socket, sessionId, cleanup, onSharingChange]);

    useEffect(() => {
        if (!socket) return;

        const handleAnswer = async (data: { answer: RTCSessionDescriptionInit }) => {
            const pc = peerConnectionRef.current;
            if (pc && pc.signalingState === 'have-local-offer') {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                } catch (err) {
                    console.error("Error setting remote desc:", err);
                }
            }
        };

        const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
            if (peerConnectionRef.current && data.candidate) {
                try { await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) {}
            }
        };

        const handleStreamRequest = () => {
             if (peerConnectionRef.current?.localDescription) {
                 socket.emit("webrtc:offer", { sessionId, offer: peerConnectionRef.current.localDescription });
             } else if (isSharing && !hasStartedRef.current) {
                 startSharing();
             }
        };

        socket.on("webrtc:answer", handleAnswer);
        socket.on("webrtc:ice-candidate", handleIceCandidate);
        socket.on("webrtc:request-stream", handleStreamRequest);

        return () => {
            socket.off("webrtc:answer", handleAnswer);
            socket.off("webrtc:ice-candidate", handleIceCandidate);
            socket.off("webrtc:request-stream", handleStreamRequest);
        };
    }, [socket, isSharing, startSharing]);

    useEffect(() => {
        if (isSharing && status === "idle" && !hasStartedRef.current) {
            const timer = setTimeout(() => {
                startSharing().catch(() => setShowManualStart(true));
            }, 500);
            return () => clearTimeout(timer);
        } else if (!isSharing && status !== "idle") {
            cleanup();
            socket?.emit("webrtc:stop", { sessionId });
        }
    }, [isSharing, status, startSharing, cleanup, socket, sessionId]);

    useEffect(() => () => cleanup(), [cleanup]);

    if (!isSharing) return null;

    if (showManualStart) {
        return (
            <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] animate-bounce">
                <button 
                    onClick={startSharing}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-full font-bold shadow-[0_0_20px_rgba(16,185,129,0.5)] flex items-center gap-3 transition-all transform hover:scale-105 border-2 border-white/20"
                >
                    <Monitor size={20} />
                    <span>Resume Screen Sharing</span>
                    <RefreshCw size={16} className="opacity-50" />
                </button>
            </div>
        );
    }

    return null;
};