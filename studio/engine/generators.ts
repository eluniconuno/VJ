import { ParamDef, Modulation } from './types';
import { SCULPTOR_PARAMS } from './sculptor';

export type GenCategory = 'Psicodélico' | 'Escultura' | 'Partículas' | 'Overlay' | 'Mídia';
export type GenKind = 'shader' | 'sculptor' | 'media' | 'text';

export interface GeneratorDef {
  id: string;
  name: string;
  category: GenCategory;
  kind: GenKind;
  description: string;
  params: ParamDef[];
  /** GLSL que define `vec4 gen(vec2 uv)` (kind shader/media). */
  glsl?: string;
  /** Fração da resolução de saída usada para renderizar (geradores pesados). */
  resScale?: number;
  defaultPalette?: number;
}

const P = (
  key: string, label: string, min: number, max: number, def: number,
  mod?: Partial<Modulation>, step?: number,
): ParamDef => ({ key, label, min, max, default: def, mod, step });

// ---------------------------------------------------------------------------
// Template de raymarching para as esculturas. Cada escultura define
// `float map(vec3 p)` e `vec3 shade(vec3 p, vec3 n)`; pode usar gTrap/gRd.
// ---------------------------------------------------------------------------
const SCULPT_PARAMS = [
  P('orbit', 'Órbita', 0, 2, 0.4),
  P('dist', 'Distância', 1.5, 6, 3.2),
  P('glow', 'Aura', 0, 2, 0.6, { src: 'bass', amount: 0.3 }),
  P('colorShift', 'Cor', 0, 1, 0),
];

const sculpture = (body: string, stepScale = 0.8) => /* glsl */ `
float gTrap = 0.0;
vec3 gRd = vec3(0.0);
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
${body}
vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0015;
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}
float calcAO(vec3 p, vec3 n) {
  float o = 0.0, s = 1.0;
  for (int i = 0; i < 5; i++) { float h = 0.01 + 0.12 * float(i) / 4.0; o += (h - map(p + h * n)) * s; s *= 0.9; }
  return clamp(1.0 - 3.0 * o, 0.0, 1.0);
}
vec4 gen(vec2 uv) {
  vec2 p = uvc(uv);
  float ang = uTime * 0.25 * p_orbit;
  float d = p_dist * (1.0 - uBeat * 0.04);
  vec3 ro = vec3(sin(ang) * d, sin(uTime * 0.13) * d * 0.35, cos(ang) * d);
  vec3 ww = normalize(-ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(p.x * uu + p.y * vv + 1.5 * ww);
  gRd = rd;
  float t = 0.0, glow = 0.0;
  bool hit = false;
  for (int i = 0; i < 100; i++) {
    float h = map(ro + rd * t);
    glow += exp(-max(h, 0.0) * 10.0);
    if (h < 0.0008 * t) { hit = true; break; }
    t += h * ${stepScale.toFixed(2)};
    if (t > 20.0) break;
  }
  vec3 bg = pal(0.65 + p.y * 0.3 + p_colorShift) * 0.06 * (1.2 - length(p));
  vec3 col = bg;
  if (hit) {
    vec3 pos = ro + rd * t;
    vec3 n = calcNormal(pos);
    float ao = calcAO(pos, n);
    map(pos);
    vec3 base = shade(pos, n);
    vec3 l = normalize(vec3(0.6, 0.8, -0.4));
    float dif = clamp(dot(n, l), 0.0, 1.0);
    float spe = pow(clamp(dot(n, normalize(l - rd)), 0.0, 1.0), 40.0);
    float fre = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);
    float back = clamp(dot(n, -l), 0.0, 1.0);
    col = base * (0.12 + 0.88 * dif) * ao
        + base * back * 0.15
        + spe * (0.6 + uHigh)
        + fre * pal(0.3 + p_colorShift + dot(n, vec3(0.2, 0.5, 0.3))) * (0.8 + uMid);
    col = mix(col, bg, 1.0 - exp(-0.01 * t * t));
  }
  col += glow * 0.012 * p_glow * pal(uTime * 0.03 + 0.4 + p_colorShift);
  return vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------------------

export const GENERATORS: GeneratorDef[] = [
  // ======================= PSICODÉLICO 2D =======================
  {
    id: 'liquid', name: 'Sonho Líquido', category: 'Psicodélico', kind: 'shader',
    description: 'Ruído fractal com domain warping — fluxo orgânico de tinta.',
    defaultPalette: 0,
    params: [
      P('scale', 'Escala', 0.5, 6, 2.2),
      P('warp', 'Distorção', 0, 5, 2.0, { src: 'bass', amount: 0.15 }),
      P('flow', 'Fluxo', 0, 2, 0.6),
      P('contrast', 'Contraste', 0.3, 3, 1.3),
      P('colorShift', 'Cor', 0, 1, 0, { src: 'saw', amount: 0.25, rate: 32 }),
      P('flash', 'Flash na batida', 0, 2, 0.6),
    ],
    glsl: /* glsl */ `
