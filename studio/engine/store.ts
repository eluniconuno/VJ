import {
  Clip, Composition, EffectInstance, FrameContext, Layer, ParamDef, ParamMap, ParamValue, Selection,
} from './types';
import { GENERATOR_MAP } from './generators';
import { EFFECT_MAP } from './effects';
import { PALETTES } from './glsl';

const STORAGE_KEY = 'vyxo-studio-composition-v2';

export const uid = () => Math.random().toString(36).slice(2, 10);

function paramsFrom(defs: ParamDef[], overrides: Record<string, number> = {}): ParamMap {
  const out: ParamMap = {};
  for (const d of defs) {
    out[d.key] = {
      value: overrides[d.key] ?? d.default,
      mod: { src: d.mod?.src ?? 'none', amount: d.mod?.amount ?? 0, rate: d.mod?.rate ?? 4 },
    };
  }
  return out;
}

/** Garante que o ParamMap tem todas as chaves de `defs` (ex.: após atualizar o app). */
export function syncParams(defs: ParamDef[], params: ParamMap) {
  for (const d of defs) if (!params[d.key]) params[d.key] = paramsFrom([d])[d.key];
}

export function makeEffect(type: string, overrides?: Record<string, number>, mix = 1): EffectInstance {
  const def = EFFECT_MAP[type];
  return { id: uid(), type, enabled: true, mix, params: paramsFrom(def.params, overrides) };
}

export function makeClip(
  generator: string,
  opts: { name?: string; palette?: number; params?: Record<string, number>; effects?: EffectInstance[]; speed?: number } = {},
): Clip {
  const def = GENERATOR_MAP[generator];
  return {
    id: uid(),
    name: opts.name ?? def.name,
    generator,
    params: paramsFrom(def.params, opts.params),
    palette: opts.palette ?? def.defaultPalette ?? 0,
    speed: opts.speed ?? 1,
    drive: 0.3,
    effects: opts.effects ?? [],
  };
}

export function cloneClip(c: Clip): Clip {
  const copy: Clip = JSON.parse(JSON.stringify(c));
  copy.id = uid();
  copy.effects.forEach(e => (e.id = uid()));
  return copy;
}

function makeLayer(name: string, columns: number, clips: (Clip | null)[], extra: Partial<Layer> = {}): Layer {
  const row = Array.from({ length: columns }, (_, i) => clips[i] ?? null);
  return {
    id: uid(), name, opacity: 1, blend: 'normal', group: '-', bypass: false, solo: false,
    transition: 0.6, active: -1, clips: row, ...extra,
  };
}

/** Liga uma modulação a um parâmetro do clip (usado nos presets). */
function withMod(clip: Clip, key: string, mod: Partial<ParamValue['mod']>): Clip {
  Object.assign(clip.params[key].mod, mod);
  return clip;
}

