import React, { useRef, useState, useEffect } from 'react';
import { VJState, LayerType, LayerItem, TextOverlayItem, TextAnimType } from '../types';
import { BRUTALIST_STICKERS, StickerAsset } from '../data/stickers';
import { 
  Trash2, Move, RefreshCw, Layers, Sliders, Type, 
  Image as ImageIcon, Sparkles, Scale, Lock, Unlock, 
  Copy, ChevronUp, ChevronDown, RefreshCcw, Crop, SlidersHorizontal 
} from 'lucide-react';

interface BrutalistCanvasProps {
  vjState: VJState;
  setVjState: React.Dispatch<React.SetStateAction<VJState>>;
  children: React.ReactNode; // This will receive our VJCanvas WebGL component
}

export const BrutalistCanvas: React.FC<BrutalistCanvasProps> = ({ vjState, setVjState, children }) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [activeElement, setActiveElement] = useState<{ id: string; isText: boolean } | null>(null);
  const [dragState, setDragState] = useState<{
    id: string;
    isText: boolean;
    initialMouseX: number;
    initialMouseY: number;
    initialX: number;
    initialY: number;
  } | null>(null);

  // Active property tab: 'TRANSFORM' | 'CROP' | 'STYLING' | 'ARRENGE'
  const [activePropertyTab, setActivePropertyTab] = useState<'TRANSFORM' | 'CROP' | 'STYLING' | 'ARRANGE'>('TRANSFORM');

  // Dragging logic
  const handleMouseDown = (e: React.MouseEvent, id: string, isText: boolean, currentX: number, currentY: number) => {
    // Prevent triggering other events
    e.stopPropagation();
    
    // Select element
    setActiveElement({ id, isText });

    // If locked, prevent dragging
    if (!isText) {
      const layer = vjState.layers.find(l => l.id === id);
      if (layer?.locked) return;
    }
    
    setDragState({
      id,
      isText,
      initialMouseX: e.clientX,
      initialMouseY: e.clientY,
      initialX: currentX,
      initialY: currentY
    });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const mouseDx = e.clientX - dragState.initialMouseX;
      const mouseDy = e.clientY - dragState.initialMouseY;

      // Translate px movement to percentage-based coordinates of active canvas box
      const pctDx = (mouseDx / rect.width) * 100;
      const pctDy = (mouseDy / rect.height) * 100;

      const newX = dragState.initialX + pctDx;
      
      if (dragState.isText) {
        const newY = dragState.initialY + pctDy;
        setVjState(prev => ({
          ...prev,
          textOverlays: prev.textOverlays.map(txt => 
            txt.id === dragState.id ? { ...txt, posX: Math.max(0, Math.min(100, newX)), posY: Math.max(0, Math.min(100, newY)) } : txt
          )
        }));
      } else {
        // THREEJS Y is inverted: positive is UP, negative is DOWN
        const newY = dragState.initialY - pctDy;
        setVjState(prev => ({
          ...prev,
          layers: prev.layers.map(layer => 
            layer.id === dragState.id ? { ...layer, posX: Math.max(-100, Math.min(100, newX)), posY: Math.max(-100, Math.min(100, newY)) } : layer
          )
        }));
      }
    };

    const handleMouseUp = () => {
      if (dragState) {
        setDragState(null);
      }
    };

    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, setVjState]);

  // Keyboard controls for fine tuning focused element coordinates
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeElement) return;
      
      const step = e.shiftKey ? 5 : 1;
      let dx = 0;
      let dy = 0;

      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;

      e.preventDefault();

      if (activeElement.isText) {
        setVjState(prev => ({
          ...prev,
          textOverlays: prev.textOverlays.map(txt => 
            txt.id === activeElement.id ? { ...txt, posX: Math.max(0, Math.min(100, txt.posX + dx)), posY: Math.max(0, Math.min(100, txt.posY + dy)) } : txt
          )
        }));
      } else {
        // Arrow down is positive screen movement (towards bottom), which decreases ThreeJS posY coordinate
        // Arrow up is negative screen movement (towards top), which increases ThreeJS posY coordinate
        const factorY = (e.key === 'ArrowUp') ? step : (e.key === 'ArrowDown') ? -step : 0;
        setVjState(prev => ({
          ...prev,
          layers: prev.layers.map(layer => 
            layer.id === activeElement.id ? { ...layer, posX: Math.max(-100, Math.min(100, layer.posX + dx)), posY: Math.max(-100, Math.min(100, layer.posY + factorY)) } : layer
          )
        }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeElement, setVjState]);

  const deleteElement = (id: string, isText: boolean) => {
    if (isText) {
      setVjState(prev => ({
        ...prev,
        textOverlays: prev.textOverlays.filter(t => t.id !== id)
      }));
    } else {
      setVjState(prev => ({
        ...prev,
        layers: prev.layers.filter(l => l.id !== id)
      }));
    }
    setActiveElement(null);
  };

  // Helper actions for layer management (Photoshop / Illustrator style)
  const toggleLock = (id: string) => {
    setVjState(prev => ({
      ...prev,
      layers: prev.layers.map(l => l.id === id ? { ...l, locked: !l.locked } : l)
    }));
  };

  const duplicateLayer = (id: string) => {
    setVjState(prev => {
      const original = prev.layers.find(l => l.id === id);
      if (!original) return prev;
      const newId = `layer_${Date.now()}`;
      const clone: LayerItem = {
        ...original,
        id: newId,
        name: original.name ? `${original.name} (Copy)` : `${original.type.toUpperCase()} Layer (Copy)`,
        posX: Math.max(-100, Math.min(100, original.posX + 8)),
        posY: Math.max(-100, Math.min(100, original.posY - 8)),
        locked: false
      };
      return {
        ...prev,
        layers: [...prev.layers, clone]
      };
    });
  };

  const duplicateText = (id: string) => {
    setVjState(prev => {
      const original = prev.textOverlays.find(t => t.id === id);
      if (!original) return prev;
      const newId = `text_${Date.now()}`;
      const clone: TextOverlayItem = {
        ...original,
        id: newId,
        text: `${original.text} (Copy)`,
        posX: Math.max(0, Math.min(100, original.posX + 5)),
        posY: Math.max(0, Math.min(100, original.posY + 5))
      };
      return {
        ...prev,
        textOverlays: [...prev.textOverlays, clone]
      };
    });
  };

  const bringToFront = (id: string) => {
    setVjState(prev => {
      const target = prev.layers.find(l => l.id === id);
      if (!target) return prev;
      const filtered = prev.layers.filter(l => l.id !== id);
      return { ...prev, layers: [...filtered, target] };
    });
  };

  const sendToBack = (id: string) => {
    setVjState(prev => {
      const target = prev.layers.find(l => l.id === id);
      if (!target) return prev;
      const filtered = prev.layers.filter(l => l.id !== id);
      return { ...prev, layers: [target, ...filtered] };
    });
  };

  const moveUp = (id: string) => {
    setVjState(prev => {
      const idx = prev.layers.findIndex(l => l.id === id);
      if (idx === -1 || idx === prev.layers.length - 1) return prev;
      const newLayers = [...prev.layers];
      const temp = newLayers[idx];
      newLayers[idx] = newLayers[idx + 1];
      newLayers[idx + 1] = temp;
      return { ...prev, layers: newLayers };
    });
  };

  const moveDown = (id: string) => {
    setVjState(prev => {
      const idx = prev.layers.findIndex(l => l.id === id);
      if (idx === -1 || idx === 0) return prev;
      const newLayers = [...prev.layers];
      const temp = newLayers[idx];
      newLayers[idx] = newLayers[idx - 1];
      newLayers[idx - 1] = temp;
      return { ...prev, layers: newLayers };
    });
  };

  // Dynamic Google Font Loader
  useEffect(() => {
    const fonts: string[] = Array.from(new Set(vjState.textOverlays.map(t => t.font).filter(Boolean)));
    if (fonts.length === 0) return;

    const linkId = 'dynamic-font-loader';
    let link = document.getElementById(linkId) as HTMLLinkElement;
    
    if (!link) {
      link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }

    const fontQuery = fonts.map(f => `family=${f.trim().replace(/ /g, '+')}:wght@400;700;800;900`).join('&');
    link.href = `https://fonts.googleapis.com/css2?${fontQuery}&display=swap`;
  }, [vjState.textOverlays]);

  const getAnimationClass = (anim: TextAnimType) => {
    switch (anim) {
      case TextAnimType.PULSE: return 'animate-pulse-fast';
      case TextAnimType.GLITCH: return 'animate-glitch';
      case TextAnimType.NEON_FLICKER: return 'animate-flicker';
      case TextAnimType.SLIDE: return 'animate-slide-scan';
      case TextAnimType.SPIN: return 'animate-slow-spin';
      case TextAnimType.MARQUEE: return 'animate-marquee';
      case TextAnimType.WAVE: return 'animate-wave';
      case TextAnimType.BOUNCE: return 'animate-bounce-vj';
      case TextAnimType.CHROMA: return 'animate-chroma';
      default: return '';
    }
  };

  // Find currently active item for property inspector display
  const activeLayerData = !activeElement?.isText 
    ? vjState.layers.find(l => l.id === activeElement?.id) 
    : null;
    
  const activeTextData = activeElement?.isText 
    ? vjState.textOverlays.find(t => t.id === activeElement?.id) 
    : null;

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-2 sm:p-4 select-none">
      
      {/* Brutalist Frame Workspace Wrapper */}
      <div 
        ref={canvasRef}
        id="brutalist-workspace"
        className={`relative border-4 border-white bg-black overflow-hidden shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] transition-all duration-300 ${
          vjState.videoFormat === 'mobile' 
            ? 'aspect-[9/16] w-[350px] max-w-full max-h-[75vh]' 
            : 'aspect-video w-full max-w-[1280px] max-h-[70vh]'
        }`}
        style={{ minHeight: vjState.videoFormat === 'mobile' ? '540px' : '420px' }}
      >
        <style>{`
          @keyframes glitch {
            0% { transform: translate(0); }
            20% { transform: translate(-3px, 3px); }
            40% { transform: translate(3px, -3px); }
            60% { transform: translate(-3px, 0); }
            80% { transform: translate(3px, 3px); }
            100% { transform: translate(0); }
          }
          .animate-glitch { animation: glitch 0.2s steps(2, start) infinite; }
          
          @keyframes flicker {
            0%, 19%, 21%, 23%, 25%, 54%, 56%, 100% { opacity: 1; }
            20%, 24%, 55% { opacity: 0.2; }
          }
          .animate-flicker { animation: flicker 0.15s infinite; }

          @keyframes pulse-fast {
            0%, 100% { transform: scale(1); filter: brightness(1); }
            50% { transform: scale(1.1); filter: brightness(1.5); }
          }
          .animate-pulse-fast { animation: pulse-fast 0.4s ease-in-out infinite; }
          
          @keyframes marquee {
            0% { transform: translateX(100vw); }
            100% { transform: translateX(-100%); }
          }
          .animate-marquee { animation: marquee 10s linear infinite; width: max-content; }

          @keyframes wave {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-30px); }
          }
          .animate-wave { animation: wave 2s ease-in-out infinite; }

          @keyframes bounce-vj {
            0%, 100% { transform: translateY(0) scale(1); }
            30% { transform: translateY(-50px) scale(0.9, 1.1); }
            50% { transform: translateY(0) scale(1.2, 0.8); }
          }
          .animate-bounce-vj { animation: bounce-vj 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) infinite; }

          @keyframes chroma {
            0% { color: #ff0000; text-shadow: 0 0 20px #ff0000; }
            33% { color: #00ff00; text-shadow: 0 0 20px #00ff00; }
            66% { color: #0000ff; text-shadow: 0 0 20px #0000ff; }
            100% { color: #ff0000; text-shadow: 0 0 20px #ff0000; }
          }
          .animate-chroma { animation: chroma 3s linear infinite; }

          .animate-slow-spin { animation: spin 12s linear infinite; }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

          @keyframes slide-scan {
            0% { clip-path: inset(0 0 100% 0); }
            50% { clip-path: inset(0 0 0 0); }
            100% { clip-path: inset(100% 0 0 0); }
          }
          .animate-slide-scan { animation: slide-scan 2s ease-in-out infinite; }
        `}</style>

        {/* Grid and calibrations */}
        <div className="absolute inset-0 pointer-events-none z-10 bg-[radial-gradient(#ffffff15_1.5px,transparent_1.5px)] [background-size:20px_20px] opacity-60"></div>
        
        {/* Visual Calibration Badges */}
        <div className="absolute top-2 left-2 z-10 text-[8px] tracking-widest text-[#22c55e] bg-black border border-[#22c55e] px-1.5 py-0.5 uppercase font-bold font-mono">
          CANVAS // WORKSPACE // {vjState.bpm} BPM
        </div>
        <div className="absolute top-2 right-2 z-10 text-[8px] tracking-widest text-fuchsia-500 bg-black border border-fuchsia-500 px-1.5 py-0.5 uppercase font-bold font-mono">
          LAYERS_ACTIVE: {vjState.layers.length}
        </div>

        {/* --- THREEJS/WEBGL AUDIO-REACTIVE LAYER RENDERS --- */}
        <div className="absolute inset-0 w-full h-full z-0 select-none pointer-events-none">
          {children}
        </div>

        {/* --- INTERACTIVE COLLAGE CANVAS LAYER --- */}
        <div id="brutalist-collages-overlay" className="absolute inset-0 w-full h-full z-20 pointer-events-auto overflow-hidden">
          
          {/* 1. TEXT LAYERS */}
          {vjState.textOverlays.map(text => {
            const isFocused = activeElement?.id === text.id && activeElement?.isText;
            
            return (
              <div
                key={text.id}
                id={text.id}
                data-type="text"
                data-text={text.text || "TYPOGRAPHY"}
                data-font={text.font}
                data-size={text.size}
                data-color={text.color}
                data-rotation={text.rotation || 0}
                data-opacity={text.opacity !== undefined ? text.opacity : 1.0}
                data-blend-mode={text.blendMode || "normal"}
                data-outline={text.outline ? "true" : "false"}
                data-glow={text.glow !== undefined ? text.glow : 20}
                data-weight={text.fontWeight || "900"}
                data-italic={text.isItalic ? "true" : "false"}
                data-letter-spacing={text.letterSpacing || 0}
                onMouseDown={(e) => handleMouseDown(e, text.id, true, text.posX, text.posY)}
                style={{
                  left: `${text.posX}%`,
                  top: `${text.posY}%`,
                  transform: `translate(-50%, -50%) rotate(${text.rotation || 0}deg)`,
                  mixBlendMode: text.blendMode as any,
                  opacity: text.opacity,
                  zIndex: isFocused ? 50 : 30,
                  fontSize: `${text.size}rem`,
                  color: text.color,
                  fontFamily: `"${text.font}", sans-serif`,
                  letterSpacing: `${text.letterSpacing || 0}px`,
                  fontWeight: text.fontWeight || "900",
                  fontStyle: text.isItalic ? "italic" : "normal"
                }}
                className={`absolute select-none cursor-move p-2 transition-shadow ${
                  isFocused ? 'ring-2 ring-lime-400 border-2 border-dashed border-lime-400 bg-black/60 shadow-lg' : 'hover:ring-1 hover:ring-white/40'
                }`}
              >
                {/* Visual drag anchor on-top */}
                {isFocused && (
                  <div className="absolute -top-6 left-0 right-0 h-5 bg-lime-400 border-2 border-black flex items-center justify-between px-1 cursor-move">
                    <span className="text-[7px] font-black uppercase text-black font-mono">TYPO</span>
                    <div className="flex items-center gap-1">
                      <button 
                        onMouseDown={(e) => { e.stopPropagation(); duplicateText(text.id); }}
                        className="hover:bg-black/20 text-black p-0.5 transition-colors"
                        title="Duplicate"
                      >
                        <Copy size={9} strokeWidth={3} />
                      </button>
                      <button 
                        onMouseDown={(e) => { e.stopPropagation(); deleteElement(text.id, true); }}
                        className="hover:text-red-600 text-black p-0.5 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={9} strokeWidth={3} />
                      </button>
                    </div>
                  </div>
                )}

                <div 
                  className={`${getAnimationClass(text.anim)} text-center tracking-tight whitespace-nowrap leading-none`}
                  style={{
                    textShadow: text.outline 
                      ? `-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000` 
                      : `0 0 ${text.glow !== undefined ? text.glow : 20}px ${text.color}`,
                    WebkitTextStroke: text.outline ? `1.5px ${text.color}` : 'none',
                    WebkitTextFillColor: text.outline ? 'transparent' : 'inherit',
                  }}
                >
                  {text.text || "TYPOGRAPHY"}
                </div>
              </div>
            );
          })}

          {/* 2. IMAGE & VIDEO COLLAGE LAYERS */}
          {vjState.layers.map(layer => {
            if (!layer.visible || layer.type === LayerType.PARTICLES) return null;

            const isFocused = activeElement?.id === layer.id && !activeElement?.isText;
            
            const cssLeft = 50 + layer.posX;
            const cssTop = 50 - layer.posY; // ThreeJS coordinates inverter
            
            const scaleX = layer.scaleX !== undefined ? layer.scaleX : 1.0;
            const scaleY = layer.scaleY !== undefined ? layer.scaleY : 1.0;
            const scaleWidthPct = layer.scale * 15;

            // Crops coordinates
            const cropLeft = layer.cropLeft || 0;
            const cropRight = layer.cropRight || 0;
            const cropTop = layer.cropTop || 0;
            const cropBottom = layer.cropBottom || 0;

            const stickerPreset = BRUTALIST_STICKERS.find(s => s.id === layer.url);

            return (
              <div
                key={layer.id}
                id={layer.id}
                data-type={layer.type === LayerType.VIDEO ? "video" : stickerPreset ? "sticker" : "image"}
                data-opacity={layer.opacity !== undefined ? layer.opacity : 1.0}
                data-rotation={layer.rotZ || 0}
                data-scale-x={scaleX}
                data-scale-y={scaleY}
                data-blend-mode={layer.blendMode || "normal"}
                data-sticker-id={stickerPreset ? stickerPreset.id : ""}
                onMouseDown={(e) => handleMouseDown(e, layer.id, false, layer.posX, layer.posY)}
                style={{
                  left: `${cssLeft}%`,
                  top: `${cssTop}%`,
                  width: `${scaleWidthPct}%`,
                  transform: `translate(-50%, -50%) rotate(${layer.rotZ || 0}deg) scale(${scaleX}, ${scaleY})`,
                  opacity: layer.opacity,
                  mixBlendMode: layer.blendMode as any,
                  zIndex: isFocused ? 50 : 25,
                }}
                className={`absolute select-none transition-shadow ${
                  layer.locked ? 'cursor-not-allowed opacity-80' : 'cursor-move'
                } ${
                  isFocused ? 'ring-2 ring-fuchsia-400 border-2 border-dashed border-fuchsia-400 bg-black/40' : 'hover:ring-1 hover:ring-white/40'
                }`}
              >
                {/* On-canvas Brutalist Frame Header */}
                {isFocused && (
                  <div className="absolute -top-6 left-0 right-0 h-5 bg-fuchsia-500 border-2 border-black flex items-center justify-between px-1 cursor-move">
                    <div className="flex items-center gap-1 text-[7px] font-black text-black font-mono">
                      {layer.locked ? <Lock size={8} /> : <Unlock size={8} />}
                      <span>{layer.name || layer.type.toUpperCase()}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button 
                        onMouseDown={(e) => { e.stopPropagation(); toggleLock(layer.id); }}
                        className="hover:bg-black/20 text-black p-0.5 rounded transition-colors"
                        title={layer.locked ? 'Unlock and drag' : 'Lock coordinates'}
                      >
                        {layer.locked ? <Unlock size={9} strokeWidth={2.5} /> : <Lock size={9} strokeWidth={2.5} />}
                      </button>
                      <button 
                        onMouseDown={(e) => { e.stopPropagation(); duplicateLayer(layer.id); }}
                        className="hover:bg-black/20 text-black p-0.5 rounded transition-colors"
                        title="Duplicate"
                      >
                        <Copy size={9} strokeWidth={2.5} />
                      </button>
                      <button 
                        onMouseDown={(e) => { e.stopPropagation(); deleteElement(layer.id, false); }}
                        className="hover:text-red-700 text-black p-0.5 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={9} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Layer Frame Container with absolute clipping/cropping */}
                <div 
                  style={{
                    clipPath: `polygon(${cropLeft}% ${cropTop}%, ${100 - cropRight}% ${cropTop}%, ${100 - cropRight}% ${100 - cropBottom}%, ${cropLeft}% ${100 - cropBottom}%)`
                  }}
                  className="w-full h-full p-1 bg-black/30 border-2 border-black flex items-center justify-center overflow-hidden"
                >
                  {/* Standard Uploaded Collage image */}
                  {layer.type === LayerType.IMAGE && !stickerPreset && layer.url && (
                    <img 
                      src={layer.url} 
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      className="w-full h-auto object-contain max-h-[40vh] pointer-events-none select-none" 
                      alt="collage component"
                    />
                  )}

                  {/* Built-in SVG Sticker */}
                  {layer.type === LayerType.IMAGE && stickerPreset && stickerPreset.type === 'svg' && stickerPreset.markup && (
                    <div 
                      className="w-full text-current select-none pointer-events-none"
                      style={{ color: stickerPreset.color }}
                      dangerouslySetInnerHTML={{ __html: stickerPreset.markup }}
                    />
                  )}

                  {/* Stamp alerts sticker */}
                  {layer.type === LayerType.IMAGE && stickerPreset && stickerPreset.type === 'retro-alert' && (
                    <div 
                      style={{ borderColor: stickerPreset.color }} 
                      className="w-full bg-black border-2 text-white p-2 text-center uppercase font-bold"
                    >
                      <div style={{ backgroundColor: stickerPreset.color }} className="text-black text-[10px] px-1 py-0.5 font-black tracking-wider leading-none">
                        {stickerPreset.badgeText}
                      </div>
                      <div className="text-[8px] font-mono mt-1 text-gray-300 max-w-full overflow-hidden truncate">
                        {stickerPreset.subText}
                      </div>
                    </div>
                  )}

                  {/* Collage Video/GIF compatibility */}
                  {layer.type === LayerType.VIDEO && layer.url && (
                    <video
                      src={layer.url}
                      crossOrigin="anonymous"
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-auto object-contain max-h-[40vh] pointer-events-none select-none"
                    />
                  )}

                  {/* Vector Shape */}
                  {layer.type === LayerType.SHAPE && (
                    <div className="w-full aspect-square border border-dashed border-white/20 p-2 text-center flex flex-col justify-center items-center">
                      <Sparkles size={16} className="text-[#2D70FF] animate-pulse" />
                      <span className="text-[7px] text-gray-400 mt-1 uppercase">{layer.shapeType || 'SHAPE_X'}</span>
                    </div>
                  )}

                  {/* Fallback info */}
                  {(!layer.url && layer.type !== LayerType.SHAPE) && (
                    <div className="p-2 text-[8px] text-gray-400 font-bold uppercase tracking-tight text-center">
                      EMPTY MEDIA
                    </div>
                  )}
                </div>

                {/* Locked Shield indicator */}
                {layer.locked && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 pointer-events-none">
                    <Lock size={16} className="text-rose-500 animate-pulse" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- WYXO ILLUSTRATOR DYNAMIC PROPERTY INSPECTOR --- */}
      <div className="w-full max-w-[1280px] mt-4 bg-[#080808] border-2 border-white text-white font-mono flex flex-col select-none shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]">
        
        {/* Module Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-2 border-b border-white bg-black gap-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={12} className="text-lime-400 animate-pulse" />
            <span style={{ fontFamily: 'Tektur, sans-serif' }} className="font-extrabold text-[10px] tracking-widest text-[#fff]">
              {activeElement ? 'VECTOR_PROPERTIES_CONSOLE' : 'ILLUSTRATOR_STANDBY'}
            </span>
          </div>
          {activeElement ? (
            <div className="flex items-center gap-2 text-[8px]">
              <span className="bg-lime-950 text-lime-400 border border-lime-500 px-1.5 py-0.5 rounded font-black font-mono">
                {activeElement.isText ? 'TYPOGRAPHY' : 'MEDIA_LAYER'} SELECTED
              </span>
              <button 
                onClick={() => setActiveElement(null)} 
                className="bg-white text-black font-black hover:bg-rose-500 hover:text-white px-2 py-0.5 border border-black uppercase text-[8px] transition-colors"
              >
                Clear Selection ✕
              </button>
            </div>
          ) : (
            <span className="text-[8px] text-gray-500">SELECT ANY ELEMENT ON CANVAS TO ACTIVATE LIVE EDITING</span>
          )}
        </div>

        {/* Console Body */}
        {activeElement ? (
          <div className="p-3 grid grid-cols-1 lg:grid-cols-12 gap-4">
            
            {/* Sidebar quick actions & metadata */}
            <div className="lg:col-span-3 border-r border-white/14 pr-3 flex flex-col justify-between gap-3">
              <div>
                <span className="text-[8px] text-gray-500 uppercase block tracking-wider mb-1">Layer details</span>
                {activeLayerData ? (
                  <div className="space-y-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[7px] text-gray-400">LAYER NAME</span>
                      <input 
                        type="text" 
                        value={activeLayerData.name || `${activeLayerData.type.toUpperCase()}_LAYER`}
                        onChange={(e) => {
                          const val = e.target.value;
                          setVjState(prev => ({
                            ...prev,
                            layers: prev.layers.map(l => l.id === activeLayerData.id ? { ...l, name: val } : l)
                          }));
                        }}
                        className="bg-black text-[9px] border border-white/20 p-1 font-bold text-lime-400 focus:border-lime-400 outline-none w-full"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[7px] text-gray-400">
                      <div>TYPE: <span className="text-white font-bold">{activeLayerData.type}</span></div>
                      <div>BLEND: <span className="text-white font-bold">{activeLayerData.blendMode}</span></div>
                      <div>POS X: <span className="text-white font-bold">{activeLayerData.posX.toFixed(0)}%</span></div>
                      <div>POS Y: <span className="text-white font-bold">{activeLayerData.posY.toFixed(0)}%</span></div>
                    </div>
                  </div>
                ) : activeTextData ? (
                  <div className="space-y-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[7px] text-gray-400">TEXT VALUE</span>
                      <input 
                        type="text" 
                        value={activeTextData.text}
                        onChange={(e) => {
                          const val = e.target.value;
                          setVjState(prev => ({
                            ...prev,
                            textOverlays: prev.textOverlays.map(t => t.id === activeTextData.id ? { ...t, text: val } : t)
                          }));
                        }}
                        className="bg-black text-[9px] border border-white/20 p-1 font-bold text-lime-400 focus:border-lime-400 outline-none w-full"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-[7px] text-gray-400">
                      <div>FONT: <span className="text-white font-bold">{activeTextData.font}</span></div>
                      <div>SIZE: <span className="text-white font-bold">{activeTextData.size}rem</span></div>
                      <div>POS X: <span className="text-white font-bold">{activeTextData.posX.toFixed(0)}%</span></div>
                      <div>POS Y: <span className="text-white font-bold">{activeTextData.posY.toFixed(0)}%</span></div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Depth reordering / Lock / Duplicate panel */}
              {activeLayerData && (
                <div className="space-y-1 pt-2 border-t border-white/10">
                  <span className="text-[7px] text-gray-500 uppercase block tracking-wider">Depth / Arrange</span>
                  <div className="grid grid-cols-2 gap-1 mb-1">
                    <button 
                      onClick={() => bringToFront(activeLayerData.id)} 
                      className="py-1 bg-zinc-900 hover:bg-white hover:text-black border border-white/20 text-[7px] font-black flex items-center justify-center gap-1 uppercase"
                    >
                      <ChevronUp size={10} /> Bring Front
                    </button>
                    <button 
                      onClick={() => sendToBack(activeLayerData.id)} 
                      className="py-1 bg-zinc-900 hover:bg-white hover:text-black border border-white/20 text-[7px] font-black flex items-center justify-center gap-1 uppercase"
                    >
                      <ChevronDown size={10} /> Send Back
                    </button>
                    <button 
                      onClick={() => moveUp(activeLayerData.id)} 
                      className="py-1 bg-zinc-900 hover:bg-white hover:text-black border border-white/20 text-[7px] font-black flex items-center justify-center gap-1 uppercase"
                    >
                      Move Forward
                    </button>
                    <button 
                      onClick={() => moveDown(activeLayerData.id)} 
                      className="py-1 bg-zinc-900 hover:bg-white hover:text-black border border-white/20 text-[7px] font-black flex items-center justify-center gap-1 uppercase"
                    >
                      Move Backward
                    </button>
                    <button 
                      onClick={() => {
                        setVjState(prev => ({
                          ...prev,
                          layers: prev.layers.map(l => l.id === activeLayerData.id ? { ...l, posX: 0, posY: 0 } : l)
                        }));
                      }}
                      className="col-span-2 py-1 bg-blue-950 hover:bg-blue-600 hover:text-white border border-blue-500 text-blue-300 text-[7px] font-black flex items-center justify-center gap-1 uppercase"
                    >
                      🎯 CENTER ON CANVAS
                    </button>
                    <button 
                      onClick={() => toggleLock(activeLayerData.id)} 
                      className={`col-span-2 py-1 border text-[7px] font-black flex items-center justify-center gap-1 uppercase transition-all ${
                        activeLayerData.locked 
                        ? 'bg-rose-950 border-rose-500 text-rose-300 hover:bg-rose-900' 
                        : 'bg-[#1c1c1e] border-white/20 text-gray-200 hover:bg-white hover:text-black'
                      }`}
                    >
                      {activeLayerData.locked ? '🔒 UNLOCK LAYER' : '🔓 LOCK POSITION'}
                    </button>
                  </div>
                </div>
              )}

              {activeTextData && (
                <div className="space-y-1 pt-2 border-t border-white/10">
                  <span className="text-[7px] text-gray-500 uppercase block tracking-wider">Arrange</span>
                  <div className="grid grid-cols-1 gap-1">
                    <button 
                      onClick={() => {
                        setVjState(prev => ({
                          ...prev,
                          textOverlays: prev.textOverlays.map(t => t.id === activeTextData.id ? { ...t, posX: 50, posY: 50 } : t)
                        }));
                      }}
                      className="py-1 bg-blue-950 hover:bg-blue-600 hover:text-white border border-blue-500 text-blue-300 text-[7px] font-black flex items-center justify-center gap-1 uppercase"
                    >
                      🎯 CENTER ON CANVAS
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Slider parameters control */}
            <div className="lg:col-span-9 flex flex-col gap-3">
              
              {/* Properties menu Tabs selection */}
              {!activeElement.isText && (
                <div className="flex border-b border-white/10 gap-2 mb-1">
                  {(['TRANSFORM', 'CROP', 'STYLING'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActivePropertyTab(tab)}
                      className={`pb-1.5 px-3 text-[9px] font-black tracking-tight border-b-2 uppercase transition-all ${
                        activePropertyTab === tab 
                        ? 'border-fuchsia-500 text-fuchsia-400' 
                        : 'border-transparent text-gray-400 hover:text-white'
                      }`}
                    >
                      {tab === 'TRANSFORM' && '↔ Size & Position'}
                      {tab === 'CROP' && '✂ Crop & Cut (Cortar)'}
                      {tab === 'STYLING' && '☄ Styling & Blends'}
                    </button>
                  ))}
                </div>
              )}

              {/* Rendering selected active menu configurations */}
              {activeLayerData ? (
                <>
                  {activePropertyTab === 'TRANSFORM' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <PropertySlider 
                          label="Proportional scale" 
                          value={activeLayerData.scale} 
                          min={0.1} 
                          max={5.0} 
                          step={0.05} 
                          onChange={v => updateLocalLayer(activeLayerData.id, { scale: v })} 
                        />
                        <PropertySlider 
                          label="Aspect Scale Width (scaleX)" 
                          value={activeLayerData.scaleX !== undefined ? activeLayerData.scaleX : 1.0} 
                          min={0.1} 
                          max={5.0} 
                          step={0.05} 
                          onChange={v => updateLocalLayer(activeLayerData.id, { scaleX: v })} 
                        />
                        <PropertySlider 
                          label="Aspect Scale Height (scaleY)" 
                          value={activeLayerData.scaleY !== undefined ? activeLayerData.scaleY : 1.0} 
                          min={0.1} 
                          max={5.0} 
                          step={0.05} 
                          onChange={v => updateLocalLayer(activeLayerData.id, { scaleY: v })} 
                        />
                      </div>
                      <div className="space-y-3">
                        <PropertySlider 
                          label="Z-Rotation angle" 
                          value={activeLayerData.rotZ || 0} 
                          min={0} 
                          max={360} 
                          step={1} 
                          onChange={v => updateLocalLayer(activeLayerData.id, { rotZ: v })} 
                        />
                        <PropertySlider 
                          label="Absolute X Position" 
                          value={activeLayerData.posX} 
                          min={-100} 
                          max={100} 
                          step={1} 
                          onChange={v => updateLocalLayer(activeLayerData.id, { posX: v })} 
                        />
                        <PropertySlider 
                          label="Absolute Y Position" 
                          value={activeLayerData.posY} 
                          min={-100} 
                          max={100} 
                          step={1} 
                          onChange={v => updateLocalLayer(activeLayerData.id, { posY: v })} 
                        />
                      </div>
                    </div>
                  )}

                  {activePropertyTab === 'CROP' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <PropertySlider 
                          label="CROP LEFT (%)" 
                          value={activeLayerData.cropLeft || 0} 
                          min={0} 
                          max={90} 
                          step={1} 
                          onChange={v => updateLocalLayer(activeLayerData.id, { cropLeft: v })} 
                        />
                        <PropertySlider 
                          label="CROP RIGHT (%)" 
                          value={activeLayerData.cropRight || 0} 
                          min={0} 
                          max={90} 
                          step={1} 
                          onChange={v => updateLocalLayer(activeLayerData.id, { cropRight: v })} 
                        />
                        <div className="flex justify-end pt-2">
                          <button 
                            onClick={() => updateLocalLayer(activeLayerData.id, { cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 })}
                            className="bg-zinc-950 py-1.5 px-3 border border-red-500/40 text-red-400 font-extrabold hover:bg-rose-500 hover:text-white transition-all text-[8px] uppercase"
                          >
                            Reset Crop
                          </button>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <PropertySlider 
                          label="CROP TOP (%)" 
                          value={activeLayerData.cropTop || 0} 
                          min={0} 
                          max={90} 
                          step={1} 
                          onChange={v => updateLocalLayer(activeLayerData.id, { cropTop: v })} 
                        />
                        <PropertySlider 
                          label="CROP BOTTOM (%)" 
                          value={activeLayerData.cropBottom || 0} 
                          min={0} 
                          max={90} 
                          step={1} 
                          onChange={v => updateLocalLayer(activeLayerData.id, { cropBottom: v })} 
                        />
                        <p className="text-[7.5px] text-gray-500 italic mt-2 uppercase leading-tight font-black">
                          * Click, Drag and Crop controls let you isolate and format layers neatly, resembling Photoshop and Webflow.
                        </p>
                      </div>
                    </div>
                  )}

                  {activePropertyTab === 'STYLING' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <PropertySlider 
                          label="Opacity" 
                          value={activeLayerData.opacity} 
                          min={0.0} 
                          max={1.0} 
                          step={0.05} 
                          onChange={v => updateLocalLayer(activeLayerData.id, { opacity: v })} 
                        />
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[8px] uppercase font-black tracking-wider text-gray-400">LAYER BLEND MODE</span>
                          <select 
                            value={activeLayerData.blendMode}
                            onChange={(e) => updateLocalLayer(activeLayerData.id, { blendMode: e.target.value })}
                            className="bg-black hover:border-lime-400 transition-colors border border-white/20 p-1.5 text-[9px] font-black uppercase text-lime-400 focus:outline-none"
                          >
                            <option value="normal">Normal</option>
                            <option value="multiply">Multiply</option>
                            <option value="screen">Screen</option>
                            <option value="overlay">Overlay</option>
                            <option value="darken">Darken</option>
                            <option value="lighten">Lighten</option>
                            <option value="color-dodge">Color Dodge</option>
                            <option value="color-burn">Color Burn</option>
                            <option value="hard-light">Hard Light</option>
                            <option value="difference">Difference</option>
                            <option value="exclusion">Exclusion</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-col justify-end">
                        <div className="p-3 border-2 border-white/10 bg-white/5 space-y-1.5 select-none rounded">
                          <span className="text-[8px] uppercase tracking-wider text-fuchsia-400 font-bold">MUTATION & SYNC</span>
                          <p className="text-[7.5px] leading-normal text-gray-300 uppercase">
                            Use the Canvas layer controls or rearrange their order in the Left Layers column sidebar tree hierarchy.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : activeTextData ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <PropertySlider 
                      label="FONT SIZE (REM)" 
                      value={activeTextData.size} 
                      min={0.5} 
                      max={10.0} 
                      step={0.1} 
                      onChange={v => {
                        setVjState(prev => ({
                          ...prev,
                          textOverlays: prev.textOverlays.map(t => t.id === activeTextData.id ? { ...t, size: v } : t)
                        }));
                      }} 
                    />
                    <PropertySlider 
                      label="OPACITY" 
                      value={activeTextData.opacity} 
                      min={0.0} 
                      max={1.0} 
                      step={0.05} 
                      onChange={v => {
                        setVjState(prev => ({
                          ...prev,
                          textOverlays: prev.textOverlays.map(t => t.id === activeTextData.id ? { ...t, opacity: v } : t)
                        }));
                      }} 
                    />
                    <div className="flex flex-col gap-1">
                      <span className="text-[8px] uppercase font-black text-gray-400">FONT STYLING</span>
                      <select 
                        value={activeTextData.font}
                        onChange={(e) => {
                          const val = e.target.value;
                          setVjState(prev => ({
                            ...prev,
                            textOverlays: prev.textOverlays.map(t => t.id === activeTextData.id ? { ...t, font: val } : t)
                          }));
                        }}
                        className="bg-black border border-white/20 p-1 font-bold text-[9px] uppercase"
                      >
                        <option value="Inter">Inter (Sans)</option>
                        <option value="Tektur">Tektur (Tech)</option>
                        <option value="Impact">Industrial Impact</option>
                        <option value="Courier New">Terminal Mono</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-3 font-mono text-[8px]">
                    <div className="flex flex-col gap-1">
                      <span className="text-[8px] uppercase font-black text-gray-400">TEXT COLOR HEX</span>
                      <div className="flex gap-1">
                        <input 
                          type="color" 
                          value={activeTextData.color} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setVjState(prev => ({
                              ...prev,
                              textOverlays: prev.textOverlays.map(t => t.id === activeTextData.id ? { ...t, color: val } : t)
                            }));
                          }}
                          className="w-10 h-7 bg-transparent cursor-pointer p-0 select-none border-0"
                        />
                        <input 
                          type="text" 
                          value={activeTextData.color} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setVjState(prev => ({
                              ...prev,
                              textOverlays: prev.textOverlays.map(t => t.id === activeTextData.id ? { ...t, color: val } : t)
                            }));
                          }}
                          className="bg-black border border-white/20 px-2 py-1 flex-1 font-bold select-text uppercase"
                        />
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 pt-2">
                      <input 
                        type="checkbox" 
                        id="outline_chk"
                        checked={activeTextData.outline}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setVjState(prev => ({
                            ...prev,
                            textOverlays: prev.textOverlays.map(t => t.id === activeTextData.id ? { ...t, outline: val } : t)
                          }));
                        }}
                        className="accent-lime-400 h-3 w-3"
                      />
                      <label htmlFor="outline_chk" className="cursor-pointer tracking-wider text-[8px] uppercase font-bold text-gray-200">
                        OUTLINE & STROKE EFFECT
                      </label>
                    </div>

                    <button 
                      onClick={() => {
                        duplicateText(activeTextData.id);
                      }}
                      className="w-full mt-2 py-1.5 bg-zinc-900 hover:bg-white hover:text-black border border-white/20 font-black uppercase text-[8px]"
                    >
                      Duplicate Typography
                    </button>
                  </div>
                </div>
              ) : null}

            </div>
          </div>
        ) : (
          <div className="p-4 text-center text-gray-600 text-[9px] uppercase tracking-widest font-black flex flex-col items-center justify-center gap-2">
            <span>NO LAYER CURRENTLY SELECTED // COLLAGE TIPS</span>
            <p className="text-[7.5px] max-w-xl normal-case text-gray-400 font-normal">
              Click elements directly on the Canvas above to activate our custom layout properties console. You can resize, stretch, crop sides, modify opacity, layer overlay depth, and rotate objects with precise pixels and visual tools on the go.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  function updateLocalLayer(id: string, updates: Partial<LayerItem>) {
    setVjState(prev => ({
      ...prev,
      layers: prev.layers.map(l => l.id === id ? { ...l, ...updates } : l)
    }));
  }
};

// Internal reusable lightweight range slider with beautiful neobrutalist handles
interface PropertySliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
}

const PropertySlider: React.FC<PropertySliderProps> = ({ label, value, min, max, step = 1, onChange }) => {
  return (
    <div className="flex flex-col gap-1 font-mono text-[8px] select-none">
      <div className="flex justify-between items-center text-gray-400">
        <span className="uppercase font-bold tracking-tight">{label}</span>
        <span className="bg-zinc-900 border border-white/10 px-1 py-0.5 font-bold text-white leading-none">
          {value !== undefined ? value.toFixed(step >= 0.1 ? 2 : 0) : 0}
        </span>
      </div>
      <input 
        type="range"
        min={min}
        max={max}
        step={step}
        value={value !== undefined ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-zinc-900 border border-white/10 rounded appearance-none outline-none cursor-pointer accent-fuchsia-500"
      />
    </div>
  );
};
