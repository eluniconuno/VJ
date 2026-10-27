import React, { useState } from 'react';
import { BLEND_MODES, BlendMode, CrossGroup } from '../engine/types';
import { cloneClip, store, uid } from '../engine/store';
import { GENERATOR_MAP } from '../engine/generators';
import { PALETTES, paletteCss } from '../engine/glsl';
import { Fader, learnClick, useMidiState } from './Controls';
import { useStore } from './hooks';

const CAT_COLORS: Record<string, string> = {
  'Psicodélico': '#c77dff', 'Escultura': '#36d6ff', 'Partículas': '#ffb02e', 'Overlay': '#b6ff3b', 'Mídia': '#ff7de9',
};

const BLEND_LABEL: Record<BlendMode, string> = {
  normal: 'Normal', add: 'Somar', screen: 'Tela', multiply: 'Multiplicar',
  difference: 'Diferença', overlay: 'Sobrepor', lighten: 'Clarear', subtract: 'Subtrair',
};

const ColumnButton: React.FC<{ col: number }> = ({ col }) => {
  const target = `col:${col}`;
  const midi = useMidiState(target);
  return (
    <button
      onClick={() => { if (!learnClick(target)) store.triggerColumn(col); }}
      title={`Disparar coluna ${col + 1} (tecla ${col + 1})`}
      className={`h-6 rounded-sm border text-[10px] font-bold text-white/60 hover:text-black hover:bg-lime-300 border-white/10
        ${midi.learning ? 'ring-2 ring-fuchsia-400 animate-pulse' : midi.learnMode ? 'ring-1 ring-fuchsia-400/60' : ''}`}
    >{col + 1}{midi.mapped && <sup className="text-fuchsia-300">M</sup>}</button>
  );
};