vec4 gen(vec2 uv) {
  vec2 p = uvc(uv) * p_scale;
  float t = uTime * 0.12;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p + p_warp * q + vec2(1.7, 9.2) + t * p_flow),
                fbm(p + p_warp * q + vec2(8.3, 2.8) - t * p_flow * 0.7));
  float f = fbm(p + p_warp * r);
  float v = f * 1.4 + 0.6 * length(q) + p_colorShift;
  vec3 col = pal(v + uMid * 0.1);
  col *= pow(clamp(f * 1.5, 0.0, 1.1), p_contrast) * (0.5 + 0.6 * length(r));
  col += pal(v + 0.5) * uBeat * 0.15 * p_flash;
  return vec4(col, 1.0);
}`,
  },
  {
    id: 'tunnel', name: 'Túnel Caleidoscópico', category: 'Psicodélico', kind: 'shader',
    description: 'Túnel infinito espelhado em segmentos que pulsa com o grave.',
    defaultPalette: 1,
    params: [
      P('segments', 'Segmentos', 2, 16, 6, undefined, 1),
      P('speed', 'Mergulho', -3, 3, 1.0, { src: 'level', amount: 0.15 }),
      P('density', 'Densidade', 0.5, 6, 2.0),
      P('warp', 'Ondulação', 0, 3, 1.0, { src: 'mid', amount: 0.2 }),
      P('sharp', 'Nitidez', 0.5, 6, 2.0),
      P('colorShift', 'Cor', 0, 1, 0),
      P('pulse', 'Pulso', 0, 2, 0.8),
    ],
    glsl: /* glsl */ `
vec4 gen(vec2 uv) {
  vec2 p = uvc(uv) * rot(uTime * 0.05);
  float r = length(p);
  float a = atan(p.y, p.x);
  float seg = TAU / floor(p_segments);
  a = abs(mod(a, seg) - seg * 0.5);
  float z = 0.35 / (r + 0.02) + uTime * p_speed;
  float w = a / seg;
  float n = fbm(vec2(w * 3.0, z * 0.4));
  float pat = sin(z * p_density * 2.0 + sin(w * 9.0 + uTime) * p_warp * 2.0 + n * 5.0);
  float band = pow(0.5 + 0.5 * pat, p_sharp);
  vec3 col = pal(z * 0.04 + n * 0.4 + p_colorShift) * band;
  col *= smoothstep(0.0, 0.25, r) * (1.0 + uBeat * p_pulse);
  col += pal(z * 0.04 + 0.5 + p_colorShift) * exp(-r * 9.0) * (0.4 + uBass * 1.5);
  return vec4(col, 1.0);
}`,
  },
  {
    id: 'julia', name: 'Fractal Julia', category: 'Psicodélico', kind: 'shader',
    description: 'Conjunto de Julia animado com orbit-trap brilhante.',
    defaultPalette: 6,
    params: [
      P('zoom', 'Zoom', 0.5, 4, 1.0, { src: 'bass', amount: 0.05 }),
      P('morph', 'Metamorfose', 0, 3, 1.0),
      P('spin', 'Giro', -2, 2, 0.3),
      P('bands', 'Bandas', 0.5, 8, 3.0),
      P('trap', 'Brilho interno', 0, 3, 1.0, { src: 'high', amount: 0.2 }),
      P('trapR', 'Raio do trap', 0, 1.5, 0.5),
      P('colorShift', 'Cor', 0, 1, 0, { src: 'saw', amount: 0.3, rate: 16 }),
    ],
    glsl: /* glsl */ `
