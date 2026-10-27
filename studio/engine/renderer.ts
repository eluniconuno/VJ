import * as THREE from 'three';
// @ts-ignore - módulo de exemplo do three sem tipos neste setup
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BlendMode, BLEND_MODES, Clip, Composition, EffectInstance, FrameContext, Layer } from './types';
import { GENERATOR_MAP, GeneratorDef } from './generators';
import { SCULPTOR_FRAG, SCULPTOR_VERT } from './sculptor';
import { spotify } from './spotify';
import { EFFECT_MAP } from './effects';
import { COMMON_FUNCS, COMMON_UNIFORMS, FULLSCREEN_VERT, PALETTES, paramDefines } from './glsl';
import { evalParam, store } from './store';
import { audio, mediaBlockedReason, SPECTRUM_BINS } from './audio';

type RT = THREE.WebGLRenderTarget;
type Uniforms = Record<string, THREE.IUniform>;

function makeRT(w: number, h: number, depth = false): RT {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: depth,
  });
}

function baseUniforms(audioTex: THREE.Texture): Uniforms {
  return {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uBeat: { value: 0 },
    uBeats: { value: 0 },
    uBass: { value: 0 },
    uMid: { value: 0 },
    uHigh: { value: 0 },
    uLevel: { value: 0 },
    uAudio: { value: audioTex },
    uP: { value: new Array(48).fill(0) },
    uPalA: { value: new THREE.Vector3() },
    uPalB: { value: new THREE.Vector3() },
    uPalC: { value: new THREE.Vector3() },
    uPalD: { value: new THREE.Vector3() },
  };
}

const quadMaterial = (fragmentShader: string, uniforms: Uniforms) =>
  new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });

const BLEND_FRAG = /* glsl */ `
uniform sampler2D tBase;
uniform sampler2D tLayer;
uniform float uOpacity;
uniform int uMode;
varying vec2 vUv;
void main() {
  vec4 B = texture2D(tBase, vUv);
  vec4 L = texture2D(tLayer, vUv);
  vec3 b = B.rgb, l = L.rgb, r;
  vec3 bc = clamp(b, 0.0, 1.0), lc = clamp(l, 0.0, 1.0);
  if (uMode == 0) r = l;
  else if (uMode == 1) r = b + l;
  else if (uMode == 2) r = 1.0 - (1.0 - bc) * (1.0 - lc) + max(l - 1.0, 0.0);
  else if (uMode == 3) r = b * l;
  else if (uMode == 4) r = abs(b - l);
  else if (uMode == 5) r = mix(2.0 * bc * lc, 1.0 - 2.0 * (1.0 - bc) * (1.0 - lc), step(0.5, bc));
  else if (uMode == 6) r = max(b, l);
  else r = max(b - l, 0.0);
  gl_FragColor = vec4(mix(b, r, L.a * uOpacity), 1.0);
}`;

const MIX_FRAG = /* glsl */ `
uniform sampler2D tA;
uniform sampler2D tB;
uniform float uT;
varying vec2 vUv;
void main() { gl_FragColor = mix(texture2D(tA, vUv), texture2D(tB, vUv), uT); }`;

