"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

export interface ElementMetadata {
    id: string;
    tagName: string;
    classes?: string;
    idAttr?: string;
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
        top: number;
        left: number;
    };
    isInteractive?: boolean;
    innerText?: string;
}

interface GhostDOMOverlayProps {
    elements: ElementMetadata[];
    videoRef: React.RefObject<HTMLVideoElement | null>;
    isActive: boolean;
    onHover?: (element: ElementMetadata | null) => void;
    onClick?: (element: ElementMetadata) => void;
    showCursor?: boolean;
}

export const GhostDOMOverlay: React.FC<GhostDOMOverlayProps> = ({
    elements,
    videoRef,
    isActive,
    onHover,
    onClick,
    showCursor = true
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [hoveredElement, setHoveredElement] = useState<ElementMetadata | null>(null);
    const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
    const [isOverVideo, setIsOverVideo] = useState(false);
    const [scale, setScale] = useState({ x: 1, y: 1 });
    const [offset, setOffset] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const updateScale = () => {
            const rect = video.getBoundingClientRect();
            const videoWidth = video.videoWidth || 1920;
            const videoHeight = video.videoHeight || 1080;

            const scaleX = rect.width / videoWidth;
            const scaleY = rect.height / videoHeight;

            const effectiveScale = Math.min(scaleX, scaleY);

            const renderedWidth = videoWidth * effectiveScale;
            const renderedHeight = videoHeight * effectiveScale;
            const offsetX = (rect.width - renderedWidth) / 2;
            const offsetY = (rect.height - renderedHeight) / 2;

            setScale({ x: effectiveScale, y: effectiveScale });
            setOffset({ x: offsetX, y: offsetY });
        };

        updateScale();
        video.addEventListener('loadedmetadata', updateScale);
        window.addEventListener('resize', updateScale);

        return () => {
            video.removeEventListener('loadedmetadata', updateScale);
            window.removeEventListener('resize', updateScale);
        };
    }, [videoRef]);

    // Map screen coordinates to video coordinates
    const screenToVideo = useCallback((screenX: number, screenY: number): { x: number, y: number } | null => {
        const video = videoRef.current;
        const container = containerRef.current;
        if (!video || !container) return null;

        const rect = container.getBoundingClientRect();
        const localX = screenX - rect.left;
        const localY = screenY - rect.top;

        const videoX = (localX - offset.x) / scale.x;
        const videoY = (localY - offset.y) / scale.y;

        return { x: videoX, y: videoY };
    }, [offset, scale, videoRef]);

    // Find element at position
    const findElementAt = useCallback((x: number, y: number): ElementMetadata | null => {
        let best: ElementMetadata | null = null;
        let bestArea = Infinity;

        for (const el of elements) {
            if (x >= el.rect.left && x <= el.rect.left + el.rect.width &&
                y >= el.rect.top && y <= el.rect.top + el.rect.height) {
                const area = el.rect.width * el.rect.height;
                if (area < bestArea) {
                    best = el;
                    bestArea = area;
                }
            }
        }

        return best;
    }, [elements]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isActive) return;

        setCursorPos({ x: e.clientX, y: e.clientY });

        const videoCoords = screenToVideo(e.clientX, e.clientY);
        if (!videoCoords) return;

        const element = findElementAt(videoCoords.x, videoCoords.y);

        if (element !== hoveredElement) {
            setHoveredElement(element);
            onHover?.(element);
        }
    }, [isActive, screenToVideo, findElementAt, hoveredElement, onHover]);

    const handleMouseEnter = useCallback(() => {
        setIsOverVideo(true);
    }, []);

    const handleMouseLeave = useCallback(() => {
        setIsOverVideo(false);
        setHoveredElement(null);
        onHover?.(null);
    }, [onHover]);

    const handleClick = useCallback((e: React.MouseEvent) => {
        if (!isActive) return;
        e.preventDefault();

        if (hoveredElement) {
            onClick?.(hoveredElement);
        }
    }, [isActive, hoveredElement, onClick]);

    // Transform element rect from video coordinates to screen coordinates
    const rectToScreen = useCallback((rect: ElementMetadata['rect']) => {
        return {
            left: rect.left * scale.x + offset.x,
            top: rect.top * scale.y + offset.y,
            width: rect.width * scale.x,
            height: rect.height * scale.y
        };
    }, [scale, offset]);

    if (!isActive) return null;

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 cursor-none"
            style={{ pointerEvents: isActive ? 'auto' : 'none' }}
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
        >
            {hoveredElement && (
                <div
                    className="absolute border-2 border-violet-500 bg-violet-500/10 pointer-events-none transition-all duration-75 rounded-sm"
                    style={rectToScreen(hoveredElement.rect)}
                >
                    <div className="absolute -top-6 left-0 bg-violet-500 text-white text-[10px] px-2 py-0.5 rounded font-mono whitespace-nowrap">
                        {hoveredElement.tagName}
                        {hoveredElement.idAttr && <span className="text-violet-200">#{hoveredElement.idAttr}</span>}
                        {hoveredElement.classes && !hoveredElement.idAttr && (
                            <span className="text-violet-200">.{hoveredElement.classes.split(' ')[0]}</span>
                        )}
                    </div>
                </div>
            )}

            {showCursor && isOverVideo && (
                <div
                    className="fixed pointer-events-none z-[99999]"
                    style={{
                        left: cursorPos.x,
                        top: cursorPos.y,
                        transform: 'translate(-5px, -3px)'
                    }}
                >
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        style={{
                            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
                        }}
                    >
                        <path
                            d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.86a.5.5 0 0 0-.85.35Z"
                            fill="#8B5CF6"
                            stroke="#fff"
                            strokeWidth="1.5"
                        />
                    </svg>
                    <span
                        className="absolute left-4 top-3 bg-violet-500 text-white px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap"
                        style={{ boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
                    >
                        INSPECT
                    </span>
                </div>
            )}
        </div>
    );
};

export default GhostDOMOverlay;
