"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";

interface ScreenShareHostProps {
    sessionId: string;
    socket: Socket | null;
    hasControl?: boolean;
}

const rtcConfig: RTCConfiguration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
    ],
};

export const ScreenShareHost = ({ sessionId, socket, hasControl = false }: ScreenShareHostProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const [status, setStatus] = useState<"waiting" | "connecting" | "streaming">("waiting");
    const [resolution, setResolution] = useState({ width: 0, height: 0 });

    const cleanup = useCallback(() => {
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setStatus("waiting");
        setResolution({ width: 0, height: 0 });
    }, []);

    // Updated to accept both React Synthetic Events and Native DOM Events
    const calculateVideoCoordinates = (e: React.MouseEvent | React.WheelEvent | MouseEvent | WheelEvent) => {
        const video = videoRef.current;
        if (!video || video.videoWidth === 0) return null;

        const rect = video.getBoundingClientRect();

        const videoRatio = video.videoWidth / video.videoHeight;
        const elementRatio = rect.width / rect.height;

        let renderWidth = rect.width;
        let renderHeight = rect.height;
        let offsetX = 0;
        let offsetY = 0;

        if (elementRatio > videoRatio) {
            renderWidth = rect.height * videoRatio;
            offsetX = (rect.width - renderWidth) / 2;
        } else {
            renderHeight = rect.width / videoRatio;
            offsetY = (rect.height - renderHeight) / 2;
        }

        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;

        if (clientX < offsetX || clientX > offsetX + renderWidth ||
            clientY < offsetY || clientY > offsetY + renderHeight) {
            return null;
        }

        const xInVideo = clientX - offsetX;
        const yInVideo = clientY - offsetY;

        const sourceX = (xInVideo / renderWidth) * video.videoWidth;
        const sourceY = (yInVideo / renderHeight) * video.videoHeight;

        return {
            x: sourceX,
            y: sourceY,
            displayX: e.clientX - rect.left,
            displayY: e.clientY - rect.top,
            normalizedX: (xInVideo / renderWidth),
            normalizedY: (yInVideo / renderHeight)
        };
    };

    const sendCursorEvent = useCallback((type: string, x: number, y: number, extra: any = {}) => {
        if (!socket || !hasControl || !videoRef.current) return;

        const video = videoRef.current;

        const data = {
            sessionId,
            type,
            x,
            y,
            normalizedX: x / video.videoWidth,
            normalizedY: y / video.videoHeight,
            streamWidth: video.videoWidth,
            streamHeight: video.videoHeight,
            ...extra
        };
        socket.emit("control:cursor", data);
    }, [socket, sessionId, hasControl]);

    // Handle click on video
    const handleClick = useCallback((e: React.MouseEvent) => {
        if (!hasControl) return;

        const coords = calculateVideoCoordinates(e);
        if (coords) {
            sendCursorEvent("click", coords.x, coords.y, { button: e.button });
        }
    }, [hasControl, sendCursorEvent]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!hasControl) return;
        const coords = calculateVideoCoordinates(e);
        if (coords) {
            sendCursorEvent("move", coords.x, coords.y);
        }
    }, [hasControl, sendCursorEvent]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleNativeWheel = (e: WheelEvent) => {
            if (!hasControl || !socket) return;

            e.preventDefault(); 
            e.stopPropagation();

            const coords = calculateVideoCoordinates(e);

            if (coords) {
                sendCursorEvent("scroll", coords.x, coords.y, {
                    deltaX: e.deltaX,
                    deltaY: e.deltaY,
                });
            }
        };

        video.addEventListener('wheel', handleNativeWheel, { passive: false });

        return () => {
            video.removeEventListener('wheel', handleNativeWheel);
        };
    }, [hasControl, socket, sessionId, sendCursorEvent]);

    useEffect(() => {
        if (!socket) return;
        
        console.log("[ScreenShareHost] Asking for stream...");
        socket.emit("webrtc:request-stream", { sessionId });

        const handleOffer = async (data: { offer: RTCSessionDescriptionInit }) => {
            console.log("[ScreenShareHost] Received offer");
            setStatus("connecting");
            try {
                if (peerConnectionRef.current) peerConnectionRef.current.close();
                const pc = new RTCPeerConnection(rtcConfig);
                peerConnectionRef.current = pc;
                pc.ontrack = (event) => {
                    if (videoRef.current && event.streams[0]) {
                        videoRef.current.srcObject = event.streams[0];
                        setStatus("streaming");
                        videoRef.current.onloadedmetadata = () => {
                            if (videoRef.current) {
                                setResolution({
                                    width: videoRef.current.videoWidth,
                                    height: videoRef.current.videoHeight
                                });
                            }
                        };
                    }
                };
                pc.onicecandidate = (event) => {
                    if (event.candidate) socket.emit("webrtc:ice-candidate", { sessionId, candidate: event.candidate });
                };
                pc.onconnectionstatechange = () => {
                    if (pc.connectionState === "failed" || pc.connectionState === "disconnected") cleanup();
                };
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit("webrtc:answer", { sessionId, answer: pc.localDescription });
            } catch (err) {
                console.error("[ScreenShareHost] Error:", err);
                cleanup();
            }
        };
        const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
            if (peerConnectionRef.current && data.candidate) {
                try { await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) { }
            }
        };
        const handleStop = () => cleanup();

        socket.on("webrtc:offer", handleOffer);
        socket.on("webrtc:ice-candidate", handleIceCandidate);
        socket.on("webrtc:stop", handleStop);

        return () => {
            socket.off("webrtc:offer", handleOffer);
            socket.off("webrtc:ice-candidate", handleIceCandidate);
            socket.off("webrtc:stop", handleStop);
            cleanup();
        };
    }, [socket, sessionId, cleanup]);

    return (
        <div
            ref={containerRef}
            className={`w-full h-full relative bg-slate-900 overflow-hidden rounded-2xl border ${hasControl ? 'border-violet-500/50 shadow-[0_0_20px_rgba(139,92,246,0.3)]' : 'border-white/10'}`}
        >
            {/* Status Overlay */}
            <div className="absolute top-4 left-4 z-20 flex items-center gap-3 bg-slate-900/90 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10">
                <div className={`w-2 h-2 rounded-full ${status === "streaming" ? "bg-red-500 animate-pulse" : "bg-slate-600"}`} />
                <span className="text-xs font-mono text-slate-400">
                    {status === "streaming" ? "LIVE" : status === "connecting" ? "CONNECTING..." : "WAITING"}
                </span>
                {status === "streaming" && (
                    <span className="text-xs font-mono text-slate-600">
                        {resolution.width}x{resolution.height}
                    </span>
                )}
                {hasControl && <span className="text-xs font-bold text-violet-400">CONTROLLING</span>}
            </div>

            {/* Waiting State */}
            {status !== "streaming" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-slate-900">
                    <div className="w-16 h-16 border-4 border-violet-500/20 rounded-full border-t-violet-500 animate-spin mb-4" />
                    <p className="text-slate-500 text-sm">Waiting for Guest Stream...</p>
                </div>
            )}

            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-contain ${hasControl ? 'cursor-none' : ''}`}
                style={{ opacity: status === "streaming" ? 1 : 0 }}
                onClick={handleClick}
                onMouseMove={hasControl ? handleMouseMove : undefined}
            />
        </div>
    );
};