vec4 gen(vec2 uv) {
  vec2 z = uvc(uv) * 2.6 / p_zoom;
  z *= rot(uTime * 0.05 * p_spin);
  float t = uTime * 0.08;
  float ca = 2.3 + sin(t) * 0.35 * p_morph;
  vec2 c = 0.7885 * vec2(cos(ca), sin(ca)) + vec2(uBass * 0.008, 0.0);
  float it = 0.0, trap = 1e9;
  for (int i = 0; i < 120; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    trap = min(trap, abs(length(z) - p_trapR));
    if (dot(z, z) > 256.0) break;
    it += 1.0;
  }
  vec3 col;
  if (it >= 119.0) {
    col = pal(trap * 2.0 + p_colorShift + 0.5) * 0.15;
  } else {
    float sm = it - log2(log2(dot(z, z))) + 4.0;
    col = pal(sm / 120.0 * p_bands + p_colorShift + uTime * 0.02) * sqrt(clamp(sm / 40.0, 0.0, 1.0)) * 0.9;
  }
  col += pal(trap * 1.5 + 0.3 + p_colorShift) * exp(-trap * 10.0) * p_trap;
  return vec4(col, 1.0);
}`,
  },
  {
    id: 'hypno', name: 'Espiral Hipnótica', category: 'Psicodélico', kind: 'shader',
    description: 'Espiral logarítmica com braços que giram com o tempo.',
    defaultPalette: 4,
    params: [
      P('arms', 'Braços', 1, 12, 4, undefined, 1),
      P('twist', 'Torção', -6, 6, 2.5),
      P('flow', 'Velocidade', -3, 3, 1.0),
      P('sharp', 'Suavidade', 0.01, 0.5, 0.15),
      P('depth', 'Profundidade', 0, 1, 0.6, { src: 'bass', amount: 0.3 }),
      P('colorShift', 'Cor', 0, 1, 0),
    ],
    glsl: /* glsl */ `
vec4 gen(vec2 uv) {
  vec2 p = uvc(uv);
  float r = length(p);
  float a = atan(p.y, p.x);
  float v = a / TAU * floor(p_arms) + log(r + 1e-3) * p_twist - uTime * p_flow;
  float s = smoothstep(0.5 - p_sharp, 0.5 + p_sharp, 0.5 + 0.5 * sin(v * TAU));
  vec3 c1 = pal(v * 0.08 + r * 0.5 + p_colorShift) * 0.75;
  vec3 c2 = pal(v * 0.08 + 0.5 + p_colorShift) * 0.08;
  vec3 col = mix(c2, c1, s);
  col *= mix(1.0, smoothstep(0.0, 0.5, r) * 1.6, p_depth);
  col *= 1.0 + uBeat * 0.25;
  return vec4(col, 1.0);
}`,
  },
  {
    id: 'cells', name: 'Células Pulsantes', category: 'Psicodélico', kind: 'shader',
    description: 'Voronoi animado — cada célula reage a uma faixa do espectro.',
    defaultPalette: 5,
    params: [
      P('scale', 'Escala', 1, 20, 6),
      P('speed', 'Movimento', 0, 3, 0.8),
      P('edge', 'Bordas', 0, 3, 1.2, { src: 'beat', amount: 0.25 }),
      P('fill', 'Preenchimento', 0, 2, 0.8),
      P('colorShift', 'Cor', 0, 1, 0),
    ],
    glsl: /* glsl */ `