export function defaultComposition(): Composition {
  const columns = 8;
  const fx = makeEffect;
  const sculpt = (name: string, params: Record<string, number>, palette = 0, effects: EffectInstance[] = []) =>
    makeClip('sculptor', { name, params, palette, effects });

  const bg = makeLayer('Fundo', columns, [
    makeClip('liquid', { effects: [fx('feedback', { decay: 0.85, zoom: 0.4 }, 0.6)] }),
    makeClip('tunnel', { effects: [fx('rgb', { amount: 0.15 })] }),
    makeClip('julia', { effects: [fx('feedback', { decay: 0.8, rotate: 0.5 }, 0.5)] }),
    makeClip('hypno', { effects: [fx('warp', { amount: 0.15 })] }),
    makeClip('chladni', { effects: [fx('feedback', { decay: 0.82, zoom: 1.2, hue: 0.4 }, 0.8)] }),
    makeClip('cells', { effects: [fx('kaleido', { segments: 6 })] }),
    makeClip('horizon', { effects: [fx('film', { scan: 0.4 })] }),
    makeClip('media'),
  ], { active: 0 });

  const ray = makeLayer('Esculturas 3D', columns, [
    makeClip('gyroid'),
    makeClip('metal'),
    makeClip('mandelbulb', { effects: [fx('feedback', { decay: 0.75, zoom: 0.8 }, 0.5)] }),
    makeClip('ribbon'),
    makeClip('crystal'),
  ], { blend: 'screen', opacity: 0.9 });

  const parts = makeLayer('Partículas', columns, [
    withMod(sculpt('Esfera ↔ Nó', { shapeA: 0, shapeB: 10, noiseMode: 1 }), 'mix', { src: 'sine', amount: 1, rate: 16 }),
    sculpt('Atrator de Lorenz', { shapeA: 25, material: 0, mathA: 10, mathB: 28, mathC: 2.666, mathD: 1, colorMode: 2, noiseMode: 3, dist: 4 }, 4),
    sculpt('Superfórmula Maciça', { shapeA: 24, material: 7, mathA: 6, mathB: 1, mathC: 1, mathD: 1, colorMode: 1, noiseMode: 2, shapeNoise: 0.3 }, 2),
    sculpt('Mandala de Estrelas', { shapeA: 27, material: 3, size: 0.8, mathA: 8, mathB: 2, mathC: 3, mathD: 1, noiseMode: 4, noiseAmt: 0.6, rotX: 0.9 }, 1),
    withMod(sculpt('DNA em Linhas', { shapeA: 5, material: 4, noiseMode: 10, noiseAmt: 0.5 }, 5), 'twist', { src: 'sine', amount: 0.15, rate: 8 }),
    sculpt('Coração Estelar', { shapeA: 21, material: 3, noiseMode: 2, size: 1.2, symmetry: 0 }, 10),
    sculpt('Terreno Sonoro', { shapeA: 11, material: 4, noiseMode: 6, noiseAmt: 1.5, rotX: 0.45, dist: 3.2, colorMode: 3, spin: 0.05 }, 2,
      [fx('feedback', { decay: 0.8, zoom: 0.3 }, 0.6)]),
    sculpt('Mandelbulb Fractal', { shapeA: 26, mathA: 8, mathB: 5, mathC: 1, mathD: 0, colorMode: 2, noiseMode: 0, material: 3 }, 0),
  ], { blend: 'add', opacity: 1, active: 0 });

  const over = makeLayer('Overlay', columns, [
    makeClip('scope'),
    makeClip('spectrum'),
    makeClip('shapes'),
    makeClip('scope', { name: 'Osciloscópio Circular', params: { polar: 1, lines: 2 }, effects: [fx('feedback', { decay: 0.9, zoom: -0.6, hue: 0.5 })] }),
    makeClip('shapes', { name: 'Hexágonos', params: { sides: 6, count: 5 }, palette: 5 }),
    Object.assign(makeClip('text', { name: 'Texto: música', effects: [fx('glitch', { amount: 0.2 })] }), { text: '{musica}', font: 'Tektur' }),
  ], { blend: 'add', opacity: 0.8 });

  return {
    version: 1,
    name: 'Nova composição',
    columns,
    layers: [bg, ray, parts, over],
    crossfader: 0,
    bpm: 120,
    autoBpm: true,
    audioGain: 1,
    reactivity: 1,
    master: {
      opacity: 1, bloom: 0.35, bloomRadius: 0.35, bloomThreshold: 0.4, palette: 0, quality: 1, resW: 1280, resH: 720,
      effects: [makeEffect('film', { vignette: 0.6, grain: 0.04 })],
    },
    midi: [],
    autopilot: { on: false, bars: 8, mode: 'next' },
  };
}

// ---------------------------------------------------------------------------
// Modulação
// ---------------------------------------------------------------------------
const hash1 = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

export function modSignal(pv: ParamValue, ctx: FrameContext): number {
  const m = pv.mod;
  const ph = ctx.beats / Math.max(m.rate, 0.0625);
  switch (m.src) {
    case 'bass': return ctx.bass * ctx.reactivity;
    case 'mid': return ctx.mid * ctx.reactivity;
    case 'high': return ctx.high * ctx.reactivity;
    case 'level': return ctx.level * ctx.reactivity;
    case 'beat': return ctx.beatPulse * ctx.reactivity;
    case 'sine': return 0.5 - 0.5 * Math.cos(ph * Math.PI * 2);
    case 'saw': return ph - Math.floor(ph);
    case 'square': return ph - Math.floor(ph) < 0.5 ? 1 : 0;
    case 'random': return hash1(Math.floor(ph));
    default: return 0;
  }
}

export function evalParam(def: ParamDef, pv: ParamValue | undefined, ctx: FrameContext): number {
  if (!pv) return def.default;
  let v = pv.value;
  if (pv.mod.src !== 'none' && pv.mod.amount !== 0) {
    v += pv.mod.amount * (def.max - def.min) * modSignal(pv, ctx);
  }
  return Math.min(def.max, Math.max(def.min, v));
}

