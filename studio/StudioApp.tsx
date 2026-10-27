import React, { useEffect, useRef, useState } from 'react';
import { Engine } from './engine/renderer';
import { randomizeClip, store } from './engine/store';
import { Clip } from './engine/types';
import { GENERATOR_MAP } from './engine/generators';
import { spotify } from './engine/spotify';
import { mediaBlockedReason } from './engine/audio';
import { initMidi, setTapHandler } from './engine/io';
import { TopBar } from './ui/TopBar';
import { ClipGrid } from './ui/ClipGrid';
import { Inspector } from './ui/Inspector';
import { runtime, useRaf, useStore } from './ui/hooks';

/** Escultura que o mouse controla: a selecionada, senão a ativa mais alta. */
function sculptTarget(): Clip | null {
  const sel = store.selectedClip();
  if (sel?.generator === 'sculptor') return sel;
  const layers = store.comp.layers;
  for (let i = layers.length - 1; i >= 0; i--) {
    const c = layers[i].clips[layers[i].active];
    if (layers[i].active >= 0 && c?.generator === 'sculptor') return c;
  }
  return null;
}

function nudge(clip: Clip, key: string, delta: number) {
  const def = GENERATOR_MAP.sculptor.params.find(p => p.key === key)!;
  const pv = clip.params[key];
  pv.value = Math.min(def.max, Math.max(def.min, pv.value + delta));
}

const Preview: React.FC<{ hostRef: React.RefObject<HTMLDivElement> }> = ({ hostRef }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const errRef = useRef<HTMLDivElement>(null);
  const s = useStore();
  const { resW, resH } = s.comp.master;

  useEffect(() => {
    const engine = new Engine(canvasRef.current!);
    runtime.engine = engine;
    setTapHandler(() => engine.tap());
    engine.start();
    return () => { engine.dispose(); runtime.engine = null; };
  }, []);

  const drag = useRef<{ x: number; y: number; shift: boolean } | null>(null);

  /** Posição do mouse em NDC dentro da imagem (o canvas usa object-fit: contain). */
  const toNdc = (e: React.PointerEvent | React.WheelEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const scale = Math.min(r.width / resW, r.height / resH);
    const w = resW * scale, h = resH * scale;
    const x = (e.clientX - (r.left + (r.width - w) / 2)) / w;
    const y = (e.clientY - (r.top + (r.height - h) / 2)) / h;
    return { x: x * 2 - 1, y: 1 - y * 2, inside: x >= 0 && x <= 1 && y >= 0 && y <= 1 };
  };

  const onMove = (e: React.PointerEvent) => {
    const eng = runtime.engine;
    const p = toNdc(e);
    if (eng) eng.mouse.set(p.inside ? p.x : 9, p.inside ? p.y : 9);
    const d = drag.current;
    const clip = d && sculptTarget();
    if (!d || !clip) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.x = e.clientX; d.y = e.clientY;
    store.update(() => {
      if (e.shiftKey) { nudge(clip, 'posX', dx * 0.01); nudge(clip, 'posY', -dy * 0.01); }
      else { nudge(clip, 'rotY', dx * 0.01); nudge(clip, 'rotX', dy * 0.01); }
    });
  };

  useRaf(() => {
    const e = runtime.engine;
    if (errRef.current) {
      errRef.current.textContent = e?.error ?? '';
      errRef.current.style.display = e?.error ? 'block' : 'none';
    }
  });

  return (
    <div ref={hostRef} className="relative flex h-full w-full items-center justify-center bg-black">
      <canvas
        ref={canvasRef}
        className="h-full w-full touch-none"
        style={{ objectFit: 'contain' }}
        onPointerMove={onMove}
        onPointerDown={e => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, shift: e.shiftKey }; }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => { runtime.engine?.mouse.set(9, 9); }}
        onWheel={e => {
          const clip = sculptTarget();
          if (clip) store.update(() => nudge(clip, 'scale', -e.deltaY * 0.001));
        }}
      />
      <div ref={errRef} className="absolute left-2 top-2 hidden max-w-[80%] rounded-sm bg-red-600/90 px-2 py-1 text-[11px] text-white" />
      <div className="pointer-events-none absolute bottom-1 right-2 text-[9px] text-white/30">{resW}×{resH}</div>
    </div>
  );
};

export const StudioApp: React.FC = () => {
  const [toast, setToast] = useState<string | null>(null);
  const [midiDevices, setMidiDevices] = useState<string[]>([]);
  const [hideUI, setHideUI] = useState(false);
  const previewHost = useRef<HTMLDivElement>(null);
  useStore();

  const fullscreen = () => {
    const el = previewHost.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen();
  };

  useEffect(() => { initMidi(setMidiDevices); spotify.init(); }, []);

  // acesso pelo console do navegador para depuração
  if (import.meta.env.DEV) (window as any).__vyxo = { store, runtime };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key >= '1' && e.key <= '9') {
        const col = Number(e.key) - 1;
        if (col < store.comp.columns) store.triggerColumn(col);
      } else if (e.code === 'Space') {
        e.preventDefault();
        runtime.engine?.tap();
      } else if (e.key === 'f' || e.key === 'F') {
        fullscreen();
      } else if (e.key === 'h' || e.key === 'H') {
        setHideUI(h => !h);
      } else if (e.key === 'Escape') {
        if (store.midiLearn) { store.midiLearn = false; store.learnTarget = null; store.touch(false); }
      } else if ((e.key === 'r' || e.key === 'R') && store.selection.kind === 'clip') {
        // R = inspirar o clip selecionado
        const clip = store.selectedClip();
        if (clip) store.update(() => randomizeClip(clip, 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#050507] font-mono text-white">
      {!hideUI && <TopBar onError={setToast} midiDevices={midiDevices} onFullscreen={fullscreen} />}
      {!hideUI && mediaBlockedReason() && (
        <div className="shrink-0 border-b border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-[11px] text-amber-200">
          ⚠ {mediaBlockedReason()}{' '}
          {location.port && (
            <a className="font-bold underline" href={`http://127.0.0.1:${location.port}${location.pathname}`}>Abrir em 127.0.0.1</a>
          )}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className={`min-h-0 ${hideUI ? 'flex-1' : 'h-[52%]'} border-b border-white/10`}>
            <Preview hostRef={previewHost} />
          </div>
          {!hideUI && (
            <div className="min-h-0 flex-1 overflow-auto custom-scroll">
              <ClipGrid />
              <p className="px-3 pb-3 text-[10px] text-white/30">
                Clique = disparar · Arrastar = mover (Alt = copiar) · Botão direito = opções · 1–8 colunas · Espaço = tap · R = inspirar · F = tela cheia · H = esconder interface
              </p>
            </div>
          )}
        </div>
        {!hideUI && (
          <aside className="w-[340px] shrink-0 border-l border-white/10 bg-[#08080b]">
            <Inspector />
          </aside>
        )}
      </div>
      {store.midiLearn && !hideUI && (
        <div className="pointer-events-none fixed bottom-3 left-1/2 -translate-x-1/2 rounded-sm bg-fuchsia-500 px-3 py-1.5 text-[11px] font-bold text-black">
          MIDI LEARN: clique num controle e mova um knob/fader/pad no controlador · Esc para sair
        </div>
      )}
      {toast && (
        <div className="fixed bottom-3 right-3 max-w-sm rounded-sm border border-red-400 bg-black px-3 py-2 text-[11px] text-red-300 shadow-xl" onClick={() => setToast(null)}>
          {toast}
        </div>
      )}
    </div>
  );
};
