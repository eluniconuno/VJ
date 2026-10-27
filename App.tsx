
import React, { useState, useEffect } from 'react';
import { VJCanvas } from './components/VJCanvas';
import { BrutalistCanvas } from './components/BrutalistCanvas';
import { Controls } from './components/Controls';
import { AIPanel } from './components/AIPanel';
import { LayerOverlay } from './components/LayerOverlay';
import { TechnicalOverlay } from './components/TechnicalOverlay';
import { VJState, ShapeType, NoiseType, EffectType, TextAnimType, LayerType, MergeMode, ShapeMergeMode } from './types';
import { audioService } from './services/audioService';
import { Layers, Settings } from 'lucide-react';

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
  videoFormat: 'desktop',
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
  stateB: null,
  // --- ESCULTURA GEOMETRICA E CONTROLES DJ ---
  drawingMode: 'points',
  shape3DScale: 1.0,
  geomPositionX: 0,
  geomPositionY: 0,
  chaosIntensity: 0,
  noiseFrequency: 1.0,
  glitchFrequency: 0.2,
  djColorPalette: 'default',
  // --- ESCULTOR GEOMÉTRICO (CUSTOM SHAPES & DEFORMATIONS) ---
  shapeScaleX: 1.0,
  shapeScaleY: 1.0,
  shapeScaleZ: 1.0,
  shapeFreqX: 1.0,
  shapeFreqY: 1.0,
  shapeFreqZ: 1.0,
  shapeModulation: 0.0,
  shapeTwist: 0.0,
  shapeSymmetry: 1,
  shapePower: 1.0,
  shapeNoise: 0.0,
  mathParamA: 4.0,
  mathParamB: 1.0,
  mathParamC: 1.0,
  mathParamD: 1.0,
  mouseMode: 'repel'
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

  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

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
    <div className="relative w-full h-screen overflow-hidden font-mono bg-[#050505] text-white flex flex-col md:flex-row">
      
      {/* 1. LEFT COLLAPSIBLE PANEL (HTML & STRUCTURE ANALOG) */}
      {vjState.showUI && (
        leftPanelOpen ? (
          <div className="w-full md:w-[380px] h-[45%] md:h-screen md:border-r-4 border-white bg-black flex flex-col z-30 select-none relative shadow-[4px_0px_20px_rgba(0,0,0,0.5)]">
            <Controls 
              vjState={vjState} 
              setVjState={setVjState} 
              audioService={audioService} 
              side="left" 
              onClose={() => setLeftPanelOpen(false)} 
            />
          </div>
        ) : (
          <button 
            onClick={() => setLeftPanelOpen(true)}
            className="hidden md:flex h-screen w-12 bg-black border-r-4 border-white flex-col items-center justify-start pt-12 gap-8 text-white hover:bg-[#111111] transition-all cursor-pointer select-none group z-30 font-sans shadow-[2px_0px_10px_rgba(0,0,0,0.5)]"
          >
            <div className="border-2 border-white p-1 bg-[#16a34a] text-black shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] group-hover:scale-110 transition-transform">
              <Layers size={14} className="text-white animate-pulse" />
            </div>
            <span style={{ fontFamily: 'Tektur, sans-serif', writingMode: 'vertical-lr' }} className="font-black text-[10px] tracking-widest uppercase rotate-180 text-lime-400">
              [+] OPEN_STRUCTURE_DOCK
            </span>
          </button>
        )
      )}

      {/* 2. CENTER MULTIMEDIA CANVAS PORT VIEW */}
      <div className="flex-1 h-full relative overflow-y-auto custom-scrollbar flex flex-col justify-between py-4 px-2 md:px-6 z-10 bg-[#020202]">
        
        {/* VYXO_LAB Neobrutalist Header */}
        <div className="w-full max-w-[1280px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 border-b-2 border-white/20 pb-3 mb-2 select-none">
          <div className="flex items-center gap-3">
            <div className="bg-lime-400 text-black font-extrabold text-[10px] px-2.5 py-1 uppercase shadow-[3px_3px_0px_0px_rgba(255,255,255,1)] rotate-[-1deg] border border-black font-sans">
              CORE_ACTIVE // V.4.2
            </div>
            <h1 style={{ fontFamily: 'Tektur, sans-serif' }} className="text-lg md:text-xl font-extrabold tracking-widest text-white uppercase leading-none">
              VYXO_LAB // MULTIMEDIA CANVAS STUDIO
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Direct Mobile Quick Expand indicators */}
            <div className="md:hidden flex gap-1">
              {!leftPanelOpen && (
                <button onClick={() => setLeftPanelOpen(true)} className="px-2 py-1 border border-lime-400 text-lime-400 text-[10px] bg-lime-950/20 font-black">
                  [+] STR_DOCK
                </button>
              )}
              {!rightPanelOpen && (
                <button onClick={() => setRightPanelOpen(true)} className="px-2 py-1 border border-fuchsia-400 text-fuchsia-400 text-[10px] bg-fuchsia-950/20 font-black">
                  [+] STY_DOCK
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[9px] text-[#22c55e] border-2 border-[#22c55e] px-2.5 py-0.5 bg-green-950/20 shadow-[2px_2px_0px_0px_rgba(34,197,94,0.3)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse"></span>
              GLITCH_SYS_STABLE
            </div>
          </div>
        </div>

        {/* The Brutalist interactive drawing board */}
        <div className="flex-1 flex items-center justify-center min-h-0 w-full">
          <div className="w-full h-full max-h-[82vh] relative flex items-center justify-center">
            <BrutalistCanvas vjState={vjState} setVjState={setVjState}>
              <VJCanvas vjState={vjState} setVjState={setVjState} />
            </BrutalistCanvas>
          </div>
        </div>

        {/* Technical feedback stats bar */}
        <div className="w-full max-w-[1280px] mx-auto mt-2 select-none">
          <TechnicalOverlay vjState={vjState} />
        </div>
      </div>

      {/* Floating full layers overlays if any */}
      <LayerOverlay vjState={vjState} />

      {/* 3. RIGHT COLLAPSIBLE PANEL (CSS & STYLING ANALOG) */}
      {vjState.showUI && (
        rightPanelOpen ? (
          <div className="w-full md:w-[380px] h-[45%] md:h-screen md:border-l-4 border-white bg-black flex flex-col z-30 select-none relative shadow-[-4px_0px_20px_rgba(0,0,0,0.5)]">
            <Controls 
              vjState={vjState} 
              setVjState={setVjState} 
              audioService={audioService} 
              side="right" 
              onClose={() => setRightPanelOpen(false)} 
            />
          </div>
        ) : (
          <button 
            onClick={() => setRightPanelOpen(true)}
            className="hidden md:flex h-screen w-12 bg-black border-l-4 border-white flex-col items-center justify-start pt-12 gap-8 text-white hover:bg-[#111111] transition-all cursor-pointer select-none group z-30 font-sans shadow-[-2px_0px_10px_rgba(0,0,0,0.5)]"
          >
            <div className="border-2 border-white p-1 bg-[#d946ef] text-black shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] group-hover:scale-110 transition-transform">
              <Settings size={14} className="text-white animate-spin" />
            </div>
            <span style={{ fontFamily: 'Tektur, sans-serif', writingMode: 'vertical-lr' }} className="font-black text-[10px] tracking-widest uppercase rotate-180 text-fuchsia-400">
              [+] OPEN_STYLING_DOCK
            </span>
          </button>
        )
      )}

      {/* AI command central panel */}
      <AIPanel vjState={vjState} setVjState={setVjState} />
      
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 z-0"></div>
    </div>
  );
};

export default App;