vec4 gen(vec2 uv) {
  vec2 p = uvc(uv) * p_scale;
  vec2 ip = floor(p), fp = fract(p);
  float d1 = 8.0, d2 = 8.0;
  vec2 id = vec2(0.0);
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash2(ip + g);
    o = 0.5 + 0.45 * sin(uTime * p_speed + TAU * o);
    vec2 rr = g + o - fp;
    float d = dot(rr, rr);
    if (d < d1) { d2 = d1; d1 = d; id = ip + g; } else if (d < d2) { d2 = d; }
  }
  float edge = sqrt(d2) - sqrt(d1);
  float h = hash(id);
  float s = spec(h * 0.7 + 0.02);
  vec3 col = pal(h + p_colorShift + uTime * 0.02) * (0.15 + s * 1.2) * p_fill * (1.0 - sqrt(d1) * 0.7);
  col += pal(h + 0.5 + p_colorShift) * smoothstep(0.08 * p_edge, 0.0, edge) * p_edge;
  return vec4(col, 1.0);
}`,
  },
  {
    id: 'chladni', name: 'Padrões Chladni', category: 'Psicodélico', kind: 'shader',
    description: 'Figuras de ressonância de placas vibrando — geometria sagrada sonora.',
    defaultPalette: 7,
    params: [
      P('n', 'Modo N', 1, 12, 3),
      P('m', 'Modo M', 1, 12, 5),
      P('morph', 'Metamorfose', 0, 4, 1.0),
      P('scale', 'Escala', 0.5, 3, 1.2),
      P('thick', 'Espessura', 0.05, 2, 0.5, { src: 'bass', amount: 0.2 }),
      P('fill', 'Preenchimento', 0, 2, 0.6),
      P('colorShift', 'Cor', 0, 1, 0),
    ],
    glsl: /* glsl */ `
vec4 gen(vec2 uv) {
  vec2 p = uvc(uv) * p_scale * 2.0;
  float n = p_n + sin(uTime * 0.1) * p_morph;
  float m = p_m + cos(uTime * 0.13) * p_morph;
  float v = sin(n * p.x * PI) * sin(m * p.y * PI) - sin(m * p.x * PI) * sin(n * p.y * PI);
  v += uBass * 0.4 * sin(length(p) * 8.0 - uTime * 4.0);
  float line = smoothstep(p_thick * 0.12, 0.0, abs(v));
  vec3 col = pal(length(p) * 0.15 + v * 0.2 + p_colorShift) * (line * 0.9 + abs(v) * 0.06 * p_fill);
  col *= 1.0 + uBeat * 0.3;
  return vec4(col, 1.0);
}`,
  },
  {
    id: 'horizon', name: 'Horizonte Neon', category: 'Psicodélico', kind: 'shader',
    description: 'Grid retrô infinito com sol listrado e montanhas de espectro.',
    defaultPalette: 4,
    params: [
      P('speed', 'Velocidade', 0, 4, 1.0, { src: 'level', amount: 0.2 }),
      P('height', 'Altura câmera', 0.2, 2, 0.6),
      P('grid', 'Densidade grid', 0.5, 4, 1.5),
      P('mountains', 'Montanhas', 0, 1, 0.6),
      P('sun', 'Sol', 0, 2, 1.0, { src: 'bass', amount: 0.2 }),
      P('colorShift', 'Cor', 0, 1, 0),
    ],
    glsl: /* glsl */ `
vec4 gen(vec2 uv) {
  vec2 p = uvc(uv);
  float hz = -0.05;
  vec3 col = pal(0.6 + p.y * 0.6 + p_colorShift) * 0.12 * smoothstep(hz, 0.5, p.y);
  vec2 sp = p - vec2(0.0, 0.14);
  float sr = length(sp);
  float sun = smoothstep(0.26, 0.255, sr);
  if (sp.y < 0.02) sun *= step(0.35 + sp.y * 2.5, fract(sp.y * 22.0 + uTime * 0.6));
  col += pal(0.05 + sp.y * 0.8 + p_colorShift) * sun * 0.8 * p_sun;
  col += pal(0.1 + p_colorShift) * 0.008 / (sr + 0.03) * p_sun;
  float mx = abs(p.x);
  float mh = hz + (spec(mx * 0.5) * 0.18 + fbm(vec2(p.x * 4.0, 1.0)) * 0.08) * p_mountains;
  if (p.y < mh && p.y > hz) col = pal(0.75 + p_colorShift) * 0.05 + pal(0.9 + p_colorShift) * smoothstep(0.004, 0.0, abs(p.y - mh)) * 1.2;
  if (p.y < hz) {
    float z = p_height / (hz - p.y + 1e-4);
    vec2 g = vec2(p.x * z, z + uTime * p_speed * 2.0) * p_grid * 0.5;
    vec2 gd = abs(fract(g - 0.5) - 0.5) / fwidth(g);
    float line = 1.0 - min(min(gd.x, gd.y), 1.0);
    float fade = exp(-z * 0.08);
    col = pal(0.85 + p_colorShift) * line * fade * (1.2 + uBeat) + pal(0.7) * 0.03 * fade;
  }
  return vec4(col, 1.0);
}`,
  },

  // ======================= ESCULTURAS 3D =======================
  {
    id: 'gyroid', name: 'Escultura Giroide', category: 'Escultura', kind: 'shader', resScale: 0.7,
    description: 'Superfície mínima giroide esculpida dentro de uma esfera.',
    defaultPalette: 2,
    params: [
      P('size', 'Tamanho', 0.5, 1.6, 1.15),
      P('freq', 'Frequência', 2, 14, 6),
      P('thick', 'Espessura', 0.2, 3, 1.0, { src: 'bass', amount: 0.25 }),
      P('flow', 'Fluxo', 0, 3, 0.6),
      ...SCULPT_PARAMS,
    ],
    glsl: sculpture(/* glsl */ `
