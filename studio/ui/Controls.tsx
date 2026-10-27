import React, { useRef, useState } from 'react';
import { ModSource, ParamDef, ParamValue } from '../engine/types';
import { store } from '../engine/store';
import { MOD_COLORS, MOD_LABELS, runtime, useRaf } from './hooks';

const MOD_SOURCES: ModSource[] = ['none', 'bass', 'mid', 'high', 'level', 'beat', 'sine', 'saw', 'square', 'random'];
const RATES = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64];
const LFO = new Set<ModSource>(['sine', 'saw', 'square', 'random']);

function fmt(v: number, step?: number) {
  if (step && step >= 1) return String(Math.round(v));
  return Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
}

/** Aplica MIDI learn no clique; devolve true se consumiu o evento. */
function learnClick(target?: string) {
  if (!target || !store.midiLearn) return false;
  store.learnTarget = target;
  store.touch(false);
  return true;
}

function useMidiState(target?: string) {
  const mapped = !!target && store.comp.midi.some(m => m.target === target);
  const learning = !!target && store.midiLearn && store.learnTarget === target;
  return { mapped, learning, learnMode: store.midiLearn && !!target };
}

// ---------------------------------------------------------------------------

interface FaderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  def?: number;
  onChange: (v: number) => void;
  midiTarget?: string;
  liveKey?: string;
  accent?: string;
  compact?: boolean;
  format?: (v: number) => string;
}

/** Barra arrastável. Shift = ajuste fino, duplo clique = valor padrão. */
export const Fader: React.FC<FaderProps> = ({
  label, value, min, max, step, def, onChange, midiTarget, liveKey, accent = '#b6ff3b', compact, format,
}) => {
  const bar = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; v: number } | null>(null);
  const midi = useMidiState(midiTarget);
  const range = max - min;
  const pct = Math.max(0, Math.min(1, (value - min) / range));

  useRaf(() => {
    if (!liveKey || !marker.current) return;
    const v = runtime.engine?.live.get(liveKey);
    if (v === undefined) { marker.current.style.opacity = '0'; return; }
    marker.current.style.opacity = '1';
    marker.current.style.left = `${Math.max(0, Math.min(1, (v - min) / range)) * 100}%`;
  });

  const setFromX = (clientX: number, fine: boolean) => {
    const el = bar.current!;
    const r = el.getBoundingClientRect();
    let v: number;
    if (fine && drag.current) {
      v = drag.current.v + ((clientX - drag.current.x) / r.width) * range * 0.1;
    } else {
      v = min + ((clientX - r.left) / r.width) * range;
    }
    if (step) v = Math.round(v / step) * step;
    onChange(Math.max(min, Math.min(max, v)));
  };

  return (
    <div className={compact ? '' : 'mb-1.5'}>
      {!compact && (
        <div className="flex justify-between text-[10px] leading-4 text-white/60 select-none">
          <span className="truncate">{label}</span>
          <span className="tabular-nums text-white/80">{format ? format(value) : fmt(value, step)}</span>
        </div>
      )}
      <div
        ref={bar}
        title={compact ? `${label}: ${format ? format(value) : fmt(value, step)}` : undefined}
        className={`relative ${compact ? 'h-4' : 'h-3.5'} rounded-sm bg-white/[0.06] cursor-ew-resize touch-none overflow-hidden
          ${midi.learning ? 'ring-2 ring-fuchsia-400 animate-pulse' : midi.learnMode ? 'ring-1 ring-fuchsia-400/60' : ''}`}
        onPointerDown={e => {
          if (learnClick(midiTarget)) return;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, v: value };
          if (!e.shiftKey) setFromX(e.clientX, false);
        }}
        onPointerMove={e => { if (drag.current) setFromX(e.clientX, e.shiftKey); }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => def !== undefined && onChange(def)}
      >
        <div className="absolute inset-y-0 left-0" style={{ width: `${pct * 100}%`, background: accent, opacity: 0.55 }} />
        <div ref={marker} className="absolute inset-y-0 w-[2px] -ml-[1px] bg-white shadow-[0_0_6px_#fff] opacity-0" />
        {compact && <span className="absolute inset-0 px-1 text-[9px] leading-4 text-white/80 truncate pointer-events-none">{label}</span>}
        {midi.mapped && <span className="absolute right-0.5 top-0 text-[8px] text-fuchsia-300">M</span>}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

interface ParamProps {
  def: ParamDef;
  pv: ParamValue;
  liveKey: string;
  midiTarget: string;
  label?: string;
  onValue?: (v: number) => void;
}

