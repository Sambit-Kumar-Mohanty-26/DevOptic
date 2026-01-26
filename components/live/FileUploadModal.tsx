"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Upload, X, FileText, File, Loader2 } from "lucide-react";
import type { Socket } from "socket.io-client";
import { toast } from "sonner";

interface FileUploadModalProps {
    sessionId: string;
    socket: Socket | null;
    isOpen: boolean;
    multiple: boolean;
    accept: string;
    onClose: () => void;
}

export const FileUploadModal = ({
    sessionId,
    socket,
    isOpen,
    multiple,
    accept,
    onClose
}: FileUploadModalProps) => {
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setFiles(Array.from(e.target.files));
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files) {
            setFiles(Array.from(e.dataTransfer.files));
        }
    }, []);

    const handleUpload = useCallback(async () => {
        if (!socket || files.length === 0) return;

        setUploading(true);

        try {
            // Convert files to base64
            const fileData = await Promise.all(
                files.map(async (file) => {
                    const buffer = await file.arrayBuffer();
                    const base64 = btoa(
                        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
                    );
                    return {
                        name: file.name,
                        data: base64,
                        type: file.type
                    };
                })
            );

            socket.emit("browser:upload", { sessionId, files: fileData });
            toast.success(`Uploading ${files.length} file(s)...`);
        } catch (err) {
            toast.error("Failed to prepare files for upload");
            setUploading(false);
        }
    }, [socket, sessionId, files]);

    const handleCancel = useCallback(() => {
        if (socket) {
            socket.emit("browser:cancelUpload", { sessionId });
        }
        setFiles([]);
        onClose();
    }, [socket, sessionId, onClose]);

    useEffect(() => {
        if (!socket) return;

        const handleUploaded = (data: { success: boolean; count: number }) => {
            setUploading(false);
            if (data.success) {
                toast.success(`${data.count} file(s) uploaded successfully`);
                setFiles([]);
                onClose();
            }
        };

        socket.on("browser:uploaded", handleUploaded);
        return () => {
            socket.off("browser:uploaded", handleUploaded);
        };
    }, [socket, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                            <Upload size={20} className="text-emerald-400" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white">Upload Files</h3>
                            <p className="text-xs text-slate-400">
                                {multiple ? "Select one or more files" : "Select a file to upload"}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleCancel}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                <div
                    className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center hover:border-emerald-500/50 transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={accept}
                        multiple={multiple}
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                    <File size={40} className="text-slate-500 mx-auto mb-3" />
                    <p className="text-sm text-slate-400">
                        Drag & drop or <span className="text-emerald-400">click to browse</span>
                    </p>
                    {accept !== "*" && (
                        <p className="text-xs text-slate-500 mt-2">Accepts: {accept}</p>
                    )}
                </div>

                {files.length > 0 && (
                    <div className="mt-4 space-y-2 max-h-40 overflow-y-auto">
                        {files.map((file, index) => (
                            <div
                                key={index}
                                className="flex items-center gap-3 p-3 bg-white/5 rounded-lg"
                            >
                                <FileText size={16} className="text-slate-400" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-white truncate">{file.name}</p>
                                    <p className="text-xs text-slate-500">
                                        {(file.size / 1024).toFixed(1)} KB
                                    </p>
                                </div>
                                <button
                                    onClick={() => setFiles(files.filter((_, i) => i !== index))}
                                    className="p-1 hover:bg-white/10 rounded"
                                >
                                    <X size={14} className="text-slate-400" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex gap-3 mt-6">
                    <button
                        onClick={handleCancel}
                        className="flex-1 py-2.5 px-4 bg-white/10 hover:bg-white/15 text-slate-300 rounded-xl font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={files.length === 0 || uploading}
                        className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                    >
                        {uploading ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Uploading...
                            </>
                        ) : (
                            <>
                                <Upload size={16} />
                                Upload
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
