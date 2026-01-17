"use client";

import React, { useState, useRef, useEffect } from "react";
import { RemoteNetwork } from "./RemoteNetwork";
import { RemoteConsole } from "./RemoteConsole";
import { GripHorizontal } from "lucide-react";
import type { Socket } from "socket.io-client";

interface TelemetryPanelProps {
  sessionId: string;
  socket: Socket | null;
}

export const TelemetryPanel = ({ sessionId, socket }: TelemetryPanelProps) => {
  const [networkHeight, setNetworkHeight] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const startDrag = () => {
    isDragging.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  };

  const stopDrag = () => {
    isDragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  const onDrag = (e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const percentage = (relativeY / rect.height) * 100;
    if (percentage > 15 && percentage < 85) setNetworkHeight(percentage);
  };

  useEffect(() => {
    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", stopDrag);
    return () => {
      window.removeEventListener("mousemove", onDrag);
      window.removeEventListener("mouseup", stopDrag);
    };
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full bg-slate-950">
      
      {/* TOP: Network */}
      <div style={{ height: `${networkHeight}%` }} className="overflow-hidden flex flex-col">
        <RemoteNetwork sessionId={sessionId} socket={socket} />
      </div>

      {/* HANDLE */}
      <div 
        onMouseDown={startDrag}
        className="h-1.5 bg-slate-900 border-y border-white/10 hover:bg-emerald-500/20 cursor-row-resize flex items-center justify-center shrink-0 z-50 transition-colors"
      >
        <GripHorizontal size={10} className="text-slate-600" />
      </div>

      {/* BOTTOM: Console */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <RemoteConsole sessionId={sessionId} socket={socket} />
      </div>
    </div>
  );
};