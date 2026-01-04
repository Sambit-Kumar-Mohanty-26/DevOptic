"use client";

import React, { useState, use, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Terminal, Paintbrush, Share2, MousePointer2, 
  Type, Square, Circle, MessageSquare, 
  Shield, Cpu, Check, Globe, Zap, Search,
  RotateCw, ChevronLeft, Trash2, Eraser,  Wand2,
  Move, LayoutTemplate, ArrowRight, Minus, Triangle, AppWindow, Grid3x3
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { toast } from "sonner";
import * as fabric from "fabric"; 

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default function LiveWorkspace({ params }: PageProps) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;

  // --- STATE ---
  const [mode, setMode] = useState<"debug" | "pixel">("debug");
  const [pixelSubMode, setPixelSubMode] = useState<"overlay" | "whiteboard">("overlay");
  const [activeTool, setActiveTool] = useState("select");
  const [activeColor, setActiveColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(3);
  
  // Browser State
  const [targetUrl, setTargetUrl] = useState("https://nextjs.org");
  const [inputUrl, setInputUrl] = useState("https://nextjs.org");
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvas = useRef<fabric.Canvas | null>(null);
  const colorInputRef = useRef<HTMLInputElement>(null)

  // --- INITIALIZE CANVAS ---
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    // Get exact container dimensions (including decimals)
    const initRect = containerRef.current.getBoundingClientRect();

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: initRect.width,
      height: initRect.height,
      selection: true,
      renderOnAddRemove: true,
      enableRetinaScaling: true, // Keep TRUE for sharp rendering
    });
    
    fabricCanvas.current = canvas;

    // Resize Observer to handle window resizing perfectly
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        
        // Update canvas size to match container exactly
        canvas.setDimensions({ width, height });
        canvas.calcOffset();
        canvas.renderAll();
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      canvas.dispose();
    };
  }, []);

  // --- HANDLE WHITEBOARD VS OVERLAY MODE ---
  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    if (pixelSubMode === "whiteboard") {
      canvas.backgroundColor = "transparent";
      if(activeColor === "#000000") setActiveColor("#000000");
    } else {
      canvas.backgroundColor = "transparent";
      if(activeColor === "#000000") setActiveColor("#f43f5e");
    }
    canvas.requestRenderAll();
  }, [pixelSubMode]);

  // ---TOOL LOGIC (Fixed Arrow Hit-Box & Eraser) ---
  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    // Reset Defaults
    canvas.isDrawingMode = false;
    canvas.selection = true;
    canvas.defaultCursor = "default";
    canvas.hoverCursor = "move";
    canvas.off("mouse:down");
    canvas.off("mouse:move");
    canvas.off("mouse:up");

    if (activeTool === "magic") {
      canvas.selection = false;
      canvas.defaultCursor = "default";
      // We rely on CSS pointer-events to let the mouse pass through
    }

    // --- PENCIL ---
    else if (activeTool === "pencil") {
      canvas.isDrawingMode = true;
      const brush = new fabric.PencilBrush(canvas);
      brush.width = brushSize;
      brush.color = activeColor;
      canvas.freeDrawingBrush = brush;
      canvas.defaultCursor = "crosshair";
      canvas.hoverCursor = "crosshair";
    } 
    
    // --- ERASER ---
    else if (activeTool === "eraser") {
        const eraserCursor = `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjgiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4zKSIgLz48L3N2Zz4=") 12 12, auto`;
        
        canvas.defaultCursor = eraserCursor; 
        canvas.hoverCursor = eraserCursor;
        canvas.selection = false;
        
        // Enable per-pixel target find so we can hit lines easily
        canvas.forEachObject((obj) => {
            obj.perPixelTargetFind = false;
        });

        canvas.on("mouse:down", (opt) => {
            if (opt.target) {
                canvas.remove(opt.target);
                canvas.requestRenderAll();
            }
        });
    }

    // --- SHAPES & ARROWS ---
    else if (["rect", "circle", "arrow", "diamond", "triangle"].includes(activeTool)) {
      canvas.selection = false;
      canvas.defaultCursor = "crosshair";
      canvas.hoverCursor = "crosshair";
      
      let shape: any = null;
      let isDown = false;
      let origX = 0;
      let origY = 0;

      canvas.on("mouse:down", (o) => {
        isDown = true;
        const pointer = canvas.getScenePoint(o.e);
        origX = pointer.x;
        origY = pointer.y;
        
        const commonProps = {
            left: origX, top: origY, 
            fill: 'transparent', 
            stroke: activeColor, 
            strokeWidth: brushSize,
            selectable: false,
            originX: 'left' as const,
            originY: 'top' as const,
            padding: 10,
            cornerSize: 10
        };

        if (activeTool === "rect") {
            shape = new fabric.Rect({ ...commonProps, width: 0, height: 0 });
            canvas.add(shape);
        } else if (activeTool === "circle") {
            shape = new fabric.Circle({ ...commonProps, radius: 0 });
            canvas.add(shape);
        } else if (activeTool === "triangle") {
            shape = new fabric.Triangle({ ...commonProps, width: 0, height: 0 });
            canvas.add(shape);
        } else if (activeTool === "diamond") {
            shape = new fabric.Rect({ ...commonProps, width: 0, height: 0, angle: 45, originX: 'center' as const, originY: 'center' as const, left: origX, top: origY });
            canvas.add(shape);
        } else if (activeTool === "arrow") {
            // We don't add the arrow yet, we create it dynamically in move
        }
      });

      canvas.on("mouse:move", (o) => {
        if (!isDown) return;
        const pointer = canvas.getScenePoint(o.e);
        
        // ARROW LOGIC (Re-create object to ensure Hit Box is correct)
        if (activeTool === "arrow") {
            if(shape) canvas.remove(shape);

            const x1 = origX;
            const y1 = origY;
            const x2 = pointer.x;
            const y2 = pointer.y;
            
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const headLen = 20;

            const x2_arrow = x2 - headLen * Math.cos(angle - Math.PI / 6);
            const y2_arrow = y2 - headLen * Math.sin(angle - Math.PI / 6);
            const x3_arrow = x2 - headLen * Math.cos(angle + Math.PI / 6);
            const y3_arrow = y2 - headLen * Math.sin(angle + Math.PI / 6);

            const pathData = `M ${x1} ${y1} L ${x2} ${y2} M ${x2} ${y2} L ${x2_arrow} ${y2_arrow} M ${x2} ${y2} L ${x3_arrow} ${y3_arrow}`;
            
            shape = new fabric.Path(pathData, {
                fill: 'transparent',
                stroke: activeColor,
                strokeWidth: brushSize,
                strokeLineCap: 'round',
                strokeLineJoin: 'round',
                selectable: false,
                evented: false,
                originX: 'left' as const,
                originY: 'top' as const,
                padding: 15
            });
            
            canvas.add(shape);
        } 
        
        // OTHER SHAPES (Resize existing)
        else if (shape) {
            if (activeTool === "circle") {
                const radius = Math.sqrt(Math.pow(pointer.x - origX, 2) + Math.pow(pointer.y - origY, 2)) / 2;
                shape.set({ radius: radius });
            } else if (activeTool === "diamond") {
                 const w = Math.abs(origX - pointer.x);
                 const h = Math.abs(origY - pointer.y);
                 shape.set({ width: w, height: h });
            } else {
                if (origX > pointer.x) shape.set({ left: Math.abs(pointer.x) });
                if (origY > pointer.y) shape.set({ top: Math.abs(pointer.y) });
                shape.set({ width: Math.abs(origX - pointer.x), height: Math.abs(origY - pointer.y) });
            }
        }
        canvas.requestRenderAll();
      });

      canvas.on("mouse:up", () => {
        isDown = false;
        if (shape) {
            shape.setCoords();
            shape.set({ 
                selectable: true, 
                evented: true,
                perPixelTargetFind: false
            }); 
        }
        setActiveTool("select"); 
      });
    }

    // --- TEXT ---
    else if (activeTool === "text") {
      canvas.defaultCursor = "text";
      canvas.hoverCursor = "text";
      canvas.on("mouse:down", (o) => {
        const pointer = canvas.getScenePoint(o.e);
        const text = new fabric.IText("Type...", {
          left: pointer.x, top: pointer.y,
          fill: activeColor, fontSize: 20,
          fontFamily: "sans-serif", fontWeight: "bold",
          padding: 10
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        setActiveTool("select");
      });
    }

  }, [activeTool, activeColor, brushSize]);

  // ---LISTENING TO IFRAME HOVER EVENTS ---
  useEffect(() => {
    const handleIframeMessage = (event: MessageEvent) => {
        if (event.data?.type !== 'DEVOPTIC_HOVER') return;
        if (activeTool !== 'magic' || pixelSubMode !== 'overlay') return;

        const { rect } = event.data.payload;
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        canvas.getObjects().forEach((obj: any) => {
            if (obj.id === 'magic-highlight') canvas.remove(obj);
        });

        const highlight = new fabric.Rect({
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            fill: 'rgba(56, 189, 248, 0.1)', 
            stroke: '#0ea5e9',
            strokeWidth: 2,
            strokeUniform: true,
            rx: 2,
            ry: 2,
            selectable: false,
            evented: false,
            originX: 'left',
            originY: 'top',
            objectCaching: false,
            // @ts-ignore
            id: 'magic-highlight'
        });

        canvas.add(highlight);
        canvas.requestRenderAll();
    };

    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, [activeTool, pixelSubMode]);

  // --- HANDLERS ---
  const copyInvite = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    toast.success("Invite link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    let formattedUrl = inputUrl;
    if (!/^https?:\/\//i.test(inputUrl)) {
      formattedUrl = 'https://' + inputUrl;
    }
    setTargetUrl(formattedUrl);
    setInputUrl(formattedUrl);
  };

  const handleRefresh = () => {
    setIsLoading(true);
    setRefreshKey(prev => prev + 1);
  };

  const clearCanvas = () => {
    if(fabricCanvas.current) {
        fabricCanvas.current.clear();
        fabricCanvas.current.backgroundColor = 'transparent';
        fabricCanvas.current.requestRenderAll();
    }
    toast.info("Board cleared");
  };

  const triggerColorPicker = () => {
    colorInputRef.current?.click();
  };

  return (
    <div className="h-screen w-full bg-[#020617] text-white flex flex-col overflow-hidden font-sans">
      
      {/* TOP BAR */}
      <header className="h-16 border-b border-white/5 bg-slate-950/80 backdrop-blur-xl z-50 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shadow-lg transition-colors duration-500 ${mode === 'debug' ? 'bg-cyan-600' : 'bg-pink-600'}`}>D</div>
          <h1 className="text-sm font-bold tracking-tight">SESSION: <span className="text-slate-500 font-mono">{sessionId}</span></h1>
        </div>

        <div className="p-1 bg-slate-900 border border-white/10 rounded-full flex relative">
            <motion.div 
              className={`absolute top-1 bottom-1 w-[100px] rounded-full z-0 ${mode === 'debug' ? 'bg-cyan-900/50' : 'bg-pink-900/50'}`}
              animate={{ x: mode === "debug" ? 0 : 100 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
            <button onClick={() => setMode("debug")} className={`relative z-10 w-[100px] py-1.5 text-xs rounded-full flex items-center justify-center gap-2 ${mode === 'debug' ? 'text-cyan-400' : 'text-slate-500'}`}><Terminal size={14} /> Debug</button>
            <button onClick={() => setMode("pixel")} className={`relative z-10 w-[100px] py-1.5 text-xs rounded-full flex items-center justify-center gap-2 ${mode === 'pixel' ? 'text-pink-400' : 'text-slate-500'}`}><Paintbrush size={14} /> Pixel</button>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={copyInvite} className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-lg text-xs font-medium hover:bg-white/10 transition-all">
            {copied ? <Check size={14} className="text-emerald-400" /> : <Share2 size={14} />} {copied ? "Copied" : "Invite"}
          </button>
          <UserButton />
        </div>
      </header>

      <div className="flex-1 flex relative overflow-hidden">
        
        {/* PIXEL MODE TOOLBAR */}
        <AnimatePresence>
          {mode === "pixel" && (
            <motion.aside
              initial={{ x: -50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -50, opacity: 0 }}
              className="absolute left-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-4"
            >
              <div className="bg-slate-900/95 backdrop-blur-2xl border border-white/10 p-1 rounded-2xl shadow-2xl grid grid-cols-2 gap-1 w-[4.5rem]">

                 <button 
                    onClick={() => setPixelSubMode("overlay")} 
                    className={`aspect-square rounded-xl flex items-center justify-center transition-all relative group ${pixelSubMode === 'overlay' ? 'bg-pink-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                 >
                    <AppWindow size={18} />
                    <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 border border-white/10 shadow-xl">
                        Overlay Mode
                    </span>
                 </button>

                 <button 
                    onClick={() => setPixelSubMode("whiteboard")} 
                    className={`aspect-square rounded-xl flex items-center justify-center transition-all relative group ${pixelSubMode === 'whiteboard' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                 >
                    <Grid3x3 size={18} />
                    <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 border border-white/10 shadow-xl">
                        Whiteboard Mode
                    </span>
                 </button>
              </div>

              {/*  TOOLS GROUP  */}
              <div className="bg-slate-900/90 backdrop-blur-2xl border border-white/10 p-2 rounded-3xl shadow-2xl flex flex-col items-center gap-2 w-[4.5rem]">
                  <ToolIcon icon={MousePointer2} active={activeTool === "select"} onClick={() => setActiveTool("select")} tooltip="Select" />
                  <div className="grid grid-cols-2 gap-1.5 w-full justify-items-center">
                    <MiniToolIcon icon={Wand2} active={activeTool === "magic"} onClick={() => setActiveTool("magic")} />
                    <MiniToolIcon icon={Paintbrush} active={activeTool === "pencil"} onClick={() => setActiveTool("pencil")} />
                  </div>
                  <ToolIcon icon={Eraser} active={activeTool === "eraser"} onClick={() => setActiveTool("eraser")} tooltip="Eraser" />
                  
                  <div className="w-8 h-[1px] bg-white/10 my-1" />
                  
                  {/* Grid Layout for shapes to fit narrow width */}
                  <div className="grid grid-cols-2 gap-1.5 w-full justify-items-center">
                    <MiniToolIcon icon={Square} active={activeTool === "rect"} onClick={() => setActiveTool("rect")} />
                    <MiniToolIcon icon={Circle} active={activeTool === "circle"} onClick={() => setActiveTool("circle")} />
                    <MiniToolIcon icon={Triangle} active={activeTool === "triangle"} onClick={() => setActiveTool("triangle")} />
                    <MiniToolIcon icon={ArrowRight} active={activeTool === "arrow"} onClick={() => setActiveTool("arrow")} />
                  </div>

                  <div className="w-8 h-[1px] bg-white/10 my-1" />
                  
                  <ToolIcon icon={Type} active={activeTool === "text"} onClick={() => setActiveTool("text")} tooltip="Text" />
              </div>

              {/* COLORS & ACTIONS GROUP (Unchanged) */}
              <div className="bg-slate-900/90 backdrop-blur-2xl border border-white/10 p-3 rounded-2xl shadow-2xl flex flex-col items-center gap-3 w-[4.5rem]">
                  <div 
                    className="w-10 h-10 rounded-full cursor-pointer shadow-lg border-2 border-white/20 hover:scale-110 transition-transform relative overflow-hidden group"
                    style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
                    onClick={triggerColorPicker}
                    title="Pick Color"
                  >
                    <div className="absolute inset-2.5 rounded-full border border-white/50 shadow-sm transition-colors duration-200" style={{ backgroundColor: activeColor }} />
                  </div>
                  
                  <input 
                    ref={colorInputRef}
                    type="color" 
                    value={activeColor} 
                    onChange={(e) => setActiveColor(e.target.value)}
                    className="absolute opacity-0 pointer-events-none"
                  />

                  <div className="w-8 h-[1px] bg-white/10" />
                  <button onClick={clearCanvas} className="text-slate-500 hover:text-red-400 transition-colors p-2 hover:bg-white/5 rounded-lg"><Trash2 size={20}/></button>
              </div>

            </motion.aside>
          )}
        </AnimatePresence>
        {/* MAIN VIEWPORT */}
        <main className="flex-1 relative flex items-center justify-center p-4 bg-[#020617]">
            <div className="w-full h-full rounded-2xl border border-white/10 shadow-2xl overflow-hidden relative flex flex-col">
                
                {/* BROWSER BAR */}
                {pixelSubMode === 'overlay' || mode === 'debug' ? (
                    <div className="h-12 bg-slate-900/50 border-b border-white/5 flex items-center px-4 gap-4 z-40 relative">
                        <div className="flex items-center gap-3 shrink-0">
                            <div className="flex gap-1.5 mr-2">
                                <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                                <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                                <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
                            </div>
                            <button onClick={() => window.history.back()} className="text-slate-500 hover:text-white transition-colors"><ChevronLeft size={16} /></button>
                            <button onClick={handleRefresh} className={`text-slate-500 hover:text-white transition-colors ${isLoading ? 'animate-spin' : ''}`}><RotateCw size={14} /></button>
                        </div>
                        <form onSubmit={handleUrlSubmit} className="flex-1 flex items-center relative group">
                            <Globe className="absolute left-3 w-3 h-3 text-cyan-500/50" />
                            <input value={inputUrl} onChange={(e) => setInputUrl(e.target.value)} className="w-full bg-black/60 border border-white/10 rounded-full pl-9 pr-10 py-1.5 text-[11px] text-slate-300 font-mono focus:outline-none focus:border-cyan-500/50 transition-all" placeholder="Search..." />
                        </form>
                    </div>
                ) : (
                    // Whiteboard Header
                    <div className="h-12 bg-white border-b border-slate-200 flex items-center px-4 justify-between z-40">
                        <span className="text-xs font-bold text-slate-500 flex items-center gap-2"><LayoutTemplate size={14}/> WHITEBOARD CANVAS</span>
                        <div className="text-[10px] text-slate-400 font-mono">Infinite Canvas Active</div>
                    </div>
                )}
                
                {/* STACKED LAYERS */}
                <div 
                    className="flex-1 relative overflow-hidden" 
                    ref={containerRef}
                    style={{
                        backgroundColor: pixelSubMode === 'whiteboard' ? '#ffffff' : 'transparent',
                        backgroundImage: pixelSubMode === 'whiteboard' ? 'radial-gradient(#cbd5e1 1px, transparent 1px)' : 'none',
                        backgroundSize: '20px 20px',
                    }}
                >
                    
                    {/* LAYER 1: CANVAS (Top) */}
                    <div className={`absolute inset-0 z-20 ${mode === "pixel" && activeTool !== 'magic' ? "pointer-events-auto" : "pointer-events-none"}`}>
                        <canvas ref={canvasRef} />
                    </div>

                    {/* LAYER 2: IFRAME (Bottom - Hidden in Whiteboard Mode) */}
                    {pixelSubMode === 'overlay' && (
                        <iframe 
                            key={`${targetUrl}-${refreshKey}`}
                            src={`http://localhost:3001/api/proxy?url=${encodeURIComponent(targetUrl)}`}
                            className="w-full h-full border-none absolute inset-0 z-10"
                            onLoad={() => setIsLoading(false)}
                        />
                    )}

                    {/* LAYER 3: LOADER */}
                    <AnimatePresence>
                        {isLoading && pixelSubMode === 'overlay' && (
                            <motion.div initial={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 bg-[#020617] flex flex-col items-center justify-center">
                                <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} className="mb-6"><Shield size={64} className="text-cyan-500 opacity-20" /></motion.div>
                                <p className="font-mono text-xs tracking-[0.3em] uppercase text-cyan-500/60 animate-pulse">Initializing Proxy Pipeline</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </main>

        {/* DEBUG PANEL*/}
        <AnimatePresence>
          {mode === "debug" && (
            <motion.aside initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }} className="w-80 border-l border-white/5 bg-slate-950/80 backdrop-blur-xl flex flex-col z-40">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-400 flex items-center gap-2 tracking-widest uppercase"><Cpu size={14} /> Telemetry_Stream</span>
                <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_10px_cyan]" />
              </div>
              <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] space-y-3">
                 <LogEntry type="info" text="PROXY_TUNNEL_ESTABLISHED" />
                 <LogEntry type="success" text="CANVAS_LAYER_MOUNTED" />
                 <LogEntry type="info" text={`TARGET: ${targetUrl}`} />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

const ToolIcon = ({ icon: Icon, active = false, onClick, tooltip }: any) => (
  <button 
    onClick={onClick}
    className={`p-3 rounded-xl transition-all relative group ${active ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
  >
    <Icon size={20} />
    <span className="absolute left-14 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 border border-white/10">
        {tooltip}
    </span>
  </button>
);

const MiniToolIcon = ({ icon: Icon, active = false, onClick }: any) => (
    <button 
      onClick={onClick}
      className={`p-1.5 rounded-lg transition-all ${active ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white hover:bg-white/10'}`}
    >
      <Icon size={16} />
    </button>
);

const LogEntry = ({ type, text }: any) => (
    <div className={`p-2 rounded border-l-2 font-mono ${type === 'info' ? 'text-slate-500 border-slate-500' : 'text-emerald-400 border-emerald-400 bg-emerald-400/5'}`}>
        <span className="opacity-30 mr-2">{">"}</span>{text}
    </div>
);
