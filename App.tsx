
import React, { useState, useEffect } from 'react';
import { VJCanvas } from './components/VJCanvas';
import { Controls } from './components/Controls';
import { AIPanel } from './components/AIPanel';
import { TextOverlay } from './components/TextOverlay';
import { VJState, ShapeType, NoiseType, EffectType, TextAnimType, LayerType, MergeMode, ShapeMergeMode } from './types';
import { audioService } from './services/audioService';

import { TechnicalOverlay } from './components/TechnicalOverlay';
import { LayerOverlay } from './components/LayerOverlay';

const DEFAULT_STATE: VJState = {
  deformationIntensity: 0.0,
  displacementScale: 1.0,
  animationSpeed: 1.2,
  timeScale: 1.0,
  rotationSpeed: 0.5,
  pointSize: 2.5,
  color: '#2D70FF',
  brightness: 1.0,
  activeShape: ShapeType.MONOLITH,
  activeShapeB: ShapeType.ORB,
  shapeMix: 0,
  shapeMergeMode: ShapeMergeMode.LERP,
  noiseMode: NoiseType.MESH_TEAR,
  effectMode: EffectType.GLITCH,
  mergeMode: MergeMode.DNA_FUSION,
  audioForce: 1.5,
  bassImpact: 1.2,
  trebleImpact: 1.5,
  audioSmoothing: 0.85,
  audioReactive: true,
  micActive: false,
  isPlaying: false,
  audioSource: 'mic',
  volume: 1.0,
  filterValue: 0,
  elasticity: 0.3,
  cameraZoom: 75,
  cameraShake: 0.1,
  autoRotate: true,
  mediaUrl: null,
  mediaType: 'none',
  mediaOpacity: 0.3,
  mediaScale: 1.0,
  mediaDistortion: 0.5,
  textOverlays: [],
  layers: [
    {
      id: 'default_particles',
      type: LayerType.PARTICLES,
      visible: true,
      opacity: 1.0,
      scale: 1.0,
      posX: 0, posY: 0, posZ: 0,
      rotX: 0, rotY: 0, rotZ: 0,
      blendMode: 'additive'
    }
  ],
  researchLog: [
    {
      timestamp: Date.now(),
      prompt: "INITIAL_GRANDIOSO_STATE",
      parameters: {
        activeShape: ShapeType.SENTIMENTAL,
        noiseMode: NoiseType.SENTIMENTAL,
        effectMode: EffectType.GLITCH,
        mergeMode: MergeMode.DNA_FUSION,
        color: '#ff00ff',
        sentimentalMode: true,
        absurdityIntensity: 0.9,
        latentWarp: 0.7,
        deformationIntensity: 2.5,
        divineMode: true,
        multiCursorCount: 4,
        displacementScale: 2.0
      } as any
    }
  ],
  autoMorph: false,
  mouseInteraction: true,
  showAdvancedPanel: false,
  showUI: true,
  isRecording: false,
  showTechnicalOverlay: true,
  compressionArtifacts: 0.2,
  datamoshIntensity: 0.0,
  glitchIntensity: 0.0,
  feedbackIntensity: 0.0,
  geometryAttraction: 0.0,
  divineMode: false,
  multiCursorCount: 0,
  sentimentalMode: false,
  absurdityIntensity: 0.0,
  latentWarp: 0.0,
  // --- ARENA VJ EXTENSIONS ---
  bpm: 120,
  bpmSync: false,
  crossfader: 0,
  activeDeck: 0,
  decks: [
    { id: 'deck_a', clips: Array(8).fill(null) },
    { id: 'deck_b', clips: Array(8).fill(null) }
  ],
  activeClipId: null,
  lfos: [],
  stateA: null,
  stateB: null
};

// Helper to create a clean visual state for Deck A/B
const getInitialVisualState = () => {
  const state = { ...DEFAULT_STATE };
  delete (state as any).decks;
  delete (state as any).stateA;
  delete (state as any).stateB;
  delete (state as any).researchLog;
  return state;
};

const App: React.FC = () => {
  const [vjState, setVjState] = useState<VJState>(() => {
    const state = { ...DEFAULT_STATE };
    state.stateA = getInitialVisualState();
    state.stateB = getInitialVisualState();
    return state;
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h' && e.target instanceof HTMLElement && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        setVjState(prev => ({ ...prev, showUI: !prev.showUI }));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setVjState]);

  return (
    <div className="relative w-full h-screen overflow-hidden font-mono bg-black">
      <VJCanvas vjState={vjState} setVjState={setVjState} />
      <LayerOverlay vjState={vjState} />
      <TechnicalOverlay vjState={vjState} />
      <TextOverlay vjState={vjState} />
      <Controls vjState={vjState} setVjState={setVjState} audioService={audioService} />
      <AIPanel vjState={vjState} setVjState={setVjState} />
      <div className="pointer-events-none absolute inset-0 bg-radial-gradient(circle, transparent 40%, black 140%) z-20"></div>
    </div>
  );
};

export default App;
