// Trechos GLSL compartilhados por geradores e efeitos.

export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const COMMON_UNIFORMS = /* glsl */ `
uniform vec2 uRes;
uniform float uTime;
uniform float uBeat;
uniform float uBeats;
uniform float uBass;
uniform float uMid;
uniform float uHigh;
uniform float uLevel;
uniform sampler2D uAudio;
uniform float uP[48];
uniform vec3 uPalA;
uniform vec3 uPalB;
uniform vec3 uPalC;
uniform vec3 uPalD;
`;

export const COMMON_FUNCS = /* glsl */ `
#define PI 3.14159265
#define TAU 6.28318531

vec3 pal(float t) { return uPalA + uPalB * cos(TAU * (uPalC * t + uPalD)); }

// espectro (log) e forma de onda, 0..1 no eixo x
float spec(float x) { return texture2D(uAudio, vec2(clamp(x, 0.0, 1.0), 0.25)).r; }
float wave(float x) { return texture2D(uAudio, vec2(clamp(x, 0.0, 1.0), 0.75)).r * 2.0 - 1.0; }

float aspect() { return uRes.x / uRes.y; }
// coordenadas centradas, y em -0.5..0.5, x corrigido pelo aspecto
vec2 uvc(vec2 uv) { return (uv - 0.5) * vec2(aspect(), 1.0); }

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float hash(float n) { return fract(sin(n) * 43758.5453123); }
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 17.31)); }

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}

vec3 hueShift(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a * TAU);
  return c * ca + cross(k, c) * sin(a * TAU) + k * dot(k, c) * (1.0 - ca);
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec2 mirrorUv(vec2 uv) { return 1.0 - abs(1.0 - mod(uv, 2.0)); }
`;

/** Paletas cosseno (técnica de Inigo Quilez): a + b·cos(2π(c·t + d)). */
export interface Palette {
  name: string;
  a: [number, number, number];
  b: [number, number, number];
  c: [number, number, number];
  d: [number, number, number];
}

export const PALETTES: Palette[] = [
  { name: 'Ácido',      a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1.0, 1.0, 1.0], d: [0.0, 0.33, 0.67] },
  { name: 'Neon Rosa',  a: [0.5, 0.2, 0.5], b: [0.5, 0.4, 0.5], c: [1.0, 1.0, 1.0], d: [0.85, 0.15, 0.55] },
  { name: 'Oceano',     a: [0.2, 0.4, 0.6], b: [0.3, 0.4, 0.4], c: [1.0, 1.0, 1.0], d: [0.0, 0.1, 0.2] },
  { name: 'Inferno',    a: [0.5, 0.3, 0.1], b: [0.5, 0.4, 0.2], c: [1.0, 1.0, 0.5], d: [0.0, 0.15, 0.2] },
  { name: 'Vaporwave',  a: [0.6, 0.4, 0.7], b: [0.4, 0.4, 0.3], c: [1.0, 1.0, 1.0], d: [0.5, 0.75, 0.9] },
  { name: 'Tóxico',     a: [0.3, 0.6, 0.2], b: [0.4, 0.4, 0.3], c: [1.0, 1.5, 1.0], d: [0.3, 0.0, 0.6] },
  { name: 'Aurora',     a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1.0, 1.0, 0.5], d: [0.8, 0.9, 0.3] },
  { name: 'Ouro',       a: [0.6, 0.5, 0.3], b: [0.4, 0.35, 0.2], c: [1.0, 1.0, 1.0], d: [0.0, 0.05, 0.12] },
  { name: 'Gelo',       a: [0.6, 0.7, 0.8], b: [0.4, 0.3, 0.25], c: [1.0, 1.0, 1.0], d: [0.55, 0.6, 0.65] },
  { name: 'Arco-íris',  a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [2.0, 1.0, 0.0], d: [0.5, 0.2, 0.25] },
  { name: 'Sangue',     a: [0.45, 0.1, 0.15], b: [0.45, 0.1, 0.15], c: [1.0, 1.0, 1.0], d: [0.0, 0.1, 0.1] },
  { name: 'Mono',       a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1.0, 1.0, 1.0], d: [0.0, 0.0, 0.0] },
];

export function paletteCss(p: Palette, steps = 6): string {
  const stops: string[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const ch = (k: 0 | 1 | 2) =>
      Math.round(255 * Math.min(1, Math.max(0, p.a[k] + p.b[k] * Math.cos(2 * Math.PI * (p.c[k] * t + p.d[k])))));
    stops.push(`rgb(${ch(0)},${ch(1)},${ch(2)})`);
  }
  return `linear-gradient(90deg, ${stops.join(',')})`;
}

/** Cria `#define p_<key> uP[i]` para cada parâmetro. */
export function paramDefines(keys: string[]): string {
  return keys.map((k, i) => `#define p_${k} uP[${i}]`).join('\n');
}