// ---------------------------------------------------------------------------
// Randomização ("inspirar") e mutação
// ---------------------------------------------------------------------------
function randomizeParams(defs: ParamDef[], params: ParamMap, strength: number) {
  for (const d of defs) {
    const pv = params[d.key];
    if (!pv) continue;
    const range = d.max - d.min;
    let v = strength >= 1
      ? d.default + (d.min + Math.random() * range - d.default) * 0.7
      : pv.value + (Math.random() - 0.5) * range * strength;
    if (d.step) v = Math.round(v / d.step) * d.step;
    pv.value = Math.min(d.max, Math.max(d.min, v));
  }
}

export function randomizeClip(clip: Clip, strength: number) {
  const def = GENERATOR_MAP[clip.generator];
  randomizeParams(def.params, clip.params, strength);
  clip.effects.forEach(e => randomizeParams(EFFECT_MAP[e.type].params, e.params, strength * 0.5));
  if (strength >= 1) clip.palette = Math.floor(Math.random() * PALETTES.length);
}

// ---------------------------------------------------------------------------
// Store observável
// ---------------------------------------------------------------------------
type Listener = () => void;

class Store {
  comp: Composition;
  selection: Selection = { kind: 'clip', layer: 0, col: 0 };
  midiLearn = false;
  learnTarget: string | null = null;
  version = 0;
  private listeners = new Set<Listener>();
  private saveTimer: number | undefined;

  constructor() {
    this.comp = this.load() ?? defaultComposition();
  }

  subscribe = (fn: Listener) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;

  /** Muta a composição e notifica a UI. */
  update(fn: (c: Composition) => void, persist = true) {
    fn(this.comp);
    this.touch(persist);
  }

  touch(persist = true) {
    this.version++;
    this.listeners.forEach(l => l());
    if (persist) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = window.setTimeout(() => this.save(), 600);
    }
  }

  select(sel: Selection) {
    this.selection = sel;
    this.touch(false);
  }

  selectedClip(): Clip | null {
    const s = this.selection;
    if (s.kind !== 'clip') return null;
    return this.comp.layers[s.layer]?.clips[s.col] ?? null;
  }

  trigger(layer: number, col: number) {
    this.update(c => {
      const l = c.layers[layer];
      if (!l) return;
      l.active = l.clips[col] ? col : -1;
    });
  }

  triggerColumn(col: number) {
    this.update(c => c.layers.forEach(l => { if (l.clips[col]) l.active = col; }));
  }

  findClip(id: string): Clip | null {
    for (const l of this.comp.layers) for (const c of l.clips) if (c?.id === id) return c;
    return null;
  }

  replace(comp: Composition) {
    this.comp = comp;
    this.selection = { kind: 'clip', layer: 0, col: 0 };
    this.touch();
  }

  private serialize(): string {
    // URLs blob:/webcam não sobrevivem a um recarregamento
    return JSON.stringify(this.comp, (k, v) => (k === 'url' && typeof v === 'string' && v.startsWith('blob:') ? undefined : v));
  }

  save() {
    try { localStorage.setItem(STORAGE_KEY, this.serialize()); } catch { /* cota ou modo privado */ }
  }

  exportJson(): string { return this.serialize(); }

  importJson(text: string) {
    const c = JSON.parse(text) as Composition;
    if (c.version !== 1 || !Array.isArray(c.layers)) throw new Error('Arquivo de composição inválido');
    this.normalize(c);
    this.replace(c);
  }

  private load(): Composition | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const c = JSON.parse(raw) as Composition;
      if (c.version !== 1) return null;
      this.normalize(c);
      return c;
    } catch {
      return null;
    }
  }

  /** Remove referências a geradores/efeitos que não existem mais e completa params. */
  private normalize(c: Composition) {
    for (const l of c.layers) {
      l.clips = l.clips.map(clip => {
        if (!clip || !GENERATOR_MAP[clip.generator]) return null;
        syncParams(GENERATOR_MAP[clip.generator].params, clip.params);
        clip.effects = clip.effects.filter(e => EFFECT_MAP[e.type]);
        clip.effects.forEach(e => syncParams(EFFECT_MAP[e.type].params, e.params));
        return clip;
      });
      while (l.clips.length < c.columns) l.clips.push(null);
    }
    c.master.effects = c.master.effects.filter(e => EFFECT_MAP[e.type]);
    c.master.resW = c.master.resW || 1280;
    c.master.resH = c.master.resH || 720;
    c.midi = c.midi ?? [];
    c.autopilot = c.autopilot ?? { on: false, bars: 8, mode: 'next' };
  }
}

export const store = new Store();
