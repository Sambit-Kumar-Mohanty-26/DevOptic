"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Socket } from "socket.io-client";
import { ShieldAlert, Globe, Server, Terminal } from "lucide-react";
import { GhostDOMOverlay, type ElementMetadata } from "./GhostDOMOverlay";
import { FindBar } from "./FindBar";
import { DevToolsPanel } from "./DevToolsPanel";

interface ScreenShareHostProps {
    sessionId: string;
    socket: Socket | null;
    hasControl?: boolean;
    activeTool?: string;
    isServerBrowserMode?: boolean;
    onInspectElement?: (element: any) => void;
}

const rtcConfig: RTCConfiguration = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
    ],
};

export const ScreenShareHost = ({
    sessionId,
    socket,
    hasControl = false,
    activeTool = "select",
    isServerBrowserMode = false,
    onInspectElement
}: ScreenShareHostProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const dataChannelRef = useRef<RTCDataChannel | null>(null);

    const scrollAccumulator = useRef({ x: 0, y: 0 });
    const lastCursorPos = useRef<{ x: number, y: number } | null>(null);

    const [status, setStatus] = useState<"waiting" | "connecting" | "streaming">("waiting");
    const [resolution, setResolution] = useState({ width: 0, height: 0 });
    const [privacyMode, setPrivacyMode] = useState(false);
    const [showFindBar, setShowFindBar] = useState(false);
    const [showDevTools, setShowDevTools] = useState(false);
    const [cursorStyle, setCursorStyle] = useState("default");

    const [ghostDOMData, setGhostDOMData] = useState<ElementMetadata[]>([]);
    const [serverBrowserUrl, setServerBrowserUrl] = useState("");
    const frameRequestRef = useRef<NodeJS.Timeout | null>(null);

    const cleanup = useCallback(() => {
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        if (frameRequestRef.current) {
            clearTimeout(frameRequestRef.current);
            frameRequestRef.current = null;
        }
        if (dataChannelRef.current) {
            dataChannelRef.current.close();
            dataChannelRef.current = null;
        }
    }, []);


    useEffect(() => {
        if (!isServerBrowserMode || !socket) return;

        // Handle cursor sync
        const handleCursor = (data: { cursor: string }) => {
            setCursorStyle(data.cursor);
        };

        socket.on('browser:cursor', handleCursor);

        return () => {
            socket.off('browser:cursor', handleCursor);
        };
    }, [isServerBrowserMode, socket, sessionId]);


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

        return {
            x: (xInVideo / renderWidth) * video.videoWidth,
            y: (yInVideo / renderHeight) * video.videoHeight,
        };
    };

    const sendCursorEvent = useCallback((type: string, x: number, y: number, extra: any = {}) => {
        // In server browser mode, always allow input. Otherwise require hasControl
        const canSendInput = isServerBrowserMode || hasControl;
        if (!socket || !canSendInput || !videoRef.current) return;
        const video = videoRef.current;
        socket.emit("control:cursor", {
            sessionId,
            type,
            x,
            y,
            normalizedX: x / video.videoWidth,
            normalizedY: y / video.videoHeight,
            streamWidth: video.videoWidth,
            streamHeight: video.videoHeight,
            ...extra
        });
    }, [socket, sessionId, hasControl, isServerBrowserMode]);

    // HIGH SPEED ACCUMULATOR LOOP (60 FPS)
    useEffect(() => {
        // Run scroll loop when hasControl OR in server browser mode
        const canInteract = isServerBrowserMode || hasControl;
        if (!canInteract) return;

        const interval = setInterval(() => {
            const { x, y } = scrollAccumulator.current;

            // Only send if there is significant movement (>1px) to save bandwidth
            if ((Math.abs(x) > 1 || Math.abs(y) > 1) && lastCursorPos.current) {
                sendCursorEvent("scroll", lastCursorPos.current.x, lastCursorPos.current.y, {
                    deltaX: x,
                    deltaY: y
                });

                scrollAccumulator.current = { x: 0, y: 0 };
            }
        }, 16); // 16ms = ~60 FPS

        return () => clearInterval(interval);
    }, [hasControl, sendCursorEvent, isServerBrowserMode]);

    const handleClick = useCallback((e: React.MouseEvent) => {
        const canInteract = isServerBrowserMode || hasControl || activeTool === 'magic';
        if (!canInteract) return;

        const coords = calculateVideoCoordinates(e);
        if (!coords) return;

        if (activeTool === 'magic') {
            console.log("[Inspector] Triggering inspection at", coords.x, coords.y);
            socket?.emit("magic:select", {
                sessionId,
                x: coords.x,
                y: coords.y,
                normalizedX: coords.x / (videoRef.current?.videoWidth || 1),
                normalizedY: coords.y / (videoRef.current?.videoHeight || 1)
            });
        } else {
            sendCursorEvent("click", coords.x, coords.y, { button: e.button });
        }
    }, [hasControl, activeTool, socket, sessionId, sendCursorEvent, isServerBrowserMode]);

    // Double-click handler for text selection
    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        const canInteract = isServerBrowserMode || hasControl;
        if (!canInteract) return;

        const coords = calculateVideoCoordinates(e);
        if (!coords) return;

        sendCursorEvent("dblclick", coords.x, coords.y, { button: e.button });
    }, [hasControl, sendCursorEvent, isServerBrowserMode]);

    // MouseDown handler for drag-select
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        const canInteract = isServerBrowserMode || hasControl;
        if (!canInteract) return;

        const coords = calculateVideoCoordinates(e);
        if (!coords) return;

        sendCursorEvent("mousedown", coords.x, coords.y, { button: e.button });
    }, [hasControl, sendCursorEvent, isServerBrowserMode]);

    // MouseUp handler for drag-select
    const handleMouseUp = useCallback((e: React.MouseEvent) => {
        const canInteract = isServerBrowserMode || hasControl;
        if (!canInteract) return;

        const coords = calculateVideoCoordinates(e);
        if (!coords) return;

        sendCursorEvent("mouseup", coords.x, coords.y, { button: e.button });
    }, [hasControl, sendCursorEvent, isServerBrowserMode]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const canInteract = isServerBrowserMode || hasControl;
        if (!canInteract) return;
        const coords = calculateVideoCoordinates(e);
        if (coords) {
            lastCursorPos.current = { x: coords.x, y: coords.y };
            sendCursorEvent("move", coords.x, coords.y);
        }
    }, [hasControl, sendCursorEvent, isServerBrowserMode]);

    // --- Wheel Event Handler ---
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleNativeWheel = (e: WheelEvent) => {
            const canInteract = isServerBrowserMode || hasControl;
            if (!canInteract || !socket) return;

            e.preventDefault();
            e.stopPropagation();

            const coords = calculateVideoCoordinates(e);
            if (coords) {
                lastCursorPos.current = { x: coords.x, y: coords.y };

                // MULTIPLIER: Increased for responsiveness (was 2.0)
                const sensitivity = 4.5;
                scrollAccumulator.current.x += (e.deltaX * sensitivity);
                scrollAccumulator.current.y += (e.deltaY * sensitivity);
            }
        };

        video.addEventListener('wheel', handleNativeWheel, { passive: false });
        return () => {
            video.removeEventListener('wheel', handleNativeWheel);
        };
    }, [hasControl, socket, sessionId, isServerBrowserMode]);

    // --- Keyboard Event Handler (Server Browser Mode) ---
    useEffect(() => {
        if (!isServerBrowserMode || !socket) return;

        const handleKeyDown = async (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            // F12 to toggle DevTools
            if (e.key === 'F12') {
                e.preventDefault();
                setShowDevTools(prev => !prev);
                return;
            }

            // Handle clipboard shortcuts
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'f' || e.key === 'F') {
                    // Find in Page
                    e.preventDefault();
                    setShowFindBar(true);
                    return;
                }
                if (e.key === 'c' || e.key === 'C') {
                    e.preventDefault();
                    socket.emit("browser:copy", { sessionId });
                    return;
                }
                if (e.key === 'v' || e.key === 'V') {
                    e.preventDefault();
                    try {
                        const text = await navigator.clipboard.readText();
                        if (text) {
                            socket.emit("browser:paste", { sessionId, text });
                        }
                    } catch (err) {
                        console.warn('[Clipboard] Could not read clipboard:', err);
                    }
                    return;
                }
                if (e.key === 'a' || e.key === 'A') {
                    // Select All
                    e.preventDefault();
                    socket.emit("browser:selectAll", { sessionId });
                    return;
                }
            }

            // Send key to server browser
            socket.emit("browser:keyboard", {
                sessionId,
                key: e.key,
                code: e.code,
                ctrlKey: e.ctrlKey,
                altKey: e.altKey,
                shiftKey: e.shiftKey,
                metaKey: e.metaKey
            });

            // Prevent default for navigation keys
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Enter', 'Backspace', 'Delete', 'Escape'].includes(e.key)) {
                e.preventDefault();
            }
        };

        // Handle incoming clipboard data from server
        const handleClipboard = async (data: { text: string }) => {
            if (data.text) {
                try {
                    await navigator.clipboard.writeText(data.text);
                    console.log('[Clipboard] Copied to local clipboard:', data.text.substring(0, 50));
                } catch (err) {
                    console.warn('[Clipboard] Could not write to clipboard:', err);
                }
            }
        };

        const handleCursorStyle = (data: { cursor: string }) => {
            setCursorStyle(data.cursor);
        };

        socket.on('browser:cursor', handleCursorStyle);
        socket.on('browser:clipboard', handleClipboard);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            socket.off('browser:cursor', handleCursorStyle);
            socket.off('browser:clipboard', handleClipboard);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isServerBrowserMode, socket, sessionId]);

    // --- Server Browser Mode: Real-Time Frame Streaming ---
    useEffect(() => {
        if (!isServerBrowserMode || !socket) return;

        console.log("[ServerBrowser] Setting up frame streaming");

        // Auto-start streaming if mode is active (handles refresh/reconnect)
        socket.emit("browser:stream:start", { sessionId });
        setStatus("connecting");

        // Canvas for rendering frames
        const canvas = document.createElement('canvas');
        canvas.width = 1920;
        canvas.height = 1080;
        const ctx = canvas.getContext('2d');

        // Handle incoming frame data
        const handleFrameData = (data: { sessionId: string, frame: { data: string | ArrayBuffer, format?: string, width: number, height: number } }) => {
            if (data.sessionId !== sessionId || !ctx || !videoRef.current) return;

            // Create image from data (Binary or Base64)
            const img = new Image();
            let objectUrl: string | null = null;

            img.onload = () => {
                // Update canvas size if needed
                if (canvas.width !== data.frame.width || canvas.height !== data.frame.height) {
                    canvas.width = data.frame.width;
                    canvas.height = data.frame.height;
                }

                // Draw frame to canvas
                ctx.drawImage(img, 0, 0);

                // Update video element with canvas stream
                if (!videoRef.current!.srcObject) {
                    const stream = canvas.captureStream(30);
                    videoRef.current!.srcObject = stream;
                    setStatus("streaming");
                    setResolution({ width: data.frame.width, height: data.frame.height });
                }

                // Clean up object URL
                if (objectUrl) {
                    URL.revokeObjectURL(objectUrl);
                }
            };

            // Handle data format
            if (data.frame.format === 'binary' || data.frame.data instanceof ArrayBuffer) {
                const blob = new Blob([data.frame.data as ArrayBuffer], { type: 'image/jpeg' });
                objectUrl = URL.createObjectURL(blob);
                img.src = objectUrl;
            } else {
                img.src = `data:image/jpeg;base64,${data.frame.data}`;
            }
        };

        // Handle Ghost DOM data
        const handleGhostDOMData = (data: { sessionId: string, elements: ElementMetadata[] }) => {
            if (data.sessionId === sessionId) {
                setGhostDOMData(data.elements);
            }
        };

        // Handle navigation - auto start streaming
        const handleNavigated = (data: { url: string }) => {
            console.log("[ServerBrowser] Navigated, starting stream...");
            socket.emit("browser:stream:start", { sessionId });
            setStatus("connecting");
        };

        // Handle stream started
        const handleStreamStarted = () => {
            console.log("[ServerBrowser] Stream started");
            setStatus("streaming");
        };

        // Handle file downloads from remote browser
        const handleDownload = (data: { filename: string; data: string; size: number; mimeType: string }) => {
            console.log(`[ServerBrowser] Download: ${data.filename} (${data.size} bytes)`);
            try {
                // Convert base64 to blob and trigger download
                const byteCharacters = atob(data.data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: data.mimeType });

                // Create download link
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = data.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                console.log(`[ServerBrowser] Downloaded: ${data.filename}`);
            } catch (err) {
                console.error('[ServerBrowser] Download failed:', err);
            }
        };

        socket.on("browser:frame:data", handleFrameData);
        socket.on("browser:ghostdom:data", handleGhostDOMData);
        socket.on("browser:navigated", handleNavigated);
        socket.on("browser:stream:started", handleStreamStarted);
        socket.on("browser:download", handleDownload);

        return () => {
            socket.off("browser:frame:data", handleFrameData);
            socket.off("browser:ghostdom:data", handleGhostDOMData);
            socket.off("browser:navigated", handleNavigated);
            socket.off("browser:stream:started", handleStreamStarted);
            socket.off("browser:download", handleDownload);

            // Stop streaming on unmount
            socket.emit("browser:stream:stop", { sessionId });
        };

    }, [isServerBrowserMode, socket, sessionId]);

    // --- Tab Visibility Handler (Fix for WhatsApp/Tab Switching) ---
    useEffect(() => {
        if (!isServerBrowserMode || !socket) return;

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                console.log("[ServerBrowser] Tab visible, resuming stream...");
                socket.emit("browser:stream:resume", { sessionId });
                setStatus("connecting");
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [isServerBrowserMode, socket, sessionId]);

    // --- WebRTC Connection Setup ---
    useEffect(() => {
        if (!socket) return;
        socket.emit("webrtc:request-stream", { sessionId });

        const handleOffer = async (data: { offer: RTCSessionDescriptionInit }) => {
            setStatus("connecting");
            try {
                if (peerConnectionRef.current) peerConnectionRef.current.close();
                const pc = new RTCPeerConnection(rtcConfig);
                peerConnectionRef.current = pc;

                // Handle incoming video track
                pc.ontrack = (event) => {
                    if (videoRef.current && event.streams[0]) {
                        videoRef.current.srcObject = event.streams[0];
                        setStatus("streaming");
                        videoRef.current.onloadedmetadata = () => {
                            if (videoRef.current) setResolution({ width: videoRef.current.videoWidth, height: videoRef.current.videoHeight });
                        };
                    }
                };

                // Handle incoming DataChannel for Ghost DOM (Server Browser Mode)
                pc.ondatachannel = (event) => {
                    const channel = event.channel;
                    channel.onmessage = (e) => {
                        try {
                            const metadata = JSON.parse(e.data);
                            if (Array.isArray(metadata)) {
                                setGhostDOMData(metadata);
                            }
                        } catch (err) {
                            console.warn("[ScreenShareHost] DataChannel parse error:", err);
                        }
                    };
                    dataChannelRef.current = channel;
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

                // Monitor packet loss for adaptive quality feedback
                if (isServerBrowserMode) {
                    setInterval(async () => {
                        if (!pc || pc.connectionState !== 'connected') return;
                        try {
                            const stats = await pc.getStats();
                            stats.forEach((report) => {
                                if (report.type === 'inbound-rtp' && report.packetsLost !== undefined) {
                                    socket.emit('webrtc:stats', {
                                        sessionId,
                                        packetLoss: report.packetsLost
                                    });
                                }
                            });
                        } catch (err) { }
                    }, 5000);
                }

            } catch (err) { cleanup(); }
        };

        const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
            if (peerConnectionRef.current && data.candidate) try { await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) { }
        };

        const handleStop = () => cleanup();

        socket.on("webrtc:offer", handleOffer);
        socket.on("webrtc:ice-candidate", handleIceCandidate);
        socket.on("webrtc:stop", handleStop);
        socket.on('privacy:sync', (data: { active: boolean }) => {
            console.log("Privacy Mode:", data.active);
            setPrivacyMode(data.active);
        });

        return () => {
            socket.off("webrtc:offer", handleOffer);
            socket.off("webrtc:ice-candidate", handleIceCandidate);
            socket.off("webrtc:stop", handleStop);
            socket.off('privacy:sync');
            cleanup();
        };
    }, [socket, sessionId, cleanup, isServerBrowserMode]);

    // --- Ghost DOM Handlers ---
    const handleGhostDOMHover = useCallback((element: ElementMetadata | null) => {
        if (!socket || !element) return;

        socket.emit("magic:highlight", {
            sessionId,
            rect: {
                left: element.rect.left / (resolution.width || 1920),
                top: element.rect.top / (resolution.height || 1080),
                width: element.rect.width / (resolution.width || 1920),
                height: element.rect.height / (resolution.height || 1080),
            },
            userId: socket.id
        });
    }, [socket, sessionId, resolution]);

    const handleGhostDOMClick = useCallback((element: ElementMetadata) => {
        if (onInspectElement) {
            // Request full inspection data from server
            socket?.emit("browser:inspect", { sessionId, elementId: element.id });
            onInspectElement(element);
        }
    }, [socket, sessionId, onInspectElement]);

    return (
        <div ref={containerRef} className={`w-full h-full relative bg-slate-900 overflow-hidden rounded-2xl border ${hasControl ? 'border-violet-500/50 shadow-[0_0_20px_rgba(139,92,246,0.3)]' : 'border-white/10'}`}>
            {/* Status Bar */}
            <div className="absolute top-4 left-4 z-20 flex items-center gap-3 bg-slate-900/90 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10">
                <div className={`w-2 h-2 rounded-full ${status === "streaming" ? "bg-red-500 animate-pulse" : "bg-slate-600"}`} />
                <span className="text-xs font-mono text-slate-400">{status === "streaming" ? "LIVE" : status === "connecting" ? "CONNECTING..." : "WAITING"}</span>
                {status === "streaming" && <span className="text-xs font-mono text-slate-600">{resolution.width}x{resolution.height}</span>}
                {hasControl && <span className="text-xs font-bold text-violet-400">CONTROLLING</span>}
                {isServerBrowserMode && (
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                        <Server size={12} />
                        SERVER
                    </span>
                )}
            </div>

            {/* Find Bar */}
            {isServerBrowserMode && (
                <FindBar
                    sessionId={sessionId}
                    socket={socket}
                    isOpen={showFindBar}
                    onClose={() => setShowFindBar(false)}
                />
            )}

            {/* Waiting State */}
            {status !== "streaming" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-slate-900">
                    <div className="w-16 h-16 border-4 border-violet-500/20 rounded-full border-t-violet-500 animate-spin mb-4" />
                    <p className="text-slate-500 text-sm">
                        {isServerBrowserMode ? "Connecting to Server Browser..." : "Waiting for Guest Stream..."}
                    </p>
                </div>
            )}

            {/* Privacy Mode Overlay */}
            {privacyMode && (
                <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center border border-red-500/20 m-1 rounded-xl">
                    <div className="bg-red-500/10 p-4 rounded-full mb-4 animate-pulse">
                        <ShieldAlert size={48} className="text-red-500" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Sensitive Input Detected</h3>
                    <p className="text-slate-400 text-sm max-w-xs text-center">
                        The user is currently entering confidential information (Password/Email).
                        Screen share is paused for security.
                    </p>
                </div>
            )}

            {/* Video Element */}
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-contain ${(hasControl || isServerBrowserMode) ? (activeTool === 'magic' ? 'cursor-crosshair' : 'cursor-none') : ''} ${privacyMode ? 'opacity-0' : 'opacity-100'}`}
                style={{
                    opacity: status === "streaming" ? 1 : 0,
                    cursor: isServerBrowserMode ? cursorStyle : undefined
                }}
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onContextMenu={(e) => {
                    if (isServerBrowserMode || hasControl) {
                        e.preventDefault();
                        handleClick({ ...e, button: 2 } as React.MouseEvent);
                    }
                }}
                tabIndex={isServerBrowserMode ? 0 : -1}
            />

            {/* Ghost DOM Overlay for Server Browser Mode */}
            {isServerBrowserMode && status === "streaming" && activeTool === 'magic' && (
                <GhostDOMOverlay
                    elements={ghostDOMData}
                    videoRef={videoRef}
                    isActive={true}
                    onHover={handleGhostDOMHover}
                    onClick={handleGhostDOMClick}
                    showCursor={true}
                />
            )}

            {/* DevTools Panel */}
            {isServerBrowserMode && (
                <DevToolsPanel
                    sessionId={sessionId}
                    socket={socket}
                    isOpen={showDevTools}
                    onClose={() => setShowDevTools(false)}
                />
            )}

            {/* DevTools Toggle Button */}
            {isServerBrowserMode && status === "streaming" && !showDevTools && (
                <button
                    onClick={() => setShowDevTools(true)}
                    className="absolute bottom-4 right-4 z-40 p-2 bg-slate-800/90 hover:bg-slate-700 border border-white/10 rounded-lg transition-colors"
                    title="Open DevTools (F12)"
                >
                    <Terminal size={16} className="text-slate-400" />
                </button>
            )}
        </div>
    );
};