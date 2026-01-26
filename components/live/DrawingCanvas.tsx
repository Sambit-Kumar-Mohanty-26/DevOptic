"use client";

import React, { useEffect, useRef } from "react";
import * as fabric from "fabric";

interface DrawingCanvasProps {
  mode: "debug" | "pixel";
  tool: string;
  color: string;
}

export const DrawingCanvas = ({ mode, tool, color }: DrawingCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvas = useRef<fabric.Canvas | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize Fabric Canvas
    fabricCanvas.current = new fabric.Canvas(canvasRef.current, {
      width: canvasRef.current.parentElement?.clientWidth,
      height: canvasRef.current.parentElement?.clientHeight,
      selection: true,
    });

    const handleResize = () => {
      if (fabricCanvas.current && canvasRef.current?.parentElement) {
        fabricCanvas.current.setDimensions({
          width: canvasRef.current.parentElement.clientWidth,
          height: canvasRef.current.parentElement.clientHeight,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      fabricCanvas.current?.dispose();
    };
  }, []);

  // TOOL LOGIC
  useEffect(() => {
    const canvas = fabricCanvas.current;
    if (!canvas) return;

    canvas.isDrawingMode = false;
    canvas.off("mouse:down");
    canvas.off("mouse:move");
    canvas.off("mouse:up");

    if (tool === "pencil") {
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
      canvas.freeDrawingBrush.width = 3;
      canvas.freeDrawingBrush.color = color;
    }
    else if (tool === "rect") {
      let rect: fabric.Rect | null = null;
      let startX: number, startY: number;

      canvas.on("mouse:down", (opt) => {
        const pointer = canvas.getScenePoint(opt.e);
        startX = pointer.x;
        startY = pointer.y;
        rect = new fabric.Rect({
          left: startX,
          top: startY,
          width: 0,
          height: 0,
          fill: "transparent",
          stroke: color,
          strokeWidth: 2,
        });
        canvas.add(rect);
      });

      canvas.on("mouse:move", (opt) => {
        if (!rect) return;
        const pointer = canvas.getScenePoint(opt.e);
        rect.set({
          width: Math.abs(startX - pointer.x),
          height: Math.abs(startY - pointer.y),
          left: Math.min(startX, pointer.x),
          top: Math.min(startY, pointer.y),
        });
        canvas.renderAll();
      });

      canvas.on("mouse:up", () => {
        rect = null;
      });
    }

    else if (tool === "text") {
      canvas.on("mouse:down", (opt) => {
        const pointer = canvas.getScenePoint(opt.e);
        const text = new fabric.IText("Type here...", {
          left: pointer.x,
          top: pointer.y,
          fontFamily: "monospace",
          fontSize: 16,
          fill: color,
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
      });
    }
  }, [tool, color]);

  return (
    <div
      className={`absolute inset-0 z-20 pointer-events-none transition-opacity duration-500 ${mode === "pixel" ? "opacity-100 pointer-events-auto" : "opacity-0"
        }`}
    >
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};