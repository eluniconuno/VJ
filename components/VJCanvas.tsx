
import React, { useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// @ts-ignore
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
// @ts-ignore
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
// @ts-ignore
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
// @ts-ignore
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VJState, ShapeType, NoiseType, EffectType, LayerType, LayerItem, MergeMode, ShapeMergeMode } from '../types';
import { audioService } from '../services/audioService';

interface VJCanvasProps {
  vjState: VJState;
  setVjState: React.Dispatch<React.SetStateAction<VJState>>;
}

const PARTICLE_COUNT = 12000;

// --- MEDIA SHADER (Background Image/Video) ---
const MediaShader = {
    uniforms: {
        map: { value: null },
        uTime: { value: 0.0 },
        uAudioLow: { value: 0.0 }, // Bass for warp
        uAudioHigh: { value: 0.0 }, // Treble for RGB shift
        uDistortionStrength: { value: 0.0 },
        uOpacity: { value: 0.5 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D map;
        uniform float uTime;
        uniform float uAudioLow;
        uniform float uAudioHigh;
        uniform float uDistortionStrength;
        uniform float uOpacity;
        varying vec2 vUv;

        void main() {
            vec2 uv = vUv;
            
            // 1. Bass Ripple Distortion
            float ripple = sin(uv.y * 20.0 + uTime * 2.0) * 0.02 * uAudioLow * uDistortionStrength;
            uv.x += ripple;
            
            // 2. Chromatic Aberration (RGB Shift) driven by Treble
            float shift = 0.02 * uAudioHigh * uDistortionStrength;
            
            vec4 r = texture2D(map, uv + vec2(shift, 0.0));
            vec4 g = texture2D(map, uv);
            vec4 b = texture2D(map, uv - vec2(shift, 0.0));
            
            vec4 color = vec4(r.r, g.g, b.b, g.a);
            
            // 3. Scanline effect (Subtle)
            float scan = sin(uv.y * 200.0) * 0.05;
            color.rgb -= scan;

            gl_FragColor = vec4(color.rgb, color.a * uOpacity);
        }
    `
};

// --- DISPLACEMENT SHADER (Images to 3D) ---
const DisplacementShader = {
    uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0.0 },
        uDisplacement: { value: 0.0 },
        uOpacity: { value: 1.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        varying float vDisp;
        uniform sampler2D tDiffuse;
        uniform float uDisplacement;
        uniform float uTime;

        void main() {
            vUv = uv;
            vec4 color = texture2D(tDiffuse, uv);
            float lum = dot(color.rgb, vec3(0.299, 0.587, 0.114));
            vDisp = lum;
            
            vec3 pos = position;
            pos.z += lum * uDisplacement * 20.0;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
    `,
    fragmentShader: `
        varying vec2 vUv;
        varying float vDisp;
        uniform sampler2D tDiffuse;
        uniform float uOpacity;

        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            gl_FragColor = vec4(color.rgb, color.a * uOpacity);
        }
    `
};

// --- CORRUPTION SHADER (Advanced Distortion for any Layer) ---
const CorruptionShader = {
    uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0.0 },
        uOpacity: { value: 1.0 },
        uAudioLow: { value: 0.0 },
        uAudioHigh: { value: 0.0 },
        uDeformation: { value: 0.0 },
        uDisplacementScale: { value: 1.0 },
        uSentimental: { value: 0.0 },
        uLatentWarp: { value: 0.0 },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uCursors: { value: Array(8).fill(new THREE.Vector2(0.5, 0.5)) },
        uCursorCount: { value: 0 },
        uInteraction: { value: 0.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        varying float vDisp;
        uniform sampler2D tDiffuse;
        uniform float uTime;
        uniform float uAudioLow;
        uniform float uAudioHigh;
        uniform float uDeformation;
        uniform float uDisplacementScale;
        uniform float uSentimental;
        uniform float uLatentWarp;
        uniform vec2 uMouse;
        uniform vec2 uCursors[8];
        uniform int uCursorCount;
        uniform float uInteraction;

        // Simplex noise helper
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
        float snoise(vec2 v) {
          const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
          vec2 i  = floor(v + dot(v, C.yy) );
          vec2 x0 = v -   i + dot(i, C.xx);
          vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod289(i);
          vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
          vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
          m = m*m ; m = m*m ;
          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 a0 = x - floor(x + 0.5);
          m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
          vec3 g;
          g.x  = a0.x  * x0.x  + h.x  * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        void main() {
            vUv = uv;
            vec3 pos = position;
            
            // 1. Texture Displacement
            vec4 tex = texture2D(tDiffuse, uv);
            float lum = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
            vDisp = lum;
            
            float totalDeform = uDeformation * uDisplacementScale;
            pos.z += lum * totalDeform * 20.0 * (1.0 + uAudioLow);

            // 2. Sentimental Warp
            if (uSentimental > 0.0) {
                float n = snoise(pos.xy * 0.05 + uTime * 0.2);
                pos.z += n * uSentimental * 10.0;
                pos.x += sin(pos.y * 0.1 + uTime) * uLatentWarp * 5.0;
            }

            // 3. Interaction
            if (uInteraction > 0.0) {
                // Main Mouse
                vec2 mouseWorld = (uMouse - 0.5) * 100.0;
                float d = distance(pos.xy, mouseWorld);
                if (d < 30.0) {
                    pos.z += (1.0 - d/30.0) * uInteraction * 15.0;
                }

                // Ghost Cursors
                if (uCursorCount > 0) {
                    for(int i = 0; i < 8; i++) {
                        if(i >= uCursorCount) break;
                        vec2 cWorld = (uCursors[i] - 0.5) * 100.0;
                        float dist = distance(pos.xy, cWorld);
                        if (dist < 20.0) {
                            pos.z += (1.0 - dist / 20.0) * uInteraction * 10.0;
                        }
                    }
                }
            }

            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
    `,
    fragmentShader: `
        varying vec2 vUv;
        varying float vDisp;
        uniform sampler2D tDiffuse;
        uniform float uOpacity;
        uniform float uTime;
        uniform float uAudioHigh;

        void main() {
            vec2 uv = vUv;
            
            // RGB Shift based on audio high
            float shift = 0.01 * uAudioHigh;
            float r = texture2D(tDiffuse, uv + vec2(shift, 0.0)).r;
            float g = texture2D(tDiffuse, uv).g;
            float b = texture2D(tDiffuse, uv - vec2(shift, 0.0)).b;
            
            vec4 color = vec4(r, g, b, 1.0);
            
            // Subtle scanline
            float scan = sin(uv.y * 500.0 + uTime * 10.0) * 0.05;
            color.rgb -= scan;

            gl_FragColor = vec4(color.rgb, color.a * uOpacity);
        }
    `
};

// --- HELPERS ---
const getShapeGeometry = (type: ShapeType): THREE.BufferGeometry => {
    switch (type) {
        case ShapeType.ORB: return new THREE.SphereGeometry(1, 32, 32);
        case ShapeType.TORUS: return new THREE.TorusGeometry(1, 0.4, 16, 100);
        case ShapeType.MONOLITH: return new THREE.BoxGeometry(1, 2, 0.5);
        case ShapeType.DATA_GRID: return new THREE.PlaneGeometry(2, 2, 10, 10);
        case ShapeType.NEURAL_NODE: return new THREE.IcosahedronGeometry(1, 0);
        case ShapeType.DNA: return new THREE.CylinderGeometry(0.5, 0.5, 2, 8);
        case ShapeType.SPIRAL: return new THREE.TorusKnotGeometry(1, 0.3, 100, 16);
        case ShapeType.VORONOI: return new THREE.DodecahedronGeometry(1, 0);
        case ShapeType.SHATTERED: return new THREE.TetrahedronGeometry(1, 0);
        case ShapeType.ICOSAHEDRON: return new THREE.IcosahedronGeometry(1, 1);
        case ShapeType.KNOT: return new THREE.TorusKnotGeometry(1, 0.4, 128, 32);
        case ShapeType.TERRAIN: return new THREE.PlaneGeometry(2, 2, 32, 32);
        case ShapeType.CLOUD: return new THREE.SphereGeometry(1, 8, 8);
        case ShapeType.PLANE: return new THREE.PlaneGeometry(1, 1);
        case ShapeType.GRID: return new THREE.PlaneGeometry(1, 1, 10, 10);
        case ShapeType.CUBE: return new THREE.BoxGeometry(1, 1, 1);
        case ShapeType.PYRAMID: return new THREE.ConeGeometry(1, 1, 4);
        case ShapeType.CYLINDER: return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
        default: return new THREE.SphereGeometry(1, 32, 32);
    }
};

// --- FEEDBACK SHADER (Datamosh Smearing) ---
const FeedbackShader = {
    uniforms: {
        tDiffuse: { value: null },
        tPrev: { value: null },
        uIntensity: { value: 0.0 },
        uTime: { value: 0.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tPrev;
        uniform float uIntensity;
        uniform float uTime;
        varying vec2 vUv;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
            vec2 uv = vUv;
            
            // Subtle UV drift for datamosh smear
            vec2 drift = vec2(
                hash(uv + floor(uTime * 10.0)) - 0.5,
                hash(uv + floor(uTime * 10.0) + 1.0) - 0.5
            ) * 0.002 * uIntensity;
            
            vec4 curr = texture2D(tDiffuse, uv);
            vec4 prev = texture2D(tPrev, uv + drift);
            
            // Blend current with previous based on intensity
            // High intensity = long trails / smearing
            gl_FragColor = mix(curr, prev, uIntensity * 0.95);
        }
    `
};

// --- PARTICLE SHADER (Conceptual Data Merging) ---
const ParticleShader = {
    uniforms: {
        uTime: { value: 0.0 },
        uColor: { value: new THREE.Color('#2D70FF') },
        uPointSize: { value: 2.0 },
        uBrightness: { value: 1.0 },
        uAudioLow: { value: 0.0 },
        uAudioHigh: { value: 0.0 },
        uMergeMode: { value: 0 },
        uCorpusTextures: { value: [null, null, null] },
        uCorpusWeights: { value: [0.0, 0.0, 0.0] },
        uHasCorpus: { value: false },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uCursors: { value: Array(8).fill(new THREE.Vector2(0.5, 0.5)) },
        uCursorCount: { value: 0 },
        uInteractionIntensity: { value: 0.0 },
        uSentimentalIntensity: { value: 0.0 },
        uLatentWarp: { value: 0.0 }
    },
    vertexShader: `
        attribute vec3 color;
        varying vec3 vColor;
        varying vec2 vUv;
        uniform float uTime;
        uniform float uPointSize;
        uniform float uAudioLow;
        uniform float uAudioHigh;
        uniform int uMergeMode;
        uniform sampler2D uCorpusTextures[3];
        uniform float uCorpusWeights[3];
        uniform bool uHasCorpus;
        uniform vec2 uMouse;
        uniform vec2 uCursors[8];
        uniform int uCursorCount;
        uniform float uInteractionIntensity;
        uniform float uSentimentalIntensity;
        uniform float uLatentWarp;

        // Simplex-like noise for latent warping
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
        float snoise(vec2 v) {
          const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
          vec2 i  = floor(v + dot(v, C.yy) );
          vec2 x0 = v -   i + dot(i, C.xx);
          vec2 i1;
          i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod289(i);
          vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
          vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
          m = m*m ;
          m = m*m ;
          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 a0 = x - floor(x + 0.5);
          m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
          vec3 g;
          g.x  = a0.x  * x0.x  + h.x  * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        void main() {
            vColor = color;
            vec3 pos = position;
            
            // 1. Latent Space Warping (Sentimental AI)
            if (uSentimentalIntensity > 0.0) {
                float n = snoise(pos.xy * 0.05 + uTime * 0.2);
                float n2 = snoise(pos.yz * 0.05 - uTime * 0.1);
                pos += vec3(n, n2, snoise(pos.zx * 0.05)) * uSentimentalIntensity * 15.0;
                
                // Fluid-like morphing
                pos.x += sin(pos.y * 0.1 + uTime) * uLatentWarp * 5.0;
                pos.z += cos(pos.x * 0.1 + uTime) * uLatentWarp * 5.0;
            }

            // Interactive Mouse Displacement
            if (uInteractionIntensity > 0.0) {
                // Main Mouse
                vec2 mouseWorld = (uMouse - 0.5) * 100.0;
                float dist = distance(pos.xy, mouseWorld);
                if (dist < 30.0) {
                    float force = (1.0 - dist / 30.0) * uInteractionIntensity * 20.0;
                    vec2 dir = normalize(pos.xy - mouseWorld);
                    pos.xy += dir * force;
                }

                // Ghost Cursors (Only if count > 0)
                if (uCursorCount > 0) {
                    for(int i = 0; i < 8; i++) {
                        if(i >= uCursorCount) break;
                        vec2 cWorld = (uCursors[i] - 0.5) * 100.0;
                        float d = distance(pos.xy, cWorld);
                        if (d < 20.0) {
                            float f = (1.0 - d / 20.0) * uInteractionIntensity * 15.0;
                            vec2 dir = normalize(pos.xy - cWorld);
                            pos.xy += dir * f;
                        }
                    }
                }
            }
            
            // Conceptual Data Merging: Displacement from Corpus
            if (uHasCorpus && uMergeMode > 0) {
                vec2 lookupUv = (pos.xy / 60.0) + 0.5;
                vec4 blendedCorpus = vec4(0.0);
                
                // Multi-Corpus Blending
                blendedCorpus += texture2D(uCorpusTextures[0], lookupUv) * uCorpusWeights[0];
                blendedCorpus += texture2D(uCorpusTextures[1], lookupUv) * uCorpusWeights[1];
                blendedCorpus += texture2D(uCorpusTextures[2], lookupUv) * uCorpusWeights[2];
                
                float disp = (blendedCorpus.r + blendedCorpus.g + blendedCorpus.b) / 3.0;
                vec3 pseudoNormal = normalize(pos + vec3(0.001));
                
                if (uMergeMode == 1) { // COLLISION
                    pos += pseudoNormal * (disp - 0.5) * 20.0 * (1.0 + uAudioHigh);
                } else if (uMergeMode == 2) { // INTERFERENCE
                    pos.x += sin(pos.y * 0.5 + uTime * 5.0) * disp * 10.0 * uAudioLow;
                } else if (uMergeMode == 3) { // DNA_FUSION
                    pos += pseudoNormal * disp * 20.0 * (uAudioLow + uAudioHigh);
                    vColor = mix(vColor, blendedCorpus.rgb, 0.8);
                } else if (uMergeMode == 4) { // EROSION
                    pos -= pseudoNormal * disp * 15.0 * (1.0 + uAudioLow);
                    vColor *= (1.0 - disp * 0.7);
                }
            }

            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = uPointSize * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
        }
    `,
    fragmentShader: `
        varying vec3 vColor;
        uniform float uBrightness;
        uniform float uTime;
        uniform int uMergeMode;

        void main() {
            // Circular particle
            float d = distance(gl_PointCoord, vec2(0.5));
            if (d > 0.5) discard;
            
            vec3 finalColor = vColor;
            
            // Data Corruption Flicker
            if (uMergeMode > 0) {
                float noise = fract(sin(dot(gl_PointCoord + uTime, vec2(12.9898, 78.233))) * 43758.5453);
                if (noise > 0.98) finalColor = vec3(1.0);
                if (noise < 0.02) discard;
            }

            gl_FragColor = vec4(finalColor, uBrightness * (1.0 - d * 2.0));
        }
    `
};

// --- POST-PROCESSING SHADER ---
const VJEffectsShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0.0 },
    uEffectMode: { value: 0 },
    uIntensity: { value: 1.0 },
    uCompression: { value: 0.0 },
    uMergeMode: { value: 0 },
    uDatamosh: { value: 0.0 },
    uGlitch: { value: 0.0 },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uCursors: { value: Array(8).fill(new THREE.Vector2(0.5, 0.5)) },
    uCursorCount: { value: 0 },
    uDivineMode: { value: false },
    uAbsurdity: { value: 0.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform int uEffectMode;
    uniform float uCompression;
    uniform int uMergeMode;
    uniform float uDatamosh;
    uniform float uGlitch;
    uniform vec2 uMouse;
    uniform vec2 uCursors[8];
    uniform int uCursorCount;
    uniform bool uDivineMode;
    uniform float uAbsurdity;
    varying vec2 vUv;

    // Helper: Grayscale
    float getLuminance(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 uv = vUv;
      
      // 0. COMPRESSION ARTIFACTS & DATAMOSH (Cumulative)
      if (uCompression > 0.0 || uDatamosh > 0.0) {
        float totalComp = clamp(uCompression + uDatamosh * 0.5, 0.0, 1.0);
        float blockSize = 8.0 + (1.0 - totalComp) * 120.0;
        vec2 blockUv = floor(uv * blockSize) / blockSize;
        
        float dmosh = uCompression * 0.05 + uDatamosh * 0.2;
        if (hash(blockUv + floor(uTime * 10.0)) < dmosh) {
          uv += (hash(blockUv) - 0.5) * 0.2 * totalComp;
        }
      }

      vec4 color = texture2D(tDiffuse, uv);

      if (uCompression > 0.0 || uDatamosh > 0.0) {
        float totalComp = clamp(uCompression + uDatamosh * 0.5, 0.0, 1.0);
        float levels = 4.0 + (1.0 - totalComp) * 12.0;
        color.rgb = floor(color.rgb * levels) / levels;
        color.rgb += (hash(uv + uTime) - 0.5) * 0.1 * totalComp;
      }
      
      // --- DATA MERGING MODES ---
      if (uMergeMode == 1) { // COLLISION
         float noise = hash(uv + floor(uTime * 5.0));
         if (noise < 0.1) color.rgb = 1.0 - color.rgb;
      } else if (uMergeMode == 2) { // INTERFERENCE
         color.rgb *= sin(uv.y * 100.0 + uTime * 10.0) * 0.5 + 0.5;
      } else if (uMergeMode == 3) { // DNA FUSION
         vec2 shift = vec2(sin(uTime), cos(uTime)) * 0.01;
         vec4 alt = texture2D(tDiffuse, uv + shift);
         color.rgb = mix(color.rgb, alt.gbr, 0.5);
      } else if (uMergeMode == 4) { // EROSION
         color.rgb = pow(color.rgb, vec3(2.0));
      }

      // --- EXISTING EFFECTS ---
      // 1. SCANLINES
      if (uEffectMode == 1) {
        float scanline = sin(uv.y * 800.0) * 0.1;
        color.rgb -= scanline;
        float dist = distance(uv, vec2(0.5));
        color.rgb *= 1.0 - dist * 0.5;
      }

      // 2. RGB SHIFT
      if (uEffectMode == 2) {
        float amount = 0.005;
        float r = texture2D(tDiffuse, uv + vec2(amount, 0.0)).r;
        float g = texture2D(tDiffuse, uv).g;
        float b = texture2D(tDiffuse, uv - vec2(amount, 0.0)).b;
        color = vec4(r, g, b, 1.0);
      }

      // 3. KALEIDOSCOPE
      if (uEffectMode == 3) {
        vec2 centered = uv - 0.5;
        float r = length(centered);
        float a = atan(centered.y, centered.x);
        float sides = 6.0;
        a = mod(a, 3.14159 * 2.0 / sides);
        a = abs(a - 3.14159 / sides);
        vec2 newUv = r * vec2(cos(a), sin(a)) + 0.5;
        color = texture2D(tDiffuse, newUv);
      }

      // 4. MIRROR
      if (uEffectMode == 4) {
        vec2 mirrorUv = abs(uv - 0.5) + 0.5;
        color = texture2D(tDiffuse, mirrorUv);
      }

      // --- COLOR CORRECTION / TONALITY (5-15) ---

      // 5. HIGH CONTRAST
      if (uEffectMode == 5) {
        color.rgb = (color.rgb - 0.5) * 1.5 + 0.5;
      }

      // 6. VIBRANCE / SATURATION
      if (uEffectMode == 6) {
        float lum = getLuminance(color.rgb);
        color.rgb = mix(vec3(lum), color.rgb, 1.8); // Boost saturation
      }

      // 7. BW NOIR
      if (uEffectMode == 7) {
        float lum = getLuminance(color.rgb);
        // Noir style contrast
        lum = (lum - 0.5) * 1.2 + 0.5;
        color.rgb = vec3(lum);
      }

      // 8. POSTERIZE
      if (uEffectMode == 8) {
        float levels = 4.0;
        color.rgb = floor(color.rgb * levels) / levels;
      }

      // 9. INVERT
      if (uEffectMode == 9) {
        color.rgb = 1.0 - color.rgb;
      }

      // 10. SOLARIZE
      if (uEffectMode == 10) {
        color.rgb = abs(color.rgb - 0.5) * 2.0;
      }

      // 11. BLEACH BYPASS (Cinematic)
      if (uEffectMode == 11) {
        float lum = getLuminance(color.rgb);
        vec3 blend = vec3(lum);
        float L = min(1.0, max(0.0, 10.0 * (lum - 0.45)));
        vec3 result1 = 2.0 * color.rgb * blend;
        vec3 result2 = 1.0 - 2.0 * (1.0 - blend) * (1.0 - color.rgb);
        vec3 newColor = mix(result1, result2, L);
        color.rgb = mix(color.rgb, newColor, 0.7);
      }

      // 12. VINTAGE SEPIA
      if (uEffectMode == 12) {
        float r = color.r * 0.393 + color.g * 0.769 + color.b * 0.189;
        float g = color.r * 0.349 + color.g * 0.686 + color.b * 0.168;
        float b = color.r * 0.272 + color.g * 0.534 + color.b * 0.131;
        color.rgb = vec3(r, g, b);
      }

      // 13. GAMMA CORRECTION
      if (uEffectMode == 13) {
        color.rgb = pow(color.rgb, vec3(1.0 / 2.2));
      }

      // 14. CHANNEL SWAP (RGB -> BGR)
      if (uEffectMode == 14) {
        color.rgb = color.bgr;
      }

      // 15. EXPOSURE BOOST
      if (uEffectMode == 15) {
        color.rgb *= 1.5;
      }

      // 16. GLITCH (Post-processing)
      if (uEffectMode == 16 || uGlitch > 0.0) {
        float strength = 0.1 + uGlitch * 0.4;
        float noise = hash(uv + floor(uTime * 20.0));
        if (noise > (1.0 - strength * 0.5)) {
          uv.x += (hash(vec2(uTime)) - 0.5) * strength;
          color = texture2D(tDiffuse, uv);
          color.rgb += vec3(0.2, 0.0, 0.5) * noise * strength;
        }
      }

      // 17. INTERACTIVE MOUSE WARP (Grand Elevation)
      float distToMouse = distance(uv, uMouse);
      if (distToMouse < 0.2) {
        float warp = (1.0 - distToMouse / 0.2) * 0.05;
        vec2 dir = normalize(uv - uMouse);
        color = texture2D(tDiffuse, uv + dir * warp);
        color.rgb += vec3(0.1, 0.5, 1.0) * warp * 2.0;
      }

      // 18. MULTI-CURSOR GHOST WARP
      for(int i = 0; i < 8; i++) {
        if(i >= uCursorCount) break;
        float d = distance(uv, uCursors[i]);
        if (d < 0.15) {
            float w = (1.0 - d / 0.15) * 0.03;
            vec2 dir = normalize(uv - uCursors[i]);
            color = texture2D(tDiffuse, uv + dir * w);
            color.rgb += vec3(1.0, 0.2, 0.8) * w * 3.0;
        }
      }

      // 19. DIVINE MODE (Ethereal Glow & Chromatic Bloom)
      if (uDivineMode) {
        vec3 glow = vec3(0.0);
        float samples = 8.0;
        for(float i = 0.0; i < 8.0; i++) {
            float angle = i * (3.14159 * 2.0 / 8.0);
            vec2 offset = vec2(cos(angle), sin(angle)) * 0.01;
            glow += texture2D(tDiffuse, uv + offset).rgb;
        }
        glow /= 8.0;
        color.rgb = mix(color.rgb, glow, 0.4);
        color.rgb += glow * 0.2;
        
        // Spectral shift
        color.r = texture2D(tDiffuse, uv + vec2(0.005, 0.0)).r;
        color.b = texture2D(tDiffuse, uv - vec2(0.005, 0.0)).b;
      }

      // 20. ABSURDITY ENGINE (AI Hallucination Overlay)
      if (uAbsurdity > 0.0) {
        float n = hash(uv + uTime * 0.1);
        if (n > (1.0 - uAbsurdity * 0.2)) {
            vec2 halluUv = uv + vec2(sin(uv.y * 10.0 + uTime), cos(uv.x * 10.0 + uTime)) * 0.05;
            vec4 hallu = texture2D(tDiffuse, halluUv);
            color.rgb = mix(color.rgb, hallu.gbr, uAbsurdity * 0.5);
            
            // Impossible geometry lines
            float line = step(0.98, fract(uv.y * 50.0 + sin(uv.x * 20.0 + uTime)));
            color.rgb += vec3(0.0, 1.0, 0.5) * line * uAbsurdity;
        }
      }

      gl_FragColor = color;
    }
  `
};

const GLSL_SNOISE = `
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy) );
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m ; m = m*m ;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 a0 = x - floor(x + 0.5);
      m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }
`;

export const VJCanvas: React.FC<VJCanvasProps> = (props) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const animationId = useRef<number>();
  const controlsRef = useRef<OrbitControls | null>(null);
  
  // State Ref for the render loop
  const vjStateRef = useRef<VJState>(props.vjState);
  
  // Update ref on every render
  useEffect(() => {
    console.log("VJCanvas: State Updated", props.vjState.activeShape);
    vjStateRef.current = props.vjState;
  }, [props.vjState]);

  // Post Processing Refs
  const composerRef = useRef<EffectComposer | null>(null);
  const effectPassRef = useRef<ShaderPass | null>(null);
  const feedbackPassRef = useRef<ShaderPass | null>(null);
  const mousePosRef = useRef<THREE.Vector2>(new THREE.Vector2(0.5, 0.5));
  const ghostCursorsRef = useRef<THREE.Vector2[]>(Array(8).fill(0).map(() => new THREE.Vector2(0.5, 0.5)));
  const feedbackTarget1 = useRef<THREE.WebGLRenderTarget | null>(null);
  const feedbackTarget2 = useRef<THREE.WebGLRenderTarget | null>(null);
  const currentFeedbackTarget = useRef<number>(0);
  const particleMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const layerObjectsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const gltfLoader = useMemo(() => new GLTFLoader(), []);

  // Media Refs
  const mediaPlaneRef = useRef<THREE.Mesh | null>(null);
  const mediaMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  
  // Data Refs for Particles
  const memory = useMemo(() => {
     // Generate static seeds for Voronoi effects (50 seeds)
     const seeds = new Float32Array(50 * 3);
     for(let i=0; i<50; i++) {
        seeds[i*3] = (Math.random() - 0.5) * 60;
        seeds[i*3+1] = (Math.random() - 0.5) * 60;
        seeds[i*3+2] = (Math.random() - 0.5) * 60;
     }

     return {
         basePositions: new Float32Array(PARTICLE_COUNT * 3),
         seeds: seeds,
         shapeCache: {} as Record<string, Float32Array>
     };
  }, []);

  // --- HANDLE MEDIA LOADING (Image/Video) ---
  useEffect(() => {
      if (!mediaMaterialRef.current) return;
      
      const { mediaUrl, mediaType } = props.vjState;
      
      // Cleanup previous texture
      if (mediaMaterialRef.current.uniforms.map.value) {
          mediaMaterialRef.current.uniforms.map.value.dispose();
          mediaMaterialRef.current.uniforms.map.value = null;
      }
      if (videoElementRef.current) {
          videoElementRef.current.pause();
          videoElementRef.current.src = "";
          videoElementRef.current = null;
      }

      if (mediaUrl && mediaType !== 'none') {
          if (mediaType === 'video') {
              const video = document.createElement('video');
              video.src = mediaUrl;
              video.loop = true;
              video.muted = true;
              video.playsInline = true;
              video.play();
              videoElementRef.current = video;

              const videoTex = new THREE.VideoTexture(video);
              videoTex.minFilter = THREE.LinearFilter;
              videoTex.magFilter = THREE.LinearFilter;
              mediaMaterialRef.current.uniforms.map.value = videoTex;
          } else {
              const loader = new THREE.TextureLoader();
              loader.load(mediaUrl, (tex) => {
                  tex.minFilter = THREE.LinearFilter;
                  tex.magFilter = THREE.LinearFilter;
                  if (mediaMaterialRef.current) mediaMaterialRef.current.uniforms.map.value = tex;
              });
          }
          if (mediaPlaneRef.current) mediaPlaneRef.current.visible = true;
      } else {
          if (mediaPlaneRef.current) mediaPlaneRef.current.visible = false;
      }

  }, [props.vjState.mediaUrl, props.vjState.mediaType]);
  
  // --- HANDLE LAYERS SYNC ---
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    const currentLayers = props.vjState.layers;
    const layerObjects = layerObjectsRef.current;

    const setupModelCorruption = (model: THREE.Object3D) => {
        model.traverse((node) => {
            if ((node as THREE.Mesh).isMesh) {
                const mesh = node as THREE.Mesh;
                const mat = mesh.material as THREE.MeshStandardMaterial;
                
                mat.onBeforeCompile = (shader) => {
                    shader.uniforms.uTime = { value: 0 };
                    shader.uniforms.uAudioLow = { value: 0 };
                    shader.uniforms.uDeformation = { value: 0 };
                    shader.uniforms.uSentimental = { value: 0 };
                    
                    shader.vertexShader = `
                        uniform float uTime;
                        uniform float uAudioLow;
                        uniform float uDeformation;
                        uniform float uSentimental;
                        ${GLSL_SNOISE}
                    ` + shader.vertexShader;
                    
                    shader.vertexShader = shader.vertexShader.replace(
                        '#include <begin_vertex>',
                        `
                        #include <begin_vertex>
                        if (uDeformation > 0.0 || uSentimental > 0.0) {
                            float n = snoise(transformed.xy * 0.1 + uTime);
                            transformed += normal * n * (uDeformation * 5.0 + uSentimental * 10.0);
                        }
                        `
                    );
                    
                    mesh.userData.shaderUniforms = shader.uniforms;
                };
                mat.needsUpdate = true;
            }
        });
    };

    // 1. Remove objects for layers that no longer exist
    const layerIds = new Set(currentLayers.map(l => l.id));
    for (const [id, obj] of layerObjects.entries()) {
      if (!layerIds.has(id)) {
        scene.remove(obj);
        layerObjects.delete(id);
      }
    }

    // 2. Add or update objects for current layers
    currentLayers.forEach(layer => {
      let obj = layerObjects.get(layer.id);

      if (!obj) {
        // Create new object based on type
        if (layer.type === LayerType.MODEL_3D && layer.url) {
          gltfLoader.load(layer.url, (gltf) => {
            const model = gltf.scene;
            setupModelCorruption(model);
            layerObjects.set(layer.id, model);
            scene.add(model);
            updateObjectProperties(model, layer);
          });
        } else if (layer.type === LayerType.IMAGE && layer.url) {
          const loader = new THREE.TextureLoader();
          loader.load(layer.url, (tex) => {
            const geo = new THREE.PlaneGeometry(40, 40, 128, 128); // Higher res for corruption
            const mat = new THREE.ShaderMaterial({
                ...CorruptionShader,
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide
            });
            mat.uniforms.tDiffuse.value = tex;
            const mesh = new THREE.Mesh(geo, mat);
            layerObjects.set(layer.id, mesh);
            scene.add(mesh);
            updateObjectProperties(mesh, layer);
          });
        } else if (layer.type === LayerType.SHAPE) {
          const shapeGeo = getShapeGeometry(layer.shapeType || ShapeType.ORB);
          const mat = new THREE.MeshBasicMaterial({ color: layer.color || '#ffffff', transparent: true, opacity: layer.opacity, wireframe: true });
          const mesh = new THREE.Mesh(shapeGeo, mat);
          layerObjects.set(layer.id, mesh);
          scene.add(mesh);
          updateObjectProperties(mesh, layer);
        } else if (layer.type === LayerType.VIDEO && layer.url) {
          const video = document.createElement('video');
          video.src = layer.url;
          video.loop = true;
          video.muted = true;
          video.playsInline = true;
          video.play();
          const tex = new THREE.VideoTexture(video);
          const geo = new THREE.PlaneGeometry(40, 40, 128, 128); 
          const mat = new THREE.ShaderMaterial({
              ...CorruptionShader,
              transparent: true,
              depthWrite: false,
              side: THREE.DoubleSide
          });
          mat.uniforms.tDiffuse.value = tex;
          const mesh = new THREE.Mesh(geo, mat);
          (mesh as any).videoElement = video; // Store for cleanup
          layerObjects.set(layer.id, mesh);
          scene.add(mesh);
          updateObjectProperties(mesh, layer);
        }
 else if (layer.type === LayerType.PARTICLES) {
          // Create a sub-particle system for this layer
          const subGeo = new THREE.BufferGeometry();
          const subCount = 2000;
          const subPos = new Float32Array(subCount * 3);
          const subCol = new Float32Array(subCount * 3);
          for(let i=0; i<subCount; i++) {
            subPos[i*3] = (Math.random() - 0.5) * 40;
            subPos[i*3+1] = (Math.random() - 0.5) * 40;
            subPos[i*3+2] = (Math.random() - 0.5) * 40;
            subCol[i*3] = 1; subCol[i*3+1] = 1; subCol[i*3+2] = 1;
          }
          subGeo.setAttribute('position', new THREE.BufferAttribute(subPos, 3));
          subGeo.setAttribute('color', new THREE.BufferAttribute(subCol, 3));
          const subMat = new THREE.PointsMaterial({ size: 2, vertexColors: true, transparent: true, opacity: layer.opacity, blending: THREE.AdditiveBlending });
          const subPoints = new THREE.Points(subGeo, subMat);
          layerObjects.set(layer.id, subPoints);
          scene.add(subPoints);
          updateObjectProperties(subPoints, layer);
        }
      } else {
        // Update existing object
        updateObjectProperties(obj, layer);
      }
    });
  }, [props.vjState.layers]);

  function updateObjectProperties(obj: THREE.Object3D, layer: LayerItem) {
      obj.userData.layerId = layer.id;
      obj.visible = layer.visible;
      obj.scale.set(layer.scale, layer.scale, layer.scale);
      // Map 0-100 to -50 to 50
      const worldX = (layer.posX - 50);
      const worldY = (layer.posY - 50);
      obj.position.set(worldX, worldY, layer.posZ);
      obj.rotation.set(layer.rotX, layer.rotY, layer.rotZ);
      
      // Update Model Corruption Uniforms
      obj.traverse((node) => {
          if ((node as THREE.Mesh).isMesh && node.userData.shaderUniforms) {
              const uniforms = node.userData.shaderUniforms;
              uniforms.uDeformation.value = layer.isCorrupted ? props.vjState.deformationIntensity : 0;
              uniforms.uSentimental.value = layer.isCorrupted ? (props.vjState.sentimentalMode ? 1.0 : 0.0) : 0;
          }
      });

      if (obj instanceof THREE.Mesh) {
        if (obj.material instanceof THREE.MeshBasicMaterial) {
            obj.material.opacity = layer.opacity;
            if (layer.blendMode === 'additive') obj.material.blending = THREE.AdditiveBlending;
            else obj.material.blending = THREE.NormalBlending;
            if (layer.color) obj.material.color.set(layer.color);
        } else if (obj.material instanceof THREE.ShaderMaterial) {
            const mat = obj.material;
            mat.uniforms.uOpacity.value = layer.opacity;
            
            // Sync Corruption Uniforms if applicable
            if (mat.uniforms.uDeformation) {
                mat.uniforms.uDeformation.value = layer.isCorrupted ? props.vjState.deformationIntensity : 0;
                mat.uniforms.uDisplacementScale.value = props.vjState.displacementScale;
                mat.uniforms.uSentimental.value = layer.isCorrupted ? (props.vjState.sentimentalMode ? 1.0 : 0.0) : 0;
                mat.uniforms.uLatentWarp.value = props.vjState.latentWarp;
                mat.uniforms.uInteraction.value = props.vjState.mouseInteraction ? 1.0 : 0.0;
                mat.uniforms.uMouse.value.copy(mousePosRef.current);
            }
            
            if (mat.uniforms.uDisplacement && !mat.uniforms.uDeformation) {
                mat.uniforms.uDisplacement.value = layer.distortion || 0;
            }
        }
      }
    }

  // Update layer properties when state changes
  useEffect(() => {
    layerObjectsRef.current.forEach((obj, id) => {
      const layer = props.vjState.layers.find(l => l.id === id);
      if (layer) {
        updateObjectProperties(obj, layer);
      }
    });
  }, [props.vjState.mouseInteraction, props.vjState.deformationIntensity, props.vjState.displacementScale, props.vjState.sentimentalMode, props.vjState.latentWarp]);


  useEffect(() => {
    if (!mountRef.current) return;
    
    // CRITICAL: Clear any existing canvas to prevent "double sphere" issue
    mountRef.current.innerHTML = '';
    
    console.log("VJCanvas: Initializing Scene...");

    let controls: OrbitControls | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let geometry: THREE.BufferGeometry | null = null;
    let material: THREE.PointsMaterial | null = null;
    let planeGeo: THREE.PlaneGeometry | null = null;
    let planeMat: THREE.ShaderMaterial | null = null;

    try {
        // 1. SETUP SCENE
        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x000000, 0.02);
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 60;
        camera.position.y = 10;
        camera.lookAt(0,0,0);
        cameraRef.current = camera;

        renderer = new THREE.WebGLRenderer({ 
            antialias: false, 
            alpha: true,
            powerPreference: 'high-performance'
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        mountRef.current.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // 2. CONTROLS
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = 10;
        controls.maxDistance = 200;
        controls.enableZoom = true; // Ensure zoom is enabled
        controlsRef.current = controls;

        // 3. MEDIA PLANE (Background)
        planeGeo = new THREE.PlaneGeometry(100, 100);
        planeMat = new THREE.ShaderMaterial({
            ...MediaShader,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false, // Don't occlude particles
            blending: THREE.AdditiveBlending // Glowy look
        });
        mediaMaterialRef.current = planeMat;
        const planeMesh = new THREE.Mesh(planeGeo, planeMat);
        planeMesh.position.z = -20; // Sit slightly behind main shape
        planeMesh.visible = false; // Hidden by default
        mediaPlaneRef.current = planeMesh;
        scene.add(planeMesh);

        // 4. PARTICLES SETUP
        geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(PARTICLE_COUNT * 3);
        const colors = new Float32Array(PARTICLE_COUNT * 3);
        
        // Init Arrays
        for(let i=0; i<PARTICLE_COUNT*3; i++) {
            positions[i] = 0; colors[i] = 1;
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const pMaterial = new THREE.ShaderMaterial({
            ...ParticleShader,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        particleMaterialRef.current = pMaterial;

        const points = new THREE.Points(geometry, pMaterial);
        scene.add(points);

    // 5. POST PROCESSING COMPOSER
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Feedback Pass (Datamosh Smear)
    const feedbackPass = new ShaderPass(FeedbackShader);
    feedbackPass.uniforms.uIntensity.value = 0.0;
    composer.addPass(feedbackPass);
    feedbackPassRef.current = feedbackPass;

    const effectPass = new ShaderPass(VJEffectsShader);
    composer.addPass(effectPass);
    
    composerRef.current = composer;
    effectPassRef.current = effectPass;

    // Create Feedback Targets
    feedbackTarget1.current = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
    feedbackTarget2.current = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight);
    
    // --- HELPER FUNCTIONS ---
    const getTargetPos = (type: string, i: number, out: THREE.Vector3) => {
        if (type === ShapeType.ORB) {
            const phi = Math.acos(1 - 2 * (i + 0.5) / PARTICLE_COUNT);
            const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
            const r = 25;
            out.set(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
        } else if (type === ShapeType.MONOLITH) {
             // Brutalist Monolith: A tall, thin rectangular structure
             const w = 15, h = 60, d = 15;
             const side = i % 6;
             const u = Math.random();
             const v = Math.random();
             if (side === 0) out.set((u-0.5)*w, (v-0.5)*h, d/2);
             else if (side === 1) out.set((u-0.5)*w, (v-0.5)*h, -d/2);
             else if (side === 2) out.set(w/2, (v-0.5)*h, (u-0.5)*d);
             else if (side === 3) out.set(-w/2, (v-0.5)*h, (u-0.5)*d);
             else if (side === 4) out.set((u-0.5)*w, h/2, (v-0.5)*d);
             else out.set((u-0.5)*w, -h/2, (v-0.5)*d);
        } else if (type === ShapeType.DATA_GRID) {
             // 3D Matrix Grid
             const side = Math.floor(Math.pow(PARTICLE_COUNT, 1/3));
             const x = i % side;
             const y = Math.floor(i / side) % side;
             const z = Math.floor(i / (side * side));
             const spacing = 10;
             out.set((x - side/2) * spacing, (y - side/2) * spacing, (z - side/2) * spacing);
        } else if (type === ShapeType.NEURAL_NODE) {
             // Central core with branching "axons"
             if (i < PARTICLE_COUNT * 0.3) {
                 // Core
                 const r = 10;
                 const phi = Math.random() * Math.PI * 2;
                 const theta = Math.random() * Math.PI;
                 out.set(r * Math.sin(theta) * Math.cos(phi), r * Math.sin(theta) * Math.sin(phi), r * Math.cos(theta));
             } else {
                 // Axons
                 const axonIdx = i % 12;
                 const t = ((i % 500) / 500);
                 const angle = (axonIdx / 12) * Math.PI * 2;
                 const r = 10 + t * 60;
                 const noise = Math.sin(t * 10 + i) * 5;
                 out.set(r * Math.cos(angle) + noise, r * Math.sin(angle) + noise, Math.cos(t * 5) * 20);
             }
        } else if (type === ShapeType.DNA) {
             const t = i * 0.1;
             const r = 10;
             const h = (i/PARTICLE_COUNT)*80 - 40;
             const off = i%2===0 ? 0 : Math.PI;
             out.set(r*Math.cos(t*0.5+off), h, r*Math.sin(t*0.5+off));
        } else if (type === ShapeType.TORUS) {
             const u = (i/PARTICLE_COUNT)*Math.PI*2;
             const v = (i%100)/100*Math.PI*2;
             const R=20, tube=8;
             out.set((R+tube*Math.cos(v))*Math.cos(u), (R+tube*Math.cos(v))*Math.sin(u), tube*Math.sin(v));
        } else if (type === ShapeType.SPIRAL) {
             const angle = i * 2.39996;
             const radius = 0.3 * Math.sqrt(i);
             out.set(radius * Math.cos(angle), radius * Math.sin(angle), 0);
        } else if (type === ShapeType.VORONOI) {
             const seedIdx = (i % 50) * 3;
             const sx = memory.seeds[seedIdx];
             const sy = memory.seeds[seedIdx+1];
             const sz = memory.seeds[seedIdx+2];
             const phi = Math.acos(1 - 2 * (i%240 + 0.5) / 240);
             const theta = Math.PI * (1 + Math.sqrt(5)) * (i%240 + 0.5);
             const r = 5; 
             out.set(sx + r * Math.sin(phi) * Math.cos(theta), sy + r * Math.sin(phi) * Math.sin(theta), sz + r * Math.cos(phi));
        } else if (type === ShapeType.SHATTERED) {
             const phi = Math.acos(1 - 2 * (i + 0.5) / PARTICLE_COUNT);
             const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
             const r = 25;
             const bx = r * Math.sin(phi) * Math.cos(theta);
             const by = r * Math.sin(phi) * Math.sin(theta);
             const bz = r * Math.cos(phi);
             const shardId = (Math.floor(phi * 5) + Math.floor(theta * 3)) % 10;
             const explode = shardId % 2 === 0 ? 5 : 0; 
             const dir = new THREE.Vector3(bx,by,bz).normalize().multiplyScalar(explode);
             out.set(bx + dir.x, by + dir.y, bz + dir.z);
        } else if (type === ShapeType.ICOSAHEDRON) {
             const t = (1.0 + Math.sqrt(5.0)) / 2.0;
             const verts = [[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]];
             const vIdx = i % 12;
             const v = verts[vIdx];
             const spread = 8.0; 
             out.set(v[0]*12 + (Math.sin(i)*spread), v[1]*12 + (Math.cos(i*0.9)*spread), v[2]*12 + (Math.sin(i*1.2)*spread));
        } else if (type === ShapeType.KNOT) {
             const t = (i / PARTICLE_COUNT) * Math.PI * 2 * 10; 
             const p = 2, q = 3, rScale = 25, tube = 8;
             const r = rScale + tube * Math.cos(q * t);
             out.set(r * Math.cos(p * t), r * Math.sin(p * t), tube * Math.sin(q * t));
        } else if (type === ShapeType.TERRAIN) {
             const cols = Math.floor(Math.sqrt(PARTICLE_COUNT));
             const size = 100;
             const spacing = size / cols;
             const row = Math.floor(i / cols);
             const col = i % cols;
             out.set((col * spacing) - size/2, -10, (row * spacing) - size/2);
        } else if (type === ShapeType.CLOUD) {
             const r = 35 * Math.pow(Math.random(), 1/3); 
             const theta = Math.random() * Math.PI * 2;
             const phi = Math.acos(2 * Math.random() - 1);
             out.set(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
        } else if (type === ShapeType.SENTIMENTAL) {
             // Neural Node / Synapse structure
             const nodeCount = 5;
             const nodeId = i % nodeCount;
             const angle = (nodeId / nodeCount) * Math.PI * 2;
             const r = 20 + Math.sin(i * 0.1) * 5;
             const bx = Math.cos(angle) * r;
             const by = Math.sin(angle) * r;
             const bz = Math.sin(i * 0.05) * 10;
             
             // Add "synapse" filaments
             const filament = Math.sin(i * 0.5) * 15;
             out.set(bx + filament * Math.cos(i), by + filament * Math.sin(i), bz);
        } else if (type === ShapeType.CUBE) {
             const s = 40;
             const pointsPerFace = Math.floor(PARTICLE_COUNT / 6);
             const face = Math.min(5, Math.floor(i / pointsPerFace));
             const faceIdx = i % pointsPerFace;
             const sideRes = Math.floor(Math.sqrt(pointsPerFace));
             
             // Use normalized coordinates 0 to 1
             const u = ((faceIdx % sideRes) / (sideRes - 1)) - 0.5;
             const v = (Math.floor(faceIdx / sideRes) / (sideRes - 1)) - 0.5;
             
             if (face === 0) out.set(u * s, v * s, s/2);
             else if (face === 1) out.set(u * s, v * s, -s/2);
             else if (face === 2) out.set(u * s, s/2, v * s);
             else if (face === 3) out.set(u * s, -s/2, v * s);
             else if (face === 4) out.set(s/2, u * s, v * s);
             else out.set(-s/2, u * s, v * s);
        } else if (type === ShapeType.PYRAMID) {
             const s = 40;
             const h = 40;
             const pointsPerFace = Math.floor(PARTICLE_COUNT / 5);
             const face = Math.min(4, Math.floor(i / pointsPerFace));
             const faceIdx = i % pointsPerFace;
             const res = Math.floor(Math.sqrt(pointsPerFace));
             
             const u = (faceIdx % res) / (res - 1);
             const v = Math.floor(faceIdx / res) / (res - 1);

             if (face === 0) { // Base
                 out.set((u-0.5)*s, -h/2, (v-0.5)*s);
             } else { // 4 Triangles
                 const angle = (face - 1) * Math.PI * 0.5;
                 const nextAngle = face * Math.PI * 0.5;
                 const edgeX1 = Math.cos(angle) * s * 0.707;
                 const edgeZ1 = Math.sin(angle) * s * 0.707;
                 const edgeX2 = Math.cos(nextAngle) * s * 0.707;
                 const edgeZ2 = Math.sin(nextAngle) * s * 0.707;
                 
                 const px = THREE.MathUtils.lerp(edgeX1, edgeX2, u);
                 const pz = THREE.MathUtils.lerp(edgeZ1, edgeZ2, u);
                 
                 out.set(
                     THREE.MathUtils.lerp(px, 0, v),
                     THREE.MathUtils.lerp(-h/2, h/2, v),
                     THREE.MathUtils.lerp(pz, 0, v)
                 );
             }
        } else if (type === ShapeType.CYLINDER) {
             const r = 20;
             const h = 50;
             const sidePoints = Math.floor(PARTICLE_COUNT * 0.7);
             const capPoints = Math.floor(PARTICLE_COUNT * 0.15);
             
             if (i < sidePoints) {
                 const resH = 40;
                 const resT = Math.floor(sidePoints / resH);
                 const it = i % resT;
                 const ih = Math.floor(i / resT);
                 const thetaGrid = (it / (resT - 1)) * Math.PI * 2;
                 const yGrid = (ih / (resH - 1)) * h - h/2;
                 out.set(r * Math.cos(thetaGrid), yGrid, r * Math.sin(thetaGrid));
             } else {
                 const isTop = i < sidePoints + capPoints;
                 const capIdx = i % capPoints;
                 const angle = (capIdx / (capPoints - 1)) * Math.PI * 2;
                 const radius = Math.sqrt(Math.random()) * r; // Use random for solid caps
                 out.set(radius * Math.cos(angle), isTop ? h/2 : -h/2, radius * Math.sin(angle));
             }
        } else {
             const s=60, c=Math.floor(Math.sqrt(PARTICLE_COUNT));
             out.set(((i%c)/c -0.5)*s, 0, (Math.floor(i/c)/c -0.5)*s);
        }
    };

    // Initialize Base Positions
    const targetVector = new THREE.Vector3();
    const targetA = new THREE.Vector3();
    const targetB = new THREE.Vector3();
    for(let i=0; i<PARTICLE_COUNT; i++) {
        getTargetPos(ShapeType.ORB, i, targetVector);
        memory.basePositions[i*3] = targetVector.x;
        memory.basePositions[i*3+1] = targetVector.y;
        memory.basePositions[i*3+2] = targetVector.z;
    }

    let time = 0;

    // 6. RENDER LOOP
    let frameCount = 0;
    const renderLoop = () => {
        try {
            animationId.current = requestAnimationFrame(renderLoop);
            frameCount++;
            
            if (controlsRef.current) controlsRef.current.update();

            const baseState = vjStateRef.current;
            if (!baseState) {
                if (frameCount % 60 === 0) console.warn("VJ Render Loop: No state found");
                return;
            }

            // --- ARENA VJ: CROSSFADER & LFO LOGIC ---
            let currentState = { ...baseState };
            
            // 1. Calculate LFOs
            const lfoValues: Record<string, number> = {};
            baseState.lfos.forEach(lfo => {
                if (!lfo.active) return;
                let val = 0;
                const t = time * lfo.frequency;
                switch (lfo.type) {
                    case 'sine': val = Math.sin(t); break;
                    case 'square': val = Math.sin(t) > 0 ? 1 : -1; break;
                    case 'saw': val = (t % 1) * 2 - 1; break;
                    case 'random': val = Math.random() * 2 - 1; break;
                }
                lfoValues[lfo.target] = (lfoValues[lfo.target] || 0) + (val * lfo.amplitude + lfo.offset);
            });

            // 2. Interpolate between Side A and Side B
            const mix = baseState.crossfader;
            const sideA = baseState.stateA || baseState;
            const sideB = baseState.stateB || baseState;
            
            const keys = Object.keys(baseState) as (keyof VJState)[];
            keys.forEach(key => {
                // Skip non-visual/recursive keys
                if (['decks', 'researchLog', 'lfos', 'stateA', 'stateB', 'activeDeck', 'activeClipId'].includes(key)) return;
                
                const valA = (sideA as any)[key];
                const valB = (sideB as any)[key];
                
                // If one side is missing a value, use the other side's value
                const finalValA = valA !== undefined ? valA : valB;
                const finalValB = valB !== undefined ? valB : valA;

                if (typeof finalValA === 'number' && typeof finalValB === 'number') {
                    (currentState as any)[key] = THREE.MathUtils.lerp(finalValA, finalValB, mix);
                } else if (mix > 0.5) {
                    (currentState as any)[key] = finalValB !== undefined ? finalValB : finalValA;
                } else {
                    (currentState as any)[key] = finalValA !== undefined ? finalValA : finalValB;
                }
            });

            // 3. Apply LFO Modulations
            Object.entries(lfoValues).forEach(([target, mod]) => {
                if (typeof (currentState as any)[target] === 'number') {
                    (currentState as any)[target] += mod;
                }
            });

            // --- BPM SYNC ---
            const bpm = currentState.bpm || 120;
            const beatDuration = 60 / bpm;
            const beatTime = (time % beatDuration) / beatDuration;
            const bpmPulse = Math.pow(1.0 - beatTime, 4); // Sharp pulse on beat
            
            // If BPM Sync is on, override pulse with bpmPulse
            // We'll combine this later in the audio reactive block

            if (frameCount % 120 === 0) {
                console.log("VJ Loop Running. Shape:", currentState.activeShape, "Time:", time.toFixed(2));
            }
            
            // --- 1. MOTION CONTROL ---
        // Scale time by global speed multiplier
        time += 0.01 * currentState.animationSpeed * currentState.timeScale;
        
        // Update Audio Smoothing in real-time
        audioService.setSmoothing(currentState.audioSmoothing);

        // --- RESOLVE DYNAMIC COLORS ---
        const colorElec = new THREE.Color(currentState.color);
        const colorDeep = colorElec.clone().multiplyScalar(0.15); 
        
        // --- AUDIO DATA ---
        let bass=0, mid=0, treble=0, pulse=0, freq: Uint8Array | null = null, timeData: Uint8Array | null = null;
        if (currentState.audioReactive) {
            const d = audioService.getAudioData();
            // Apply Audio Force (Global Amplitude)
            const force = currentState.audioForce; 
            
            bass = d.bass * force * currentState.bassImpact; 
            mid = d.mid * force; 
            treble = d.treble * force * currentState.trebleImpact; 
            pulse = d.pulse * force;
            
            // --- BPM SYNC INTEGRATION ---
            if (currentState.bpmSync) {
                pulse = THREE.MathUtils.lerp(pulse, bpmPulse * force, 0.5);
            }

            freq=d.frequencyData; 
            timeData=d.timeData;
        }

        // --- UPDATE MEDIA PLANE (BACKGROUND) ---
        if (mediaPlaneRef.current && mediaMaterialRef.current && mediaPlaneRef.current.visible) {
            mediaPlaneRef.current.scale.set(currentState.mediaScale, currentState.mediaScale, 1);
            mediaMaterialRef.current.uniforms.uTime.value = time;
            mediaMaterialRef.current.uniforms.uOpacity.value = currentState.mediaOpacity;
            mediaMaterialRef.current.uniforms.uDistortionStrength.value = currentState.mediaDistortion;
            mediaMaterialRef.current.uniforms.uAudioLow.value = bass;
            mediaMaterialRef.current.uniforms.uAudioHigh.value = treble;
            
            // Look at camera for "Billboard" effect but keep Z distance
            mediaPlaneRef.current.lookAt(cameraRef.current?.position || new THREE.Vector3(0,0,60));
        }

        // --- CAMERA CONTROLS ---
        if (cameraRef.current && controlsRef.current) {
             // 1. Zoom - Only apply from state if it's significantly different (UI change)
             const targetZoom = currentState.cameraZoom;
             const currentZoom = cameraRef.current.position.distanceTo(controlsRef.current.target);
             
             // If the state was changed via slider, move the camera
             // We use a small epsilon to avoid fighting the OrbitControls scroll
             if (Math.abs(targetZoom - currentZoom) > 2.0 && !controlsRef.current.enabled) {
                 const dir = cameraRef.current.position.clone().sub(controlsRef.current.target).normalize();
                 cameraRef.current.position.copy(controlsRef.current.target).add(dir.multiplyScalar(targetZoom));
             }

             // 2. Auto Rotate
             if (currentState.autoRotate) {
                 points.rotation.y += 0.005 * currentState.rotationSpeed * currentState.timeScale;
             }

             // 3. Camera Shake
             if (currentState.cameraShake > 0) {
                 const shake = currentState.cameraShake * (0.1 + pulse * 0.2);
                 cameraRef.current.position.x += (Math.random() - 0.5) * shake;
                 cameraRef.current.position.y += (Math.random() - 0.5) * shake;
             }
        }

        // --- PARTICLE PHYSICS ---
        const posArr = geometry.attributes.position.array as Float32Array;
        const colArr = geometry.attributes.color.array as Float32Array;
        
        // Map deformationIntensity to noise amplitude
        // Map displacementScale to vertex movement range
        const intensity = currentState.deformationIntensity;
        const dispScale = currentState.displacementScale;
        
        // Physics: Elasticity replaces fixed LERP_FACTOR
        const damping = currentState.elasticity;

        for(let i=0; i<PARTICLE_COUNT; i++) {
            const idx = i*3;
            
            getTargetPos(currentState.activeShape, i, targetA);
            
            if (currentState.shapeMix > 0) {
                getTargetPos(currentState.activeShapeB, i, targetB);
                
                if (currentState.shapeMergeMode === ShapeMergeMode.LERP) {
                    targetA.lerp(targetB, currentState.shapeMix);
                } else if (currentState.shapeMergeMode === ShapeMergeMode.ADDITIVE) {
                    targetA.add(targetB.multiplyScalar(currentState.shapeMix));
                } else if (currentState.shapeMergeMode === ShapeMergeMode.SUBTRACTIVE) {
                    targetA.sub(targetB.multiplyScalar(currentState.shapeMix));
                } else if (currentState.shapeMergeMode === ShapeMergeMode.CROSS_AXIS) {
                    // Mix axes: Take X,Z from A and Y from B based on mix
                    targetA.y = THREE.MathUtils.lerp(targetA.y, targetB.y, currentState.shapeMix);
                } else if (currentState.shapeMergeMode === ShapeMergeMode.INTERSECT) {
                    // Intersection-like: Pull towards the smaller volume
                    const distA = targetA.length();
                    const distB = targetB.length();
                    if (distA > distB) {
                        targetA.lerp(targetB, currentState.shapeMix);
                    }
                }
            }
            
            targetVector.copy(targetA);
            
            // --- GEOMETRY ATTRACTION ---
            if (currentState.geometryAttraction > 0) {
                // Find a random layer object to attract to
                const layers = Array.from(layerObjectsRef.current.values()).filter(obj => (obj as THREE.Object3D).visible && (obj as THREE.Mesh).isMesh);
                if (layers.length > 0) {
                    const targetObj = layers[i % layers.length] as THREE.Object3D;
                    const worldPos = new THREE.Vector3();
                    targetObj.getWorldPosition(worldPos);
                    
                    // Pull towards the object's center
                    targetVector.lerp(worldPos, currentState.geometryAttraction * 0.5);
                }
            }
            
            // Apply physics (Elasticity/Damping)
            memory.basePositions[idx]   += (targetVector.x - memory.basePositions[idx]) * damping;
            memory.basePositions[idx+1] += (targetVector.y - memory.basePositions[idx+1]) * damping;
            memory.basePositions[idx+2] += (targetVector.z - memory.basePositions[idx+2]) * damping;

            let x = memory.basePositions[idx];
            let y = memory.basePositions[idx+1];
            let z = memory.basePositions[idx+2];

            if (currentState.audioReactive && intensity > 0.01) {
                 // We multiply noise effects by displacementScale
                 const ampFactor = intensity * dispScale; 

                 if (currentState.noiseMode === NoiseType.WAVEFORM && timeData) {
                     const audioIdx = Math.floor((i / PARTICLE_COUNT) * timeData.length);
                     const wave = (timeData[audioIdx] / 128.0) - 1.0;
                     const beatAmp = 1.0 + (pulse * 2.0); 

                     if (currentState.activeShape === ShapeType.PLANE || currentState.activeShape === ShapeType.GRID || currentState.activeShape === ShapeType.TERRAIN) {
                         y += wave * 25 * ampFactor * beatAmp;
                     } else {
                         const len = Math.sqrt(x*x + y*y + z*z);
                         if(len > 0.001) {
                             const disp = wave * 15 * ampFactor * beatAmp;
                             x += (x/len) * disp;
                             y += (y/len) * disp;
                             z += (z/len) * disp;
                         }
                     }
                 } else if (currentState.noiseMode === NoiseType.PULSE) {
                    const d = Math.sqrt(x*x+y*y+z*z);
                    if (d>0.1) {
                        const f = 1 + (pulse * ampFactor * 0.8);
                        x*=f; y*=f; z*=f;
                    }
                 } else if (currentState.noiseMode === NoiseType.NOISE) {
                    const amp = (treble + pulse * 0.5) * ampFactor * 5;
                    x += (Math.random()-0.5)*amp;
                    y += (Math.random()-0.5)*amp;
                    z += (Math.random()-0.5)*amp;
                 } else if (currentState.noiseMode === NoiseType.VORTEX) {
                    const ang = Math.atan2(z,x) + ((bass + pulse)*ampFactor*3);
                    const r = Math.sqrt(x*x+z*z);
                    x = r*Math.cos(ang);
                    z = r*Math.sin(ang);
                    y += mid*20*ampFactor;
                 } else if (currentState.noiseMode === NoiseType.RIPPLE) {
                     const r1 = Math.sqrt(x*x + z*z); 
                     const r2 = Math.sqrt((x-10)*(x-10) + z*z);
                     const ripple1 = Math.sin(r1 * 0.5 - time * 5) * ampFactor * 3;
                     const ripple2 = Math.sin(r2 * 0.4 - time * 4) * ampFactor * 3;
                     y += (ripple1 + ripple2) * (1 + pulse);
                 } else if (currentState.noiseMode === NoiseType.HARMONICS) {
                     const baseFreq = x * 0.2; 
                     const h1 = Math.sin(baseFreq + time) * (bass * 30 * ampFactor);
                     const h2 = Math.sin(baseFreq * 2 + time * 1.5) * (mid * 15 * ampFactor);
                     const h3 = Math.sin(baseFreq * 3 + time * 2) * (treble * 10 * ampFactor);
                     const sawtooth = ((x % 5) - 2.5) * ampFactor;
                     if (currentState.activeShape === ShapeType.SPIRAL) {
                         const r = Math.sqrt(x*x + y*y);
                         const angle = Math.atan2(y, x);
                         const newR = r + h1 + h2 + h3;
                         x = newR * Math.cos(angle);
                         y = newR * Math.sin(angle);
                     } else {
                         y += h1 + h2 + h3 + (pulse * sawtooth);
                     }
                 } else if (currentState.noiseMode === NoiseType.MESH_TEAR) {
                     const tearId = Math.floor(i / 100);
                     const tearOffset = Math.sin(tearId + time) * 20 * ampFactor;
                     x += tearOffset * (pulse + 0.5);
                     y += Math.cos(tearId * 0.5 + time) * 10 * ampFactor;
                 } else if (currentState.noiseMode === NoiseType.DATAMOSH) {
                     const lag = Math.sin(i * 0.01 + time) > 0.8 ? 0 : 1;
                     const smear = pulse * ampFactor * 50;
                     x += (Math.random() - 0.5) * smear * lag;
                     y += (Math.random() - 0.5) * smear * lag;
                     z += (Math.random() - 0.5) * smear * lag;
                 } else if (currentState.noiseMode === NoiseType.BIT_CRUSH) {
                     const step = 5 / (ampFactor + 0.1);
                     x = Math.round(x / step) * step;
                     y = Math.round(y / step) * step;
                     z = Math.round(z / step) * step;
                 } else if (currentState.noiseMode === NoiseType.TWIST) {
                     const twistAmt = y * 0.05 * ampFactor * (1 + pulse);
                     const ca = Math.cos(twistAmt);
                     const sa = Math.sin(twistAmt);
                     const nx = x * ca - z * sa;
                     const nz = x * sa + z * ca;
                     x = nx;
                     z = nz;
                 } else if (currentState.noiseMode === NoiseType.BEND) {
                     const bendAmt = 0.01 * ampFactor * (1 + bass);
                     x += (y * y) * bendAmt;
                     z += (y * y) * bendAmt * 0.5;
                 } else if (currentState.noiseMode === NoiseType.STRETCH) {
                     const stretch = 1.0 + (bass * ampFactor * 3.0);
                     y *= stretch;
                     const squeeze = 1.0 / Math.sqrt(stretch);
                     x *= squeeze;
                     z *= squeeze;
                 } else if (currentState.noiseMode === NoiseType.SENTIMENTAL) {
                     const speed = time * 0.5;
                     x += Math.sin(y * 0.05 + speed) * 5 * ampFactor;
                     y += Math.cos(x * 0.05 + speed) * 5 * ampFactor;
                     z += Math.sin(z * 0.05 + speed) * 5 * ampFactor;
                 }
            }
            
            if(isNaN(x)) x=0; if(isNaN(y)) y=0; if(isNaN(z)) z=0;
            posArr[idx] = x; posArr[idx+1] = y; posArr[idx+2] = z;

            // Color Mapping
            let f = 0;
            if (currentState.noiseMode === NoiseType.WAVEFORM && timeData) {
                f = Math.abs((timeData[Math.floor((i / PARTICLE_COUNT) * timeData.length)] - 128) / 128.0) * 3.0;
            } else if (currentState.noiseMode === NoiseType.RIPPLE) {
                f = Math.abs(y) * 0.05;
            } else if (freq && freq.length > 0) {
                const fIdx = Math.floor((i/PARTICLE_COUNT)*freq.length);
                f = freq[fIdx] / 255.0;
            }

            const beatFlash = pulse * 0.5 * intensity; 
            
            const r = THREE.MathUtils.lerp(colorDeep.r, colorElec.r, f*2 + 0.1 + beatFlash);
            const g = THREE.MathUtils.lerp(colorDeep.g, colorElec.g, f*2 + 0.1 + beatFlash);
            const b = THREE.MathUtils.lerp(colorDeep.b, colorElec.b, f*2 + 0.1 + beatFlash);
            
            if (currentState.effectMode === EffectType.GLITCH && Math.random() > 0.98) {
                colArr[idx] = 1.0;
                colArr[idx+1] = 0.0;
                colArr[idx+2] = 0.0;
            } else if (f > 0.6) {
                colArr[idx] = THREE.MathUtils.lerp(r, 1.0, (f-0.6)*2);
                colArr[idx+1] = THREE.MathUtils.lerp(g, 1.0, (f-0.6)*2);
                colArr[idx+2] = THREE.MathUtils.lerp(b, 1.0, (f-0.6)*2);
            } else {
                colArr[idx]=r; colArr[idx+1]=g; colArr[idx+2]=b;
            }
        }
        
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
        
        // --- UPDATE PARTICLE SHADER UNIFORMS ---
        if (particleMaterialRef.current) {
            const pMat = particleMaterialRef.current;
            pMat.uniforms.uTime.value = time;
            pMat.uniforms.uPointSize.value = currentState.pointSize;
            pMat.uniforms.uBrightness.value = currentState.brightness;
            pMat.uniforms.uColor.value.set(currentState.color);
            pMat.uniforms.uAudioLow.value = bass;
            pMat.uniforms.uAudioHigh.value = treble;
            
            let mergeVal = 0;
            if (currentState.mergeMode === MergeMode.COLLISION) mergeVal = 1;
            else if (currentState.mergeMode === MergeMode.INTERFERENCE) mergeVal = 2;
            else if (currentState.mergeMode === MergeMode.DNA_FUSION) mergeVal = 3;
            else if (currentState.mergeMode === MergeMode.EROSION) mergeVal = 4;
            pMat.uniforms.uMergeMode.value = mergeVal;
            pMat.uniforms.uMouse.value.copy(mousePosRef.current);
            
            // Update ghost cursors
            if (currentState.multiCursorCount > 0) {
                for (let i = 0; i < 8; i++) {
                    if (i < currentState.multiCursorCount) {
                        const ghost = ghostCursorsRef.current[i];
                        const angle = time * (0.5 + i * 0.2) + i;
                        const radius = 0.2 + Math.sin(time * 0.3 + i) * 0.1;
                        ghost.x = mousePosRef.current.x + Math.cos(angle) * radius;
                        ghost.y = mousePosRef.current.y + Math.sin(angle) * radius;
                    }
                }
            }
            pMat.uniforms.uCursors.value = ghostCursorsRef.current;
            pMat.uniforms.uCursorCount.value = currentState.multiCursorCount;
            
            pMat.uniforms.uInteractionIntensity.value = currentState.mouseInteraction ? 1.0 : 0.0;
            pMat.uniforms.uSentimentalIntensity.value = currentState.sentimentalMode ? currentState.absurdityIntensity : 0.0;
            pMat.uniforms.uLatentWarp.value = currentState.latentWarp;

            // Find up to 3 layers marked as corpus
            const corpusLayers = currentState.layers.filter(l => l.isCorpus && (l.type === LayerType.IMAGE || l.type === LayerType.VIDEO)).slice(0, 3);
            const corpusTextures = [null, null, null];
            const corpusWeights = [0.0, 0.0, 0.0];

            corpusLayers.forEach((l, idx) => {
                const obj = layerObjectsRef.current.get(l.id);
                let tex: THREE.Texture | null = null;
                if (obj instanceof THREE.Mesh && obj.material instanceof THREE.ShaderMaterial && obj.material.uniforms.tDiffuse) {
                    tex = obj.material.uniforms.tDiffuse.value;
                } else if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshBasicMaterial && obj.material.map) {
                    tex = obj.material.map;
                }
                if (tex) {
                    corpusTextures[idx] = tex;
                    corpusWeights[idx] = l.opacity;
                }
            });

            // If no corpus layers, fallback to mediaUrl
            if (corpusLayers.length === 0 && mediaMaterialRef.current && mediaMaterialRef.current.uniforms.map.value) {
                corpusTextures[0] = mediaMaterialRef.current.uniforms.map.value;
                corpusWeights[0] = 1.0;
            }

            pMat.uniforms.uCorpusTextures.value = corpusTextures;
            pMat.uniforms.uCorpusWeights.value = corpusWeights;
            pMat.uniforms.uHasCorpus.value = corpusTextures[0] !== null;
        }

        // --- UPDATE POST-PROCESSING SHADER UNIFORMS ---
        if (effectPassRef.current) {
            effectPassRef.current.uniforms['uTime'].value = time;
            effectPassRef.current.uniforms['uEffectMode'].value = currentState.effectMode;
            effectPassRef.current.uniforms['uCompression'].value = currentState.compressionArtifacts;
            effectPassRef.current.uniforms['uDatamosh'].value = currentState.datamoshIntensity;
            effectPassRef.current.uniforms['uGlitch'].value = currentState.glitchIntensity;
            if (effectPassRef.current.uniforms['uMouse']) {
                effectPassRef.current.uniforms['uMouse'].value.copy(mousePosRef.current);
            }
            if (effectPassRef.current.uniforms['uCursors']) {
                effectPassRef.current.uniforms['uCursors'].value = ghostCursorsRef.current;
                effectPassRef.current.uniforms['uCursorCount'].value = currentState.multiCursorCount;
            }
            if (effectPassRef.current.uniforms['uDivineMode']) {
                effectPassRef.current.uniforms['uDivineMode'].value = currentState.divineMode;
            }
            if (effectPassRef.current.uniforms['uAbsurdity']) {
                effectPassRef.current.uniforms['uAbsurdity'].value = currentState.absurdityIntensity;
            }
            
            let mergeVal = 0;
            if (currentState.mergeMode === MergeMode.COLLISION) mergeVal = 1;
            else if (currentState.mergeMode === MergeMode.INTERFERENCE) mergeVal = 2;
            else if (currentState.mergeMode === MergeMode.DNA_FUSION) mergeVal = 3;
            else if (currentState.mergeMode === MergeMode.EROSION) mergeVal = 4;
            effectPassRef.current.uniforms['uMergeMode'].value = mergeVal;
        }

        // --- UPDATE LAYERS UNIFORMS ---
        layerObjectsRef.current.forEach((obj) => {
            const layerId = obj.userData.layerId;
            const layer = currentState.layers.find(l => l.id === layerId);
            const layerOpacity = layer ? layer.opacity : 1.0;

            obj.traverse((node) => {
                if ((node as THREE.Mesh).isMesh && (node as THREE.Mesh).material instanceof THREE.ShaderMaterial) {
                    const mat = (node as THREE.Mesh).material as THREE.ShaderMaterial;
                    if (mat.uniforms.uTime) mat.uniforms.uTime.value = time;
                    if (mat.uniforms.uAudioLow) mat.uniforms.uAudioLow.value = bass;
                    if (mat.uniforms.uAudioHigh) mat.uniforms.uAudioHigh.value = treble;
                    if (mat.uniforms.uCursors) mat.uniforms.uCursors.value = ghostCursorsRef.current;
                    if (mat.uniforms.uCursorCount) mat.uniforms.uCursorCount.value = currentState.multiCursorCount;
                    if (mat.uniforms.uDeformation) mat.uniforms.uDeformation.value = currentState.deformationIntensity * layerOpacity;
                    if (mat.uniforms.uSentimental) mat.uniforms.uSentimental.value = currentState.sentimentalMode ? currentState.absurdityIntensity * layerOpacity : 0.0;
                }
                if ((node as THREE.Mesh).isMesh && node.userData.shaderUniforms) {
                    const uniforms = node.userData.shaderUniforms;
                    uniforms.uTime.value = time;
                    uniforms.uAudioLow.value = bass;
                    if (uniforms.uDeformation) uniforms.uDeformation.value = currentState.deformationIntensity * layerOpacity;
                    if (uniforms.uSentimental) uniforms.uSentimental.value = currentState.sentimentalMode ? currentState.absurdityIntensity * layerOpacity : 0.0;
                }
            });
        });

        // --- RENDER ---
        if (composerRef.current && rendererRef.current && feedbackPassRef.current) {
            const readTarget = currentFeedbackTarget.current === 0 ? feedbackTarget1.current : feedbackTarget2.current;
            const writeTarget = currentFeedbackTarget.current === 0 ? feedbackTarget2.current : feedbackTarget1.current;
            
            if (readTarget && writeTarget) {
                // 1. Set the feedback texture from the previous frame
                feedbackPassRef.current.uniforms.tPrev.value = readTarget.texture;
                feedbackPassRef.current.uniforms.uIntensity.value = currentState.feedbackIntensity;
                feedbackPassRef.current.uniforms.uTime.value = time;
                
                // 2. Render the whole composer chain to the screen
                composerRef.current.render();
                
                // 3. Also render the scene to the writeTarget for the NEXT frame's feedback
                // We do this AFTER the composer render so we can potentially capture effects too
                // But usually feedback is on the raw scene or a specific pass.
                // Let's capture the scene + feedback for a "deep" smear.
                rendererRef.current.setRenderTarget(writeTarget);
                rendererRef.current.render(scene, camera);
                rendererRef.current.setRenderTarget(null);
                
                currentFeedbackTarget.current = 1 - currentFeedbackTarget.current;
            } else {
                composerRef.current.render();
            }
        } else if (rendererRef.current) {
            rendererRef.current.render(scene, camera);
        }
      } catch (err) {
        console.error("Render Loop Error:", err);
      }
    };
    
    console.log("VJ Engine: Starting Render Loop...");
    renderLoop();
    
    } catch (err) {
        console.error("VJCanvas Initialization Error:", err);
    }

    const handleResize = () => {
        if(cameraRef.current && rendererRef.current && composerRef.current) {
            const w = window.innerWidth;
            const h = window.innerHeight;
            cameraRef.current.aspect = w/h;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(w, h);
            composerRef.current.setSize(w, h);
        }
    };

    const handleMouseMove = (e: MouseEvent) => {
        mousePosRef.current.x = e.clientX / window.innerWidth;
        mousePosRef.current.y = 1.0 - (e.clientY / window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('mousemove', handleMouseMove);
        if (animationId.current) cancelAnimationFrame(animationId.current);
        if (controls) controls.dispose(); 
        if (renderer) renderer.dispose();
        if (geometry) geometry.dispose();
        if (material) material.dispose();
        if (planeGeo) planeGeo.dispose(); 
        if (planeMat) planeMat.dispose();
        if(mountRef.current) mountRef.current.innerHTML = '';
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0 z-0 bg-black" />;
};