float map(vec3 p) {
  p.xz *= rot(uTime * 0.15);
  float sph = length(p) - p_size;
  vec3 q = p * p_freq;
  float g = abs(dot(sin(q), cos(q.zxy + uTime * p_flow))) / p_freq - 0.03 * p_thick;
  gTrap = length(p);
  return max(sph, g * 0.7);
}
vec3 shade(vec3 p, vec3 n) { return pal(gTrap * 0.6 + dot(n, vec3(0.3, 0.5, 0.2)) * 0.3 + p_colorShift); }
`),
  },
  {
    id: 'mandelbulb', name: 'Mandelbulb', category: 'Escultura', kind: 'shader', resScale: 0.6,
    description: 'Fractal 3D clássico com potência animada — escultura alienígena.',
    defaultPalette: 3,
    params: [
      P('power', 'Potência', 2, 12, 8),
      P('morph', 'Metamorfose', 0, 3, 0.8, { src: 'bass', amount: 0.1 }),
      ...SCULPT_PARAMS.map(d => (d.key === 'dist' ? { ...d, default: 3.1 } : d)),
    ],
    glsl: sculpture(/* glsl */ `
float map(vec3 p) {
  p.xz *= rot(uTime * 0.1);
  vec3 w = p;
  float m = dot(w, w), dz = 1.0, trap = 1e9;
  float pw = p_power + sin(uTime * 0.2) * p_morph;
  for (int i = 0; i < 5; i++) {
    float r = sqrt(m);
    dz = pw * pow(r, pw - 1.0) * dz + 1.0;
    float b = pw * acos(clamp(w.y / r, -1.0, 1.0));
    float a = pw * atan(w.x, w.z);
    w = p + pow(r, pw) * vec3(sin(b) * sin(a), cos(b), sin(b) * cos(a));
    m = dot(w, w);
    trap = min(trap, m);
    if (m > 256.0) break;
  }
  gTrap = trap;
  return 0.25 * log(m) * sqrt(m) / dz;
}
vec3 shade(vec3 p, vec3 n) { return pal(sqrt(gTrap) * 0.8 + p_colorShift); }
`, 0.9),
  },
  {
    id: 'metal', name: 'Metal Líquido', category: 'Escultura', kind: 'shader', resScale: 0.7,
    description: 'Metaballs iridescentes que se fundem — cada bolha ouve uma frequência.',
    defaultPalette: 8,
    params: [
      P('spread', 'Espalhamento', 0.2, 1.5, 0.75),
      P('goo', 'Fusão', 0.05, 1, 0.45),
      P('react', 'Reação', 0, 2, 1.0),
      P('ripple', 'Ondulação', 0, 3, 1.0, { src: 'mid', amount: 0.2 }),
      P('irid', 'Iridescência', 0, 3, 1.2),
      ...SCULPT_PARAMS,
    ],
    glsl: sculpture(/* glsl */ `
