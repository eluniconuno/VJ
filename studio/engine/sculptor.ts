// Escultor de partículas: versão GPU do escultor original (VJCanvas antigo).
// Mesmas 28 formas, modos de fusão, deformações e modos de ruído — agora
// calculados no vertex shader, com vários materiais de desenho.
import { Modulation, ParamDef } from './types';

export const SHAPES = [
  'Esfera', 'Toro', 'Monolito', 'Grade de dados', 'Nó neural', 'DNA', 'Espiral', 'Voronoi',
  'Estilhaçado', 'Icosaedro', 'Nó toroidal', 'Terreno', 'Nuvem', 'Plano', 'Grade', 'Sentimental',
  'Cubo', 'Pirâmide', 'Cilindro', 'Grade cúbica', 'Bola espinhosa', 'Coração', 'Rosácea',
  'Fita de Möbius', 'Superfórmula', 'Atrator de Lorenz', 'Mandelbulb', 'Mandala sagrada',
];

export const MATERIALS = ['Pontos', 'Nuvem (cloud points)', 'Pixels', 'Estrelas', 'Linhas', 'Linhas em espiral', 'Wireframe', 'Maciço'];
export const MERGE_MODES = ['Interpolar', 'Somar', 'Subtrair', 'Interseção', 'Eixo cruzado'];
export const NOISE_MODES = [
  'Nenhum', 'Forma de onda', 'Pulso', 'Ruído', 'Vórtice', 'Ondulação', 'Harmônicos',
  'Rasgo de malha', 'Datamosh', 'Bit crush', 'Torção', 'Curvar', 'Esticar', 'Sentimental',
];
const SYMMETRY = ['Nenhuma', 'Espelho 2x', 'Radial 4x', 'Mandala 8x'];
const MOUSE = ['Desligado', 'Repelir', 'Atrair', 'Vórtice', 'Onda'];
const COLOR_MODES = ['Por índice', 'Por altura', 'Por distância', 'Pelo espectro', 'Cor única'];

/** Formas que usam os parâmetros Math A–D: rótulos e valores sugeridos. */
export const SHAPE_MATH: Record<number, { labels: string[]; defaults: number[] }> = {
  24: { labels: ['Simetria m', 'n1', 'n2', 'n3'], defaults: [6, 1, 1, 1] },
  25: { labels: ['Sigma σ', 'Rho ρ', 'Beta β', 'Escala'], defaults: [10, 28, 2.666, 1] },
  26: { labels: ['Potência', 'Iterações', 'Escala', 'Metamorfose'], defaults: [8, 5, 1, 0] },
  27: { labels: ['Pétalas', 'Torção', 'Frequência', 'Raio'], defaults: [8, 2, 3, 1] },
};

const P = (
  group: string, key: string, label: string, min: number, max: number, def: number,
  extra: { mod?: Partial<Modulation>; step?: number; options?: string[] } = {},
): ParamDef => ({ key, label, min, max, default: def, group, ...extra });

const opt = (options: string[]) => ({ options, step: 1 });

