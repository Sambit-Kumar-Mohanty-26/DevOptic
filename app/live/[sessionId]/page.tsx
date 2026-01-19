"use client";

import React, { useState, use, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Terminal, Paintbrush, Share2, MousePointer2,
  Type, Square, Circle, MessageSquare,
  Shield, Cpu, Check, Globe, Zap, Search,
  RotateCw, ChevronLeft, Trash2, Eraser, Wand2,
  LayoutTemplate, ArrowRight, Triangle, AppWindow, Grid3x3,
  Monitor, Eye, Video, VideoOff,
  Phone,
  Folder
} from "lucide-react";
import { UserButton } from "@clerk/nextjs";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import * as fabric from "fabric";
import { io, Socket } from "socket.io-client";
import { throttle } from "lodash";
import { GuestRecorder } from "@/components/live/GuestRecorder";
import { HostPlayer } from "@/components/live/HostPlayer";
import { RemoteConsole } from "@/components/live/RemoteConsole";
import { FullScreenPlayer } from "@/components/live/FullScreenPlayer";
import { ScreenShareGuest } from "@/components/live/ScreenShareGuest";
import { ScreenShareHost } from "@/components/live/ScreenShareHost";
import { NetworkCapture } from "@/components/live/NetworkCapture";
import { RemoteNetwork } from "@/components/live/RemoteNetwork";
import { RemoteControlRequest } from "@/components/live/RemoteControlRequest";
import { CursorControl } from "@/components/live/CursorControl";
import { getSessionRole } from "@/app/actions";
import { TelemetryPanel } from "@/components/live/TelemetryPanel";
import { InspectorPanel } from "@/components/live/InspectorPanel";
import { CallInterface, CallInterfaceRef } from "@/components/live/CallInterface";
import { FileEditor } from "@/components/live/FileEditor";

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default function LiveWorkspace({ params }: PageProps) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;

  const [mode, setMode] = useState<"debug" | "pixel">("debug");
  const [pixelSubMode, setPixelSubMode] = useState<"overlay" | "whiteboard">("overlay");
  const [activeTool, setActiveTool] = useState("select");
  const [activeColor, setActiveColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(3);
  const [targetUrl, setTargetUrl] = useState("https://nextjs.org");
  const [inputUrl, setInputUrl] = useState("https://nextjs.org");
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [role, setRole] = useState<"guest" | "host" | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [hasControl, setHasControl] = useState(false);
  const [controlGranted, setControlGranted] = useState(false);
  const [isGuestTaken, setIsGuestTaken] = useState(false);
  const [isPrivacyActive, setIsPrivacyActive] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [inspectedElement, setInspectedElement] = useState<any>(null);
  const { getToken } = useAuth();
  const [rightPanelTab, setRightPanelTab] = useState<"telemetry" | "files">("telemetry");

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvas = useRef<fabric.Canvas | null>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const callRef = useRef<CallInterfaceRef>(null);
  const roleRef = useRef<"guest" | "host" | null>(null);

  const remoteRef = useRef<Record<string, fabric.Path>>({});
  const overlayObjectsRef = useRef<any[]>([]);
  const whiteboardObjectsRef = useRef<any[]>([]);
  const prevPixelSubModeRef = useRef<"overlay" | "whiteboard">("overlay");

  const stabilizePath = (canvas: fabric.Canvas, dirtyPath: fabric.Path) => {
    const pathData = (dirtyPath.path as any[]);
    const id = (dirtyPath as any).id;
    const stroke = dirtyPath.stroke;
    const strokeWidth = dirtyPath.strokeWidth;

    // Remove the dirty/temporary path
    canvas.remove(dirtyPath);

    // Create a fresh, mathematically correct path
    const cleanPath = new fabric.Path(pathData, {
      stroke,
      strokeWidth,
      fill: null,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      // @ts-ignore
      id: id
    });
    (cleanPath as any).id = id;

    return cleanPath;
  };

  // --- SOCKET HANDLING (RECEIVER) ---
  useEffect(() => {
    const initSocket = async () => {
      try {
        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
        const socket = io(socketUrl, {
          auth: async (cb) => {
            const token = await getToken();
            cb({ token });
          },
          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
        });
        socketRef.current = socket;

        socket.on("connect", () => {
          console.log("Socket Connected");
          setIsConnected(true);
          toast.success("Connected to server");
        });

        socket.on("connect", () => {
          console.log("Socket Connected");
          setIsConnected(true);
          toast.success("Connected to server");
        });

        socket.on("disconnect", (reason) => {
          console.warn("Socket Disconnected:", reason);
          setIsConnected(false);
          toast.error("Connection lost. Reconnecting...");
        });

        socket.on('role:state', (data) => {
          setIsGuestTaken(data.guestTaken);
        });

        socket.on('role:update', (data) => {
          if (data.role === 'guest') {
            const isTaken = data.status === 'taken';
            setIsGuestTaken(isTaken);

            if (isTaken && data.userId !== socket.id && role === 'guest') {
              setRole(null);
              setIsRecording(false);
              toast.warning("Another user took the Guest role.");
            }
          }
        });

        socket.on('role:error', (msg) => {
          toast.error(msg);
          if (role === 'guest') {
            setRole(null);
            setIsRecording(false);
          }
        });

        socket.on('role:granted', () => {
          setRole("guest");
          setIsRecording(true);
          toast.success("Started screen sharing");
        });

        // Handle Auth Errors
        socket.on("connect_error", (err) => {
          console.error("Socket connection failed:", err.message);
          toast.error("Connection failed: Unauthorized");
        });

        socket.emit("join-session", sessionId);
        console.log(`[LOG] Connected to socket, joined ${sessionId}`);


        socket.on("cursor:down", ({ id, color, size, x, y }) => {
          const canvas = fabricCanvas.current;
          if (!canvas) return;
          const w = canvas.width || 1;
          const h = canvas.height || 1;

          const path = new fabric.Path(`M ${x * w} ${y * h}`, {
            stroke: color,
            strokeWidth: size,
            fill: null,
            strokeLineCap: 'round',
            strokeLineJoin: 'round',
            selectable: false,
            evented: false,
            objectCaching: false,
          });

          (path as any).id = id;
          (path as any).isRemote = true;
          (path as any).isStreaming = true;

          remoteRef.current[id] = path;
          canvas.add(path);
          // canvas.requestRenderAll(); // wait for first move
        });

        socket.on("cursor:move", ({ id, x, y }) => {
          const canvas = fabricCanvas.current;
          const pathObj = remoteRef.current[id];
          if (!canvas || !pathObj) return;

          const w = canvas.width || 1;
          const h = canvas.height || 1;

          const newPoint = ['L', x * w, y * h];
          (pathObj.path as any[]).push(newPoint);

          pathObj.set({ dirty: true });
          canvas.requestRenderAll();
        });

        socket.on("cursor:up", ({ id }) => {
          const canvas = fabricCanvas.current;
          const dirtyPath = remoteRef.current[id];
          if (canvas && dirtyPath) {
            // Replace dirty stream path with clean stable path
            const cleanPath = stabilizePath(canvas, dirtyPath);
            (cleanPath as any).isRemote = true;

            canvas.add(cleanPath);
            cleanPath.setCoords();

            delete remoteRef.current[id];
            canvas.requestRenderAll();
          }
        });

        // --- STATIC OBJECT EVENTS ---

        socket.on("draw:add", (objData: any) => {
          const canvas = fabricCanvas.current;
          if (!canvas) return;

          if (objData.layerMode && objData.layerMode !== pixelSubMode) {
            console.log(`[Layer] Received ${objData.layerMode} object, storing in background.`);

            if (objData.layerMode === 'overlay') {
              overlayObjectsRef.current.push(objData);
            } else {
              whiteboardObjectsRef.current.push(objData);
            }
            return;
          }

          const w = canvas.width || 1;
          const h = canvas.height || 1;
          const options = { ...objData };

          if (options.left !== undefined) options.left = options.left * w;
          if (options.top !== undefined) options.top = options.top * h;

          const existingObj = canvas.getObjects().find((o: any) => (o as any).id === options.id);

          if (existingObj) {
            const { type, ...safeOptions } = options;
            if (existingObj.type === 'path') {
              (existingObj as any).path = safeOptions.path;
              if (safeOptions.pathOffset) (existingObj as any).pathOffset = safeOptions.pathOffset;
            }
            existingObj.set(safeOptions);
            existingObj.setCoords();
          } else {
            if (options.type === 'path') {
              const newPath = new fabric.Path(options.path, options);
              (newPath as any).isRemote = true;
              (newPath as any).id = options.id;
              (newPath as any).layerMode = options.layerMode;
              canvas.add(newPath);
            } else {
              fabric.util.enlivenObjects([options]).then((enlivenedObjects: any[]) => {
                enlivenedObjects.forEach((obj) => {
                  (obj as any).isRemote = true;
                  (obj as any).id = options.id;
                  (obj as any).layerMode = options.layerMode;
                  canvas.add(obj);
                });
                canvas.requestRenderAll();
              });
            }
          }
          canvas.requestRenderAll();
        });

        socket.on("draw:remove", (objectId: string) => {
          const canvas = fabricCanvas.current;
          if (!canvas) return;
          const objToRemove = canvas.getObjects().find((o: any) => (o as any).id === objectId);
          if (objToRemove) {
            (objToRemove as any).isRemote = true;
            canvas.remove(objToRemove);
            canvas.requestRenderAll();
          }
        });

        socket.on("canvas:clear", () => {
          if (fabricCanvas.current) {
            fabricCanvas.current.clear();
            fabricCanvas.current.backgroundColor = "transparent";
            fabricCanvas.current.requestRenderAll();
          }
        });

        // --- MAGIC BRUSH SYNC ---
        socket.on("magic:highlight", (data: { rect: any; userId: string }) => {
          const canvas = fabricCanvas.current;
          if (!canvas) return;
          canvas.calcOffset();
          canvas.getObjects().forEach((obj: any) => {
            if (obj.id === `magic-highlight-${data.userId}`) canvas.remove(obj);
          });
          const strokeWidth = 2;
          const cvsW = canvas.width || 1;
          const cvsH = canvas.height || 1;

          const remoteHighlight = new fabric.Rect({
            left: data.rect.left * cvsW,
            top: data.rect.top * cvsH,
            width: data.rect.width * cvsW,
            height: data.rect.height * cvsH,
            fill: 'rgba(168, 85, 247, 0.1)',
            stroke: '#a855f7',
            strokeWidth: strokeWidth,
            strokeUniform: true,
            selectable: false,
            evented: false,
            // @ts-ignore
            id: `magic-highlight-${data.userId}`,
            objectCaching: false,
            originX: 'left',
            originY: 'top'
          });
          (remoteHighlight as any).id = `magic-highlight-${data.userId}`;
          (remoteHighlight as any).isRemote = true;
          canvas.add(remoteHighlight);
          canvas.requestRenderAll();
        });

        socket.on("magic:clear", (data: { userId: string }) => {
          const canvas = fabricCanvas.current;
          if (!canvas) return;
          canvas.getObjects().forEach((obj: any) => {
            if (obj.id === `magic-highlight-${data.userId}`) canvas.remove(obj);
          });
          canvas.requestRenderAll();
        });

        // --- PIXEL SCROLL SYNC ---
        socket.on('pixel:scroll', (data: { percentX: number; percentY: number; selector?: string; userId: string }) => {
          if (data.userId === socket.id) return;

          console.log('[DevOptic] Client Executing Scroll:', data.percentY, data.selector);

          // Send to iframe to execute scroll
          const iframe = document.querySelector('iframe');
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
              type: 'DEVOPTIC_CURSOR',
              payload: {
                action: 'scroll-percent',
                percentX: data.percentX,
                percentY: data.percentY,
                selector: data.selector
              }
            }, '*');
          }
        });

        socket.on('magic:select', (data: { x: number, y: number, normalizedX: number, normalizedY: number }) => {
          // Guest receives this from Host
          const iframe = document.querySelector('iframe');
          const canvas = fabricCanvas.current;

          // Clear hover highlight (the real element rectangle is already synced via magic:highlight)
          if (canvas) {
            canvas.getObjects().forEach((obj: any) => {
              if (obj.id === 'magic-highlight') {
                canvas.remove(obj);
              }
            });
            canvas.requestRenderAll();
          }

          if (iframe && iframe.contentWindow) {
            const rect = iframe.getBoundingClientRect();
            const actualX = data.normalizedX * rect.width;
            const actualY = data.normalizedY * rect.height;

            // Tell iframe to inspect the element
            iframe.contentWindow.postMessage({
              type: 'DEVOPTIC_CURSOR',
              payload: { action: 'inspect', x: actualX, y: actualY }
            }, '*');
          }
        });

        socket.on('dom:apply', (data: { id: string, property: string, value: string }) => {
          const iframe = document.querySelector('iframe');
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
              type: 'DEVOPTIC_CURSOR',
              payload: { action: 'apply-style', id: data.id, property: data.property, value: data.value }
            }, '*');

            toast.success(`Applied ${data.property}: ${data.value}`);
          }
        });

        socket.on('dom:inspected', (data: any) => {
          // Only Host cares about this - use ref to get current role value
          console.log("[Magic] Received Inspection Data, current role:", roleRef.current);
          if (roleRef.current === 'host') {
            console.log("Received Inspection Data:", data);
            // Just open the InspectorPanel - don't draw another rectangle
            // Host already has the hover rectangle (magic-highlight) visible
            setInspectedElement(data);
          }
        });

        socket.on('mode:switch', (data: { mode: 'debug' | 'pixel'; userId: string }) => {
          if (data.userId === socket.id) return;

          console.log(`[MODE SYNC] Received mode switch to ${data.mode}`);

          if (data.mode === 'pixel') {
            toast.info('Guest switched to Pixel mode - following along...', {
              icon: '🎨',
              duration: 3000
            });
            setMode('pixel');
          } else {
            toast.info('Guest switched to Debug mode - following along...', {
              icon: '🔧',
              duration: 3000
            });
            setMode('debug');
          }
        });
      } catch (err) {
        console.error("Failed to initialize socket:", err);
      }
    };
    initSocket();

    // Cleanup function
    return () => {
      socketRef.current?.disconnect();
    };
  }, [sessionId, getToken]);

  const emitObjectUpdate = (obj: any) => {
    if (!obj || obj.isRemote || obj.id === 'magic-highlight') return;
    if (!obj.id) obj.id = crypto.randomUUID();

    const canvas = fabricCanvas.current;
    if (!canvas) return;

    const data = obj.toObject(['id', 'perPixelTargetFind', 'targetFindTolerance', 'pathOffset', 'layerMode']);
    data.layerMode = pixelSubMode;

    const w = canvas.width || 1;
    const h = canvas.height || 1;
    data.left = (data.left || 0) / w;
    data.top = (data.top || 0) / h;

    socketRef.current?.emit("draw:add", { sessionId, object: data });
  };

  const throttledEmit = useMemo(() =>
    throttle((obj: any) => {
      emitObjectUpdate(obj);
    }, 30),
    [sessionId]
  );

  useEffect(() => {
    const assignRole = async () => {
      try {
        const result = await getSessionRole(sessionId);

        if (result.error) {
          toast.error(result.error);
          return;
        }

        if (result.role === 'host') {
          console.log("[AutoRole] User is HOST");
          setRole("host");
          setIsRecording(false);
        } else {
          console.log("[AutoRole] User is GUEST");
          setRole("guest");

          if (socketRef.current) {
            socketRef.current.emit('role:claim-guest', sessionId);
          }

          setIsRecording(true);
          toast.success("Joined as Guest - Sharing Screen");
        }
      } catch (err) {
        console.error("Failed to assign role:", err);
      }
    };

    assignRole();
  }, [sessionId]);

  // Keep roleRef in sync with role state for socket event handlers
  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: rect.width,
      height: rect.height,
      selection: true,
      renderOnAddRemove: true,
      enableRetinaScaling: true,
    });

    fabricCanvas.current = canvas;

    canvas.on("object:added", (e: any) => {
      const obj = e.target;
      if (!obj.id) obj.id = crypto.randomUUID();
      if (obj.isRemote) return;
      if (obj.excludeFromSocket) return;
      emitObjectUpdate(obj);
    });

    canvas.on("object:moving", (e: any) => throttledEmit(e.target));
    canvas.on("object:scaling", (e: any) => throttledEmit(e.target));
    canvas.on("object:rotating", (e: any) => throttledEmit(e.target));
    canvas.on("object:modified", (e: any) => emitObjectUpdate(e.target));
    canvas.on("text:changed", (e: any) => emitObjectUpdate(e.target));

    canvas.on("object:removed", (e: any) => {
      const obj = e.target;
      if (!obj || obj.isRemote || obj.id === 'magic-highlight') return;
      if (obj.__isUpdating) return;
      socketRef.current?.emit("draw:remove", { sessionId, objectId: obj.id });
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use contentBoxSize for precision
        if (entry.contentBoxSize) {
          const { inlineSize, blockSize } = entry.contentBoxSize[0];
          canvas.setDimensions({ width: inlineSize, height: blockSize });
        } else {
          // Fallback
          const { width, height } = entry.contentRect;
          canvas.setDimensions({ width, height });
        }
        canvas.calcOffset();
        canvas.renderAll();
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
      canvas.dispose();
    };
  }, [sessionId]);

  // --- BACKGROUND & LAYER PERSISTENCE ---
  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    const prevMode = prevPixelSubModeRef.current;

    if (prevMode !== pixelSubMode) {
      // Filter out Magic Highlight and Streaming cursors
      const currentObjects = canvas.getObjects().filter((obj: any) => {
        return obj.id !== 'magic-highlight' && !(obj as any).isStreaming;
      });

      // Serialize and include 'layerMode'
      const serializedObjects = currentObjects.map((obj: any) => {
        const data = obj.toObject(['id', 'isRemote', 'layerMode']);
        data.layerMode = prevMode;
        return data;
      });

      //  Save to appropriate Ref
      if (prevMode === 'overlay') {
        overlayObjectsRef.current = serializedObjects;
      } else {
        whiteboardObjectsRef.current = serializedObjects;
      }

      // Clear Canvas (Remove ONLY user objects, keep system stuff if any)
      currentObjects.forEach((obj: any) => {
        (obj as any).isRemote = true;
        canvas.remove(obj);
      });

      // Restore Objects for the new mode
      const objectsToRestore = pixelSubMode === 'overlay'
        ? overlayObjectsRef.current
        : whiteboardObjectsRef.current;

      if (objectsToRestore.length > 0) {
        fabric.util.enlivenObjects(objectsToRestore).then((enlivenedObjects: any[]) => {
          enlivenedObjects.forEach((obj) => {
            (obj as any).isRemote = true;
            (obj as any).layerMode = pixelSubMode;
            canvas.add(obj);

            obj.setCoords();
          });

          canvas.requestRenderAll();
        });
      }

      prevPixelSubModeRef.current = pixelSubMode;
    }

    // Toggle Background
    if (pixelSubMode === 'whiteboard') {
      canvas.backgroundColor = 'transparent';
    } else {
      canvas.backgroundColor = 'transparent';
    }

    canvas.requestRenderAll();
  }, [pixelSubMode]);

  // --- TOOLS ---
  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    canvas.isDrawingMode = false;
    canvas.selection = true;
    canvas.defaultCursor = "default";
    canvas.hoverCursor = "move";
    canvas.off("mouse:down");
    canvas.off("mouse:move");
    canvas.off("mouse:up");

    if (activeTool === "magic") {
      canvas.selection = false;
      canvas.defaultCursor = "crosshair";

      canvas.on("mouse:down", (o) => {
        const pointer = canvas.getScenePoint(o.e);

        const w = canvas.width || 1;
        const h = canvas.height || 1;

        console.log("[Magic] Click at", pointer);

        socketRef.current?.emit("magic:select", {
          sessionId,
          x: pointer.x,
          y: pointer.y,
          normalizedX: pointer.x / w,
          normalizedY: pointer.y / h
        });
      });
    }

    // --- PENCIL TOOL ---
    else if (activeTool === "pencil") {
      canvas.isDrawingMode = false;
      canvas.selection = false;
      canvas.defaultCursor = "crosshair";

      let isDown = false;
      let currentPath: fabric.Path | null = null;

      canvas.on("mouse:down", (o) => {
        isDown = true;
        const pointer = canvas.getScenePoint(o.e);
        const w = canvas.width || 1;
        const h = canvas.height || 1;

        const id = crypto.randomUUID();
        const pathData = `M ${pointer.x} ${pointer.y}`;

        currentPath = new fabric.Path(pathData, {
          stroke: activeColor,
          strokeWidth: brushSize,
          fill: null,
          strokeLineCap: 'round',
          strokeLineJoin: 'round',
          selectable: false,
          evented: false,
          // @ts-ignore
          id: id,
          objectCaching: false,
        });

        (currentPath as any).id = id;
        (currentPath as any).isRemote = true;

        canvas.add(currentPath);

        socketRef.current?.emit("cursor:down", {
          sessionId,
          id: id,
          color: activeColor,
          size: brushSize,
          x: pointer.x / w,
          y: pointer.y / h
        });
      });

      canvas.on("mouse:move", (o) => {
        if (!isDown || !currentPath) return;
        const pointer = canvas.getScenePoint(o.e);
        const w = canvas.width || 1;
        const h = canvas.height || 1;

        const newPoint = ['L', pointer.x, pointer.y];
        (currentPath.path as any[]).push(newPoint);

        currentPath.set({ dirty: true });
        canvas.requestRenderAll();

        socketRef.current?.emit("cursor:move", {
          sessionId,
          id: (currentPath as any).id,
          x: pointer.x / w,
          y: pointer.y / h
        });
      });

      canvas.on("mouse:up", () => {
        isDown = false;
        if (currentPath) {
          const cleanPath = stabilizePath(canvas, currentPath);
          (cleanPath as any).isRemote = false;

          canvas.add(cleanPath);
          cleanPath.setCoords();
          canvas.setActiveObject(cleanPath);

          socketRef.current?.emit("cursor:up", { sessionId, id: (cleanPath as any).id });
          emitObjectUpdate(cleanPath);
        }
        currentPath = null;
      });
    }

    // --- ERASER ---
    else if (activeTool === "eraser") {
      const eraserCursor = `url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTIiIHI9IjgiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4zKSIgLz48L3N2Zz4=") 12 12, auto`;
      canvas.defaultCursor = eraserCursor;
      canvas.hoverCursor = eraserCursor;
      canvas.selection = false;

      let isDown = false;

      canvas.on("mouse:down", (o) => {
        isDown = true;
        if (o.target) {
          canvas.remove(o.target);
          canvas.requestRenderAll();
        }
      });

      canvas.on("mouse:move", (o) => {
        if (!isDown) return;
        const pointer = canvas.getScenePoint(o.e);
        const eraserSize = 10;
        const eraserRect = new fabric.Rect({
          left: pointer.x - eraserSize / 2,
          top: pointer.y - eraserSize / 2,
          width: eraserSize,
          height: eraserSize
        });

        canvas.getObjects().forEach((obj: any) => {
          if (!obj.visible || !obj.evented) return;
          if (obj.intersectsWithObject(eraserRect) || obj.containsPoint(pointer)) {
            canvas.remove(obj);
          }
        });
        canvas.requestRenderAll();
      });

      canvas.on("mouse:up", () => isDown = false);
    }

    // --- SHAPES ---
    else if (["rect", "circle", "arrow", "diamond", "triangle"].includes(activeTool)) {
      canvas.selection = false;
      canvas.defaultCursor = "crosshair";

      let shape: any = null;
      let isDown = false;
      let origX = 0; let origY = 0;
      let activeShapeId: string | null = null;

      canvas.on("mouse:down", (o) => {
        isDown = true;
        const pointer = canvas.getScenePoint(o.e);
        origX = pointer.x; origY = pointer.y;

        //Generate the ID once on mouse down
        activeShapeId = crypto.randomUUID();

        const commonProps = {
          left: origX, top: origY,
          fill: 'transparent',
          stroke: activeColor,
          strokeWidth: brushSize,
          selectable: false,
          id: activeShapeId
        };

        if (activeTool === "rect") shape = new fabric.Rect({ ...commonProps, width: 0, height: 0 });
        else if (activeTool === "circle") shape = new fabric.Circle({ ...commonProps, radius: 0 });
        else if (activeTool === "triangle") shape = new fabric.Triangle({ ...commonProps, width: 0, height: 0 });
        else if (activeTool === "diamond") shape = new fabric.Rect({ ...commonProps, width: 0, height: 0, angle: 45, originX: 'center', originY: 'center' });

        if (shape) {
          canvas.add(shape);
          emitObjectUpdate(shape);
        }
      });

      canvas.on("mouse:move", (o) => {
        if (!isDown) return;
        const pointer = canvas.getScenePoint(o.e);

        if (activeTool === "arrow") {
          if (shape) {
            (shape as any).__isUpdating = true;
            canvas.remove(shape);
          }
          const x1 = origX;
          const y1 = origY;
          const x2 = pointer.x;
          const y2 = pointer.y;

          // CALCULATE ARROW HEAD ANGLES
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const headLen = 20;

          const x2_arrow = x2 - headLen * Math.cos(angle - Math.PI / 6);
          const y2_arrow = y2 - headLen * Math.sin(angle - Math.PI / 6);
          const x3_arrow = x2 - headLen * Math.cos(angle + Math.PI / 6);
          const y3_arrow = y2 - headLen * Math.sin(angle + Math.PI / 6);

          // DRAW LINE + ARROW HEAD PATH
          const pathData = `M ${x1} ${y1} L ${x2} ${y2} M ${x2} ${y2} L ${x2_arrow} ${y2_arrow} M ${x2} ${y2} L ${x3_arrow} ${y3_arrow}`;

          shape = new fabric.Path(pathData, {
            fill: 'transparent',
            stroke: activeColor,
            strokeWidth: brushSize,
            strokeLineCap: 'round',
            strokeLineJoin: 'round',
            selectable: false,
            evented: false,
            id: activeShapeId,
            padding: 15,
            excludeFromSocket: true
          });

          canvas.add(shape);

          //Manually emit the update here for real-time arrow sync
          throttledEmit(shape);

        } else if (shape) {
          if (activeTool === "circle") {
            const radius = Math.sqrt(Math.pow(pointer.x - origX, 2) + Math.pow(pointer.y - origY, 2)) / 2;
            shape.set({ radius: radius });
          } else {
            shape.set({ width: Math.abs(origX - pointer.x), height: Math.abs(origY - pointer.y) });
            if (origX > pointer.x) shape.set({ left: pointer.x });
            if (origY > pointer.y) shape.set({ top: pointer.y });
          }
          shape.setCoords();
          throttledEmit(shape);
        }
        canvas.requestRenderAll();
      });

      canvas.on("mouse:up", () => {
        isDown = false;
        if (shape) {
          shape.setCoords();
          shape.set({ selectable: true, evented: true });
          emitObjectUpdate(shape);
        }
        setActiveTool("select");
      });
    }

    else if (activeTool === "text") {
      canvas.defaultCursor = "text";
      canvas.on("mouse:up", (o) => {
        const pointer = canvas.getScenePoint(o.e);
        const text = new fabric.IText("Type...", {
          left: pointer.x, top: pointer.y,
          fill: activeColor, fontSize: 20,
          id: crypto.randomUUID()
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        canvas.requestRenderAll();
        text.enterEditing();
        text.selectAll();
        emitObjectUpdate(text);
        setTimeout(() => {
          setActiveTool("select");
        }, 100);
      });
    }
  }, [activeTool, activeColor, brushSize, sessionId]);

  // --- MAGIC BRUSH LOGIC ---
  useEffect(() => {
    const handleIframeMessage = (event: MessageEvent) => {
      if (
        event.data?.type !== 'DEVOPTIC_HOVER' ||
        activeTool !== 'magic' ||
        pixelSubMode !== 'overlay'
      ) return;

      const { rect } = event.data.payload;
      const canvas = fabricCanvas.current;
      if (!canvas) return;

      // Recalculate Canvas Offset
      // If the UI (sidebar/header) shifted after load, Fabric's internal (0,0) is wrong.
      // This forces it to re-check where it is on the screen.
      canvas.calcOffset();

      // Remove old highlight
      canvas.getObjects().forEach((obj: any) => {
        if (obj.id === 'magic-highlight') canvas.remove(obj);
      });

      // Draw Precise Box
      // Fabric strokes are drawn 50% inside, 50% outside. 
      // We offset by half the stroke width to ensure the box hugs the element exactly.
      const strokeWidth = 2;
      const offset = strokeWidth / 2;

      const highlight = new fabric.Rect({
        left: rect.left - offset,
        top: rect.top - offset,
        width: rect.width + strokeWidth - 1, // -1 adjusts for anti-aliasing fuzziness
        height: rect.height + strokeWidth - 1,
        fill: 'rgba(56, 189, 248, 0.1)',
        stroke: '#0ea5e9',
        strokeWidth: strokeWidth,
        strokeUniform: true,
        selectable: false,
        evented: false,
        id: 'magic-highlight',
        objectCaching: false,
        originX: 'left',
        originY: 'top'
      });

      canvas.add(highlight);
      canvas.requestRenderAll();

      // Emit to socket for the other user to see
      // Both Host and Guest can emit - the receiver will just draw it locally
      // No loop because socket events go to room members EXCEPT sender
      const cvsW = canvas.width || 1;
      const cvsH = canvas.height || 1;

      socketRef.current?.emit('magic:highlight', {
        sessionId,
        rect: {
          left: (rect.left - offset) / cvsW,
          top: (rect.top - offset) / cvsH,
          width: (rect.width + strokeWidth - 1) / cvsW,
          height: (rect.height + strokeWidth - 1) / cvsH,
        },
        userId: socketRef.current?.id
      });
    };

    window.addEventListener('message', handleIframeMessage);
    return () => {
      window.removeEventListener('message', handleIframeMessage);
      // Clean up local highlight when switching away from magic tool
      const canvas = fabricCanvas.current;
      if (canvas) {
        canvas.getObjects().forEach((obj: any) => {
          if (obj.id === 'magic-highlight') canvas.remove(obj);
        });
        canvas.requestRenderAll();
      }
      // Emit clear to other users
      if (socketRef.current?.id) {
        socketRef.current?.emit('magic:clear', {
          sessionId,
          userId: socketRef.current.id
        });
      }
    };
  }, [activeTool, pixelSubMode, sessionId]);

  useEffect(() => {
    const handleInspectorMessage = (event: MessageEvent) => {
      // Listen for Inspection Result from Proxy
      if (event.data?.type === 'DEVOPTIC_INSPECTED') {
        console.log("[Bridge] Forwarding inspection data to host"); // <--- Debug Log
        const elementData = event.data.payload;

        //Forward to Host via Socket
        socketRef.current?.emit('dom:inspected', {
          sessionId,
          ...elementData
        });
      }
    };

    window.addEventListener('message', handleInspectorMessage);
    return () => window.removeEventListener('message', handleInspectorMessage);
  }, [sessionId]);

  useEffect(() => {
    const handlePrivacyMessage = (event: MessageEvent) => {
      // Listen for the 'DEVOPTIC_PRIVACY' message from the proxy script
      if (event.data?.type === 'DEVOPTIC_PRIVACY') {
        const isActive = event.data.payload.active;

        // Only emit if state actually changed (prevents infinite loops)
        if (isActive !== isPrivacyActive) {
          setIsPrivacyActive(isActive);
          socketRef.current?.emit('privacy:sync', { sessionId, active: isActive });

          if (isActive) toast("Sensitive Input Detected - Screen Masked");
        }
      }
    };

    window.addEventListener('message', handlePrivacyMessage);
    return () => window.removeEventListener('message', handlePrivacyMessage);
  }, [sessionId, isPrivacyActive]);

  // --- SCROLL SYNC HANDLER ---
  useEffect(() => {
    const handleScrollMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'DEVOPTIC_SCROLL') return;

      const { percentX, percentY, selector } = event.data.payload;
      console.log('[DevOptic] Client Received Message:', percentY, selector); // LOG CLIENT RECEIVE

      // Emit to other users
      socketRef.current?.emit('pixel:scroll', {
        sessionId,
        percentX,
        percentY,
        selector, // Send selector
        userId: socketRef.current?.id
      });
    };

    window.addEventListener('message', handleScrollMessage);



    return () => {
      window.removeEventListener('message', handleScrollMessage);
    };
  }, [sessionId]);

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
    if (!/^https?:\/\//i.test(inputUrl)) formattedUrl = 'https://' + inputUrl;
    setTargetUrl(formattedUrl);
    setInputUrl(formattedUrl);
  };

  const handleRefresh = () => {
    setIsLoading(true);
    setRefreshKey(prev => prev + 1);
  };

  const clearCanvas = () => {
    if (fabricCanvas.current) {
      fabricCanvas.current.clear();
      fabricCanvas.current.backgroundColor = 'transparent';
      fabricCanvas.current.requestRenderAll();
      socketRef.current?.emit("canvas:clear", sessionId);
    }
    toast.info("Board cleared");
  };

  const handleModeSwitch = (newMode: 'debug' | 'pixel') => {
    if (mode === newMode) return;

    setMode(newMode);

    // Guest: Emit mode change to sync with Host & control screen sharing
    if (role === 'guest') {
      socketRef.current?.emit('mode:switch', {
        sessionId,
        mode: newMode,
        userId: socketRef.current?.id
      });

      if (newMode === 'pixel') {
        // Stop screen sharing when entering Pixel mode
        setIsRecording(false);
        toast.info('Switched to Pixel mode - Screen sharing paused', { icon: '🎨' });
      } else {
        // Resume screen sharing when entering Debug mode
        setIsRecording(true);
        toast.info('Switched to Debug mode - Screen sharing resumed', { icon: '🔧' });
      }
    }
  };

  const triggerColorPicker = () => colorInputRef.current?.click();

  return (
    <div className="h-screen w-full bg-[#020617] text-white flex flex-col overflow-hidden font-sans">
      <header className="h-16 border-b border-white/5 bg-slate-950/80 backdrop-blur-xl z-50 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shadow-lg transition-colors duration-500 ${mode === 'debug' ? 'bg-cyan-600' : 'bg-pink-600'}`}>D</div>
          <h1 className="text-sm font-bold tracking-tight">SESSION: <span className="text-slate-500 font-mono">{sessionId}</span></h1>
        </div>

        <div className="p-1 bg-slate-900 border border-white/10 rounded-full flex relative">
          <motion.div
            className={`absolute top-1 bottom-1 w-25 rounded-full z-0 ${mode === 'debug' ? 'bg-cyan-900/50' : 'bg-pink-900/50'}`}
            animate={{ x: mode === "debug" ? 0 : 100 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
          <button onClick={() => handleModeSwitch("debug")} className={`relative z-10 w-25 py-1.5 text-xs rounded-full flex items-center justify-center gap-2 ${mode === 'debug' ? 'text-cyan-400' : 'text-slate-500'}`}><Terminal size={14} /> Debug</button>
          <button onClick={() => handleModeSwitch("pixel")} className={`relative z-10 w-25 py-1.5 text-xs rounded-full flex items-center justify-center gap-2 ${mode === 'pixel' ? 'text-pink-400' : 'text-slate-500'}`}><Paintbrush size={14} /> Pixel</button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1 mr-2">
             <button 
                onClick={() => callRef.current?.startCall('audio')}
                className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-emerald-400 transition-colors"
                title="Voice Call"
             >
                <Phone size={14} />
             </button>
             <div className="w-px h-4 bg-white/10" />
             <button 
                onClick={() => callRef.current?.startCall('video')}
                className="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-emerald-400 transition-colors"
                title="Video Call"
             >
                <Video size={14} />
             </button>
          </div>
          {role === 'host' && (
            <button
              onClick={copyInvite}
              className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-lg text-xs font-medium hover:bg-white/10 transition-all"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Share2 size={14} />}
              {copied ? "Copied" : "Invite"}
            </button>
          )}

          <UserButton />

          {role && (
            <div className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-2 ${role === 'host'
              ? 'bg-violet-500/10 text-violet-400 border-violet-500/20'
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}>
              {role === 'host' ? <Eye size={14} /> : <Monitor size={14} />}
              {role === 'host' ? 'Host (Viewing)' : 'Guest (Sharing)'}
            </div>
          )}

          {/* Recording Indicator */}
          {isRecording && (
            <div className="flex items-center gap-2 bg-red-500/20 border border-red-500/30 px-3 py-1.5 rounded-full">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">REC</span>
            </div>
          )}

          {/* Remote Control Request UI */}
          <RemoteControlRequest
            sessionId={sessionId}
            socket={socketRef.current}
            role={role}
            onControlStatusChange={setHasControl}
            onControlGrantedChange={setControlGranted}
          />
        </div>
      </header>

      <div className="flex-1 flex relative overflow-hidden">
        <AnimatePresence>
          {mode === "pixel" && (
            <motion.aside
              initial={{ x: -50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -50, opacity: 0 }}
              className="absolute left-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-4"
            >
              <div className="bg-slate-900/95 backdrop-blur-2xl border border-white/10 p-1 rounded-2xl shadow-2xl grid grid-cols-2 gap-1 w-18">
                <button onClick={() => setPixelSubMode("overlay")} className={`aspect-square rounded-xl flex items-center justify-center transition-all relative group ${pixelSubMode === 'overlay' ? 'bg-pink-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                  <AppWindow size={18} />
                </button>
                <button onClick={() => setPixelSubMode("whiteboard")} className={`aspect-square rounded-xl flex items-center justify-center transition-all relative group ${pixelSubMode === 'whiteboard' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                  <Grid3x3 size={18} />
                </button>
              </div>

              <div className="bg-slate-900/90 backdrop-blur-2xl border border-white/10 p-2 rounded-3xl shadow-2xl flex flex-col items-center gap-2 w-18">
                <ToolIcon icon={MousePointer2} active={activeTool === "select"} onClick={() => setActiveTool("select")} tooltip="Select" />
                <div className="grid grid-cols-2 gap-1.5 w-full justify-items-center">
                  <MiniToolIcon icon={Wand2} active={activeTool === "magic"} onClick={() => setActiveTool("magic")} />
                  <MiniToolIcon icon={Paintbrush} active={activeTool === "pencil"} onClick={() => setActiveTool("pencil")} />
                </div>
                <ToolIcon icon={Eraser} active={activeTool === "eraser"} onClick={() => setActiveTool("eraser")} tooltip="Eraser" />
                <div className="w-8 h-px bg-white/10 my-1" />
                <div className="grid grid-cols-2 gap-1.5 w-full justify-items-center">
                  <MiniToolIcon icon={Square} active={activeTool === "rect"} onClick={() => setActiveTool("rect")} />
                  <MiniToolIcon icon={Circle} active={activeTool === "circle"} onClick={() => setActiveTool("circle")} />
                  <MiniToolIcon icon={Triangle} active={activeTool === "triangle"} onClick={() => setActiveTool("triangle")} />
                  <MiniToolIcon icon={ArrowRight} active={activeTool === "arrow"} onClick={() => setActiveTool("arrow")} />
                </div>
                <div className="w-8 h-px bg-white/10 my-1" />
                <ToolIcon icon={Type} active={activeTool === "text"} onClick={() => setActiveTool("text")} tooltip="Text" />
              </div>

              <div className="bg-slate-900/90 backdrop-blur-2xl border border-white/10 p-3 rounded-2xl shadow-2xl flex flex-col items-center gap-3 w-18">
                <div className="w-10 h-10 rounded-full cursor-pointer shadow-lg border-2 border-white/20 hover:scale-110 transition-transform relative overflow-hidden group"
                  style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}
                  onClick={triggerColorPicker}>
                  <div className="absolute inset-2.5 rounded-full border border-white/50 shadow-sm transition-colors duration-200" style={{ backgroundColor: activeColor }} />
                </div>
                <input ref={colorInputRef} type="color" value={activeColor} onChange={(e) => setActiveColor(e.target.value)} className="absolute opacity-0 pointer-events-none" />
                <div className="w-8 h-px bg-white/10" />
                <button onClick={clearCanvas} className="text-slate-500 hover:text-red-400 transition-colors p-2 hover:bg-white/5 rounded-lg"><Trash2 size={20} /></button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <main className="flex-1 relative flex items-center justify-center p-4 bg-[#020617]">
          {!isConnected && (
            <div className="absolute top-0 left-0 right-0 z-100 bg-red-600/90 backdrop-blur text-white text-xs font-bold text-center py-2 animate-pulse shadow-lg flex items-center justify-center gap-2">
              <Shield size={14} />
              CONNECTION LOST - ATTEMPTING TO RECONNECT...
            </div>
          )}
          <div className="w-full h-full rounded-2xl border border-white/10 shadow-2xl overflow-hidden relative flex flex-col">
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
              <div className="h-12 bg-white border-b border-slate-200 flex items-center px-4 justify-between z-40">
                <span className="text-xs font-bold text-slate-500 flex items-center gap-2"><LayoutTemplate size={14} /> WHITEBOARD CANVAS</span>
                <div className="text-[10px] text-slate-400 font-mono">Infinite Canvas Active</div>
              </div>
            )}

            <div className="flex-1 relative overflow-hidden" ref={containerRef}
              style={{
                backgroundColor: pixelSubMode === 'whiteboard' && mode === 'pixel' ? '#ffffff' : 'transparent',
                backgroundImage: pixelSubMode === 'whiteboard' && mode === 'pixel' ? 'radial-gradient(#cbd5e1 1px, transparent 1px)' : 'none',
                backgroundSize: '20px 20px',
              }}>

              <div
                className={`absolute inset-0 z-20`}
                style={{
                  pointerEvents: mode === "pixel" && activeTool !== 'select' ? 'auto' : 'none',
                }}
              >
                <canvas
                  ref={canvasRef}
                />
              </div>

              {mode === 'pixel' && activeTool === 'magic' && (
                <div
                  className="absolute inset-0 z-25"
                  style={{
                    cursor: 'crosshair',
                    pointerEvents: 'auto',
                  }}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const canvas = fabricCanvas.current;
                    const w = canvas?.width || rect.width;
                    const h = canvas?.height || rect.height;

                    console.log("[Magic] Click at", { x, y, normalizedX: x / w, normalizedY: y / h, role: roleRef.current });

                    // Clear hover highlight when clicking
                    if (canvas) {
                      canvas.getObjects().forEach((obj: any) => {
                        if (obj.id === 'magic-highlight') canvas.remove(obj);
                      });
                      canvas.requestRenderAll();
                    }

                    // Host clicks -> sends to Guest for inspection
                    // Guest clicks -> inspects directly on their own iframe
                    if (roleRef.current === 'host') {
                      socketRef.current?.emit("magic:select", {
                        sessionId,
                        x: x,
                        y: y,
                        normalizedX: x / w,
                        normalizedY: y / h
                      });
                    } else if (roleRef.current === 'guest') {
                      // Guest can inspect directly on their own iframe
                      const iframe = document.querySelector('iframe');
                      if (iframe && iframe.contentWindow) {
                        iframe.contentWindow.postMessage({
                          type: 'DEVOPTIC_CURSOR',
                          payload: { action: 'inspect', x, y }
                        }, '*');
                      }
                    }
                  }}
                  onMouseMove={(e) => {
                    // Forward mouse position to iframe for hover detection
                    const iframe = document.querySelector('iframe');
                    if (iframe && iframe.contentWindow) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = e.clientX - rect.left;
                      const y = e.clientY - rect.top;
                      // Send synthetic mousemove to iframe
                      iframe.contentWindow.postMessage({
                        type: 'DEVOPTIC_CURSOR',
                        payload: { action: 'hover', x, y }
                      }, '*');
                    }
                  }}
                />
              )}

              {(pixelSubMode === 'overlay' || mode === 'debug') && (
                <iframe key={`${targetUrl}-${refreshKey}`}
                  src={`/api/proxy?url=${encodeURIComponent(targetUrl)}`}
                  className="w-full h-full border-none absolute inset-0 z-10"
                  style={{ display: 'block' }}
                  onLoad={() => setIsLoading(false)} />
              )}

              {role === 'host' && mode === 'debug' && (
                <div className="absolute inset-0 z-10">
                  <ScreenShareHost sessionId={sessionId} socket={socketRef.current} hasControl={hasControl} activeTool={activeTool} />
                </div>
              )}

              <AnimatePresence>
                {isLoading && pixelSubMode === 'overlay' && (
                  <motion.div initial={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 bg-[#020617] flex flex-col items-center justify-center">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: "linear" }} className="mb-6"><Shield size={64} className="text-cyan-500 opacity-20" /></motion.div>
                    <p className="font-mono text-xs tracking-[0.3em] uppercase text-cyan-500/60 animate-pulse">Initializing Proxy Pipeline</p>
                  </motion.div>
                )}
              </AnimatePresence>


              <AnimatePresence>
                {inspectedElement && role === 'host' && (
                  <motion.div
                    initial={{ x: 320 }}
                    animate={{ x: 0 }}
                    exit={{ x: 320 }}
                    className="absolute right-0 top-0 bottom-0 z-50 flex h-full shadow-2xl" // Added h-full and shadow
                  >
                    <InspectorPanel
                      data={inspectedElement}
                      onClose={() => setInspectedElement(null)}
                      onApply={(id, prop, val) => {
                        socketRef.current?.emit('dom:apply', {
                          sessionId,
                          id,
                          property: prop,
                          value: val
                        });
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </main>

        <AnimatePresence>
          {mode === "debug" && (
            <motion.aside
              initial={{ x: 400 }}
              animate={{ x: 0 }}
              exit={{ x: 400 }}
              className="w-96 border-l border-white/5 bg-slate-950/80 backdrop-blur-xl flex flex-col z-40 h-full"
            >

              <div className="flex border-b border-white/5 shrink-0">
                <button
                  onClick={() => setRightPanelTab("telemetry")}
                  className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 uppercase tracking-wider transition-colors ${
                    rightPanelTab === "telemetry" 
                      ? "text-cyan-400 bg-cyan-500/5 border-b-2 border-cyan-500" 
                      : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <Cpu size={14} /> Telemetry
                </button>
                <button
                  onClick={() => setRightPanelTab("files")}
                  className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 uppercase tracking-wider transition-colors ${
                    rightPanelTab === "files" 
                      ? "text-blue-400 bg-blue-500/5 border-b-2 border-blue-500" 
                      : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <Folder size={14} /> Files
                </button>
              </div>
            {rightPanelTab === "telemetry" ? (
                // EXISTING TELEMETRY UI
                <>

              <div className="p-4 font-mono text-[10px] space-y-3 border-b border-white/5 shrink-0 max-h-48 overflow-y-auto">
                <LogEntry type="info" text="PROXY_TUNNEL_ESTABLISHED" />
                <LogEntry type="success" text="CANVAS_LAYER_MOUNTED" />
                <LogEntry type="info" text={`WS_STATUS: ${socketRef.current?.connected ? 'CONNECTED' : 'CONNECTING...'}`} />
                <LogEntry type={role ? "success" : "info"} text={`ROLE: ${role?.toUpperCase() || 'NOT_SELECTED'}`} />
              </div>

              {role === "host" && (
                <div className="flex-1 overflow-hidden relative">
                  <TelemetryPanel sessionId={sessionId} socket={socketRef.current} />
                </div>
              )}
              </>
             ) : (
                <div className="flex-1 overflow-hidden relative">
                   <FileEditor sessionId={sessionId} socket={socketRef.current} />
                </div>
              )}
            </motion.aside>
          )}
        </AnimatePresence>

        {/* GuestRecorder Component - invisible, handles recording */}
        {role === "guest" && (
          <>
            <GuestRecorder sessionId={sessionId} socket={socketRef.current} isRecording={isRecording} />
            <ScreenShareGuest
              sessionId={sessionId}
              socket={socketRef.current}
              isSharing={isRecording}
              onSharingChange={setIsRecording}
            />
            <NetworkCapture sessionId={sessionId} socket={socketRef.current} isActive={isRecording} />
            <CursorControl sessionId={sessionId} socket={socketRef.current} controlGranted={controlGranted} />
          </>
        )}
        <CallInterface 
            ref={callRef} 
            sessionId={sessionId} 
            socket={socketRef.current} 
            role={role} 
        />

      </div>
    </div>
  );
}

const ToolIcon = ({ icon: Icon, active = false, onClick, tooltip }: any) => (
  <button onClick={onClick} className={`p-3 rounded-xl transition-all relative group ${active ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}>
    <Icon size={20} />
    <span className="absolute left-14 top-1/2 -translate-y-1/2 bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 border border-white/10">
      {tooltip}
    </span>
  </button>
);

const MiniToolIcon = ({ icon: Icon, active = false, onClick }: any) => (
  <button onClick={onClick} className={`p-1.5 rounded-lg transition-all ${active ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white hover:bg-white/10'}`}>
    <Icon size={16} />
  </button>
);

const LogEntry = ({ type, text }: any) => (
  <div className={`p-2 rounded border-l-2 font-mono ${type === 'info' ? 'text-slate-500 border-slate-500' : 'text-emerald-400 border-emerald-400 bg-emerald-400/5'}`}>
    <span className="opacity-30 mr-2">{">"}</span>{text}
  </div>
);