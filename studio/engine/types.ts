// Modelo de dados do estúdio. Tudo aqui é serializável (JSON) — o motor lê
// esse objeto a cada frame, a UI o edita através da store.

export type ModSource =
  | 'none' | 'bass' | 'mid' | 'high' | 'level' | 'beat'
  | 'sine' | 'saw' | 'square' | 'random';

export interface Modulation {
  src: ModSource;
  amount: number; // -1..1, fração da faixa do parâmetro
  rate: number;   // duração do ciclo em batidas (para LFOs)
}

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  step?: number;
  mod?: Partial<Modulation>;
  /** Parâmetro de escolha: o valor é o índice da opção. */
  options?: string[];
  /** Seção do inspetor onde o parâmetro aparece. */
  group?: string;
}

export interface ParamValue {
  value: number;
  mod: Modulation;
}

export type ParamMap = Record<string, ParamValue>;

export interface EffectInstance {
  id: string;
  type: string;
  enabled: boolean;
  mix: number;
  params: ParamMap;
}

export type MediaKind = 'image' | 'video' | 'webcam' | 'spotify';

export interface MediaRef {
  kind: MediaKind;
  url?: string;
  name?: string;
}

export interface Clip {
  id: string;
  name: string;
  generator: string;
  params: ParamMap;
  palette: number;
  speed: number; // multiplicador do tempo do clip
  drive: number; // quanto o volume do áudio acelera o tempo
  effects: EffectInstance[];
  media?: MediaRef;
  text?: string;
  font?: string;
}

export type BlendMode =
  | 'normal' | 'add' | 'screen' | 'multiply'
  | 'difference' | 'overlay' | 'lighten' | 'subtract';

export const BLEND_MODES: BlendMode[] = [
  'normal', 'add', 'screen', 'multiply', 'difference', 'overlay', 'lighten', 'subtract',
];

export type CrossGroup = 'A' | 'B' | '-';

export interface Layer {
  id: string;
  name: string;
  opacity: number;
  blend: BlendMode;
  group: CrossGroup;
  bypass: boolean;
  solo: boolean;
  transition: number; // segundos de fade entre clips
  active: number;     // índice da coluna ativa, -1 = nenhum
  clips: (Clip | null)[];
}

export interface MidiMapping {
  key: string;    // ex.: "cc:0:21" ou "note:0:36"
  target: string; // ver midi.ts
}

export interface Master {
  opacity: number;
  bloom: number;
  bloomRadius: number;
  bloomThreshold: number;
  palette: number;
  quality: number; // escala de resolução interna dos clips
  resW: number;    // resolução da composição
  resH: number;
  effects: EffectInstance[];
}

export interface Autopilot {
  on: boolean;
  bars: number;            // a cada quantos compassos troca de coluna
  mode: 'next' | 'random';
}

export interface Composition {
  version: 1;
  name: string;
  columns: number;
  layers: Layer[]; // índice 0 = camada de baixo
  crossfader: number;
  bpm: number;
  autoBpm: boolean;
  audioGain: number;
  reactivity: number;
  master: Master;
  midi: MidiMapping[];
  autopilot: Autopilot;
}

export type Selection =
  | { kind: 'clip'; layer: number; col: number }
  | { kind: 'layer'; layer: number }
  | { kind: 'master' };

/** Contexto avaliado a cada frame e usado por modulações e shaders. */
export interface FrameContext {
  time: number;
  dt: number;
  beats: number;     // contador contínuo de batidas
  beatPulse: number; // 1 na batida, decai
  bass: number;
  mid: number;
  high: number;
  level: number;
  reactivity: number;
}