export const SCULPTOR_PARAMS: ParamDef[] = [
  P('Forma', 'shapeA', 'Forma A', 0, SHAPES.length - 1, 0, opt(SHAPES)),
  P('Forma', 'shapeB', 'Forma B', 0, SHAPES.length - 1, 10, opt(SHAPES)),
  P('Forma', 'mix', 'Fusão A↔B', 0, 1, 0),
  P('Forma', 'merge', 'Modo de fusão', 0, MERGE_MODES.length - 1, 0, opt(MERGE_MODES)),
  P('Forma', 'morphTime', 'Tempo de transição (s)', 0.05, 4, 1.2),
  P('Forma', 'bounce', 'Elasticidade', 0, 3, 1),

  P('Matemática', 'mathA', 'Math A', 0, 20, 4),
  P('Matemática', 'mathB', 'Math B', 0, 40, 1),
  P('Matemática', 'mathC', 'Math C', 0, 10, 1),
  P('Matemática', 'mathD', 'Math D', 0, 5, 1),

  P('Escultura', 'scaleX', 'Escala X', 0.1, 3, 1),
  P('Escultura', 'scaleY', 'Escala Y', 0.1, 3, 1),
  P('Escultura', 'scaleZ', 'Escala Z', 0.1, 3, 1),
  P('Escultura', 'warp', 'Distorção senoidal', 0, 5, 0),
  P('Escultura', 'freqX', 'Frequência X', 0, 10, 1),
  P('Escultura', 'freqY', 'Frequência Y', 0, 10, 1),
  P('Escultura', 'freqZ', 'Frequência Z', 0, 10, 1),
  P('Escultura', 'modulation', 'Modulação harmônica', 0, 3, 0),
  P('Escultura', 'twist', 'Torção', -10, 10, 0),
  P('Escultura', 'symmetry', 'Simetria', 0, SYMMETRY.length - 1, 0, opt(SYMMETRY)),
  P('Escultura', 'power', 'Potência (inflar/encolher)', 0.2, 3, 1),
  P('Escultura', 'shapeNoise', 'Ruído geométrico', 0, 3, 0),
  P('Escultura', 'chaos', 'Caos', 0, 10, 0),

  P('Ruído e áudio', 'noiseMode', 'Modo de ruído', 0, NOISE_MODES.length - 1, 1, opt(NOISE_MODES)),
  P('Ruído e áudio', 'noiseAmt', 'Intensidade do ruído', 0, 5, 1),
  P('Ruído e áudio', 'noiseFreq', 'Frequência do ruído', 0.1, 5, 1),
  P('Ruído e áudio', 'audioPush', 'Explosão pelo espectro', 0, 2, 0.4),

  P('Material e cor', 'material', 'Material', 0, MATERIALS.length - 1, 0, opt(MATERIALS)),
  P('Material e cor', 'size', 'Tamanho do ponto', 0.2, 6, 1.6),
  P('Material e cor', 'alpha', 'Opacidade', 0, 1, 0.85),
  P('Material e cor', 'bright', 'Brilho', 0, 3, 1),
  P('Material e cor', 'colorMode', 'Modo de cor', 0, COLOR_MODES.length - 1, 0, opt(COLOR_MODES)),
  P('Material e cor', 'colorShift', 'Cor', 0, 1, 0),
  P('Material e cor', 'colorFlow', 'Fluxo de cor', -1, 1, 0.1),

  P('Câmera', 'dist', 'Distância', 1, 12, 3.5),
  P('Câmera', 'rotX', 'Inclinação', -1.6, 1.6, 0.3),
  P('Câmera', 'rotY', 'Giro manual', -3.14, 3.14, 0),
  P('Câmera', 'spin', 'Rotação automática', -2, 2, 0.25),
  P('Câmera', 'posX', 'Posição X', -2, 2, 0),
  P('Câmera', 'posY', 'Posição Y', -2, 2, 0),
  P('Câmera', 'scale', 'Escala 3D', 0.1, 4, 1),
  P('Câmera', 'shake', 'Tremor', 0, 2, 0),

  P('Interação', 'mouseMode', 'Mouse', 0, MOUSE.length - 1, 1, opt(MOUSE)),
  P('Interação', 'mouseForce', 'Força do mouse', 0, 3, 1),
];

// ---------------------------------------------------------------------------