float map(vec3 p) {
  float d = 1e9;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec3 c = vec3(sin(uTime * 0.7 + fi * 1.7), cos(uTime * 0.5 + fi * 2.3), sin(uTime * 0.6 + fi * 0.9)) * p_spread;
    float r = 0.3 + 0.35 * spec(fi / 10.0 + 0.02) * p_react;
    d = smin(d, length(p - c) - r, p_goo);
  }
  d += sin(p.x * 10.0 + uTime * 3.0) * sin(p.y * 10.0) * sin(p.z * 10.0) * 0.015 * p_ripple;
  return d;
}
vec3 shade(vec3 p, vec3 n) {
  float f = dot(n, -gRd);
  return pal(f * p_irid + p.y * 0.3 + p_colorShift) * (0.5 + 0.5 * reflect(gRd, n).y);
}
`, 0.7),
  },
  {
    id: 'ribbon', name: 'Fita Torcida', category: 'Escultura', kind: 'shader', resScale: 0.7,
    description: 'Toro com seção torcida — uma fita de Möbius esculpida em luz.',
    defaultPalette: 1,
    params: [
      P('radius', 'Raio', 0.4, 1.5, 0.9),
      P('twist', 'Torção', 0, 8, 1.5),
      P('width', 'Largura', 0.05, 0.6, 0.28, { src: 'bass', amount: 0.15 }),
      P('thick', 'Espessura', 0.01, 0.3, 0.06),
      ...SCULPT_PARAMS,
    ],
    glsl: sculpture(/* glsl */ `
float map(vec3 p) {
  p.yz *= rot(0.6 + sin(uTime * 0.2) * 0.3);
  p.xz *= rot(uTime * 0.2);
  float ang = atan(p.z, p.x);
  vec2 q = vec2(length(p.xz) - p_radius, p.y);
  q *= rot(ang * p_twist * 0.5 + uTime);
  vec2 b = abs(q) - vec2(p_width, p_thick);
  gTrap = ang;
  return (length(max(b, 0.0)) + min(max(b.x, b.y), 0.0) - 0.01) * 0.6;
}
vec3 shade(vec3 p, vec3 n) { return pal(gTrap / TAU + uTime * 0.05 + p_colorShift); }
`),
  },
  {
    id: 'crystal', name: 'Cristal Fractal', category: 'Escultura', kind: 'shader', resScale: 0.65,
    description: 'Fractal por dobras caleidoscópicas (KIFS) — catedral de cristal.',
    defaultPalette: 9,
    params: [
      P('scale', 'Escala', 1.5, 3, 2.0),
      P('fold', 'Dobra', 0, 1.5, 0.3, { src: 'bass', amount: 0.08 }),
      P('offset', 'Deslocamento', 0.5, 1.5, 1.0),
      ...SCULPT_PARAMS.map(d => (d.key === 'dist' ? { ...d, default: 3.6 } : d)),
    ],
    glsl: sculpture(/* glsl */ `
float map(vec3 p) {
  p.xz *= rot(uTime * 0.12);
  p.xy *= rot(uTime * 0.07);
  float s = 1.0, trap = 1e9;
  for (int i = 0; i < 7; i++) {
    p = abs(p);
    if (p.x < p.y) p.xy = p.yx;
    if (p.x < p.z) p.xz = p.zx;
    if (p.y < p.z) p.yz = p.zy;
    p = p * p_scale - vec3(p_offset) * (p_scale - 1.0);
    p.xy *= rot(p_fold);
    s *= p_scale;
    trap = min(trap, length(p));
  }
  gTrap = trap / s;
  return sdBox(p, vec3(1.0)) / s;
}
vec3 shade(vec3 p, vec3 n) { return pal(gTrap * 4.0 + length(p) * 0.3 + p_colorShift); }
`),
  },

  // ======================= PARTÍCULAS =======================
  {
    id: 'sculptor', name: 'Escultor de Partículas', category: 'Partículas', kind: 'sculptor',
    description: '28 formas, fusão A↔B, deformações, ruídos reativos e 8 materiais (pontos, nuvem, linhas, wireframe, maciço…). Arraste no preview para girar, Shift+arraste para mover, roda para escalar.',
    defaultPalette: 0,
    params: SCULPTOR_PARAMS,
  },

  // ======================= OVERLAY =======================
  {
    id: 'scope', name: 'Osciloscópio', category: 'Overlay', kind: 'shader',
    description: 'Linhas de forma de onda brilhantes — ideal sobre outra camada (add).',
    defaultPalette: 6,
    params: [
      P('lines', 'Linhas', 1, 6, 3, undefined, 1),
      P('amp', 'Amplitude', 0, 1, 0.3),
      P('spacing', 'Espaçamento', 0, 0.4, 0.12),
      P('thick', 'Espessura', 0.2, 4, 1.0),
      P('polar', 'Circular', 0, 1, 0),
      P('colorShift', 'Cor', 0, 1, 0),
    ],
    glsl: /* glsl */ `