export const ClipGrid: React.FC = () => {
  const s = useStore();
  const comp = s.comp;
  const [dragFrom, setDragFrom] = useState<{ layer: number; col: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; layer: number; col: number } | null>(null);
  const sel = s.selection;
  const rows = comp.layers.map((l, i) => ({ l, i })).reverse(); // camada de cima primeiro
  const gridCols = `200px repeat(${comp.columns}, minmax(84px, 1fr))`;

  const drop = (layer: number, col: number, copy: boolean) => {
    if (!dragFrom) return;
    const from = dragFrom;
    setDragFrom(null);
    if (from.layer === layer && from.col === col) return;
    store.update(c => {
      const src = c.layers[from.layer].clips[from.col];
      if (!src) return;
      const dst = c.layers[layer].clips[col];
      c.layers[layer].clips[col] = copy ? cloneClip(src) : src;
      if (!copy) c.layers[from.layer].clips[from.col] = dst;
    });
    store.select({ kind: 'clip', layer, col });
  };

  return (
    <div className="select-none" onClick={() => setMenu(null)}>
      <div className="grid gap-1 px-2 pt-2" style={{ gridTemplateColumns: gridCols }}>
        <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-white/40">
          <span>Camadas</span>
          <button
            className="ml-auto rounded-sm border border-white/10 px-1.5 text-white/60 hover:text-white"
            onClick={() => store.update(c => c.layers.push({
              id: uid(), name: `Camada ${c.layers.length + 1}`, opacity: 1, blend: 'add', group: '-',
              bypass: false, solo: false, transition: 0.6, active: -1, clips: Array(c.columns).fill(null),
            }))}
          >+ camada</button>
        </div>
        {Array.from({ length: comp.columns }, (_, col) => <ColumnButton key={col} col={col} />)}

        {rows.map(({ l, i }) => (
          <React.Fragment key={l.id}>
            <LayerHeader index={i} />
            {l.clips.map((clip, col) => {
              const isActive = l.active === col && !!clip;
              const isSel = sel.kind === 'clip' && sel.layer === i && sel.col === col;
              const def = clip ? GENERATOR_MAP[clip.generator] : null;
              return (
                <div
                  key={col}
                  draggable={!!clip}
                  onDragStart={() => setDragFrom({ layer: i, col })}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => drop(i, col, e.altKey || e.ctrlKey)}
                  onClick={() => {
                    store.select({ kind: 'clip', layer: i, col });
                    if (clip) store.trigger(i, col);
                  }}
                  onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, layer: i, col }); }}
                  className={`relative h-[58px] cursor-pointer overflow-hidden rounded-sm border transition-colors
                    ${clip ? 'bg-white/[0.04] hover:bg-white/[0.09]' : 'border-dashed bg-transparent hover:bg-white/[0.03]'}
                    ${isActive ? 'border-lime-300 shadow-[0_0_12px_rgba(182,255,59,.35)]' : isSel ? 'border-fuchsia-400' : 'border-white/10'}`}
                  style={isSel && isActive ? { outline: '1px solid #e879f9', outlineOffset: 1 } : undefined}
                >
                  {clip && def ? (
                    <>
                      <div className="absolute left-0 top-0 h-full w-[3px]" style={{ background: CAT_COLORS[def.category] }} />
                      <div className="px-2 pt-1.5 text-[10px] font-bold leading-tight text-white/90 line-clamp-2">{clip.name}</div>
                      <div className="px-2 text-[8px] uppercase tracking-wider text-white/35">
                        {def.category}{clip.effects.length ? ` · ${clip.effects.length} fx` : ''}
                      </div>
                      <div className="absolute inset-x-0 bottom-0 h-[4px]" style={{ background: paletteCss(PALETTES[clip.palette] ?? PALETTES[0]) }} />
                      {isActive && <div className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-lime-300 animate-pulse" />}
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center text-[16px] text-white/15">+</div>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      <Crossfader />

      {menu && (
        <div
          className="fixed z-50 min-w-[160px] rounded-sm border border-white/20 bg-[#0c0c0f] py-1 text-[11px] shadow-xl"
          style={{ left: menu.x, top: menu.y }}
        >
          {[
            ['Duplicar à direita', () => store.update(c => {
              const row = c.layers[menu.layer].clips;
              const src = row[menu.col];
              const target = row.findIndex((x, k) => k > menu.col && !x);
              if (src && target >= 0) row[target] = cloneClip(src);
            })],
            ['Parar camada', () => store.update(c => (c.layers[menu.layer].active = -1))],
            ['Limpar célula', () => store.update(c => {
              const l = c.layers[menu.layer];
              l.clips[menu.col] = null;
              if (l.active === menu.col) l.active = -1;
            })],
          ].map(([label, fn]) => (
            <button key={label as string} className="block w-full px-3 py-1 text-left text-white/80 hover:bg-white/10"
              onClick={() => { (fn as () => void)(); setMenu(null); }}>{label as string}</button>
          ))}
        </div>
      )}
    </div>
  );
};

const LayerHeader: React.FC<{ index: number }> = ({ index }) => {
  const l = store.comp.layers[index];
  const nextGroup: Record<CrossGroup, CrossGroup> = { '-': 'A', A: 'B', B: '-' };
  const upd = (fn: () => void) => store.update(() => fn());
  return (
    <div className="flex h-[58px] flex-col justify-between rounded-sm border border-white/10 bg-white/[0.02] p-1.5">
      <div className="flex items-center gap-1">
        <input
          value={l.name}
          onChange={e => upd(() => (l.name = e.target.value))}
          className="w-0 flex-1 bg-transparent text-[10px] font-bold text-white/90 outline-none"
        />
        <button title="Grupo do crossfader" onClick={() => upd(() => (l.group = nextGroup[l.group]))}
          className={`w-5 rounded-sm border text-[9px] font-bold ${l.group === '-' ? 'border-white/10 text-white/30' : 'border-sky-400 text-sky-300'}`}>
          {l.group}
        </button>
        <button title="Solo" onClick={() => upd(() => (l.solo = !l.solo))}
          className={`w-5 rounded-sm border text-[9px] font-bold ${l.solo ? 'border-amber-300 bg-amber-300 text-black' : 'border-white/10 text-white/40'}`}>S</button>
        <button title="Desligar camada" onClick={() => upd(() => (l.bypass = !l.bypass))}
          className={`w-5 rounded-sm border text-[9px] font-bold ${l.bypass ? 'border-red-400 bg-red-500 text-black' : 'border-white/10 text-white/40'}`}>B</button>
        <button title="Parar" onClick={() => upd(() => (l.active = -1))}
          className="w-5 rounded-sm border border-white/10 text-[9px] text-white/40 hover:text-white">■</button>
      </div>
      <div className="flex items-center gap-1">
        <select
          value={l.blend}
          onChange={e => upd(() => (l.blend = e.target.value as BlendMode))}
          className="h-4 w-[72px] bg-black text-[9px] text-white/70 outline-none border border-white/10 rounded-sm"
        >
          {BLEND_MODES.map(b => <option key={b} value={b}>{BLEND_LABEL[b]}</option>)}
        </select>
        <div className="flex-1">
          <Fader compact label="Opacidade" value={l.opacity} min={0} max={1} def={1}
            midiTarget={`layer:${l.id}:opacity`} onChange={v => upd(() => (l.opacity = v))} />
        </div>
      </div>
      <div className="flex items-center gap-1">
        <div className="flex-1">
          <Fader compact label={`Fade ${l.transition.toFixed(1)}s`} value={l.transition} min={0} max={4} def={0.6}
            accent="#36d6ff" onChange={v => upd(() => (l.transition = v))} />
        </div>
        {store.comp.layers.length > 1 && (
          <button title="Remover camada" className="text-[9px] text-white/25 hover:text-red-400"
            onClick={() => { if (confirm(`Remover a camada "${l.name}"?`)) store.update(c => c.layers.splice(index, 1)); }}>✕</button>
        )}
      </div>
    </div>
  );
};

const Crossfader: React.FC = () => {
  const comp = store.comp;
  return (
    <div className="flex items-center gap-2 px-2 py-2">
      <span className="w-[200px] text-[9px] uppercase tracking-widest text-white/40">Crossfader</span>
      <span className="text-[11px] font-black text-sky-300">A</span>
      <div className="flex-1 max-w-[520px]">
        <Fader compact label="" value={comp.crossfader} min={0} max={1} def={0.5} accent="#36d6ff"
          midiTarget="xf" onChange={v => store.update(c => (c.crossfader = v))} />
      </div>
      <span className="text-[11px] font-black text-sky-300">B</span>
      <span className="text-[9px] text-white/30">camadas marcadas A/B respondem ao crossfader</span>
    </div>
  );
};