export const SCULPTOR_VERT = /* glsl */ `
attribute float aIdx;
attribute vec2 aUV;
attribute vec3 aRand;
uniform float uCount;
uniform float uPrevA;
uniform float uPrevB;
uniform float uTransA;
uniform float uTransB;
uniform vec2 uMouse;
uniform float uIsPoints;
varying vec3 vColor;
varying float vAlpha;
varying vec3 vViewPos;

vec3 sph(float th, float ph) { return vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th)); }

vec3 boxSurf(vec2 uv, vec3 size) {
  float f = floor(uv.y * 6.0);
  vec2 q = vec2(uv.x, fract(uv.y * 6.0)) - 0.5;
  vec3 p;
  if (f < 0.5) p = vec3(q.x, q.y, 0.5);
  else if (f < 1.5) p = vec3(q.x, q.y, -0.5);
  else if (f < 2.5) p = vec3(q.x, 0.5, q.y);
  else if (f < 3.5) p = vec3(q.x, -0.5, q.y);
  else if (f < 4.5) p = vec3(0.5, q.x, q.y);
  else p = vec3(-0.5, q.x, q.y);
  return p * size;
}

float sf(float a) {
  float t1 = pow(max(abs(cos(p_mathA * a / 4.0)), 1e-4), max(p_mathC, 0.01));
  float t2 = pow(max(abs(sin(p_mathA * a / 4.0)), 1e-4), max(p_mathD, 0.01));
  return min(pow(t1 + t2, -1.0 / max(p_mathB, 0.05)), 4.0);
}

vec3 icoVert(float vi) {
  float a = mod(vi, 2.0) < 0.5 ? 1.0 : -1.0;
  float b = mod(floor(vi / 2.0), 2.0) < 0.5 ? 1.618034 : -1.618034;
  float g = floor(vi / 4.0);
  if (g < 0.5) return vec3(0.0, a, b);
  if (g < 1.5) return vec3(a, b, 0.0);
  return vec3(b, 0.0, a);
}

bool mbInside(vec3 c) {
  vec3 z = c;
  float n = p_mathA;
  float it = clamp(floor(p_mathB), 1.0, 8.0);
  for (int k = 0; k < 8; k++) {
    if (float(k) >= it) break;
    float rr = length(z);
    if (rr > 2.0) return false;
    float tt = acos(clamp(z.z / max(rr, 1e-5), -1.0, 1.0)) * n + p_mathD;
    float pp = atan(z.y, z.x) * n;
    z = pow(rr, n) * vec3(sin(tt) * cos(pp), sin(tt) * sin(pp), cos(tt)) + c;
  }
  return length(z) <= 2.0;
}

// Todas as formas têm raio ~1 (as antigas tinham ~25).
vec3 shape(float id, float t, vec2 uv, vec3 r) {
  int s = int(id + 0.5);
  float th = uv.x * TAU;
  float ph = acos(clamp(1.0 - 2.0 * uv.y, -1.0, 1.0));
  if (s == 0) return sph(th, ph);
  if (s == 1) { float v = uv.y * TAU; return vec3((0.8 + 0.32 * cos(v)) * cos(th), (0.8 + 0.32 * cos(v)) * sin(th), 0.32 * sin(v)); }
  if (s == 2) return boxSurf(uv, vec3(0.6, 2.4, 0.6));
  if (s == 3 || s == 19) {
    float side = floor(pow(uCount, 1.0 / 3.0) + 0.01);
    float k = floor(t * uCount + 0.5);
    vec3 g = vec3(mod(k, side), mod(floor(k / side), side), mod(floor(k / (side * side)), side));
    return (g / max(side - 1.0, 1.0) - 0.5) * (s == 3 ? 2.0 : 1.4);
  }
  if (s == 4) {
    if (r.x < 0.3) return sph(r.y * TAU, acos(1.0 - 2.0 * r.z)) * 0.4 * pow(r.x / 0.3, 0.33);
    float ax = floor(fract(r.x * 7.13) * 12.0);
    float ang = ax / 12.0 * TAU;
    float rad = 0.4 + uv.x * 2.4;
    float n = sin(uv.x * 10.0 + ax * 3.0) * 0.2;
    return vec3(rad * cos(ang) + n, rad * sin(ang) + n, cos(uv.x * 5.0) * 0.8);
  }
  if (s == 5) {
    float h = (uv.y * 2.0 - 1.0) * 1.6;
    float a = h * 6.0 + step(0.5, uv.x) * PI;
    float rr = 0.4 + (fract(uv.x * 2.0) - 0.5) * 0.08;
    return vec3(rr * cos(a), h, rr * sin(a));
  }
  if (s == 6) {
    float k = t * 12000.0;
    float a = k * 2.39996;
    float rr = 0.3 * sqrt(k) / 25.0;
    return vec3(rr * cos(a), rr * sin(a), (r.x - 0.5) * 0.02);
  }
  if (s == 7) {
    float c = floor(r.x * 50.0);
    vec3 seed = (vec3(hash(c), hash(c + 7.1), hash(c + 3.3)) - 0.5) * 2.8;
    return seed + sph(th, ph) * 0.2;
  }
  if (s == 8) {
    float shard = mod(floor(ph * 5.0) + floor(th * 3.0), 10.0);
    return sph(th, ph) * (mod(shard, 2.0) < 0.5 ? 1.2 : 1.0);
  }
  if (s == 9) return icoVert(floor(r.x * 12.0)) * 0.48 + (vec3(r.y, r.z, fract(r.x * 13.7)) - 0.5) * 0.64;
  if (s == 10) {
    float rr = 1.0 + 0.32 * cos(3.0 * th);
    vec3 c = vec3(rr * cos(2.0 * th), rr * sin(2.0 * th), 0.32 * sin(3.0 * th));
    float a = uv.y * TAU;
    return c + vec3(cos(a) * cos(2.0 * th), sin(a), cos(a) * sin(2.0 * th)) * 0.07;
  }
  if (s == 11) return vec3((uv.x - 0.5) * 4.0, -0.4 + (noise(uv * 6.0) - 0.5) * 0.2, (uv.y - 0.5) * 4.0);
  if (s == 12) return sph(r.y * TAU, acos(1.0 - 2.0 * r.z)) * 1.4 * pow(r.x, 1.0 / 3.0);
  if (s == 13) return vec3((uv.x - 0.5) * 2.4, 0.0, (uv.y - 0.5) * 2.4);
  if (s == 14) {
    vec2 q = uv;
    if (r.x < 0.5) q.x = floor(q.x * 16.0 + 0.5) / 16.0; else q.y = floor(q.y * 16.0 + 0.5) / 16.0;
    return vec3((q.x - 0.5) * 2.4, 0.0, (q.y - 0.5) * 2.4);
  }
  if (s == 15) {
    float k = floor(t * 12000.0);
    float ang = mod(k, 5.0) / 5.0 * TAU;
    float rr = (20.0 + sin(k * 0.1) * 5.0) / 25.0;
    float fil = sin(k * 0.5) * 0.6;
    return vec3(cos(ang) * rr + fil * cos(k), sin(ang) * rr + fil * sin(k), sin(k * 0.05) * 0.4) + (r - 0.5) * 0.03;
  }
  if (s == 16) return boxSurf(uv, vec3(1.6));
  if (s == 17) {
    float f = floor(uv.y * 5.0), lv = fract(uv.y * 5.0);
    if (f < 0.5) return vec3((uv.x - 0.5) * 1.6, -0.8, (lv - 0.5) * 1.6);
    float a0 = (f - 1.0) * PI * 0.5 + PI * 0.25, a1 = a0 + PI * 0.5;
    vec2 e = mix(vec2(cos(a0), sin(a0)), vec2(cos(a1), sin(a1)), uv.x) * 1.6 * 0.7071;
    return vec3(e.x * (1.0 - lv), mix(-0.8, 0.8, lv), e.y * (1.0 - lv));
  }
  if (s == 18) {
    if (uv.y < 0.7) return vec3(0.8 * cos(th), (uv.y / 0.7 - 0.5) * 2.0, 0.8 * sin(th));
    float rr = sqrt(fract((uv.y - 0.7) / 0.15)) * 0.8;
    return vec3(rr * cos(th), uv.y < 0.85 ? 1.0 : -1.0, rr * sin(th));
  }
  if (s == 20) {
    vec3 n = sph(th, ph);
    return r.x < 0.067 ? n * (0.68 + r.y * 0.84) : n * 0.68;
  }
  if (s == 21) {
    float x = 16.0 * pow(sin(th), 3.0);
    float y = 13.0 * cos(th) - 5.0 * cos(2.0 * th) - 2.0 * cos(3.0 * th) - cos(4.0 * th);
    return vec3(x * 0.06, y * 0.06 + 0.1, (uv.y - 0.5) * 0.48);
  }
  if (s == 22) { float rr = 0.96 * cos(6.0 * th); return vec3(rr * cos(th), rr * sin(th), (uv.y - 0.5) * 0.64); }
  if (s == 23) {
    float v = uv.y * 2.0 - 1.0;
    float rr = 0.88 + v * 0.32 * cos(th * 0.5);
    return vec3(rr * cos(th), rr * sin(th), v * 0.32 * sin(th * 0.5));
  }
  if (s == 24) {
    float a = th - PI, b = uv.y * PI - PI * 0.5;
    float r1 = sf(a), r2 = sf(b);
    return vec3(r1 * cos(a) * r2 * cos(b), r1 * sin(a) * r2 * cos(b), r2 * sin(b)) * 0.88;
  }
  if (s == 25) {
    // parte de um ponto aleatório e integra até cair no atrator
    vec3 q = (r - 0.5) * vec3(30.0, 30.0, 20.0) + vec3(0.0, 0.0, 25.0);
    float steps = 80.0 + floor(fract(r.x * 17.3) * 240.0);
    float dt = 0.008 + fract(r.y * 13.1) * 0.004;
    for (int k = 0; k < 320; k++) {
      if (float(k) >= steps) break;
      q += vec3(p_mathA * (q.y - q.x), q.x * (p_mathB - q.z) - q.y, q.x * q.y - p_mathC * q.z) * dt;
    }
    // x-z é o plano da "borboleta": fica de frente para a câmera
    return vec3(q.x, q.z - p_mathB, q.y) * 0.036 * p_mathD + (r - 0.5) * 0.01;
  }
  if (s == 26) {
    // busca binária ao longo do raio: cada partícula pousa na superfície do fractal
    vec3 dir = sph(th, ph);
    float lo = 0.0, hi = 1.4;
    for (int k = 0; k < 10; k++) {
      float mid = (lo + hi) * 0.5;
      if (mbInside(dir * mid)) lo = mid; else hi = mid;
    }
    return (dir * lo).xzy * p_mathC;
  }
  if (s == 27) {
    float tt = th * p_mathC;
    float rs = p_mathD * 0.8;
    float rr = rs * (1.0 + 0.5 * sin(p_mathA * tt));
    float a = tt + p_mathB * sin(tt);
    return vec3(rr * cos(a), rr * sin(a), sin(tt * p_mathA) * rs * 0.3 + (uv.y - 0.5) * 0.06);
  }
  return vec3((uv.x - 0.5) * 2.4, 0.0, (uv.y - 0.5) * 2.4);
}

// transição entre formas com atraso por partícula e "quique" elástico
float morphK(float tr, float rz) {
  if (tr >= 1.0) return 1.0;
  float k = clamp(tr * 1.5 - rz * 0.5, 0.0, 1.0) - 1.0;
  float c1 = 1.70158 * p_bounce;
  return 1.0 + (c1 + 1.0) * k * k * k + c1 * k * k;
}

void main() {
  float t = aIdx / uCount;
  vec2 uv = aUV;
  vec3 r = aRand;

  // A, A anterior, B, B anterior — um único laço evita copiar shape() 4 vezes
  vec3 sA = vec3(0.0), sAp = vec3(0.0), sB = vec3(0.0), sBp = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    float id = p_shapeA;
    if (k == 1) { if (uTransA >= 1.0) continue; id = uPrevA; }
    if (k == 2) { if (p_mix <= 0.0) continue; id = p_shapeB; }
    if (k == 3) { if (p_mix <= 0.0 || uTransB >= 1.0) continue; id = uPrevB; }
    vec3 q = shape(floor(id + 0.5), t, uv, r);
    if (k == 0) sA = q; else if (k == 1) sAp = q; else if (k == 2) sB = q; else sBp = q;
  }
  sA = mix(sAp, sA, morphK(uTransA, r.z));
  sB = mix(sBp, sB, morphK(uTransB, r.z));

  // --- fusão ---
  vec3 p = sA;
  if (p_mix > 0.0) {
    float mm = floor(p_merge + 0.5);
    if (mm < 0.5) p = mix(sA, sB, p_mix);
    else if (mm < 1.5) p = sA + sB * p_mix;
    else if (mm < 2.5) p = sA - sB * p_mix;
    else if (mm < 3.5) { if (length(sA) > length(sB)) p = mix(sA, sB, p_mix); }
    else p.y = mix(sA.y, sB.y, p_mix);
  }

  // --- deformações do escultor ---
  p *= vec3(p_scaleX, p_scaleY, p_scaleZ);
  if (p_warp > 0.0) {
    p.x += sin(p.y * 2.5 * p_freqX) * 0.08 * p_warp;
    p.y += sin(p.z * 2.5 * p_freqY) * 0.08 * p_warp;
    p.z += sin(p.x * 2.5 * p_freqZ) * 0.08 * p_warp;
  }
  if (p_modulation > 0.0) {
    float len = length(p);
    if (len > 0.001) {
      float phi = acos(clamp(p.z / len, -1.0, 1.0));
      p *= 1.0 + p_modulation * 0.5 * sin(phi * 8.0) * cos(atan(p.y, p.x) * 8.0);
    }
  }
  if (p_twist != 0.0) p.xz *= rot(p.y * p_twist * 1.25);
  float sym = floor(p_symmetry + 0.5);
  if (sym > 0.5) {
    p.x = abs(p.x);
    if (sym > 1.5) p.z = abs(p.z);
    if (sym > 2.5 && p.x < p.z) p.xz = p.zx;
  }
  if (abs(p_power - 1.0) > 0.001) { float len = length(p); if (len > 0.001) p = p / len * pow(len, p_power); }
  if (p_shapeNoise > 0.0) {
    float nv = p_shapeNoise * 0.16;
    p.x += sin(p.y * 5.0 + uTime) * nv;
    p.y += cos(p.z * 5.0 + uTime) * nv;
    p.z += sin(p.x * 5.0 + uTime) * nv;
  }
  if (p_chaos > 0.0) {
    float ch = p_chaos * 0.016, i = mod(aIdx, 12000.0);
    p += vec3(sin(i * 0.13 + uTime * 6.5) * cos(i * 0.07 + uTime * 3.0),
              cos(i * 0.09 + uTime * 5.2) * sin(i * 0.11 + uTime * 4.0),
              sin(i * 0.05 + uTime * 7.1) * cos(i * 0.17 + uTime * 3.5)) * ch;
  }

  // --- modos de ruído reativos ao áudio ---
  float amp = p_noiseAmt, nf = p_noiseFreq, pulse = uBeat;
  float nm = floor(p_noiseMode + 0.5);
  float sId = floor(p_shapeA + 0.5);
  if (nm > 0.5 && amp > 0.001) {
    if (nm < 1.5) {
      float w = wave(t) * (1.0 + pulse * 2.0) * amp;
      if (sId == 11.0 || sId == 13.0 || sId == 14.0) p.y += w * 0.4;
      else { float len = length(p); if (len > 0.001) p += p / len * w * 0.2; }
    }
    else if (nm < 2.5) p *= 1.0 + pulse * amp * 0.4;
    else if (nm < 3.5) {
      float a2 = (uHigh + pulse * 0.5 + abs(sin(t * 1200.0 + uTime * 5.0 * nf)) * 0.2) * amp * 0.08;
      p += sin(r * TAU * 7.0 + uTime) * 0.5 * a2;
    }
    else if (nm < 4.5) {
      float ang = atan(p.z, p.x) + (uBass + pulse + 0.2) * amp * 1.5 * nf;
      float rr = length(p.xz);
      p.x = rr * cos(ang); p.z = rr * sin(ang);
      p.y += (uMid + 0.1) * 0.24 * amp;
    }
    else if (nm < 5.5) {
      float r1 = length(p.xz), r2 = length(p.xz - vec2(0.4, 0.0));
      p.y += (sin(r1 * 12.5 * nf - uTime * 5.0) + sin(r2 * 10.0 * nf - uTime * 4.0)) * amp * 0.06 * (1.0 + pulse);
    }
    else if (nm < 6.5) {
      float bf = p.x * 5.0 * nf;
      p.y += sin(bf + uTime) * (uBass + 0.1) * 0.4 * amp
           + sin(bf * 2.0 + uTime * 1.5) * (uMid + 0.1) * 0.2 * amp
           + sin(bf * 3.0 + uTime * 2.0) * (uHigh + 0.1) * 0.12 * amp
           + pulse * (mod(p.x * 25.0, 5.0) - 2.5) / 25.0 * amp;
    }
    else if (nm < 7.5) {
      float tid = floor(t * 120.0);
      p.x += sin(tid * nf + uTime * 2.0) * 0.24 * amp * (pulse + 0.5);
      p.y += cos(tid * 0.5 * nf + uTime) * 0.12 * amp;
    }
    else if (nm < 8.5) {
      float lag = sin(t * 120.0 * nf + uTime * 3.0) > 0.8 ? 0.0 : 1.0;
      p += sin(r * TAU * 3.0 + uTime) * (pulse + 0.2) * amp * 0.6 * lag;
    }
    else if (nm < 9.5) { float st = (0.2 + amp * 1.5 * nf) / 25.0; p = floor(p / st + 0.5) * st; }
    else if (nm < 10.5) p.xz *= rot(p.y * 0.5 * amp * (1.0 + pulse) * nf);
    else if (nm < 11.5) { float b = 0.075 * amp * (1.0 + uBass) * nf; p.x += p.y * p.y * b; p.z += p.y * p.y * b * 0.5; }
    else if (nm < 12.5) { float st = 1.0 + (uBass + 0.1) * amp * 1.5 * nf; p.y *= st; p.xz /= sqrt(st); }
    else {
      float sp = uTime * 0.5 * nf;
      p.x += sin(p.y * 1.25 + sp) * 0.08 * amp;
      p.y += cos(p.x * 1.25 + sp) * 0.08 * amp;
      p.z += sin(p.z * 1.25 + sp) * 0.08 * amp;
    }
  }
  float s = spec(fract(t * 7.0) * 0.6 + 0.02);
  if (p_audioPush > 0.0) { float len = length(p); if (len > 0.001) p += p / len * (s * 0.4 + uBeat * 0.1) * p_audioPush; }
  vec3 pl = p;

  // --- transformação e câmera ---
  p *= p_scale;
  p.xz *= rot(uTime * 0.3 * p_spin + p_rotY);
  p.yz *= rot(p_rotX);
  p.xy += vec2(p_posX, p_posY);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);

  // --- interação com o mouse (no espaço da tela) ---
  float mmode = floor(p_mouseMode + 0.5);
  if (mmode > 0.5 && uMouse.x < 5.0) {
    vec4 cp = projectionMatrix * mv;
    vec2 dv = (cp.xy / cp.w - uMouse) * vec2(uRes.x / uRes.y, 1.0);
    float d = length(dv);
    float R = 0.45;
    if (d < R) {
      float f = pow(1.0 - d / R, 2.0) * p_mouseForce * (-mv.z) * 0.25;
      vec2 dir = d > 1e-4 ? dv / d : vec2(0.0);
      if (mmode < 1.5) mv.xy += dir * f;
      else if (mmode < 2.5) mv.xy -= dir * f * 0.8;
      else if (mmode < 3.5) mv.xy += vec2(-dir.y, dir.x) * f;
      else mv.z += sin(d * 40.0 - uTime * 8.0) * f * 0.5;
    }
  }
  gl_Position = projectionMatrix * mv;

  // --- cor ---
  float flow = uTime * p_colorFlow * 0.1 + p_colorShift;
  float cm = floor(p_colorMode + 0.5);
  vec3 col;
  if (cm < 0.5) col = pal(t * 0.6 + flow) * (0.6 + s * 1.2);
  else if (cm < 1.5) col = pal(pl.y * 0.4 + flow) * (0.6 + s * 1.2);
  else if (cm < 2.5) col = pal(length(pl) * 0.5 + flow) * (0.6 + s * 1.2);
  else if (cm < 3.5) col = pal(s * 0.8 + flow) * (0.25 + s * 1.8);
  else col = pal(flow) * (0.5 + s * 1.2);
  vColor = col * p_bright * (1.0 + uBeat * 0.3);
  vAlpha = p_alpha;
  vViewPos = mv.xyz;

  float m = floor(p_material + 0.5);
  float ps = p_size * uRes.y / 600.0 * (3.0 / max(-mv.z, 0.1)) * (1.0 + s * 1.2);
  // ~147 mil pontos somados: a opacidade por ponto precisa ser baixa
  if (m < 0.5) vAlpha *= 0.3;
  else if (m < 1.5) { ps *= 4.0; vAlpha *= 0.035; }
  else if (m < 2.5) { ps *= 0.6; vAlpha *= 0.2; }
  else if (m < 3.5) { ps *= 2.5; vAlpha *= 0.1; }
  else vAlpha *= 0.35;
  gl_PointSize = clamp(ps, 1.0, 256.0);
}
`;

