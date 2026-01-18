"use client";

import React, { useState, useEffect } from "react";
import { X, Type, Layout, Palette, MousePointer2, Eye, EyeOff, Code, Copy, Check, Play, RefreshCw } from "lucide-react";

interface InspectorPanelProps {
  data: any;
  onApply: (id: string, property: string, value: string) => void;
  onClose: () => void;
}

export const InspectorPanel = ({ data, onApply, onClose }: InspectorPanelProps) => {
  const [localData, setLocalData] = useState(data);
  const [activeTab, setActiveTab] = useState<'edit' | 'code'>('edit');
  const [copied, setCopied] = useState(false);
  const [cssCode, setCssCode] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    setLocalData(data);
    if (data?.styles) {
      setCssCode(generateCssFromStyles(data));
    }
  }, [data]);

  if (!data) return null;

  const handleStyleChange = (property: string, value: string) => {
    setLocalData((prev: any) => ({
      ...prev,
      styles: { ...prev.styles, [property]: value }
    }));
    onApply(data.id, property, value);
    const newStyles = { ...localData?.styles, [property]: value };
    setCssCode(generateCssFromStylesObj(data, newStyles));
  };

  const handleInputChange = (property: string, value: string) => {
    setLocalData((prev: any) => ({
      ...prev,
      styles: { ...prev.styles, [property]: value }
    }));
  };

  const handleInputBlur = (property: string, value: string) => {
    onApply(data.id, property, value);
    const newStyles = { ...localData?.styles, [property]: value };
    setCssCode(generateCssFromStylesObj(data, newStyles));
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, property: string) => {
    if (e.key === 'Enter') {
      onApply(data.id, property, e.currentTarget.value);
      const newStyles = { ...localData?.styles, [property]: e.currentTarget.value };
      setCssCode(generateCssFromStylesObj(data, newStyles));
    }
  };

  const applyCodeChanges = () => {
    setIsApplying(true);

    try {
      const cssContent = cssCode.replace(/[^{]+\{/, '').replace(/\}/, '').trim();
      const lines = cssContent.split(';').filter(line => line.trim());

      const newStyles: Record<string, string> = {};

      lines.forEach(line => {
        const [property, ...valueParts] = line.split(':');
        if (property && valueParts.length) {
          const cleanProp = property.trim();
          const value = valueParts.join(':').trim();

          const camelProp = cleanProp.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

          onApply(data.id, camelProp, value);
          newStyles[camelProp] = value;
        }
      });

      setLocalData((prev: any) => ({
        ...prev,
        styles: { ...prev.styles, ...newStyles }
      }));

    } catch (err) {
      console.error('Error parsing CSS:', err);
    }

    setTimeout(() => setIsApplying(false), 500);
  };

  const resetCode = () => {
    if (data?.styles) {
      setCssCode(generateCssFromStyles(data));
    }
  };

  const categories = [
    {
      title: "Layout",
      icon: Layout,
      fields: ["width", "height", "margin", "padding", "display", "position"]
    },
    {
      title: "Typography",
      icon: Type,
      fields: ["color", "fontSize", "fontWeight", "textAlign", "lineHeight"]
    },
    {
      title: "Appearance",
      icon: Palette,
      fields: ["backgroundColor", "borderRadius", "border", "opacity"]
    }
  ];

  const copyCode = () => {
    navigator.clipboard.writeText(cssCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-80 h-full bg-slate-900 border-l border-white/10 flex flex-col font-sans text-xs shadow-2xl absolute right-0 top-0 z-50">
      <div className="p-3 border-b border-white/10 flex items-center justify-between bg-slate-950">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="bg-emerald-500/20 text-emerald-400 p-1.5 rounded">
            <MousePointer2 size={14} />
          </span>
          <div className="flex flex-col">
            <span className="font-bold text-slate-200 uppercase tracking-wide">Inspector</span>
            <span className="text-[10px] text-slate-500 font-mono truncate max-w-[150px]">
              {data.tagName.toUpperCase()} {data.classes ? `.${data.classes.split(' ')[0]}` : ''}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex border-b border-white/10">
        <button
          onClick={() => setActiveTab('edit')}
          className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors 
            ${activeTab === 'edit' ? 'text-emerald-400 bg-emerald-500/10 border-b-2 border-emerald-500' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <Palette size={12} /> Styles
        </button>
        <button
          onClick={() => setActiveTab('code')}
          className={`flex-1 py-2.5 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors 
            ${activeTab === 'code' ? 'text-cyan-400 bg-cyan-500/10 border-b-2 border-cyan-500' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <Code size={12} /> CSS Code
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">

        {activeTab === 'edit' ? (
          <>
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
              <span className="text-slate-400">Visibility</span>
              <button
                onClick={() => handleStyleChange('visibility', localData?.styles?.visibility === 'hidden' ? 'visible' : 'hidden')}
                className={`p-1.5 rounded transition-all ${localData?.styles?.visibility === 'hidden' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}
              >
                {localData?.styles?.visibility === 'hidden' ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            {categories.map((cat) => (
              <div key={cat.title}>
                <div className="flex items-center gap-2 text-slate-500 mb-3 uppercase tracking-wider font-bold text-[10px]">
                  <cat.icon size={12} /> {cat.title}
                </div>
                <div className="space-y-2">
                  {cat.fields.map((field) => (
                    <div key={field} className="grid grid-cols-[80px_1fr] items-center gap-2">
                      <label className="text-slate-400 truncate" title={field}>{field}</label>

                      {field.toLowerCase().includes("color") ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={rgbToHex(localData?.styles?.[field]) || '#000000'}
                            onChange={(e) => handleStyleChange(field, e.target.value)}
                            className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0"
                          />
                          <input
                            type="text"
                            value={localData?.styles?.[field] || ''}
                            onChange={(e) => handleInputChange(field, e.target.value)}
                            onBlur={(e) => handleInputBlur(field, e.target.value)}
                            onKeyDown={(e) => handleInputKeyDown(e, field)}
                            className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={localData?.styles?.[field] || ''}
                          onChange={(e) => handleInputChange(field, e.target.value)}
                          onKeyDown={(e) => handleInputKeyDown(e, field)}
                          onBlur={(e) => handleInputBlur(field, e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-emerald-500/50"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 uppercase text-[10px] font-bold tracking-wider">Editable CSS</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={resetCode}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
                  title="Reset to computed styles"
                >
                  <RefreshCw size={10} />
                </button>
                <button
                  onClick={copyCode}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="relative">
              <textarea
                value={cssCode}
                onChange={(e) => setCssCode(e.target.value)}
                className="w-full h-48 bg-black/60 border border-white/10 rounded-lg p-4 text-[11px] font-mono text-slate-300 resize-none focus:outline-none focus:border-cyan-500/50 leading-relaxed"
                spellCheck={false}
                placeholder="Edit CSS here..."
              />
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                <span className="text-[9px] text-slate-600">Ctrl+Enter to apply</span>
              </div>
            </div>

            <button
              onClick={applyCodeChanges}
              disabled={isApplying}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  applyCodeChanges();
                }
              }}
              className={`w-full py-2.5 rounded-lg font-bold text-[11px] uppercase tracking-wider flex items-center justify-center gap-2 transition-all
                ${isApplying
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white shadow-lg hover:shadow-cyan-500/25'
                }`}
            >
              {isApplying ? (
                <>
                  <Check size={14} /> Applied!
                </>
              ) : (
                <>
                  <Play size={14} /> Apply Changes
                </>
              )}
            </button>

            <div className="pt-4 border-t border-white/10">
              <span className="text-slate-500 uppercase text-[10px] font-bold tracking-wider">Element Info</span>
              <div className="mt-3 space-y-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Tag</span>
                  <span className="text-cyan-400 font-mono">&lt;{data.tagName.toLowerCase()}&gt;</span>
                </div>
                {data.idAttr && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">ID</span>
                    <span className="text-yellow-400 font-mono">#{data.idAttr}</span>
                  </div>
                )}
                {data.classes && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Classes</span>
                    <span className="text-purple-400 font-mono truncate max-w-[150px]" title={data.classes}>
                      .{data.classes.split(' ').slice(0, 2).join(' .')}
                    </span>
                  </div>
                )}
                {data.rect && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Size</span>
                      <span className="text-slate-300 font-mono">{Math.round(data.rect.width)} × {Math.round(data.rect.height)}px</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Position</span>
                      <span className="text-slate-300 font-mono">({Math.round(data.rect.left)}, {Math.round(data.rect.top)})</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {data.innerText && (
              <div className="pt-4 border-t border-white/10">
                <span className="text-slate-500 uppercase text-[10px] font-bold tracking-wider">Text Content</span>
                <p className="mt-2 text-[11px] text-slate-400 bg-black/30 rounded p-2 line-clamp-3">
                  {data.innerText.slice(0, 150)}{data.innerText.length > 150 ? '...' : ''}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const generateCssFromStyles = (data: any) => {
  const selector = data.classes
    ? `.${data.classes.split(' ')[0]}`
    : data.idAttr
      ? `#${data.idAttr}`
      : data.tagName.toLowerCase();

  const styles = data?.styles || {};
  return generateCssString(selector, styles);
};

const generateCssFromStylesObj = (data: any, styles: Record<string, string>) => {
  const selector = data.classes
    ? `.${data.classes.split(' ')[0]}`
    : data.idAttr
      ? `#${data.idAttr}`
      : data.tagName.toLowerCase();

  return generateCssString(selector, styles);
};

const generateCssString = (selector: string, styles: Record<string, string>) => {
  const cssLines: string[] = [];

  const toKebabCase = (str: string) =>
    str.replace(/([A-Z])/g, '-$1').toLowerCase();

  Object.entries(styles).forEach(([key, value]) => {
    if (value && value !== 'none' && value !== 'normal' && value !== 'auto' && value !== '') {
      cssLines.push(`  ${toKebabCase(key)}: ${value};`);
    }
  });

  return `${selector} {\n${cssLines.join('\n')}\n}`;
};

const rgbToHex = (rgb: string) => {
  if (!rgb || !rgb.startsWith('rgb')) return null;
  const rgbValues = rgb.match(/\d+/g);
  if (!rgbValues) return null;
  return "#" + rgbValues.slice(0, 3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
};