vec4 gen(vec2 uv) {
  vec2 p = uvc(uv);
  float x = uv.x, y = p.y;
  if (p_polar > 0.5) { x = atan(p.y, p.x) / TAU + 0.5; y = length(p) - 0.25; }
  vec3 col = vec3(0.0);
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    if (fk >= floor(p_lines)) break;
    float off = (fk - (floor(p_lines) - 1.0) * 0.5) * p_spacing;
    float w = wave(fract(x + fk * 0.11)) * p_amp * (0.6 + uLevel);
    float d = abs(y - off - w);
    col += pal(fk / max(p_lines, 1.0) + p_colorShift + x * 0.3) * p_thick * 0.003 / (d + 0.002);
  }
  return vec4(col, clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0));
}`,
  },
  {
    id: 'spectrum', name: 'Mandala Espectral', category: 'Overlay', kind: 'shader',
    description: 'Anel simétrico desenhado pelo espectro de frequências.',
    defaultPalette: 1,
    params: [
      P('sym', 'Simetria', 1, 16, 6, undefined, 1),
      P('radius', 'Raio', 0.05, 0.4, 0.18),
      P('amp', 'Amplitude', 0, 0.5, 0.2),
      P('rings', 'Anéis', 1, 5, 2, undefined, 1),
      P('glow', 'Brilho', 0.2, 3, 1.0),
      P('colorShift', 'Cor', 0, 1, 0),
    ],
    glsl: /* glsl */ `
vec4 gen(vec2 uv) {
  vec2 p = uvc(uv) * rot(uTime * 0.1);
  float r = length(p);
  float a = atan(p.y, p.x);
  float aa = abs(fract(a / TAU * floor(p_sym)) - 0.5) * 2.0;
  vec3 col = vec3(0.0);
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    if (fk >= floor(p_rings)) break;
    float s = spec(aa * 0.6 + 0.02 + fk * 0.08);
    float rad = p_radius * (1.0 + fk * 0.6) + s * p_amp * (1.0 + fk * 0.3);
    col += pal(aa * 0.4 + fk * 0.2 + p_colorShift) * 0.004 * p_glow / (abs(r - rad) + 0.002);
  }
  col *= 1.0 + uBeat * 0.6;
  return vec4(col, clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0));
}`,
  },
  {
    id: 'shapes', name: 'Geometria na Batida', category: 'Overlay', kind: 'shader',
    description: 'Polígonos aninhados que giram e piscam no ritmo.',
    defaultPalette: 0,
    params: [
      P('sides', 'Lados', 3, 8, 3, undefined, 1),
      P('count', 'Quantidade', 1, 6, 4, undefined, 1),
      P('gap', 'Intervalo', 0.02, 0.2, 0.07),
      P('spin', 'Giro', -2, 2, 0.5),
      P('kick', 'Chute', 0, 3, 1.5),
      P('strobe', 'Strobo', 0, 1, 0.4),
      P('thick', 'Espessura', 0.2, 4, 1.0),
      P('colorShift', 'Cor', 0, 1, 0),
    ],
    glsl: /* glsl */ `
