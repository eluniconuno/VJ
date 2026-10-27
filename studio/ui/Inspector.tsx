import React, { useRef, useState } from 'react';
import { Clip, EffectInstance } from '../engine/types';
import { cloneClip, makeClip, makeEffect, randomizeClip, store, syncParams } from '../engine/store';
import { GEN_CATEGORIES, GENERATOR_MAP, GENERATORS } from '../engine/generators';
import { SHAPE_MATH } from '../engine/sculptor';
import { spotify } from '../engine/spotify';
import { EFFECT_MAP, EFFECTS } from '../engine/effects';
import { PALETTES, paletteCss } from '../engine/glsl';
import { Btn, Fader, ParamControl, Section } from './Controls';
import { useStore } from './hooks';

export const TEXT_FONTS = ['Tektur', 'Monoton', 'Rubik Glitch', 'Syne', 'Orbitron', 'Press Start 2P', 'Permanent Marker', 'Bebas Neue', 'Space Grotesk', 'JetBrains Mono'];

const RESOLUTIONS: [string, number, number][] = [
  ['720p', 1280, 720], ['1080p', 1920, 1080], ['Vertical 9:16', 1080, 1920], ['Quadrado', 1080, 1080], ['4K', 3840, 2160],
];

export const Inspector: React.FC = () => {
  const s = useStore();
  const [tab, setTab] = useState<'clip' | 'master'>('clip');
  const showMaster = tab === 'master';
  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-white/10">
        {(['clip', 'master'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-[0.2em] ${tab === t ? 'bg-white/[0.06] text-lime-300' : 'text-white/40 hover:text-white'}`}
            style={{ fontFamily: 'Tektur, monospace' }}>
            {t === 'clip' ? 'Clip' : 'Master'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto custom-scroll">
        {showMaster ? <MasterPanel /> : <ClipPanel key={s.selection.kind === 'clip' ? `${s.selection.layer}:${s.selection.col}` : 'x'} />}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

const ClipPanel: React.FC = () => {
  const sel = store.selection;
  if (sel.kind !== 'clip') return <Empty text="Selecione uma célula na grade." />;
  const layer = store.comp.layers[sel.layer];
  if (!layer) return <Empty text="Selecione uma célula na grade." />;
  const clip = layer.clips[sel.col];
  if (!clip) return <Library layer={sel.layer} col={sel.col} />;
  return <ClipEditor clip={clip} layerIdx={sel.layer} col={sel.col} />;
};

const Empty: React.FC<{ text: string }> = ({ text }) => <div className="p-6 text-center text-[11px] text-white/40">{text}</div>;

const Library: React.FC<{ layer: number; col: number }> = ({ layer, col }) => {
  const create = (gen: string) => {
    store.update(c => {
      c.layers[layer].clips[col] = makeClip(gen);
      c.layers[layer].active = col;
    });
  };
  return (
    <div className="p-3">
      <p className="mb-3 text-[11px] text-white/50">Célula vazia — escolha um gerador para criar um clip:</p>
      {GEN_CATEGORIES.map(cat => (
        <div key={cat} className="mb-3">
          <h4 className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-white/40">{cat}</h4>
          <div className="grid grid-cols-1 gap-1">
            {GENERATORS.filter(g => g.category === cat).map(g => (
              <button key={g.id} onClick={() => create(g.id)}
                className="rounded-sm border border-white/10 px-2 py-1.5 text-left hover:border-lime-300 hover:bg-white/[0.04]">
                <div className="text-[11px] font-bold text-white/90">{g.name}</div>
                <div className="text-[10px] leading-snug text-white/45">{g.description}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const ClipEditor: React.FC<{ clip: Clip; layerIdx: number; col: number }> = ({ clip, layerIdx, col }) => {
  const def = GENERATOR_MAP[clip.generator];
  const upd = (fn: () => void) => store.update(() => fn());
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Section title="Clip" right={<span className="text-[9px] text-white/30">{def.category}</span>}>
        <input
          value={clip.name}
          onChange={e => upd(() => (clip.name = e.target.value))}
          className="mb-2 w-full rounded-sm border border-white/10 bg-black px-2 py-1 text-[12px] font-bold outline-none focus:border-lime-300"
        />
        <select
          value={clip.generator}
          onChange={e => upd(() => {
            const g = GENERATOR_MAP[e.target.value];
            if (clip.name === def.name) clip.name = g.name;
            clip.generator = g.id;
            clip.params = {};
            syncParams(g.params, clip.params);
          })}
          className="mb-2 w-full rounded-sm border border-white/10 bg-black px-2 py-1 text-[11px] outline-none"
        >
          {GEN_CATEGORIES.map(cat => (
            <optgroup key={cat} label={cat}>
              {GENERATORS.filter(g => g.category === cat).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </optgroup>
          ))}
        </select>
        <p className="mb-2 text-[10px] leading-snug text-white/45">{def.description}</p>
        <div className="flex flex-wrap gap-1">
          <Btn title="Gera uma variação nova (parâmetros + paleta)" onClick={() => upd(() => randomizeClip(clip, 1))}>🎲 Inspirar</Btn>
          <Btn title="Pequena variação dos valores atuais" onClick={() => upd(() => randomizeClip(clip, 0.15))}>Mutar</Btn>
          <Btn onClick={() => store.update(c => {
            const row = c.layers[layerIdx].clips;
            const t = row.findIndex((x, k) => k > col && !x);
            if (t >= 0) row[t] = cloneClip(clip);
          })}>Duplicar</Btn>
          <Btn className="!text-red-300" onClick={() => store.update(c => {
            const l = c.layers[layerIdx];
            l.clips[col] = null;
            if (l.active === col) l.active = -1;
          })}>Excluir</Btn>
        </div>
      </Section>

      {def.kind === 'media' && (
        <Section title="Fonte de mídia">
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={e => {
            const f = e.target.files?.[0];
            if (!f) return;
            upd(() => (clip.media = { kind: f.type.startsWith('video') ? 'video' : 'image', url: URL.createObjectURL(f), name: f.name }));
            e.target.value = '';
          }} />
          <div className="flex gap-1">
            <Btn onClick={() => fileRef.current?.click()}>Arquivo…</Btn>
            <Btn active={clip.media?.kind === 'webcam'} onClick={() => upd(() => (clip.media = { kind: 'webcam', name: 'Webcam' }))}>Webcam</Btn>
            <Btn active={clip.media?.kind === 'spotify'} tone="#1DB954" onClick={() => upd(() => (clip.media = { kind: 'spotify', name: 'Capa do Spotify' }))}>Capa Spotify</Btn>
          </div>
          <p className="mt-1.5 text-[10px] text-white/45">
            {!clip.media ? 'Nenhuma mídia carregada.'
              : clip.media.kind === 'spotify' ? (spotify.connected ? 'Mostra a capa da música que está tocando.' : 'Conecte o Spotify no botão do topo.')
              : clip.media.url || clip.media.kind === 'webcam' ? clip.media.name : `${clip.media.name ?? 'mídia'} — recarregue o arquivo`}
          </p>
        </Section>
      )}

      {def.kind === 'text' && (
        <Section title="Texto">
          <textarea
            value={clip.text ?? ''}
            onChange={e => upd(() => (clip.text = e.target.value))}
            rows={2}
            className="mb-1.5 w-full resize-y rounded-sm border border-white/10 bg-black px-2 py-1 text-[12px] outline-none focus:border-lime-300"
          />
          <select value={clip.font ?? 'Tektur'} onChange={e => upd(() => (clip.font = e.target.value))}
            className="h-6 w-full rounded-sm border border-white/15 bg-black px-1 text-[11px] outline-none">
            {TEXT_FONTS.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select>
          <p className="mt-1.5 text-[10px] text-white/40">Use <b className="text-white/70">{'{musica}'}</b> para mostrar “Artista — Música” do Spotify.</p>
        </Section>
      )}

      <Section title="Paleta">
        <div className="grid grid-cols-4 gap-1">
          {PALETTES.map((p, i) => (
            <button key={p.name} title={p.name} onClick={() => upd(() => (clip.palette = i))}
              className={`h-6 rounded-sm border ${clip.palette === i ? 'border-white' : 'border-transparent opacity-70 hover:opacity-100'}`}
              style={{ background: paletteCss(p) }} />
          ))}
        </div>
      </Section>

      <Section title="Movimento">
        <Fader label="Velocidade" value={clip.speed} min={0} max={4} def={1} onChange={v => upd(() => (clip.speed = v))} />
        <Fader label="Áudio acelera o tempo" value={clip.drive} min={0} max={2} def={0.3} onChange={v => upd(() => (clip.drive = v))} />
      </Section>

      <GenParams clip={clip} />

      <EffectChain effects={clip.effects} owner={clip.id} />
    </>
  );
};

// ---------------------------------------------------------------------------

/** Parâmetros do gerador, agrupados em seções quando o gerador define grupos. */
const GenParams: React.FC<{ clip: Clip }> = ({ clip }) => {
  const def = GENERATOR_MAP[clip.generator];
  const groups: string[] = [];
  def.params.forEach(p => { const g = p.group ?? 'Parâmetros'; if (!groups.includes(g)) groups.push(g); });
  const shapeA = Math.round(clip.params.shapeA?.value ?? -1);
  const math = SHAPE_MATH[shapeA];

  return (
    <>
      {groups.map((g, gi) => (
        <Collapsible key={g} title={g} defaultOpen={gi < 2 || g === 'Material e cor' || groups.length === 1}
          right={gi === 0 ? <span className="text-[9px] text-white/30">∿ = modular por som/LFO</span> : undefined}>
          {g === 'Matemática' && (
            <p className="mb-1.5 text-[10px] text-white/40">
              {math ? 'Controla a forma A atual.' : 'Usado por Superfórmula, Atrator de Lorenz, Mandelbulb e Mandala sagrada.'}
            </p>
          )}
          {def.params.filter(p => (p.group ?? 'Parâmetros') === g).map(p => {
            const mi = ['mathA', 'mathB', 'mathC', 'mathD'].indexOf(p.key);
            return (
              <ParamControl
                key={p.key} def={p} pv={clip.params[p.key]}
                liveKey={`${clip.id}:${p.key}`} midiTarget={`param:${clip.id}:gen:${p.key}`}
                label={mi >= 0 && math ? math.labels[mi] : undefined}
                onValue={p.key === 'shapeA' ? v => {
                  // ao escolher uma forma matemática, aplica os valores sugeridos
                  const m = SHAPE_MATH[Math.round(v)];
                  if (m) store.update(() => ['mathA', 'mathB', 'mathC', 'mathD'].forEach((k, i) => (clip.params[k].value = m.defaults[i])));
                } : undefined}
              />
            );
          })}
        </Collapsible>
      ))}
    </>
  );
};

const Collapsible: React.FC<{ title: string; defaultOpen?: boolean; right?: React.ReactNode; children: React.ReactNode }> = ({ title, defaultOpen = true, right, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/10 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <button onClick={() => setOpen(!open)} className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 hover:text-white" style={{ fontFamily: 'Tektur, monospace' }}>
          {open ? '▾' : '▸'} {title}
        </button>
        {right}
      </div>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
};

const EffectChain: React.FC<{ effects: EffectInstance[]; owner: string }> = ({ effects, owner }) => {
  const upd = (fn: () => void) => store.update(() => fn());
  return (
    <Section
      title="Efeitos"
      right={
        <select
          value=""
          onChange={e => { const t = e.target.value; if (t) upd(() => effects.push(makeEffect(t))); }}
          className="h-5 rounded-sm border border-lime-300/40 bg-black text-[10px] text-lime-300 outline-none"
        >
          <option value="">+ adicionar</option>
          {EFFECTS.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      }
    >
      {effects.length === 0 && <p className="text-[10px] text-white/35">Sem efeitos. Experimente “Feedback Infinito” para rastros psicodélicos.</p>}
      {effects.map((fx, i) => <EffectCard key={fx.id} fx={fx} index={i} effects={effects} owner={owner} />)}
    </Section>
  );
};

const EffectCard: React.FC<{ fx: EffectInstance; index: number; effects: EffectInstance[]; owner: string }> = ({ fx, index, effects, owner }) => {
  const [open, setOpen] = useState(true);
  const def = EFFECT_MAP[fx.type];
  const upd = (fn: () => void) => store.update(() => fn());
  const move = (d: number) => upd(() => {
    const j = index + d;
    if (j < 0 || j >= effects.length) return;
    [effects[index], effects[j]] = [effects[j], effects[index]];
  });
  return (
    <div className={`mb-1.5 rounded-sm border ${fx.enabled ? 'border-white/15' : 'border-white/5 opacity-50'} bg-white/[0.02]`}>
      <div className="flex items-center gap-1 px-1.5 py-1">
        <button onClick={() => upd(() => (fx.enabled = !fx.enabled))} title="Ligar/desligar"
          className={`h-3 w-3 rounded-full border ${fx.enabled ? 'border-lime-300 bg-lime-300' : 'border-white/30'}`} />
        <button onClick={() => setOpen(!open)} className="flex-1 truncate text-left text-[11px] font-bold text-white/85" title={def.description}>
          {open ? '▾' : '▸'} {def.name}
        </button>
        <button onClick={() => move(-1)} className="px-0.5 text-[10px] text-white/40 hover:text-white">↑</button>
        <button onClick={() => move(1)} className="px-0.5 text-[10px] text-white/40 hover:text-white">↓</button>
        <button onClick={() => upd(() => effects.splice(index, 1))} className="px-0.5 text-[10px] text-white/40 hover:text-red-400">✕</button>
      </div>
      {open && (
        <div className="px-1.5 pb-1">
          <Fader label="Mix" value={fx.mix} min={0} max={1} def={1} accent="#36d6ff"
            midiTarget={`param:${owner}:${fx.id}:__mix`} onChange={v => upd(() => (fx.mix = v))} />
          {def.params.map(p => (
            <ParamControl key={p.key} def={p} pv={fx.params[p.key]} liveKey={`${fx.id}:${p.key}`} midiTarget={`param:${owner}:${fx.id}:${p.key}`} />
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const MasterPanel: React.FC = () => {
  const c = store.comp;
  const m = c.master;
  const upd = (fn: () => void) => store.update(() => fn());
  return (
    <>
      <Section title="Saída">
        <Fader label="Opacidade master" value={m.opacity} min={0} max={1} def={1} midiTarget="master:opacity" onChange={v => upd(() => (m.opacity = v))} />
        <div className="mb-2 mt-1 flex flex-wrap gap-1">
          {RESOLUTIONS.map(([label, w, h]) => (
            <Btn key={label} active={m.resW === w && m.resH === h} onClick={() => upd(() => { m.resW = w; m.resH = h; })}>{label}</Btn>
          ))}
        </div>
        <Fader label="Qualidade dos clips" value={m.quality} min={0.35} max={1} def={1}
          format={v => `${Math.round(v * 100)}%`} onChange={v => upd(() => (m.quality = v))} />
        <p className="text-[10px] text-white/40">Se o FPS cair, reduza a qualidade ou use 720p.</p>
      </Section>

      <Section title="Bloom (brilho)">
        <Fader label="Intensidade" value={m.bloom} min={0} max={3} def={0.35} onChange={v => upd(() => (m.bloom = v))} />
        <Fader label="Raio" value={m.bloomRadius} min={0} max={1} def={0.35} onChange={v => upd(() => (m.bloomRadius = v))} />
        <Fader label="Limiar" value={m.bloomThreshold} min={0} max={1} def={0.4} onChange={v => upd(() => (m.bloomThreshold = v))} />
      </Section>

      <Section title="Áudio">
        <Fader label="Reatividade global" value={c.reactivity} min={0} max={3} def={1} accent="#ff3b6b" onChange={v => upd(() => (c.reactivity = v))} />
        <Fader label="Ganho de entrada" value={c.audioGain} min={0} max={4} def={1} accent="#ff3b6b" onChange={v => upd(() => (c.audioGain = v))} />
      </Section>

      <Section title="Paleta dos efeitos master">
        <div className="grid grid-cols-4 gap-1">
          {PALETTES.map((p, i) => (
            <button key={p.name} title={p.name} onClick={() => upd(() => (m.palette = i))}
              className={`h-5 rounded-sm border ${m.palette === i ? 'border-white' : 'border-transparent opacity-70 hover:opacity-100'}`}
              style={{ background: paletteCss(p) }} />
          ))}
        </div>
      </Section>

      <EffectChain effects={m.effects} owner="master" />
    </>
  );
};