export const SCULPTOR_FRAG = /* glsl */ `
uniform float uIsPoints;
varying vec3 vColor;
varying float vAlpha;
varying vec3 vViewPos;
void main() {
  float m = floor(p_material + 0.5);
  if (m > 6.5) {
    vec3 n = normalize(cross(dFdx(vViewPos), dFdy(vViewPos)));
    vec3 l = normalize(vec3(0.5, 0.8, 0.6));
    float dif = abs(dot(n, l));
    float fre = pow(1.0 - abs(n.z), 2.0);
    gl_FragColor = vec4(vColor * (0.15 + 0.85 * dif) + pal(fre * 0.6 + uTime * 0.05 + p_colorShift) * fre * 0.9, 1.0);
    return;
  }
  if (uIsPoints < 0.5) { gl_FragColor = vec4(vColor, vAlpha); return; }
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  float a;
  if (m < 0.5) { if (d > 0.25) discard; a = exp(-d * 12.0); }
  else if (m < 1.5) { if (d > 0.25) discard; a = exp(-d * 10.0); }
  else if (m < 2.5) a = 1.0;
  else {
    vec2 q = abs(c);
    a = max(0.0, 1.0 - q.x * 14.0) * max(0.0, 1.0 - q.y * 2.2)
      + max(0.0, 1.0 - q.y * 14.0) * max(0.0, 1.0 - q.x * 2.2) + exp(-d * 60.0);
  }
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`;