vec4 gen(vec2 uv) {
  vec2 p = uvc(uv);
  float sides = floor(p_sides);
  vec3 col = vec3(0.0);
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    if (fk >= floor(p_count)) break;
    vec2 q = p * rot(uTime * 0.2 * p_spin * (mod(fk, 2.0) * 2.0 - 1.0) + fk * 0.4);
    float a = atan(q.y, q.x) + PI;
    float seg = TAU / sides;
    float d = cos(floor(0.5 + a / seg) * seg - a) * length(q);
    float size = 0.08 + fk * p_gap + uBeat * p_kick * 0.03 + uBass * 0.03;
    col += pal(fk * 0.15 + p_colorShift + uTime * 0.03) * p_thick * 0.0025 / (abs(d - size) + 0.0015);
  }
  col *= mix(1.0, uBeat * 2.0, p_strobe);
  return vec4(col, clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0));
}`,
  },

  {
    id: 'text', name: 'Texto', category: 'Overlay', kind: 'text',
    description: 'Texto reativo ao som. Use {musica} para mostrar a faixa tocando no Spotify.',
    defaultPalette: 1,
    params: [
      P('scale', 'Tamanho', 0.2, 4, 1),
      P('posX', 'Posição X', -1, 1, 0),
      P('posY', 'Posição Y', -1, 1, 0),
      P('pulse', 'Pulso no grave', 0, 3, 1),
      P('wave', 'Ondulação', 0, 3, 0),
      P('split', 'Separação RGB', 0, 3, 0.5),
      P('spread', 'Gradiente', 0, 2, 0.5),
      P('flow', 'Fluxo de cor', -2, 2, 0.5),
      P('colorShift', 'Cor', 0, 1, 0),
    ],
    glsl: /* glsl */ `
uniform sampler2D uText;
vec4 gen(vec2 uv) {
  vec2 p = uv - 0.5 - vec2(p_posX, p_posY) * 0.5;
  p /= p_scale * (1.0 + uBass * p_pulse * 0.15 + uBeat * p_pulse * 0.08);
  p.x += sin(p.y * 20.0 + uTime * 3.0) * p_wave * 0.02;
  p.y += sin(p.x * 12.0 + uTime * 2.0) * p_wave * 0.01;
  vec2 q = p + 0.5;
  float sp = p_split * 0.006 * (0.3 + uHigh + uBeat);
  float a = texture2D(uText, q).a;
  float ar = texture2D(uText, q + vec2(sp, 0.0)).a;
  float ab = texture2D(uText, q - vec2(sp, 0.0)).a;
  vec3 col = pal(q.x * p_spread + uTime * p_flow * 0.1 + p_colorShift) * 1.2;
  return vec4(col * vec3(ar, a, ab), max(a, max(ar, ab)));
}`,
  },

  // ======================= MÍDIA =======================
  {
    id: 'media', name: 'Imagem / Vídeo / Webcam', category: 'Mídia', kind: 'media',
    description: 'Use sua própria imagem, vídeo ou webcam como fonte com efeitos.',
    defaultPalette: 11,
    params: [
      P('zoom', 'Zoom', 0.5, 4, 1.0, { src: 'bass', amount: 0.03 }),
      P('panX', 'Pan X', -1, 1, 0),
      P('panY', 'Pan Y', -1, 1, 0),
      P('key', 'Recorte luma', 0, 1, 0),
      P('tint', 'Tingir paleta', 0, 1, 0),
    ],
    glsl: /* glsl */ `
uniform sampler2D uMedia;
uniform float uMediaAspect;
uniform float uHasMedia;
vec4 gen(vec2 uv) {
  if (uHasMedia < 0.5) {
    vec2 p = uvc(uv);
    float g = step(0.48, abs(fract(p.x * 10.0) - 0.5)) + step(0.48, abs(fract(p.y * 10.0) - 0.5));
    return vec4(vec3(0.08) * g, 1.0);
  }
  vec2 p = (uv - 0.5);
  float a = aspect() / uMediaAspect;
  if (a > 1.0) p.y /= a; else p.x *= a;
  p = p / p_zoom + vec2(p_panX, p_panY) * 0.5;
  vec4 tex = texture2D(uMedia, p + 0.5);
  vec3 col = mix(tex.rgb, pal(luma(tex.rgb)), p_tint);
  float alpha = smoothstep(p_key, p_key + 0.1, luma(tex.rgb)) ;
  return vec4(col, p_key > 0.0 ? alpha : 1.0);
}`,
  },
];

export const GENERATOR_MAP: Record<string, GeneratorDef> =
  Object.fromEntries(GENERATORS.map(g => [g.id, g]));

export const GEN_CATEGORIES: GenCategory[] = ['Psicodélico', 'Escultura', 'Partículas', 'Overlay', 'Mídia'];
