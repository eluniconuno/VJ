
export enum ShapeType {
  ORB = 'sphere',
  TORUS = 'torus',
  MONOLITH = 'monolith',
  DATA_GRID = 'data_grid',
  NEURAL_NODE = 'neural_node',
  DNA = 'dna',
  SPIRAL = 'spiral',
  VORONOI = 'voronoi',
  SHATTERED = 'shattered',
  ICOSAHEDRON = 'icosahedron',
  KNOT = 'knot',
  TERRAIN = 'terrain',
  CLOUD = 'cloud',
  PLANE = 'plane',
  GRID = 'grid',
  SENTIMENTAL = 'sentimental',
  CUBE = 'cube',
  PYRAMID = 'pyramid',
  CYLINDER = 'cylinder'
}

export enum NoiseType {
  NONE = 0,
  WAVEFORM = 1,
  PULSE = 2,
  NOISE = 3,
  VORTEX = 4,
  RIPPLE = 5,
  HARMONICS = 6,
  MESH_TEAR = 7,
  DATAMOSH = 8,
  BIT_CRUSH = 9,
  TWIST = 10,
  BEND = 11,
  STRETCH = 12,
  SENTIMENTAL = 13
}

export enum EffectType {
  NONE = 0,
  SCANLINES = 1,
  RGB_SHIFT = 2,
  KALEIDOSCOPE = 3,
  MIRROR = 4,
  HIGH_CONTRAST = 5,
  VIBRANCE = 6,
  BW_NOIR = 7,
  POSTERIZE = 8,
  INVERT = 9,
  SOLARIZE = 10,
  BLEACH_BYPASS = 11,
  VINTAGE_SEPIA = 12,
  GAMMA_CORRECT = 13,
  CHANNEL_SWAP = 14,
  EXPOSURE_BOOST = 15,
  GLITCH = 16
}

export enum TextAnimType {
  STATIC = 'none',
  PULSE = 'pulse',
  GLITCH = 'glitch',
  NEON_FLICKER = 'neon',
  SLIDE = 'slide',
  SPIN = 'spin',
  MARQUEE = 'marquee',
  WAVE = 'wave',
  BOUNCE = 'bounce',
  CHROMA = 'chroma'
}

export interface TextOverlayItem {
  id: string;
  text: string;
  font: string;
  size: number;
  posX: number;
  posY: number;
  color: string;
  anim: TextAnimType;
  blendMode: 'normal' | 'overlay' | 'screen' | 'difference' | 'exclusion' | 'multiply' | 'color-dodge';
  outline: boolean;
  opacity: number;
}

export type AudioSourceType = 'mic' | 'file' | 'mixed';

export enum LayerType {
  PARTICLES = 'particles',
  MODEL_3D = '3d',
  IMAGE = 'image',
  VIDEO = 'video',
  SPLINE = 'spline',
  IFRAME = 'iframe',
  SHAPE = 'shape'
}

export interface LayerItem {
  id: string;
  type: LayerType;
  url?: string;
  shapeType?: ShapeType;
  visible: boolean;
  opacity: number;
  scale: number;
  posX: number;
  posY: number;
  posZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  blendMode: string;
  distortion?: number;
  color?: string;
  isCorpus?: boolean; // If true, this layer acts as a data source for merging
  isCorrupted?: boolean; // If true, this layer will be affected by the corruption engine
}

export enum MergeMode {
  ADDITIVE = 'additive',
  COLLISION = 'collision',
  INTERFERENCE = 'interference',
  DNA_FUSION = 'dna_fusion',
  EROSION = 'erosion'
}

export enum ShapeMergeMode {
  LERP = 'lerp',
  ADDITIVE = 'additive',
  SUBTRACTIVE = 'subtractive',
  INTERSECT = 'intersect',
  CROSS_AXIS = 'cross_axis'
}

export interface ResearchEntry {
  timestamp: number;
  prompt: string;
  parameters: Partial<VJState>;
}

export interface Clip {
  id: string;
  name: string;
  state: Partial<VJState>;
  thumbnail?: string;
}

export interface Deck {
  id: string;
  clips: (Clip | null)[];
}

export interface LFO {
  id: string;
  target: keyof VJState;
  type: 'sine' | 'square' | 'saw' | 'random';
  frequency: number;
  amplitude: number;
  offset: number;
  active: boolean;
}

export interface VJState {
  // ... existing properties ...
  activeShape: ShapeType;
  activeShapeB: ShapeType;
  shapeMix: number;
  shapeMergeMode: ShapeMergeMode;
  noiseMode: NoiseType;
  effectMode: EffectType;
  mergeMode: MergeMode;
  pointSize: number;
  color: string;
  brightness: number;
  audioForce: number;
  bassImpact: number;
  trebleImpact: number;
  audioSmoothing: number;
  audioReactive: boolean;
  micActive: boolean;
  isPlaying: boolean;
  audioSource: AudioSourceType;
  volume: number;
  filterValue: number;
  animationSpeed: number;
  timeScale: number;
  rotationSpeed: number;
  elasticity: number;
  deformationIntensity: number;
  displacementScale: number;
  cameraZoom: number;
  cameraShake: number;
  autoRotate: boolean;
  mediaUrl: string | null;
  mediaType: 'image' | 'video' | 'none';
  mediaOpacity: number;
  mediaScale: number;
  mediaDistortion: number;
  textOverlays: TextOverlayItem[];
  layers: LayerItem[];
  researchLog: ResearchEntry[];
  autoMorph: boolean;
  mouseInteraction: boolean;
  showAdvancedPanel: boolean;
  showUI: boolean;
  isRecording: boolean;
  showTechnicalOverlay: boolean;
  compressionArtifacts: number;
  datamoshIntensity: number;
  glitchIntensity: number;
  feedbackIntensity: number;
  geometryAttraction: number;
  divineMode: boolean;
  multiCursorCount: number;
  sentimentalMode: boolean;
  absurdityIntensity: number;
  latentWarp: number;

  // --- ARENA VJ EXTENSIONS ---
  bpm: number;
  bpmSync: boolean;
  crossfader: number; // 0 = A, 1 = B
  activeDeck: number; // 0 or 1
  decks: Deck[];
  activeClipId: string | null;
  lfos: LFO[];
  stateA: Partial<VJState> | null;
  stateB: Partial<VJState> | null;
}

export interface AudioData {
  frequencyData: Uint8Array;
  timeData: Uint8Array;
  bass: number;
  mid: number;
  treble: number;
  average: number;
  peak: number;
  pulse: number;
}

export interface AIResponse {
  type: 'action' | 'info' | 'error';
  params?: Partial<VJState>;
  text?: string;
}