const OUTPUT_FRAG = /* glsl */ `
uniform sampler2D tInput;
uniform float uOpacity;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture2D(tInput, vUv).rgb * uOpacity;
  c = c / (1.0 + max(c - 1.0, 0.0)); // compressão suave acima de 1
  c += (h(gl_FragCoord.xy) - 0.5) / 255.0; // dither contra banding
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

/** Grade G×G de partículas com uv e aleatórios; `topo` define as primitivas. */
function gridGeometry(G: number, topo: 'points' | 'strip' | 'rows' | 'wire' | 'tris'): THREE.BufferGeometry {
  const N = G * G;
  const idx = new Float32Array(N), uv = new Float32Array(N * 2), rnd = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const x = i % G, y = Math.floor(i / G);
    idx[i] = i;
    if (topo === 'points') { // jitter dentro da célula evita padrão de grade
      uv[i * 2] = (x + Math.random()) / G;
      uv[i * 2 + 1] = (y + Math.random()) / G;
    } else {
      uv[i * 2] = x / (G - 1);
      uv[i * 2 + 1] = y / (G - 1);
    }
    rnd[i * 3] = Math.random(); rnd[i * 3 + 1] = Math.random(); rnd[i * 3 + 2] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('aIdx', new THREE.BufferAttribute(idx, 1));
  geo.setAttribute('aUV', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 3));
  const index: number[] = [];
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const i = y * G + x;
    if ((topo === 'rows' || topo === 'wire') && x < G - 1) index.push(i, i + 1);
    if (topo === 'wire' && y < G - 1) index.push(i, i + G);
    if (topo === 'tris' && x < G - 1 && y < G - 1) index.push(i, i + G, i + 1, i + 1, i + G, i + G + 1);
  }
  if (index.length) geo.setIndex(index);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  return geo;
}

interface ShapeTrack { cur: number; prev: number; start: number; }

interface SculptRuntime {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  uniforms: Uniforms;
  mats: THREE.ShaderMaterial[];
  objs: THREE.Object3D[]; // pontos, linhas, espiral, wireframe, maciço
  a: ShapeTrack;
  b: ShapeTrack;
}

// ---------------------------------------------------------------------------

interface FxRuntime { mat: THREE.ShaderMaterial; hist?: [RT, RT]; }

/** Par de buffers ping-pong + efeitos. Usado por clips e pelo master. */
class Chain {
  a: RT;
  b: RT;
  fx = new Map<string, FxRuntime>();
  w = 0;
  h = 0;
  lastUsed = 0;

  constructor() { this.a = makeRT(2, 2); this.b = makeRT(2, 2); }

  resize(w: number, h: number) {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.a.setSize(w, h);
    this.b.setSize(w, h);
    this.fx.forEach(f => f.hist?.forEach(r => r.setSize(w, h)));
  }

  other(cur: RT): RT { return cur === this.a ? this.b : this.a; }

  dispose() {
    this.a.dispose(); this.b.dispose();
    this.fx.forEach(f => { f.mat.dispose(); f.hist?.forEach(r => r.dispose()); });
  }
}

interface MediaRuntime {
  key: string;
  tex: THREE.Texture | null;
  aspect: number;
  video?: HTMLVideoElement;
  stream?: MediaStream;
}

class ClipRuntime extends Chain {
  genId = '';
  mat: THREE.ShaderMaterial | null = null;
  time = 0;
  sculpt?: SculptRuntime;
  media?: MediaRuntime;
  text?: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; key: string };

  dispose() {
    super.dispose();
    this.mat?.dispose();
    this.sculpt?.mats.forEach(m => m.dispose()); // geometrias são compartilhadas
    this.text?.tex.dispose();
    disposeMedia(this.media);
  }
}

function disposeMedia(m?: MediaRuntime) {
  if (!m) return;
  m.tex?.dispose();
  m.video?.pause();
  m.stream?.getTracks().forEach(t => t.stop());
}

interface LayerRuntime { cur: string | null; prev: string | null; fadeStart: number; mixRT: RT | null; }

// ---------------------------------------------------------------------------

export class Engine {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  ctx: FrameContext = { time: 0, dt: 0, beats: 0, beatPulse: 0, bass: 0, mid: 0, high: 0, level: 0, reactivity: 1 };
  /** Valores modulados atuais, para a UI mostrar ("<ownerId>:<key>"). */
  live = new Map<string, number>();
  fps = 0;
  error: string | null = null;
  /** Mouse sobre o preview em NDC; (9,9) = fora. */
  mouse = new THREE.Vector2(9, 9);

  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private audioTex: THREE.DataTexture;
  private emptyTex: THREE.DataTexture;
  private clips = new Map<string, ClipRuntime>();
  private layers = new Map<string, LayerRuntime>();
  private master = new Chain();
  private compA = makeRT(2, 2);
  private compB = makeRT(2, 2);
  private blendMat: THREE.ShaderMaterial;
  private mixMat: THREE.ShaderMaterial;
  private outMat: THREE.ShaderMaterial;
  private bloom: any;
  private raf = 0;
  private last = 0;
  private frameNo = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  private taps: number[] = [];
  private lastBeatInt = 0;
  private lastAutoBar = -1;
  private autoCol = 0;
  private fontsVersion = 0;
  private geos: THREE.BufferGeometry[] | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setPixelRatio(1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.audioTex = new THREE.DataTexture(audio.texData, SPECTRUM_BINS, 2, THREE.RedFormat, THREE.UnsignedByteType);
    this.audioTex.magFilter = THREE.LinearFilter;
    this.audioTex.minFilter = THREE.LinearFilter;
    this.audioTex.needsUpdate = true;
    this.emptyTex = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
    this.emptyTex.needsUpdate = true;

    this.blendMat = quadMaterial(BLEND_FRAG, { tBase: { value: null }, tLayer: { value: null }, uOpacity: { value: 1 }, uMode: { value: 0 } });
    this.mixMat = quadMaterial(MIX_FRAG, { tA: { value: null }, tB: { value: null }, uT: { value: 0 } });
    this.outMat = quadMaterial(OUTPUT_FRAG, { tInput: { value: null }, uOpacity: { value: 1 } });
    this.bloom = new UnrealBloomPass(new THREE.Vector2(640, 360), 0.6, 0.4, 0.2);

    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.error = 'Contexto WebGL perdido — recarregue a página.'; });
  }

  start() {
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      try {
        this.frame(t / 1000);
      } catch (err) {
        this.error = String(err);
        console.error(err);
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.clips.forEach(c => c.dispose());
    this.layers.forEach(l => l.mixRT?.dispose());
    this.master.dispose();
    this.compA.dispose(); this.compB.dispose();
    this.bloom.dispose?.();
    this.geos?.forEach(g => g.dispose());
    this.renderer.dispose();
  }

  tap() {
    const now = performance.now() / 1000;
    if (this.taps.length && now - this.taps[this.taps.length - 1] > 2) this.taps = [];
    this.taps.push(now);
    if (this.taps.length > 6) this.taps.shift();
    this.ctx.beats = Math.ceil(this.ctx.beats);
    this.ctx.beatPulse = 1;
    if (this.taps.length >= 3) {
      const iv = (this.taps[this.taps.length - 1] - this.taps[0]) / (this.taps.length - 1);
      store.update(c => { c.bpm = Math.round((60 / iv) * 10) / 10; c.autoBpm = false; });
    }
  }

  resync() { this.ctx.beats = Math.ceil(this.ctx.beats); this.ctx.beatPulse = 1; }

  // -------------------------------------------------------------------------

  private frame(now: number) {
    const comp = store.comp;
    const dt = this.last ? Math.min(0.1, now - this.last) : 1 / 60;
    this.last = now;
    this.frameNo++;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }

    this.updateClock(comp, now, dt);
    this.audioTex.needsUpdate = true;

    const W = comp.master.resW, H = comp.master.resH;
    if (this.canvas.width !== W || this.canvas.height !== H) this.renderer.setSize(W, H, false);
    if (this.compA.width !== W || this.compA.height !== H) {
      this.compA.setSize(W, H); this.compB.setSize(W, H);
      this.bloom.setSize(W, H);
    }

    // --- camadas ---
    let cur = this.compA;
    this.renderer.setRenderTarget(cur);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear();

    const solo = comp.layers.some(l => l.solo);
    const xf = comp.crossfader;
    for (const layer of comp.layers) {
      const lr = this.layerRuntime(layer, now);
      if (layer.bypass || (solo && !layer.solo)) continue;
      const group = layer.group === 'A' ? Math.min(1, 2 - 2 * xf) : layer.group === 'B' ? Math.min(1, 2 * xf) : 1;
      const opacity = layer.opacity * group;
      if (opacity < 0.002) continue;
      const tex = this.renderLayer(layer, lr, now);
      if (!tex) continue;
      const next = cur === this.compA ? this.compB : this.compA;
      this.blendMat.uniforms.tBase.value = cur.texture;
      this.blendMat.uniforms.tLayer.value = tex;
      this.blendMat.uniforms.uOpacity.value = opacity;
      this.blendMat.uniforms.uMode.value = BLEND_MODES.indexOf(layer.blend as BlendMode);
      this.pass(this.blendMat, next);
      cur = next;
    }

    // --- master ---
    this.master.resize(W, H);
    this.master.lastUsed = now;
    let out = this.runEffects(this.master, comp.master.effects, cur, comp.master.palette, this.ctx.time, 'master');
    if (comp.master.bloom > 0.01) {
      if (out === this.compA || out === this.compB) {
        // o bloom escreve sobre o buffer de entrada; copiamos para não sujar o compositor
        const dst = this.master.a;
        this.mixMat.uniforms.tA.value = out.texture; this.mixMat.uniforms.tB.value = out.texture; this.mixMat.uniforms.uT.value = 0;
        this.pass(this.mixMat, dst);
        out = dst;
      }
      this.bloom.strength = comp.master.bloom * (1 + this.ctx.bass * 0.5 * comp.reactivity);
      this.bloom.radius = comp.master.bloomRadius;
      this.bloom.threshold = comp.master.bloomThreshold;
      this.bloom.render(this.renderer, null, out, dt, false);
    }
    this.outMat.uniforms.tInput.value = out.texture;
    this.outMat.uniforms.uOpacity.value = comp.master.opacity;
    this.pass(this.outMat, null);

    if (this.frameNo % 90 === 0) this.collect(now);
  }

  private updateClock(comp: Composition, now: number, dt: number) {
    audio.gain = comp.audioGain;
    const a = audio.update(now);
    const c = this.ctx;
    c.time = now; c.dt = dt;
    c.bass = a.bass; c.mid = a.mid; c.high = a.high; c.level = a.level;
    c.reactivity = comp.reactivity;
    c.beats += dt * comp.bpm / 60;
    c.beatPulse *= Math.exp(-dt * 7);
    if (a.active) {
      if (a.onset) {
        c.beatPulse = 1;
        if (comp.autoBpm) {
          const frac = c.beats - Math.round(c.beats);
          c.beats -= frac * 0.5; // puxa a fase do relógio para a batida detectada
          if (audio.bpmEstimate) comp.bpm = Math.round(audio.bpmEstimate);
        }
      }
    } else {
      const bi = Math.floor(c.beats);
      if (bi !== this.lastBeatInt) c.beatPulse = 1;
      // sem áudio, o "som" vira um pulso suave no tempo do BPM
      const ph = c.beats - bi;
      c.bass = Math.pow(1 - ph, 3) * 0.6;
      c.level = 0.25 + 0.15 * Math.sin(c.beats * Math.PI * 0.5);
      c.mid = 0.3 + 0.2 * Math.sin(c.beats * 0.7);
      c.high = 0.2 + 0.15 * Math.sin(c.beats * 1.3);
    }
    this.lastBeatInt = Math.floor(c.beats);

    const ap = comp.autopilot;
    if (ap?.on) {
      const bar = Math.floor(c.beats / 4 / Math.max(1, ap.bars));
      if (bar !== this.lastAutoBar) {
        if (this.lastAutoBar >= 0) this.autoAdvance(comp);
        this.lastAutoBar = bar;
      }
    } else {
      this.lastAutoBar = -1;
    }
  }

  private autoAdvance(comp: Composition) {
    const cols = Array.from({ length: comp.columns }, (_, i) => i).filter(i => comp.layers.some(l => l.clips[i]));
    if (cols.length < 2) return;
    let next: number;
    if (comp.autopilot.mode === 'random') {
      const others = cols.filter(c => c !== this.autoCol);
      next = others[Math.floor(Math.random() * others.length)];
    } else {
      next = cols[(cols.indexOf(this.autoCol) + 1) % cols.length];
    }
    this.autoCol = next;
    store.triggerColumn(next);
  }

  private pass(mat: THREE.Material, target: RT | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  private layerRuntime(layer: Layer, now: number): LayerRuntime {
    let lr = this.layers.get(layer.id);
    if (!lr) {
      lr = { cur: null, prev: null, fadeStart: 0, mixRT: null };
      this.layers.set(layer.id, lr);
    }
    const id = layer.active >= 0 ? layer.clips[layer.active]?.id ?? null : null;
    if (id !== lr.cur) {
      lr.prev = layer.transition > 0.01 ? lr.cur : null;
      lr.cur = id;
      lr.fadeStart = now;
      const fresh = id ? this.clips.get(id) : null;
      if (fresh) fresh.fx.forEach(f => f.hist?.forEach(r => { this.renderer.setRenderTarget(r); this.renderer.clear(); }));
    }
    return lr;
  }

  private renderLayer(layer: Layer, lr: LayerRuntime, now: number): THREE.Texture | null {
    const t = layer.transition > 0.01 ? Math.min(1, (now - lr.fadeStart) / layer.transition) : 1;
    if (t >= 1) lr.prev = null;
    const curClip = lr.cur ? store.findClip(lr.cur) : null;
    const prevClip = lr.prev ? store.findClip(lr.prev) : null;
    const curRT = curClip ? this.renderClip(curClip, now) : null;
    if (!prevClip) return curRT?.texture ?? null;
    const prevRT = this.renderClip(prevClip, now);
    const W = store.comp.master.resW, H = store.comp.master.resH;
    if (!lr.mixRT) lr.mixRT = makeRT(W, H);
    if (lr.mixRT.width !== W || lr.mixRT.height !== H) lr.mixRT.setSize(W, H);
    this.mixMat.uniforms.tA.value = prevRT.texture;
    this.mixMat.uniforms.tB.value = curRT?.texture ?? this.emptyTex;
    this.mixMat.uniforms.uT.value = t * t * (3 - 2 * t);
    this.pass(this.mixMat, lr.mixRT);
    return lr.mixRT.texture;
  }

  // -------------------------------------------------------------------------

  private setCommon(u: Uniforms, w: number, h: number, time: number, palette: number) {
    const c = this.ctx;
    (u.uRes.value as THREE.Vector2).set(w, h);
    u.uTime.value = time;
    u.uBeat.value = c.beatPulse * c.reactivity;
    u.uBeats.value = c.beats;
    u.uBass.value = c.bass * c.reactivity;
    u.uMid.value = c.mid * c.reactivity;
    u.uHigh.value = c.high * c.reactivity;
    u.uLevel.value = c.level * c.reactivity;
    const p = PALETTES[palette] ?? PALETTES[0];
    (u.uPalA.value as THREE.Vector3).fromArray(p.a);
    (u.uPalB.value as THREE.Vector3).fromArray(p.b);
    (u.uPalC.value as THREE.Vector3).fromArray(p.c);
    (u.uPalD.value as THREE.Vector3).fromArray(p.d);
  }

  private fillParams(u: Uniforms, defs: { key: string }[], params: Clip['params'], ownerId: string) {
    const arr = u.uP.value as number[];
    defs.forEach((d, i) => {
      const v = evalParam(d as any, params[d.key], this.ctx);
      arr[i] = v;
      this.live.set(`${ownerId}:${d.key}`, v);
    });
  }

  private clipRuntime(clip: Clip, def: GeneratorDef): ClipRuntime {
    let rt = this.clips.get(clip.id);
    if (rt && rt.genId !== clip.generator) { rt.dispose(); rt = undefined; }
    if (!rt) {
      rt = new ClipRuntime();
      rt.genId = clip.generator;
      const header = COMMON_UNIFORMS + COMMON_FUNCS + paramDefines(def.params.map(p => p.key));
      if (def.kind === 'sculptor') {
        rt.a.dispose();
        rt.a = makeRT(2, 2, true); // o material maciço precisa de profundidade
        rt.sculpt = this.makeSculpt(header);
      } else {
        const extra: Uniforms = def.kind === 'media'
          ? { uMedia: { value: this.emptyTex }, uMediaAspect: { value: 1 }, uHasMedia: { value: 0 } }
          : def.kind === 'text' ? { uText: { value: this.emptyTex } } : {};
        rt.mat = quadMaterial(
          'varying vec2 vUv;\n' + header + def.glsl + '\nvoid main() { gl_FragColor = gen(vUv); }',
          { ...baseUniforms(this.audioTex), ...extra },
        );
      }
      this.clips.set(clip.id, rt);
    }
    return rt;
  }

  private renderClip(clip: Clip, now: number): RT {
    const def = GENERATOR_MAP[clip.generator];
    const rt = this.clipRuntime(clip, def);
    const comp = store.comp;
    const scale = (def.resScale ?? 1) * comp.master.quality;
    const w = Math.max(2, Math.round(comp.master.resW * scale));
    const h = Math.max(2, Math.round(comp.master.resH * scale));
    rt.resize(w, h);
    if (rt.lastUsed === now) return this.lastOutput.get(clip.id) ?? rt.a; // já renderizado neste frame
    rt.lastUsed = now;
    rt.time += this.ctx.dt * clip.speed * (1 + clip.drive * this.ctx.level * this.ctx.reactivity * 2);

    if (rt.sculpt) {
      this.renderSculpt(clip, def, rt, w, h, now);
    } else if (rt.mat) {
      if (def.kind === 'media') this.updateMedia(clip, rt);
      if (def.kind === 'text') this.updateText(clip, rt, w, h);
      this.setCommon(rt.mat.uniforms, w, h, rt.time, clip.palette);
      this.fillParams(rt.mat.uniforms, def.params, clip.params, clip.id);
      this.pass(rt.mat, rt.a);
    }
    const out = this.runEffects(rt, clip.effects, rt.a, clip.palette, rt.time, clip.id);
    this.lastOutput.set(clip.id, out);
    return out;
  }

  private lastOutput = new Map<string, RT>();

  private runEffects(chain: Chain, effects: EffectInstance[], input: RT, palette: number, time: number, owner: string): RT {
    let cur = input;
    for (const fx of effects) {
      if (!fx.enabled || fx.mix <= 0.001) continue;
      const def = EFFECT_MAP[fx.type];
      if (!def) continue;
      let fr = chain.fx.get(fx.id);
      if (!fr) {
        const frag = COMMON_UNIFORMS + 'uniform sampler2D tInput;\nuniform sampler2D tPrev;\nuniform float uMix;\nvarying vec2 vUv;\n'
          + COMMON_FUNCS + paramDefines(def.params.map(p => p.key)) + def.glsl
          + '\nvoid main() { vec4 src = texture2D(tInput, vUv); gl_FragColor = mix(src, effect(vUv), uMix); }';
        fr = {
          mat: quadMaterial(frag, { ...baseUniforms(this.audioTex), tInput: { value: null }, tPrev: { value: this.emptyTex }, uMix: { value: 1 } }),
          hist: def.feedback ? [makeRT(chain.w, chain.h), makeRT(chain.w, chain.h)] : undefined,
        };
        chain.fx.set(fx.id, fr);
      }
      const u = fr.mat.uniforms;
      this.setCommon(u, chain.w, chain.h, time, palette);
      this.fillParams(u, def.params, fx.params, fx.id);
      u.tInput.value = cur.texture;
      u.uMix.value = fx.mix;
      let target: RT;
      if (fr.hist) {
        const [h0, h1] = fr.hist;
        if (h0.width !== chain.w || h0.height !== chain.h) { h0.setSize(chain.w, chain.h); h1.setSize(chain.w, chain.h); }
        u.tPrev.value = h1.texture;
        target = h0;
        fr.hist = [h1, h0];
      } else {
        target = cur === chain.a ? chain.b : chain.a;
      }
      this.pass(fr.mat, target);
      cur = target;
    }
    return cur;
  }

  private sculptGeometries() {
    if (!this.geos) {
      this.geos = [
        gridGeometry(384, 'points'), // ~147 mil partículas
        gridGeometry(200, 'rows'),
        gridGeometry(200, 'strip'),
        gridGeometry(110, 'wire'),
        gridGeometry(256, 'tris'),
      ];
    }
    return this.geos;
  }

  private makeSculpt(header: string): SculptRuntime {
    const uniforms: Uniforms = {
      ...baseUniforms(this.audioTex),
      uCount: { value: 1 }, uPrevA: { value: 0 }, uPrevB: { value: 0 }, uTransA: { value: 1 }, uTransB: { value: 1 },
      uMouse: { value: this.mouse }, uIsPoints: { value: 1 },
    };
    const vertexShader = header + SCULPTOR_VERT;
    const fragmentShader = header + SCULPTOR_FRAG;
    const glow = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, uniforms,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const solid = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, side: THREE.DoubleSide });
    const [gp, gr, gs, gw, gm] = this.sculptGeometries();
    const objs: THREE.Object3D[] = [
      new THREE.Points(gp, glow), new THREE.LineSegments(gr, glow), new THREE.Line(gs, glow),
      new THREE.LineSegments(gw, glow), new THREE.Mesh(gm, solid),
    ];
    const scene = new THREE.Scene();
    objs.forEach(o => { o.frustumCulled = false; scene.add(o); });
    const track = (): ShapeTrack => ({ cur: NaN, prev: 0, start: -1e9 });
    return { scene, camera: new THREE.PerspectiveCamera(50, 16 / 9, 0.01, 200), uniforms, mats: [glow, solid], objs, a: track(), b: track() };
  }

  private renderSculpt(clip: Clip, def: GeneratorDef, rt: ClipRuntime, w: number, h: number, now: number) {
    const sc = rt.sculpt!;
    const u = sc.uniforms;
    this.setCommon(u, w, h, rt.time, clip.palette);
    this.fillParams(u, def.params, clip.params, clip.id);
    const val = (k: string) => this.live.get(`${clip.id}:${k}`) ?? 0;

    // transição elástica quando a forma muda (inclusive por modulação)
    const morph = Math.max(0.05, val('morphTime'));
    const step = (tr: ShapeTrack, shape: number) => {
      if (Number.isNaN(tr.cur)) tr.cur = shape;
      else if (shape !== tr.cur) { tr.prev = tr.cur; tr.cur = shape; tr.start = now; }
      return Math.min(1, (now - tr.start) / morph);
    };
    u.uTransA.value = step(sc.a, Math.round(val('shapeA')));
    u.uTransB.value = step(sc.b, Math.round(val('shapeB')));
    u.uPrevA.value = sc.a.prev;
    u.uPrevB.value = sc.b.prev;

    const m = Math.round(val('material'));
    const which = m <= 3 ? 0 : m - 3;
    sc.objs.forEach((o, k) => (o.visible = k === which));
    const geo = (sc.objs[which] as THREE.Mesh).geometry;
    u.uCount.value = geo.getAttribute('aIdx').count;
    u.uIsPoints.value = which === 0 ? 1 : 0;

    const cam = sc.camera;
    const shake = val('shake') * (0.15 + this.ctx.beatPulse * 0.45) * 0.15;
    cam.aspect = w / h;
    cam.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, val('dist'));
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    this.renderer.setRenderTarget(rt.a);
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.clear(true, true, false);
    this.renderer.render(sc.scene, cam);
  }

  private updateText(clip: Clip, rt: ClipRuntime, w: number, h: number) {
    const label = (clip.text ?? 'VYXO').replace(/\{musica\}/gi, spotify.label || '♪ ♪ ♪');
    const font = clip.font ?? 'Tektur';
    const cw = Math.min(2048, w), ch = Math.max(2, Math.round((cw * h) / w));
    const key = `${label}|${font}|${cw}x${ch}|${this.fontsVersion}`;
    if (!rt.text) {
      const canvas = document.createElement('canvas');
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.NoColorSpace;
      rt.text = { canvas, tex, key: '' };
    }
    const t = rt.text;
    if (t.key !== key) {
      t.key = key;
      const probe = `900 40px "${font}"`;
      if (!document.fonts.check(probe)) document.fonts.load(probe).then(() => this.fontsVersion++).catch(() => {});
      t.canvas.width = cw; t.canvas.height = ch;
      const g = t.canvas.getContext('2d')!;
      g.clearRect(0, 0, cw, ch);
      const lines = label.split('\n');
      let size = ch * 0.22;
      g.font = `900 ${size}px "${font}", sans-serif`;
      const widest = Math.max(1, ...lines.map(l => g.measureText(l).width));
      size *= Math.min(1, (cw * 0.9) / widest, (ch * 0.85) / (size * 1.15 * lines.length));
      g.font = `900 ${size}px "${font}", sans-serif`;
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      lines.forEach((l, i) => g.fillText(l, cw / 2, ch / 2 + (i - (lines.length - 1) / 2) * size * 1.15));
      t.tex.needsUpdate = true;
    }
    rt.mat!.uniforms.uText.value = t.tex;
  }

  private updateMedia(clip: Clip, rt: ClipRuntime) {
    const m = clip.media;
    const url = m?.kind === 'spotify' ? spotify.track?.art ?? undefined : m?.url;
    const key = m ? `${m.kind}:${url ?? ''}` : '';
    if (rt.media?.key !== key) {
      disposeMedia(rt.media);
      rt.media = { key, tex: null, aspect: 16 / 9 };
      const media = rt.media;
      if ((m?.kind === 'image' || m?.kind === 'spotify') && url) {
        new THREE.TextureLoader().load(url, tex => {
          if (rt.media !== media) { tex.dispose(); return; }
          tex.colorSpace = THREE.NoColorSpace;
          media.tex = tex;
          media.aspect = tex.image.width / tex.image.height;
        });
      } else if ((m?.kind === 'video' && m.url) || m?.kind === 'webcam') {
        const v = document.createElement('video');
        v.loop = true; v.muted = true; v.playsInline = true; v.crossOrigin = 'anonymous';
        media.video = v;
        const ready = () => {
          if (rt.media !== media) return;
          const tex = new THREE.VideoTexture(v);
          tex.colorSpace = THREE.NoColorSpace;
          media.tex = tex;
          media.aspect = v.videoWidth / Math.max(1, v.videoHeight);
        };
        v.addEventListener('loadedmetadata', ready, { once: true });
        if (m.kind === 'webcam' && mediaBlockedReason()) {
          this.error = mediaBlockedReason();
        } else if (m.kind === 'webcam') {
          navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } }).then(s => {
            if (rt.media !== media) { s.getTracks().forEach(t => t.stop()); return; }
            media.stream = s;
            v.srcObject = s;
            v.play();
          }).catch(err => { this.error = 'Webcam: ' + err.message; });
        } else {
          v.src = m.url!;
          v.play().catch(() => {});
        }
      }
    }
    const u = rt.mat!.uniforms;
    u.uMedia.value = rt.media?.tex ?? this.emptyTex;
    u.uHasMedia.value = rt.media?.tex ? 1 : 0;
    u.uMediaAspect.value = rt.media?.aspect ?? 1;
  }

  /** Libera GPU de clips que não são renderizados há alguns segundos. */
  private collect(now: number) {
    this.clips.forEach((rt, id) => {
      if (now - rt.lastUsed > 4) { rt.dispose(); this.clips.delete(id); this.lastOutput.delete(id); }
    });
    const ids = new Set(store.comp.layers.map(l => l.id));
    this.layers.forEach((lr, id) => { if (!ids.has(id)) { lr.mixRT?.dispose(); this.layers.delete(id); } });
    if (this.live.size > 2000) this.live.clear();
  }
}
