import { ParamDef, Modulation } from './types';

export interface EffectDef {
  id: string;
  name: string;
  description: string;
  params: ParamDef[];
  /** Precisa do frame anterior em `tPrev`. */
  feedback?: boolean;
  /** GLSL que define `vec4 effect(vec2 uv)`; lê `tInput`. */
  glsl: string;
}

const P = (
  key: string, label: string, min: number, max: number, def: number,
  mod?: Partial<Modulation>, step?: number,
): ParamDef => ({ key, label, min, max, default: def, mod, step });

export const EFFECTS: EffectDef[] = [
  {
    id: 'feedback', name: 'Feedback Infinito', feedback: true,
    description: 'Reinjeta o frame anterior com zoom/rotação — rastros psicodélicos.',
    params: [
      P('decay', 'Persistência', 0.5, 0.995, 0.9),
      P('zoom', 'Zoom', -2, 2, 0.6, { src: 'bass', amount: 0.15 }),
      P('rotate', 'Rotação', -2, 2, 0.2),
      P('hue', 'Deriva de cor', -1, 1, 0.15),
      P('warp', 'Turbulência', 0, 3, 0.5),
      P('add', 'Aditivo', 0, 1, 0),
    ],
    glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec4 cur = texture2D(tInput, uv);
  vec2 c = (uv - 0.5) * vec2(aspect(), 1.0);
  c *= rot(p_rotate * 0.02);
  c *= 1.0 - p_zoom * 0.015;
  c += (vec2(noise(c * 4.0 + uTime * 0.5), noise(c * 4.0 - uTime * 0.5 + 7.0)) - 0.5) * p_warp * 0.006;
  vec2 fuv = c / vec2(aspect(), 1.0) + 0.5;
  vec3 prev = hueShift(texture2D(tPrev, fuv).rgb, p_hue * 0.01) * p_decay;
  vec3 o = mix(max(cur.rgb, prev), cur.rgb + prev * 0.8, p_add);
  return vec4(clamp(o, 0.0, 1.5), 1.0);
}`,
  },
  {
    id: 'kaleido', name: 'Caleidoscópio',
    description: 'Espelha a imagem em N segmentos radiais.',
    params: [
      P('segments', 'Segmentos', 2, 24, 8, undefined, 1),
      P('spin', 'Giro', -2, 2, 0.2),
      P('zoom', 'Zoom', 0.3, 3, 1.0, { src: 'bass', amount: 0.05 }),
      P('offset', 'Deslocamento', 0, 1, 0.1),
    ],
    glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec2 c = (uv - 0.5) * vec2(aspect(), 1.0);
  float r = length(c);
  float a = atan(c.y, c.x) + uTime * p_spin * 0.1;
  float seg = TAU / floor(p_segments);
  a = abs(mod(a, seg) - seg * 0.5);
  c = vec2(cos(a), sin(a)) * r / p_zoom + p_offset * 0.5;
  return texture2D(tInput, mirrorUv(c / vec2(aspect(), 1.0) + 0.5));
}`,
  },
  {
    id: 'mirror', name: 'Espelho',
    description: 'Espelhamento horizontal, vertical ou quádruplo.',
    params: [P('mode', 'Modo (H/V/Quad)', 0, 2, 0, undefined, 1)],
    glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  float m = floor(p_mode + 0.5);
  if (m < 0.5 || m > 1.5) uv.x = 0.5 - abs(uv.x - 0.5);
  if (m > 0.5) uv.y = 0.5 - abs(uv.y - 0.5);
  return texture2D(tInput, uv);
}`,
  },
  {
    id: 'tile', name: 'Mosaico Espelhado',
    description: 'Repete a imagem em grade espelhada.',
    params: [
      P('count', 'Repetições', 1, 8, 2),
      P('scroll', 'Rolagem', -2, 2, 0.1),
    ],
    glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec2 q = (uv - 0.5) * p_count + 0.5 + vec2(uTime * p_scroll * 0.1, 0.0);
  return texture2D(tInput, mirrorUv(q));
}`,
  },
  {
    id: 'rgb', name: 'Separação RGB',
    description: 'Aberração cromática radial.',
    params: [P('amount', 'Intensidade', 0, 1, 0.2, { src: 'beat', amount: 0.3 })],
    glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec2 d = (uv - 0.5) * p_amount * 0.05;
  return vec4(texture2D(tInput, uv + d).r, texture2D(tInput, uv).g, texture2D(tInput, uv - d).b, 1.0);
}`,
  },
  {
    id: 'warp', name: 'Distorção Líquida',
    description: 'Desloca os pixels com ruído fluido.',
    params: [
      P('amount', 'Intensidade', 0, 1, 0.2, { src: 'bass', amount: 0.2 }),
      P('scale', 'Escala', 0.5, 10, 3),
      P('speed', 'Velocidade', 0, 3, 0.5),
    ],
    glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec2 q = uv * p_scale;
  float t = uTime * p_speed;
  vec2 o = vec2(fbm(q + vec2(t, 0.0)), fbm(q + vec2(3.1, t))) - 0.5;
  return texture2D(tInput, uv + o * p_amount * 0.15);
}`,
  },
  {
    id: 'colorize', name: 'Mapa de Paleta',
    description: 'Recolore pelo brilho usando a paleta do clip.',
    params: [
      P('cycles', 'Ciclos', 0.2, 6, 1.5),
      P('flow', 'Fluxo', -2, 2, 0.4),
      P('shift', 'Deslocamento', 0, 1, 0),
    ],
    glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec4 c = texture2D(tInput, uv);
  float l = luma(c.rgb);
  return vec4(pal(l * p_cycles + uTime * p_flow * 0.1 + p_shift) * smoothstep(0.0, 0.15, l) * (0.6 + l), c.a);
}`,
  },
  {
    id: 'grade', name: 'Correção de Cor',
    description: 'Matiz, saturação, contraste e exposição.',
    params: [
      P('hue', 'Matiz', -1, 1, 0, { src: 'saw', amount: 0, rate: 16 }),
      P('sat', 'Saturação', 0, 2, 1),
      P('contrast', 'Contraste', 0.3, 2, 1),
      P('exposure', 'Exposição', 0, 3, 1),
    ],
    glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec3 c = texture2D(tInput, uv).rgb * p_exposure;
  c = hueShift(c, p_hue);
  c = mix(vec3(luma(c)), c, p_sat);
  c = (c - 0.5) * p_contrast + 0.5;
  return vec4(max(c, 0.0), 1.0);
}`,
  },
  {
    id: 'posterize', name: 'Posterizar',
    description: 'Reduz os níveis de cor.',
    params: [P('levels', 'Níveis', 2, 16, 5)],
    glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec3 c = texture2D(tInput, uv).rgb;
  return vec4(floor(c * p_levels + 0.5) / p_levels, 1.0);
}`,
  },
  {
    id: 'pixelate', name: 'Pixelar',
    description: 'Blocos de pixel, podem pulsar com a batida.',
    params: [P('size', 'Tamanho', 1, 64, 6, { src: 'beat', amount: 0.15 })],
    glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec2 px = uRes / max(p_size, 1.0);
  return texture2D(tInput, (floor(uv * px) + 0.5) / px);
}`,
  },
  {
    id: 'glitch', name: 'Glitch Digital',
    description: 'Blocos deslocados e corrupção de cor, intensifica na batida.',
    params: [
      P('amount', 'Intensidade', 0, 1, 0.3, { src: 'beat', amount: 0.4 }),
      P('size', 'Tamanho blocos', 0.2, 4, 1),
      P('rate', 'Taxa', 0.1, 4, 1),
    ],
    glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  float t = floor(uTime * p_rate * 12.0);
  vec2 block = floor(uv * vec2(6.0, 20.0) * p_size);
  float h = hash(block + t);
  float on = step(1.0 - p_amount * 0.5, h);
  vec2 q = uv + vec2((hash(block.yx + t) - 0.5) * 0.25 * on, 0.0);
  float s = 0.01 * on;
  vec3 c = vec3(texture2D(tInput, q + vec2(s, 0.0)).r, texture2D(tInput, q).g, texture2D(tInput, q - vec2(s, 0.0)).b);
  if (on > 0.5 && hash(block + t + 3.0) > 0.7) c = c.brg;
  return vec4(c, 1.0);
}`,
  },
  {
    id: 'edge', name: 'Contorno Neon',
    description: 'Detecção de bordas brilhante colorida pela paleta.',
    params: [
      P('strength', 'Força', 0, 6, 2),
      P('keep', 'Original', 0, 1, 0.2),
    ],
    glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec2 e = 1.0 / uRes;
  float tl = luma(texture2D(tInput, uv + vec2(-e.x, e.y)).rgb), t = luma(texture2D(tInput, uv + vec2(0.0, e.y)).rgb), tr = luma(texture2D(tInput, uv + e).rgb);
  float l = luma(texture2D(tInput, uv - vec2(e.x, 0.0)).rgb), r = luma(texture2D(tInput, uv + vec2(e.x, 0.0)).rgb);
  float bl = luma(texture2D(tInput, uv - e).rgb), b = luma(texture2D(tInput, uv - vec2(0.0, e.y)).rgb), br = luma(texture2D(tInput, uv + vec2(e.x, -e.y)).rgb);
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float g = sqrt(gx * gx + gy * gy) * p_strength;
  vec3 src = texture2D(tInput, uv).rgb;
  return vec4(pal(luma(src) + uTime * 0.05) * g + src * p_keep, 1.0);
}`,
  },
  {
    id: 'strobe', name: 'Strobo / Inverter',
    description: 'Inverte ou clareia a imagem na batida.',
    params: [
      P('amount', 'Intensidade', 0, 1, 0.5),
      P('mode', 'Modo (Inv/Flash)', 0, 1, 0, undefined, 1),
    ],
    glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec3 c = texture2D(tInput, uv).rgb;
  float k = smoothstep(0.5, 1.0, uBeat) * p_amount;
  c = p_mode < 0.5 ? mix(c, 1.0 - clamp(c, 0.0, 1.0), k) : c + k;
  return vec4(c, 1.0);
}`,
  },
  {
    id: 'punch', name: 'Zoom no Grave',
    description: 'A imagem "soca" para frente com o grave.',
    params: [P('amount', 'Intensidade', 0, 1, 0.3)],
    glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  float z = 1.0 + (uBass * 0.12 + uBeat * 0.06) * p_amount;
  return texture2D(tInput, (uv - 0.5) / z + 0.5);
}`,
  },
  {
    id: 'film', name: 'Filme / Vinheta',
    description: 'Vinheta, grão e scanlines.',
    params: [
      P('vignette', 'Vinheta', 0, 2, 0.8),
      P('grain', 'Grão', 0, 0.5, 0.06),
      P('scan', 'Scanlines', 0, 1, 0),
    ],
    glsl: /* glsl */ `
vec4 effect(vec2 uv) {
  vec3 c = texture2D(tInput, uv).rgb;
  vec2 v = uv - 0.5;
  c *= 1.0 - dot(v, v) * p_vignette * 1.5;
  c += (hash(uv * uRes + fract(uTime) * 100.0) - 0.5) * p_grain;
  c *= 1.0 - p_scan * 0.3 * (0.5 + 0.5 * sin(uv.y * uRes.y * 1.5));
  return vec4(max(c, 0.0), 1.0);
}`,
  },
];

export const EFFECT_MAP: Record<string, EffectDef> =
  Object.fromEntries(EFFECTS.map(e => [e.id, e]));
