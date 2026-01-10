"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";

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

    // Start screen sharing
    const startSharing = useCallback(async () => {
        if (!socket) {
            console.log("[ScreenShareGuest] No socket available");
            return;
        }

        if (hasStartedRef.current) {
            console.log("[ScreenShareGuest] Already started");
            return;
        }

        hasStartedRef.current = true;
        console.log("[ScreenShareGuest] Starting screen share...");

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

            // Add stream tracks to connection
            stream.getTracks().forEach(track => {
                console.log("[ScreenShareGuest] Adding track:", track.kind);
                pc.addTrack(track, stream);
            });

            // Handle ICE candidates
            pc.onicecandidate = (event) => {
                if (event.candidate) {
                    console.log("[ScreenShareGuest] Sending ICE candidate");
                    socket.emit("webrtc:ice-candidate", {
                        sessionId,
                        candidate: event.candidate,
                    });
                }
            };

            // Connection state changes
            pc.onconnectionstatechange = () => {
                console.log("[ScreenShareGuest] Connection state:", pc.connectionState);
                if (pc.connectionState === "connected") {
                    setStatus("sharing");
                } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
                    cleanup();
                    onSharingChange(false);
                }
            };

            pc.oniceconnectionstatechange = () => {
                console.log("[ScreenShareGuest] ICE state:", pc.iceConnectionState);
            };

            // Create and send offer
            console.log("[ScreenShareGuest] Creating offer...");
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            console.log("[ScreenShareGuest] Sending offer to session:", sessionId);
            socket.emit("webrtc:offer", {
                sessionId,
                offer: pc.localDescription,
            });

            console.log("[ScreenShareGuest] Offer sent, waiting for answer...");

        } catch (err: any) {
            console.error("[ScreenShareGuest] Error:", err.message || err);
            cleanup();
            onSharingChange(false);
        }
    }, [socket, sessionId, cleanup, onSharingChange]);

    // Handle incoming answer from Host
    useEffect(() => {
        if (!socket) return;

        const handleAnswer = async (data: { answer: RTCSessionDescriptionInit }) => {
            console.log("[ScreenShareGuest] Received answer from host");
            if (peerConnectionRef.current) {
                try {
                    await peerConnectionRef.current.setRemoteDescription(
                        new RTCSessionDescription(data.answer)
                    );
                    console.log("[ScreenShareGuest] Remote description set");
                } catch (err) {
                    console.error("[ScreenShareGuest] Error setting remote description:", err);
                }
            }
        };

        const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
            if (peerConnectionRef.current && data.candidate) {
                try {
                    await peerConnectionRef.current.addIceCandidate(
                        new RTCIceCandidate(data.candidate)
                    );
                    console.log("[ScreenShareGuest] Added ICE candidate from host");
                } catch (err) {
                    console.error("[ScreenShareGuest] Error adding ICE candidate:", err);
                }
            }
        };

        const handleStreamRequest = () => {
             console.log("[ScreenShareGuest] Received stream request from late host");
             // If we are currently sharing, re-send the existing offer
             if (peerConnectionRef.current?.localDescription) {
                 console.log("[ScreenShareGuest] Re-sending active offer");
                 socket.emit("webrtc:offer", {
                    sessionId,
                    offer: peerConnectionRef.current.localDescription,
                });
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
    }, [socket]);

    // Start/stop based on isSharing prop
    useEffect(() => {
        console.log("[ScreenShareGuest] isSharing changed:", isSharing, "status:", status);

        if (isSharing && status === "idle" && !hasStartedRef.current) {
            // Small delay to ensure socket is connected
            const timer = setTimeout(() => {
                startSharing();
            }, 500);
            return () => clearTimeout(timer);
        } else if (!isSharing && status !== "idle") {
            cleanup();
            if (socket) {
                socket.emit("webrtc:stop", { sessionId });
            }
        }
    }, [isSharing, status, startSharing, cleanup, socket, sessionId]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanup();
        };
    }, [cleanup]);

    return null;
};
