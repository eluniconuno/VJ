
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
        uInteraction: { value: 0.0 },
        uMouseMode: { value: 0 }
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
        uniform int uMouseMode;

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
            if (uInteraction > 0.0 && uMouseMode != 4) {
                // Main Mouse
                vec2 mouseWorld = (uMouse - 0.5) * 100.0;
                float d = distance(pos.xy, mouseWorld);
                if (d < 30.0) {
                    float force = (1.0 - d/30.0) * uInteraction * 15.0;
                    if (uMouseMode == 0 || uMouseMode == 3) {
                        pos.z += force;
                    } else if (uMouseMode == 1) {
                        pos.z -= force * 0.8;
                    } else if (uMouseMode == 2) {
                        vec2 dir = normalize(pos.xy - mouseWorld);
                        pos.xy += vec2(-dir.y, dir.x) * force * 0.2;
                    }
                }

                // Ghost Cursors
                if (uCursorCount > 0) {
                    for(int i = 0; i < 8; i++) {
                        if(i >= uCursorCount) break;
                        vec2 cWorld = (uCursors[i] - 0.5) * 100.0;
                        float dist = distance(pos.xy, cWorld);
                        if (dist < 20.0) {
                            float f = (1.0 - dist / 20.0) * uInteraction * 10.0;
                            if (uMouseMode == 0 || uMouseMode == 3) {
                                pos.z += f;
                            } else if (uMouseMode == 1) {
                                pos.z -= f * 0.8;
                            } else if (uMouseMode == 2) {
                                vec2 dir = normalize(pos.xy - cWorld);
                                pos.xy += vec2(-dir.y, dir.x) * f * 0.2;
                            }
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
        case ShapeType.CUBE_GRID: return new THREE.BoxGeometry(1, 1, 1, 4, 4, 4);
        case ShapeType.SPIKY_BALL: return new THREE.DodecahedronGeometry(1, 1);
        case ShapeType.HEART: return new THREE.SphereGeometry(1, 16, 16);
        case ShapeType.ROSE_CURVE: return new THREE.TorusGeometry(1, 0.2, 8, 50);
        case ShapeType.MOBIUS_STRIP: return new THREE.TorusKnotGeometry(1, 0.3, 100, 16);
        case ShapeType.SUPERFORMULA: return new THREE.IcosahedronGeometry(1, 2);
        case ShapeType.CLIFFORD_ATTRACTOR: return new THREE.TorusKnotGeometry(1, 0.4, 100, 16);
        case ShapeType.MANDELBULB: return new THREE.SphereGeometry(1, 32, 16);
        case ShapeType.SACRED_MANDALA: return new THREE.TorusGeometry(1, 0.1, 16, 100);
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
        uLatentWarp: { value: 0.0 },
        uMouseMode: { value: 0 }
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
        uniform int uMouseMode;

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
            if (uInteractionIntensity > 0.0 && uMouseMode != 4) {
                // Main Mouse
                vec2 mouseWorld = (uMouse - 0.5) * 100.0;
                float dist = distance(pos.xy, mouseWorld);
                if (dist < 30.0) {
                    float force = (1.0 - dist / 30.0) * uInteractionIntensity * 20.0;
                    vec2 dir = normalize(pos.xy - mouseWorld);
                    if (uMouseMode == 0) {
                        pos.xy += dir * force;
                    } else if (uMouseMode == 1) {
                        pos.xy -= dir * force * 0.8;
                    } else if (uMouseMode == 2) {
                        pos.xy += vec2(-dir.y, dir.x) * force;
                    } else if (uMouseMode == 3) {
                        pos.z += sin(dist * 0.5 - uTime * 8.0) * force * 0.8;
                    }
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
                            if (uMouseMode == 0) {
                                pos.xy += dir * f;
                            } else if (uMouseMode == 1) {
                                pos.xy -= dir * f * 0.8;
                            } else if (uMouseMode == 2) {
                                pos.xy += vec2(-dir.y, dir.x) * f;
                            } else if (uMouseMode == 3) {
                                pos.z += sin(d * 0.5 - uTime * 8.0) * f * 0.8;
                            }
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
  const previousSliderZoomRef = useRef<number>(60);
  
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
      // Centered at 0, 0
      const worldX = layer.posX;
      const worldY = layer.posY;
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
                let lMouseMode = 0;
                if (props.vjState.mouseMode === 'attract') lMouseMode = 1;
                else if (props.vjState.mouseMode === 'vortex') lMouseMode = 2;
                else if (props.vjState.mouseMode === 'wave') lMouseMode = 3;
                else if (props.vjState.mouseMode === 'none') lMouseMode = 4;
                if (mat.uniforms.uMouseMode) {
                    mat.uniforms.uMouseMode.value = lMouseMode;
                }
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
  }, [props.vjState.mouseInteraction, props.vjState.mouseMode, props.vjState.deformationIntensity, props.vjState.displacementScale, props.vjState.sentimentalMode, props.vjState.latentWarp]);


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

        const initWidth = mountRef.current.clientWidth || 800;
        const initHeight = mountRef.current.clientHeight || 450;

        const camera = new THREE.PerspectiveCamera(75, initWidth / initHeight, 0.1, 1000);
        camera.position.z = 60;
        camera.position.y = 10;
        camera.lookAt(0,0,0);
        cameraRef.current = camera;

        renderer = new THREE.WebGLRenderer({ 
            antialias: false, 
            alpha: true,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: true
        });
        renderer.setSize(initWidth, initHeight);
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

        const lineMaterial = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending
        });
        const lineSegments = new THREE.Line(geometry, lineMaterial);
        lineSegments.visible = false;
        scene.add(lineSegments);

        const solidMaterial = new THREE.MeshBasicMaterial({
            vertexColors: true,
            wireframe: true,
            transparent: true,
            opacity: 0.35,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });
        const solidMesh = new THREE.Mesh(geometry, solidMaterial);
        solidMesh.visible = false;
        scene.add(solidMesh);

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
    feedbackTarget1.current = new THREE.WebGLRenderTarget(initWidth, initHeight);
    feedbackTarget2.current = new THREE.WebGLRenderTarget(initWidth, initHeight);
    
    // --- HELPER FUNCTIONS ---
    const getTargetPos = (type: string, i: number, out: THREE.Vector3, state: VJState) => {
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
        } else if (type === ShapeType.CUBE_GRID) {
             const side = Math.floor(Math.pow(PARTICLE_COUNT, 1/3));
             const xGrid = i % side;
             const yGrid = Math.floor(i / side) % side;
             const zGrid = Math.floor(i / (side * side));
             const spacing = 5.0;
             out.set((xGrid - side/2) * spacing, (yGrid - side/2) * spacing, (zGrid - side/2) * spacing);
        } else if (type === ShapeType.SPIKY_BALL) {
             const phi = Math.acos(1 - 2 * (i + 0.5) / PARTICLE_COUNT);
             const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);
             const r = (i % 15 === 0) ? 38 : 17;
             out.set(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi));
        } else if (type === ShapeType.HEART) {
             const t = (i / PARTICLE_COUNT) * Math.PI * 2;
             const xVal = 16 * Math.pow(Math.sin(t), 3);
             const yVal = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);
             const zVal = Math.sin(i * 12) * 6;
             out.set(xVal * 1.5, yVal * 1.5, zVal);
        } else if (type === ShapeType.ROSE_CURVE) {
             const theta = (i / PARTICLE_COUNT) * Math.PI * 2 * 12;
             const k = 6; 
             const r = 24 * Math.cos(k * theta);
             out.set(r * Math.cos(theta), r * Math.sin(theta), Math.sin(i * 0.1) * 8);
        } else if (type === ShapeType.MOBIUS_STRIP) {
             const u = (i / PARTICLE_COUNT) * Math.PI * 2;
             const v = ((i % 100) / 100) * 2 - 1; 
             const R = 22;
             const xVal = (R + v * 8 * Math.cos(u / 2)) * Math.cos(u);
             const yVal = (R + v * 8 * Math.cos(u / 2)) * Math.sin(u);
             const zVal = v * 8 * Math.sin(u / 2);
             out.set(xVal, yVal, zVal);
        } else if (type === ShapeType.SUPERFORMULA) {
             // 3D Gielis Superformula
             const m = state.mathParamA !== undefined ? state.mathParamA : 4.0;
             const n1 = state.mathParamB !== undefined ? state.mathParamB : 1.0;
             const n2 = state.mathParamC !== undefined ? state.mathParamC : 1.0;
             const n3 = state.mathParamD !== undefined ? state.mathParamD : 1.0;
             
             const phi = (i / PARTICLE_COUNT) * Math.PI - Math.PI / 2; // latitude: -PI/2 to PI/2
             const theta = ((i % 100) / 100) * Math.PI * 2 - Math.PI; // longitude: -PI to PI
             
             const a = 1.0, b = 1.0;
             const t1 = Math.abs(Math.cos(m * theta / 4.0) / a);
             const t2 = Math.abs(Math.sin(m * theta / 4.0) / b);
             const r1 = Math.pow(Math.pow(t1, n2) + Math.pow(t2, n3), -1.0 / n1);
             
             const t3 = Math.abs(Math.cos(m * phi / 4.0) / a);
             const t4 = Math.abs(Math.sin(m * phi / 4.0) / b);
             const r2 = Math.pow(Math.pow(t3, n2) + Math.pow(t4, n3), -1.0 / n1);
             
             const scaleVal = 22.0;
             const xVal = scaleVal * r1 * Math.cos(theta) * r2 * Math.cos(phi);
             const yVal = scaleVal * r1 * Math.sin(theta) * r2 * Math.cos(phi);
             const zVal = scaleVal * r2 * Math.sin(phi);
             out.set(xVal, yVal, zVal);
        } else if (type === ShapeType.CLIFFORD_ATTRACTOR) {
             // Lorenz Chaotic Attractor Map
             const sigma = state.mathParamA !== undefined ? state.mathParamA : 10.0;
             const rho = state.mathParamB !== undefined ? state.mathParamB : 28.0;
             const beta = state.mathParamC !== undefined ? state.mathParamC : 2.666;
             const scale = state.mathParamD !== undefined ? state.mathParamD * 0.9 : 0.9;
             
             let x = 0.1, y = 0.1, z = 0.1;
             const dt = 0.01 + (i % 50) * 0.0001;
             const steps = 15 + (i % 250);
             for (let sVal = 0; sVal < steps; sVal++) {
                 const dx = sigma * (y - x);
                 const dy = x * (rho - z) - y;
                 const dz = x * y - beta * z;
                 x += dx * dt;
                 y += dy * dt;
                 z += dz * dt;
             }
             out.set(x * scale, y * scale, (z - rho/2.0) * scale);
        } else if (type === ShapeType.MANDELBULB) {
             // 3D Mandelbulb Fractal cloud
             const n = state.mathParamA !== undefined ? state.mathParamA : 8.0;
             const maxIt = Math.min(6, Math.max(1, Math.floor(state.mathParamB !== undefined ? state.mathParamB : 4.0)));
             const fScale = state.mathParamC !== undefined ? state.mathParamC * 15.0 : 15.0;
             const morph = state.mathParamD !== undefined ? state.mathParamD : 0.0;
             
             const phi = Math.acos(1.0 - 2.0 * (i + 0.5) / PARTICLE_COUNT);
             const theta = Math.PI * (1.0 + Math.sqrt(5.0)) * (i + 0.5);
             const rInit = 1.0;
             
             let x = rInit * Math.sin(phi) * Math.cos(theta);
             let y = rInit * Math.sin(phi) * Math.sin(theta);
             let z = rInit * Math.cos(phi);
             
             const cx = x, cy = y, cz = z;
             for (let iter = 0; iter < maxIt; iter++) {
                 const r = Math.sqrt(x*x + y*y + z*z);
                 if (r > 2.0) break;
                 
                 let thetaSph = Math.atan2(Math.sqrt(x*x + y*y), z);
                 let phiSph = Math.atan2(y, x);
                 
                 const rPower = Math.pow(r, n);
                 thetaSph = thetaSph * n + morph;
                 phiSph = phiSph * n;
                 
                 x = rPower * Math.sin(thetaSph) * Math.cos(phiSph) + cx;
                 y = rPower * Math.sin(thetaSph) * Math.sin(phiSph) + cy;
                 z = rPower * Math.cos(thetaSph) + cz;
             }
             out.set(x * fScale, y * fScale, z * fScale);
        } else if (type === ShapeType.SACRED_MANDALA) {
             // Sacred Geometry Mandala
             const petals = state.mathParamA !== undefined ? state.mathParamA : 8.0;
             const twist = state.mathParamB !== undefined ? state.mathParamB : 2.0;
             const freq = state.mathParamC !== undefined ? state.mathParamC : 3.0;
             const rScale = state.mathParamD !== undefined ? state.mathParamD * 20.0 : 20.0;
             
             const t = (i / PARTICLE_COUNT) * Math.PI * 2.0 * freq;
             const r = rScale * (1.0 + 0.5 * Math.sin(petals * t));
             const xVal = r * Math.cos(t + twist * Math.sin(t));
             const yVal = r * Math.sin(t + twist * Math.sin(t));
             const zVal = Math.sin(t * petals) * (rScale * 0.3);
             out.set(xVal, yVal, zVal);
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
        getTargetPos(ShapeType.ORB, i, targetVector, props.vjState);
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
        
        // Let's pre-compute the ambient fallback so it's always ready
        const ambientPulse = 0.15 + 0.15 * Math.sin(time * 2.5);
        const ambientBass = 0.2 + 0.1 * Math.sin(time * 0.8);
        const ambientMid = 0.15 + 0.08 * Math.sin(time * 1.15);
        const ambientTreble = 0.12 + 0.06 * Math.sin(time * 1.75);

        if (currentState.audioReactive) {
            const d = audioService.getAudioData();
            const force = currentState.audioForce; 
            
            const rawBass = d.bass * force * currentState.bassImpact; 
            const rawMid = d.mid * force; 
            const rawTreble = d.treble * force * currentState.trebleImpact; 
            const rawPulse = d.pulse * force;
            
            // Blend real audio with a subtle ambient baseline, ensuring it never goes dead silent/static during quiet moments
            bass = Math.max(rawBass, ambientBass * 0.3);
            mid = Math.max(rawMid, ambientMid * 0.3);
            treble = Math.max(rawTreble, ambientTreble * 0.3);
            pulse = Math.max(rawPulse, ambientPulse * 0.3);
            
            if (currentState.bpmSync) {
                pulse = THREE.MathUtils.lerp(pulse, bpmPulse * force, 0.5);
            }

            freq = d.frequencyData; 
            timeData = d.timeData;
        } else if (currentState.bpmSync) {
            // BPM Sync is ON but audio input is off - pulse beautifully to the beat
            pulse = bpmPulse;
            bass = 0.25 + bpmPulse * 0.3;
            mid = 0.2 + bpmPulse * 0.2;
            treble = 0.15 + bpmPulse * 0.15;
        } else {
            // Use ambient fallback values
            pulse = ambientPulse;
            bass = ambientBass;
            mid = ambientMid;
            treble = ambientTreble;
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
             // 1. Zoom - Only apply from state if it changed via the UI slider
             const targetZoom = currentState.cameraZoom;
             if (targetZoom !== previousSliderZoomRef.current) {
                 const dir = cameraRef.current.position.clone().sub(controlsRef.current.target).normalize();
                 cameraRef.current.position.copy(controlsRef.current.target).add(dir.multiplyScalar(targetZoom));
                 previousSliderZoomRef.current = targetZoom;
             } else {
                 // Keep the ref updated with the distance in case the user manually scrolled
                 const currentZoom = cameraRef.current.position.distanceTo(controlsRef.current.target);
                 previousSliderZoomRef.current = currentZoom;
             }

             // 2. Auto Rotate
             controlsRef.current.autoRotate = !!currentState.autoRotate;
             controlsRef.current.autoRotateSpeed = (currentState.rotationSpeed ?? 1.0) * 4.0;

             // Add rotation speed to particle points too
             if (currentState.autoRotate) {
                 const rotInc = 0.005 * currentState.rotationSpeed * currentState.timeScale;
                 points.rotation.y += rotInc;
                 lineSegments.rotation.y += rotInc;
                 solidMesh.rotation.y += rotInc;
             }

             // --- ESCULTURA GEOMETRICA: POSIÇÃO E ZOOM ---
             const scale3D = currentState.shape3DScale ?? 1.0;
             const pX = currentState.geomPositionX ?? 0;
             const pY = currentState.geomPositionY ?? 0;

             points.scale.set(scale3D, scale3D, scale3D);
             lineSegments.scale.set(scale3D, scale3D, scale3D);
             solidMesh.scale.set(scale3D, scale3D, scale3D);

             points.position.set(pX, pY, 0);
             lineSegments.position.set(pX, pY, 0);
             solidMesh.position.set(pX, pY, 0);

             // --- ALTERNAR VISIBILIDADE DAS GEOMETRIAS ---
             const dMode = currentState.drawingMode || 'points';
             points.visible = (dMode === 'points');
             lineSegments.visible = (dMode === 'lines' || dMode === 'spiral_lines');
             solidMesh.visible = (dMode === 'massive' || dMode === 'wireframe');

             if (dMode === 'wireframe') {
                 (solidMesh.material as THREE.MeshBasicMaterial).wireframe = true;
                 (solidMesh.material as THREE.MeshBasicMaterial).opacity = 0.45;
             } else if (dMode === 'massive') {
                 (solidMesh.material as THREE.MeshBasicMaterial).wireframe = false;
                 (solidMesh.material as THREE.MeshBasicMaterial).opacity = 0.35;
             }

             // 3. Camera Shake - We shake the scene directly to avoid OrbitControls drift
             if (currentState.cameraShake > 0) {
                 const shake = currentState.cameraShake * (0.15 + pulse * 0.45) * 2.5;
                 scene.position.set(
                     (Math.random() - 0.5) * shake,
                     (Math.random() - 0.5) * shake,
                     (Math.random() - 0.5) * shake
                 );
             } else {
                 scene.position.set(0, 0, 0);
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
            
            getTargetPos(currentState.activeShape, i, targetA, currentState);
            
            if (currentState.shapeMix > 0) {
                getTargetPos(currentState.activeShapeB, i, targetB, currentState);
                
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

            // --- GEOMETRIC SCULPTING DEFORMATIONS ---
            // 1. Dimensional Scaling
            targetVector.x *= currentState.shapeScaleX !== undefined ? currentState.shapeScaleX : 1.0;
            targetVector.y *= currentState.shapeScaleY !== undefined ? currentState.shapeScaleY : 1.0;
            targetVector.z *= currentState.shapeScaleZ !== undefined ? currentState.shapeScaleZ : 1.0;

            // 2. Trigonometric Frequency Warping
            const fX = currentState.shapeFreqX !== undefined ? currentState.shapeFreqX : 1.0;
            const fY = currentState.shapeFreqY !== undefined ? currentState.shapeFreqY : 1.0;
            const fZ = currentState.shapeFreqZ !== undefined ? currentState.shapeFreqZ : 1.0;
            if (fX !== 1.0 || fY !== 1.0 || fZ !== 1.0) {
                targetVector.x += Math.sin(targetVector.y * 0.1 * fX) * 2.0;
                targetVector.y += Math.sin(targetVector.z * 0.1 * fY) * 2.0;
                targetVector.z += Math.sin(targetVector.x * 0.1 * fZ) * 2.0;
            }

            // 3. Harmonic Modulation (distance modulation)
            const modulation = currentState.shapeModulation !== undefined ? currentState.shapeModulation : 0.0;
            if (modulation > 0) {
                const len = targetVector.length();
                if (len > 0.01) {
                    const phi = Math.acos(THREE.MathUtils.clamp(targetVector.z / len, -1.0, 1.0));
                    const theta = Math.atan2(targetVector.y, targetVector.x);
                    const mod = 1.0 + modulation * 0.5 * Math.sin(phi * 8.0) * Math.cos(theta * 8.0);
                    targetVector.multiplyScalar(mod);
                }
            }

            // 4. Twist (rotation around Y-axis based on Y position)
            const twist = currentState.shapeTwist !== undefined ? currentState.shapeTwist : 0.0;
            if (twist !== 0) {
                const angle = targetVector.y * twist * 0.05;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const tx = targetVector.x * cos - targetVector.z * sin;
                const tz = targetVector.x * sin + targetVector.z * cos;
                targetVector.x = tx;
                targetVector.z = tz;
            }

            // 5. Symmetry Mirroring
            const symmetry = currentState.shapeSymmetry !== undefined ? currentState.shapeSymmetry : 1;
            if (symmetry > 1) {
                if (symmetry === 2) { // Binary Mirror
                    targetVector.x = Math.abs(targetVector.x);
                } else if (symmetry === 4) { // Radial 4-fold
                    targetVector.x = Math.abs(targetVector.x);
                    targetVector.z = Math.abs(targetVector.z);
                } else if (symmetry === 8) { // 8-fold mandala symmetry
                    targetVector.x = Math.abs(targetVector.x);
                    targetVector.z = Math.abs(targetVector.z);
                    if (targetVector.x < targetVector.z) {
                        const tmp = targetVector.x;
                        targetVector.x = targetVector.z;
                        targetVector.z = tmp;
                    }
                }
            }

            // 6. Geometric Power Pinch/Inflate
            const power = currentState.shapePower !== undefined ? currentState.shapePower : 1.0;
            if (power !== 1.0 && power > 0) {
                const len = targetVector.length();
                if (len > 0.01) {
                    const normalized = targetVector.clone().normalize();
                    const newLen = Math.pow(len / 25.0, power) * 25.0;
                    targetVector.copy(normalized.multiplyScalar(newLen));
                }
            }

            // 7. Geometric Noise
            const sNoise = currentState.shapeNoise !== undefined ? currentState.shapeNoise : 0.0;
            if (sNoise > 0) {
                const noiseVal = sNoise * 4.0;
                targetVector.x += (Math.sin(targetVector.y * 0.2 + time) * noiseVal);
                targetVector.y += (Math.cos(targetVector.z * 0.2 + time) * noiseVal);
                targetVector.z += (Math.sin(targetVector.x * 0.2 + time) * noiseVal);
            }
            
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

            // --- INTENSIDADE DE CAOS (CONCRETO E VISIVEL) ---
            if (currentState.chaosIntensity > 0) {
                // Reduced scaling from 2.5 to 0.4 for smooth, beautiful, and highly progressive chaos disorder
                const ch = currentState.chaosIntensity * 0.4;
                x += Math.sin(i * 0.13 + time * 6.5) * Math.cos(i * 0.07 + time * 3.0) * ch;
                y += Math.cos(i * 0.09 + time * 5.2) * Math.sin(i * 0.11 + time * 4.0) * ch;
                z += Math.sin(i * 0.05 + time * 7.1) * Math.cos(i * 0.17 + time * 3.5) * ch;
            }            if (currentState.noiseMode !== NoiseType.NONE && intensity > 0.01) {
                 // We multiply noise effects by displacementScale
                 const ampFactor = intensity * dispScale; 
                 const nFreq = currentState.noiseFrequency ?? 1.0; 
 
                 if (currentState.noiseMode === NoiseType.WAVEFORM) {
                     const wave = (timeData && timeData.length > 0) 
                         ? ((timeData[Math.floor((i / PARTICLE_COUNT) * timeData.length)] / 128.0) - 1.0)
                         : Math.sin(i * 0.05 * nFreq + time * 6.0) * 0.5;
                     const beatAmp = 1.0 + (pulse * 2.0); 
 
                     if (currentState.activeShape === ShapeType.PLANE || currentState.activeShape === ShapeType.GRID || currentState.activeShape === ShapeType.TERRAIN) {
                         y += wave * 10.0 * ampFactor * beatAmp;
                     } else {
                         const len = Math.sqrt(x*x + y*y + z*z);
                         if(len > 0.001) {
                             const disp = wave * 5.0 * ampFactor * beatAmp;
                             x += (x/len) * disp;
                             y += (y/len) * disp;
                             z += (z/len) * disp;
                         }
                     }
                 } else if (currentState.noiseMode === NoiseType.PULSE) {
                    const d = Math.sqrt(x*x+y*y+z*z);
                    if (d>0.1) {
                        const f = 1.0 + (pulse * ampFactor * 0.4);
                        x*=f; y*=f; z*=f;
                    }
                 } else if (currentState.noiseMode === NoiseType.NOISE) {
                    const noiseSpeed = time * 5.0 * nFreq;
                    const baseNoise = Math.sin(i * 0.1 + noiseSpeed) * 0.2;
                    const amp = (treble + pulse * 0.5 + Math.abs(baseNoise)) * ampFactor * 2.0;
                    const rX = Math.sin(i * 123.456 + time) * 0.5;
                    const rY = Math.cos(i * 456.789 + time) * 0.5;
                    const rZ = Math.sin(i * 789.123 + time) * 0.5;
                    x += rX * amp;
                    y += rY * amp;
                    z += rZ * amp;
                 } else if (currentState.noiseMode === NoiseType.VORTEX) {
                    const ang = Math.atan2(z,x) + ((bass + pulse + 0.2) * ampFactor * 1.5 * nFreq);
                    const r = Math.sqrt(x*x+z*z);
                    x = r*Math.cos(ang);
                    z = r*Math.sin(ang);
                    y += (mid + 0.1) * 6.0 * ampFactor;
                 } else if (currentState.noiseMode === NoiseType.RIPPLE) {
                     const r1 = Math.sqrt(x*x + z*z); 
                     const r2 = Math.sqrt((x-10)*(x-10) + z*z);
                     const ripple1 = Math.sin(r1 * 0.5 * nFreq - time * 5.0) * ampFactor * 1.5;
                     const ripple2 = Math.sin(r2 * 0.4 * nFreq - time * 4.0) * ampFactor * 1.5;
                     y += (ripple1 + ripple2) * (1.0 + pulse);
                 } else if (currentState.noiseMode === NoiseType.HARMONICS) {
                     const baseFreq = x * 0.2 * nFreq; 
                     const h1 = Math.sin(baseFreq + time) * ((bass + 0.1) * 10.0 * ampFactor);
                     const h2 = Math.sin(baseFreq * 2.0 + time * 1.5) * ((mid + 0.1) * 5.0 * ampFactor);
                     const h3 = Math.sin(baseFreq * 3.0 + time * 2.0) * ((treble + 0.1) * 3.0 * ampFactor);
                     const sawtooth = ((x % 5.0) - 2.5) * ampFactor;
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
                     const tearOffset = Math.sin(tearId * nFreq + time * 2.0) * 6.0 * ampFactor;
                     x += tearOffset * (pulse + 0.5);
                     y += Math.cos(tearId * 0.5 * nFreq + time) * 3.0 * ampFactor;
                 } else if (currentState.noiseMode === NoiseType.DATAMOSH) {
                     const lag = Math.sin(i * 0.01 * nFreq + time * 3.0) > 0.8 ? 0.0 : 1.0;
                     const smear = (pulse + 0.2) * ampFactor * 15.0;
                     const sX = Math.sin(i * 4.5 + time) * smear * lag;
                     const sY = Math.cos(i * 7.8 + time) * smear * lag;
                     const sZ = Math.sin(i * 2.1 + time) * smear * lag;
                     x += sX;
                     y += sY;
                     z += sZ;
                 } else if (currentState.noiseMode === NoiseType.BIT_CRUSH) {
                     const step = 0.2 + (ampFactor * 1.5 * nFreq);
                     x = Math.round(x / step) * step;
                     y = Math.round(y / step) * step;
                     z = Math.round(z / step) * step;
                 } else if (currentState.noiseMode === NoiseType.TWIST) {
                     const twistAmt = y * 0.02 * ampFactor * (1.0 + pulse) * nFreq;
                     const ca = Math.cos(twistAmt);
                     const sa = Math.sin(twistAmt);
                     const nx = x * ca - z * sa;
                     const nz = x * sa + z * ca;
                     x = nx;
                     z = nz;
                 } else if (currentState.noiseMode === NoiseType.BEND) {
                     const bendAmt = 0.003 * ampFactor * (1.0 + bass) * nFreq;
                     x += (y * y) * bendAmt;
                     z += (y * y) * bendAmt * 0.5;
                 } else if (currentState.noiseMode === NoiseType.STRETCH) {
                     const stretch = 1.0 + ((bass + 0.1) * ampFactor * 1.5 * nFreq);
                     y *= stretch;
                     const squeeze = 1.0 / Math.sqrt(stretch);
                     x *= squeeze;
                     z *= squeeze;
                 } else if (currentState.noiseMode === NoiseType.SENTIMENTAL) {
                     const speed = time * 0.5 * nFreq;
                     x += Math.sin(y * 0.05 + speed) * 2.0 * ampFactor;
                     y += Math.cos(x * 0.05 + speed) * 2.0 * ampFactor;
                     z += Math.sin(z * 0.05 + speed) * 2.0 * ampFactor;
                 }
            }
            
            if(isNaN(x)) x=0; if(isNaN(y)) y=0; if(isNaN(z)) z=0;
            posArr[idx] = x; posArr[idx+1] = y; posArr[idx+2] = z;

            // Color Mapping
            let f = 0;
            if (currentState.noiseMode === NoiseType.WAVEFORM) {
                const waveVal = (timeData && timeData.length > 0)
                    ? Math.abs((timeData[Math.floor((i / PARTICLE_COUNT) * timeData.length)] - 128) / 128.0)
                    : Math.abs(Math.sin(i * 0.05 + time * 4.0)) * 0.3;
                f = waveVal * 3.0;
            } else if (currentState.noiseMode === NoiseType.RIPPLE) {
                f = Math.abs(y) * 0.05;
            } else if (freq && freq.length > 0) {
                const fIdx = Math.floor((i/PARTICLE_COUNT)*freq.length);
                f = freq[fIdx] / 255.0;
            } else {
                f = 0.15 + 0.1 * Math.sin(i * 0.01 + time * 1.5);
            }

            const beatFlash = pulse * 0.5 * intensity; 
            
            const r_orig = THREE.MathUtils.lerp(colorDeep.r, colorElec.r, f*2 + 0.1 + beatFlash);
            const g_orig = THREE.MathUtils.lerp(colorDeep.g, colorElec.g, f*2 + 0.1 + beatFlash);
            const b_orig = THREE.MathUtils.lerp(colorDeep.b, colorElec.b, f*2 + 0.1 + beatFlash);

            let r = r_orig;
            let g = g_orig;
            let b = b_orig;
            
            // --- APLICAR PALETAS DJ PROFISSIONAIS ---
            const palette = currentState.djColorPalette || 'default';
            if (palette === 'cyberpunk') {
                const tVal = (i / PARTICLE_COUNT) * Math.PI * 3 + time * 2.0;
                r = Math.sin(tVal) * 0.45 + 0.55;
                g = Math.cos(tVal * 0.4) * 0.15 + 0.1;
                b = Math.sin(tVal * 1.2) * 0.35 + 0.65;
            } else if (palette === 'acid_green') {
                const val = Math.sin(i * 0.015 + time * 4.0) * 0.5 + 0.5;
                r = val * 0.4;
                g = 0.95 + pulse * 0.05;
                b = 0.0;
            } else if (palette === 'toxic_pink') {
                const val = Math.cos(i * 0.02 + time * 4.5) * 0.3 + 0.7;
                r = 0.95 + pulse * 0.05;
                g = 0.0;
                b = val;
            } else if (palette === 'neon') {
                const alt = Math.sin(i * 0.06 + time * 5.0);
                if (alt > 0) {
                    r = 0.0; g = 1.0; b = 1.0; // Neon Ciano
                } else {
                    r = 1.0; g = 0.45; b = 0.0; // Neon Laranja
                }
            } else if (palette === 'monochrome') {
                const gray = (r_orig + g_orig + b_orig) / 3.0;
                r = gray; g = gray; b = gray;
            } else if (palette === 'dark_matter') {
                r = 0.1 + pulse * 0.1;
                g = 0.0;
                b = 0.55 + Math.sin(i * 0.005) * 0.25;
            } else if (palette === 'vaporwave') {
                r = 0.92;
                g = 0.52 + Math.sin(time * 0.8 + i * 0.001) * 0.18;
                b = 0.82;
            } else if (palette === 'inferno') {
                r = 0.9 + pulse * 0.1;
                g = 0.12 + Math.sin(i * 0.008 + time * 3.5) * 0.3;
                b = 0.0;
            }
            
            const glitchThreshold = 1.0 - (currentState.glitchFrequency ?? 0.2) * 0.08;
            if (currentState.effectMode === EffectType.GLITCH && Math.random() > glitchThreshold) {
                const noiseTypeSeed = Math.random();
                if (noiseTypeSeed > 0.6) {
                    colArr[idx] = 0.0; colArr[idx+1] = 1.0; colArr[idx+2] = 0.0; // Green Acid
                } else if (noiseTypeSeed > 0.3) {
                    colArr[idx] = 1.0; colArr[idx+1] = 0.0; colArr[idx+2] = 1.0; // Magenta
                } else {
                    colArr[idx] = 1.0; colArr[idx+1] = 1.0; colArr[idx+2] = 0.0; // Yellow Bright
                }
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
            
            // Map currentState.pointSize from user slider range [0.5, 10.0] to a perfect visible/crisp range [1.2, 3.2]
            // At 0.5, the particles are at 1.2 (perfectly visible, crisp and not empty).
            // From 2.0 (which previously bloated everything), the actual size is bounded smoothly to 1.8.
            // At 10.0, the max size is bounded to 3.2, preventing overlap that blends into solid visual geometry shapes.
            const rawSize = currentState.pointSize;
            let mappedSize = 1.3;
            if (rawSize <= 2.0) {
                // Map [0.5, 2.0] -> [1.3, 1.6]
                mappedSize = 1.3 + ((rawSize - 0.5) / 1.5) * 0.3;
            } else {
                // Map [2.0, 10.0] -> [1.6, 2.4]
                mappedSize = 1.6 + ((rawSize - 2.0) / 8.0) * 0.8;
            }
            pMat.uniforms.uPointSize.value = mappedSize;
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
            let pMouseMode = 0;
            if (currentState.mouseMode === 'attract') pMouseMode = 1;
            else if (currentState.mouseMode === 'vortex') pMouseMode = 2;
            else if (currentState.mouseMode === 'wave') pMouseMode = 3;
            else if (currentState.mouseMode === 'none') pMouseMode = 4;
            pMat.uniforms.uMouseMode.value = pMouseMode;

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
        if(mountRef.current && cameraRef.current && rendererRef.current && composerRef.current) {
            const w = mountRef.current.clientWidth;
            const h = mountRef.current.clientHeight;
            if (w === 0 || h === 0) return;
            cameraRef.current.aspect = w/h;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(w, h);
            composerRef.current.setSize(w, h);
            if (feedbackTarget1.current) feedbackTarget1.current.setSize(w, h);
            if (feedbackTarget2.current) feedbackTarget2.current.setSize(w, h);
        }
    };

    let isDraggingShape = false;
    let startDragX = 0;
    let startDragY = 0;
    let startShapeX = 0;
    let startShapeY = 0;

    const handleMouseDown = (e: MouseEvent) => {
        if (e.shiftKey || e.button === 2 || e.button === 1) {
            isDraggingShape = true;
            startDragX = e.clientX;
            startDragY = e.clientY;
            startShapeX = vjStateRef.current?.geomPositionX ?? 0;
            startShapeY = vjStateRef.current?.geomPositionY ?? 0;
            if (controlsRef.current) {
                controlsRef.current.enabled = false;
            }
            if (e.button === 2) {
                e.preventDefault();
            }
        }
    };

    const handleMouseMoveDrag = (e: MouseEvent) => {
        if (isDraggingShape) {
            const dx = e.clientX - startDragX;
            const dy = e.clientY - startDragY;
            const factor = 0.12; 
            const nX = startShapeX + dx * factor;
            const nY = startShapeY - dy * factor;
            props.setVjState(prev => ({
                ...prev,
                geomPositionX: nX,
                geomPositionY: nY
            }));
        }
    };

    const handleMouseUp = () => {
        if (isDraggingShape) {
            isDraggingShape = false;
            if (controlsRef.current) {
                controlsRef.current.enabled = true;
            }
        }
    };

    const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
    };

    const handleWheel = (e: WheelEvent) => {
        if (e.shiftKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            props.setVjState(prev => {
                const newScale = Math.max(0.1, Math.min(5.0, (prev.shape3DScale ?? 1.0) + delta));
                return { ...prev, shape3DScale: newScale };
            });
        }
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (mountRef.current) {
            const rect = mountRef.current.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                mousePosRef.current.x = (e.clientX - rect.left) / rect.width;
                mousePosRef.current.y = 1.0 - ((e.clientY - rect.top) / rect.height);
            }
        }
    };

    const resizeObserver = new ResizeObserver(() => {
        handleResize();
    });
    if (mountRef.current) {
        resizeObserver.observe(mountRef.current);
    }

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);

    if (mountRef.current) {
        mountRef.current.addEventListener('mousedown', handleMouseDown);
        mountRef.current.addEventListener('mousemove', handleMouseMoveDrag);
        mountRef.current.addEventListener('mouseup', handleMouseUp);
        mountRef.current.addEventListener('mouseleave', handleMouseUp);
        mountRef.current.addEventListener('contextmenu', handleContextMenu);
        mountRef.current.addEventListener('wheel', handleWheel, { passive: false });
    }

    return () => {
        resizeObserver.disconnect();
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('mousemove', handleMouseMove);
        
        if (mountRef.current) {
            mountRef.current.removeEventListener('mousedown', handleMouseDown);
            mountRef.current.removeEventListener('mousemove', handleMouseMoveDrag);
            mountRef.current.removeEventListener('mouseup', handleMouseUp);
            mountRef.current.removeEventListener('mouseleave', handleMouseUp);
            mountRef.current.removeEventListener('contextmenu', handleContextMenu);
            mountRef.current.removeEventListener('wheel', handleWheel);
        }

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
