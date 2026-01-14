"use client";

import { useEffect, useRef, useState } from "react";
import { Replayer } from "rrweb";
import "rrweb/dist/style.css"; 
import pako from "pako";
import type { Socket } from "socket.io-client";

interface HostPlayerProps {
  sessionId: string;
  socket: Socket | null;
}

const EventType = {
  DomContentLoaded: 0,
  Load: 1,
  FullSnapshot: 2,
  IncrementalSnapshot: 3,
  Meta: 4,
  Custom: 5,
};

export const HostPlayer = ({ sessionId, socket }: HostPlayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<Replayer | null>(null);
  const eventsBuffer = useRef<any[]>([]); 
  
  const [status, setStatus] = useState<"waiting" | "connected" | "playing">("waiting");
  const [eventCount, setEventCount] = useState(0);
  const [resolution, setResolution] = useState<{ width: number, height: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeHandler = () => {
      if (!replayerRef.current || !resolution) return;
      
      const wrapper = container.querySelector('.replayer-wrapper') as HTMLElement;
      if (!wrapper) return;

      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const contentWidth = resolution.width;
      const contentHeight = resolution.height;

      const scaleX = containerWidth / contentWidth;
      const scaleY = containerHeight / contentHeight;
      const scale = Math.min(scaleX, scaleY, 1);

      wrapper.style.transform = `scale(${scale})`;
      wrapper.style.transformOrigin = 'top left';
      wrapper.style.width = `${contentWidth}px`;
      wrapper.style.height = `${contentHeight}px`;
    };

    const observer = new ResizeObserver(resizeHandler);
    observer.observe(container);
    resizeHandler();

    return () => observer.disconnect();
  }, [resolution]);

  useEffect(() => {
    if (!socket) return;

    console.log("[HostPlayer] Requesting full snapshot...");
    socket.emit("rrweb:request-snapshot", { requestorId: socket.id });

    const handleRrwebEvent = async (data: { event: string; timestamp: number }) => {
      try {
        const binaryString = atob(data.event);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const decompressed = pako.inflate(bytes, { to: "string" });
        const event = JSON.parse(decompressed);

        setEventCount((prev) => prev + 1);

        if (!replayerRef.current) {
          if (event.type === EventType.Meta) {
             setResolution({ width: event.data.width, height: event.data.height });
          }

          if (event.type === EventType.FullSnapshot) {
            setStatus("playing");
            
            if (containerRef.current) {
                containerRef.current.innerHTML = ""; 
                
                const initialEvents = [...eventsBuffer.current, event];
                initialEvents.sort((a, b) => a.timestamp - b.timestamp);

                const replayer = new Replayer(initialEvents, {
                  root: containerRef.current,
                  liveMode: true,
                  mouseTail: false,
                });
                
                replayerRef.current = replayer;
                (replayer as any).start(); 
                
                eventsBuffer.current = [];
            }
          } else {
            eventsBuffer.current.push(event);
            if(status === "waiting") setStatus("connected");
          }
        } else {
          replayerRef.current.addEvent(event);
        }

      } catch (err) {
        console.error("[HostPlayer] Error processing event:", err);
      }
    };

    const handleRrwebBatch = async (data: { batch: string; timestamp: number }) => {
      try {
        const binaryString = atob(data.batch);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        
        const decompressed = pako.inflate(bytes, { to: "string" });
        const events = JSON.parse(decompressed) as any[]; // This is an Array now

        if (!replayerRef.current) {
            // Buffer them if player isn't ready
            eventsBuffer.current.push(...events);
        } else {
            // Add all events to player
            events.forEach(e => replayerRef.current?.addEvent(e));
        }
        
        setEventCount(prev => prev + events.length);
      } catch (err) {
        console.error("Batch Error:", err);
      }
    };

    socket.on("rrweb:event", handleRrwebEvent);
    socket.on("rrweb:batch", handleRrwebBatch);

    return () => {
      socket.off("rrweb:event", handleRrwebEvent);
      socket.off("rrweb:batch", handleRrwebBatch); 
      if (replayerRef.current) {
        replayerRef.current.destroy();
        replayerRef.current = null;
      }
    };
  }, [socket, status]);

  return (
    <div className="w-full h-full relative bg-slate-950 rounded-lg overflow-hidden border border-white/10 flex items-center justify-center">
      <div 
        ref={containerRef} 
        className="relative w-full h-full overflow-hidden flex items-center justify-center"
      />

      <div className="absolute top-2 right-2 z-50 flex items-center gap-2 pointer-events-none">
        <div className={`w-2 h-2 rounded-full ${
          status === "playing" ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : 
          status === "connected" ? "bg-amber-500 animate-pulse" : 
          "bg-slate-600"
        }`} />
        <span className="text-[9px] font-mono text-slate-500 bg-slate-900/80 px-1.5 py-0.5 rounded backdrop-blur-sm border border-white/5">
           RRWEB: {status.toUpperCase()} | EVENTS: {eventCount}
        </span>
      </div>

      {status !== "playing" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-40 bg-slate-950/80 backdrop-blur-sm">
          {status === "waiting" ? (
             <div className="flex flex-col items-center">
                <div className="w-8 h-8 border-2 border-violet-500/20 rounded-full border-t-violet-500 animate-spin mb-3" />
                <p className="text-violet-400 text-[10px] font-mono tracking-widest uppercase animate-pulse">Waiting for Guest Stream...</p>
             </div>
          ) : (
             <div className="flex flex-col items-center">
                <div className="w-8 h-8 border-2 border-amber-500/20 rounded-full border-t-amber-500 animate-spin mb-3" />
                <p className="text-amber-400 text-[10px] font-mono tracking-widest uppercase">Buffering Snapshot...</p>
                <p className="text-slate-500 text-[9px] mt-1">{eventsBuffer.current.length} frames queued</p>
             </div>
          )}
        </div>
      )}
    </div>
  );
};