/** Escolha entre opções: botões se forem poucas, lista se forem muitas. */
const OptionPicker: React.FC<{ def: ParamDef; value: number; label: string; onChange: (v: number) => void }> = ({ def, value, label, onChange }) => {
  const opts = def.options!;
  const cur = Math.round(value);
  return (
    <div className="mb-1.5">
      <div className="text-[10px] leading-4 text-white/60">{label}</div>
      {opts.length <= 8 ? (
        <div className="flex flex-wrap gap-0.5">
          {opts.map((o, i) => (
            <button key={o} onClick={() => onChange(i)}
              className={`rounded-sm border px-1.5 py-0.5 text-[10px] ${cur === i ? 'border-lime-300 bg-lime-300 text-black font-bold' : 'border-white/10 text-white/60 hover:text-white'}`}>
              {o}
            </button>
          ))}
        </div>
      ) : (
        <select value={cur} onChange={e => onChange(Number(e.target.value))}
          className="h-6 w-full rounded-sm border border-white/15 bg-black px-1 text-[11px] outline-none focus:border-lime-300">
          {opts.map((o, i) => <option key={o} value={i}>{o}</option>)}
        </select>
      )}
    </div>
  );
};

/** Parâmetro com modulação (áudio/LFO). */
export const ParamControl: React.FC<ParamProps> = ({ def, pv, liveKey, midiTarget, label, onValue }) => {
  const [open, setOpen] = useState(false);
  const m = pv.mod;
  const active = m.src !== 'none' && m.amount !== 0;
  const set = (fn: () => void) => store.update(() => fn());
  const setValue = (v: number) => { set(() => (pv.value = v)); onValue?.(v); };

  return (
    <div className="mb-1.5">
      <div className="flex items-end gap-1">
        <div className="flex-1 min-w-0">
          {def.options ? (
            <OptionPicker def={def} value={pv.value} label={label ?? def.label} onChange={setValue} />
          ) : (
            <Fader
              label={label ?? def.label} value={pv.value} min={def.min} max={def.max} step={def.step} def={def.default}
              liveKey={liveKey} midiTarget={midiTarget} accent={active ? MOD_COLORS[m.src] : '#b6ff3b'}
              onChange={setValue}
            />
          )}
        </div>
        <button
          onClick={() => setOpen(!open)}
          title="Modulação (áudio / LFO)"
          className="mb-1.5 h-3.5 w-6 rounded-sm text-[9px] font-bold leading-none border"
          style={{
            borderColor: active ? MOD_COLORS[m.src] : 'rgba(255,255,255,.15)',
            color: active ? MOD_COLORS[m.src] : 'rgba(255,255,255,.4)',
            background: open ? 'rgba(255,255,255,.08)' : 'transparent',
          }}
        >∿</button>
      </div>
      {open && (
        <div className="mb-2 rounded-sm border border-white/10 bg-white/[0.03] p-1.5">
          <div className="mb-1 flex flex-wrap gap-0.5">
            {MOD_SOURCES.map(s => (
              <button
                key={s}
                onClick={() => set(() => { m.src = s; if (s !== 'none' && m.amount === 0) m.amount = 0.25; })}
                className="rounded-sm px-1 py-0.5 text-[9px] border"
                style={{
                  borderColor: m.src === s ? MOD_COLORS[s] : 'transparent',
                  color: m.src === s ? MOD_COLORS[s] : 'rgba(255,255,255,.5)',
                }}
              >{MOD_LABELS[s]}</button>
            ))}
          </div>
          {m.src !== 'none' && (
            <>
              <Fader label="Quantidade" value={m.amount} min={-1} max={1} def={0} accent={MOD_COLORS[m.src]}
                onChange={v => set(() => (m.amount = v))} />
              {LFO.has(m.src) && (
                <div className="flex items-center gap-1 text-[9px] text-white/60">
                  <span>Ciclo (batidas)</span>
                  {RATES.map(r => (
                    <button key={r} onClick={() => set(() => (m.rate = r))}
                      className={`px-1 rounded-sm ${m.rate === r ? 'bg-white/20 text-white' : 'hover:text-white'}`}>
                      {r < 1 ? `1/${1 / r}` : r}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; tone?: string }> = ({
  active, tone = '#b6ff3b', className = '', style, children, ...rest
}) => (
  <button
    {...rest}
    className={`h-7 px-2 rounded-sm border text-[10px] font-bold uppercase tracking-wider transition-colors
      disabled:opacity-30 ${active ? 'text-black' : 'text-white/80 hover:text-white border-white/15 hover:border-white/40'} ${className}`}
    style={active ? { background: tone, borderColor: tone, ...style } : style}
  >{children}</button>
);

export const Section: React.FC<{ title: string; right?: React.ReactNode; children: React.ReactNode }> = ({ title, right, children }) => (
  <div className="border-b border-white/10 px-3 py-2.5">
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50" style={{ fontFamily: 'Tektur, monospace' }}>{title}</h3>
      {right}
    </div>
    {children}
  </div>
);

export { learnClick, useMidiState };
