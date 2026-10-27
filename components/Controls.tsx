
import React, { useRef, useEffect, useState } from 'react';
import { VJState, ShapeType, NoiseType, EffectType, TextAnimType, TextOverlayItem, LayerType, LayerItem, MergeMode, Clip, Deck, LFO, ShapeMergeMode } from '../types';
import { BRUTALIST_STICKERS } from '../data/stickers';
import { recordService } from '../services/recordService';
import { Camera, Video, Eye, EyeOff, Settings, Maximize, Minimize, Plus, Trash2, Layers, Globe, Box, Database, Zap, Activity, Circle, Play, Save, RefreshCw, Smile, Sparkles, Heart, Lock, Unlock } from 'lucide-react';

interface ControlsProps {
  vjState: VJState;
  setVjState: React.Dispatch<React.SetStateAction<VJState>>;
  audioService: any;
  side: 'left' | 'right';
  onClose?: () => void;
}

type Tab = 'MAIN' | 'AUDIO' | 'MOTION' | 'FX' | 'TEXT' | 'MEDIA' | 'LAYERS' | 'STICKERS' | 'RESEARCH' | 'ARENA';

const PRESET_FONTS = [
  "Space Grotesk", "Syne", "Shrikhand", "Orbitron", "Press Start 2P", 
  "Monoton", "Creepster", "Rubik Glitch", "Rubik Mono One", "Alfa Slab One",
  "Anton", "Bebas Neue", "Bungee", "Bungee Spice", "Bungee Outline", "Bungee Inline", "Bungee Shade",
  "Rubik Doodle Shadow", "Righteous", "Shojumaru", "Ultra", "Unbounded", 
  "Black Ops One", "Permanent Marker", "Syncopate", "Faster One", "Tektur", 
  "Cabin Sketch", "Nabla", "Montserrat", "Playfair Display"
];

const BLEND_MODES = ['normal', 'overlay', 'screen', 'difference', 'exclusion', 'multiply', 'color-dodge'];

export const Controls: React.FC<ControlsProps> = ({ vjState, setVjState, audioService, side, onClose }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const layerFileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>(side === 'left' ? 'LAYERS' : 'MAIN');
  const [uploadingForLayer, setUploadingForLayer] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [midiActive, setMidiActive] = useState(false);
  const [midiDevices, setMidiDevices] = useState<string[]>([]);
  const [hasFile, setHasFile] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  useEffect(() => {
    setMidiDevices(audioService.detectedMidiInputs);
    audioService.onMidiConnectionChange = (devices: string[]) => setMidiDevices([...devices]);
    audioService.onMidiMessage = (msg: any) => {
      setMidiActive(true);
      setTimeout(() => setMidiActive(false), 200);
      
      // Mapeamento MIDI Básico
      if (msg.type === 'CC') {
        if (msg.note === 1) handleChange('deformationIntensity', msg.value * 5);
        if (msg.note === 2) handleChange('animationSpeed', msg.value * 5);
      }
    };
  }, [audioService, setVjState]);

  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2000);
  };

  const handleChange = (key: keyof VJState, value: any) => {
    setVjState(prev => {
      const newState = { ...prev, [key]: value };
      
      // If we are editing a specific deck side, sync the change there too
      if (prev.activeDeck === 0 && prev.stateA) {
        newState.stateA = { ...prev.stateA, [key]: value };
      } else if (prev.activeDeck === 1 && prev.stateB) {
        newState.stateB = { ...prev.stateB, [key]: value };
      }
      
      return newState;
    });
  };

  const addLayer = (type: LayerType) => {
    const newLayer: LayerItem = {
      id: `layer_${Date.now()}`,
      type,
      visible: true,
      opacity: 1.0,
      scale: 1.0,
      posX: 0, posY: 0, posZ: 0,
      rotX: 0, rotY: 0, rotZ: 0,
      blendMode: 'normal'
    };
    setVjState(prev => ({ ...prev, layers: [...prev.layers, newLayer] }));
    showNotification(`LAYER_${type.toUpperCase()}_ADDED`);
  };

  const removeLayer = (id: string) => {
    setVjState(prev => ({ ...prev, layers: prev.layers.filter(l => l.id !== id) }));
  };

  const updateLayer = (id: string, updates: Partial<LayerItem>) => {
    setVjState(prev => ({
      ...prev,
      layers: prev.layers.map(l => l.id === id ? { ...l, ...updates } : l)
    }));
  };

  const duplicateLayer = (id: string) => {
    const original = vjState.layers.find(l => l.id === id);
    if (!original) return;
    const newId = `layer_${Date.now()}`;
    const clone: LayerItem = {
      ...original,
      id: newId,
      name: original.name ? `${original.name} (Copy)` : `${original.type.toUpperCase()} Layer (Copy)`,
      posX: Math.max(-100, Math.min(100, original.posX + 8)),
      posY: Math.max(-100, Math.min(100, original.posY - 8)),
      locked: false,
    };
    setVjState(prev => ({ ...prev, layers: [...prev.layers, clone] }));
    showNotification('LAYER_DUPLICATED');
  };

  const bringToFront = (id: string) => {
    setVjState(prev => {
      const target = prev.layers.find(l => l.id === id);
      if (!target) return prev;
      const filtered = prev.layers.filter(l => l.id !== id);
      return { ...prev, layers: [...filtered, target] };
    });
    showNotification('BROUGHT_TO_FRONT');
  };

  const sendToBack = (id: string) => {
    setVjState(prev => {
      const target = prev.layers.find(l => l.id === id);
      if (!target) return prev;
      const filtered = prev.layers.filter(l => l.id !== id);
      return { ...prev, layers: [target, ...filtered] };
    });
    showNotification('SENT_TO_BACK');
  };

  const moveUp = (id: string) => {
    setVjState(prev => {
      const idx = prev.layers.findIndex(l => l.id === id);
      if (idx === -1 || idx === prev.layers.length - 1) return prev;
      const newLayers = [...prev.layers];
      const temp = newLayers[idx];
      newLayers[idx] = newLayers[idx + 1];
      newLayers[idx + 1] = temp;
      return { ...prev, layers: newLayers };
    });
    showNotification('MOVED_UP');
  };

  const moveDown = (id: string) => {
    setVjState(prev => {
      const idx = prev.layers.findIndex(l => l.id === id);
      if (idx === -1 || idx === 0) return prev;
      const newLayers = [...prev.layers];
      const temp = newLayers[idx];
      newLayers[idx] = newLayers[idx - 1];
      newLayers[idx - 1] = temp;
      return { ...prev, layers: newLayers };
    });
    showNotification('MOVED_DOWN');
  };

  const getVisualSnapshot = () => {
    const excludeKeys = ['decks', 'researchLog', 'lfos', 'stateA', 'stateB', 'activeClipId', 'activeDeck', 'showUI', 'showAdvancedPanel', 'isRecording'];
    const visualState: any = {};
    Object.keys(vjState).forEach(key => {
      if (!excludeKeys.includes(key)) {
        visualState[key] = (vjState as any)[key];
      }
    });
    return JSON.parse(JSON.stringify(visualState));
  };

  const saveClip = (deckIdx: number, slotIdx: number) => {
    const clipId = `clip_${Date.now()}`;
    const visualState = getVisualSnapshot();

    const newClip: Clip = {
      id: clipId,
      name: `CLIP_${slotIdx + 1}`,
      state: visualState
    };

    setVjState(prev => {
      const newDecks = [...prev.decks];
      newDecks[deckIdx] = { ...newDecks[deckIdx], clips: [...newDecks[deckIdx].clips] };
      newDecks[deckIdx].clips[slotIdx] = newClip;
      return { ...prev, decks: newDecks };
    });
    showNotification(`CLIP_SAVED_TO_DECK_${deckIdx === 0 ? 'A' : 'B'}`);
  };

  const triggerClip = (clip: Clip, deckIdx: number) => {
    setVjState(prev => {
      const updates = { ...clip.state };
      
      if (deckIdx === 0) {
        return { 
          ...prev, 
          ...updates, 
          stateA: { ...updates }, 
          activeClipId: clip.id,
          activeDeck: 0
        };
      } else {
        return { 
          ...prev, 
          ...updates, 
          stateB: { ...updates }, 
          activeClipId: clip.id,
          activeDeck: 1
        };
      }
    });
    showNotification(`CLIP_TRIGGERED_ON_DECK_${deckIdx === 0 ? 'A' : 'B'}`);
  };

  const resetSystem = () => {
    // We need to reload or just reset the state to default
    // For now, let's just reset the state
    window.location.reload();
  };

  const sendLiveToDeck = (deckIdx: number) => {
    const visualState = getVisualSnapshot();
    setVjState(prev => ({
      ...prev,
      [deckIdx === 0 ? 'stateA' : 'stateB']: visualState
    }));
    showNotification(`LIVE_SENT_TO_DECK_${deckIdx === 0 ? 'A' : 'B'}`);
  };

  const ingestCorpus = () => {
    const entry = {
      timestamp: Date.now(),
      prompt: "MANUAL_RESEARCH_INGESTION",
      parameters: { ...vjState }
    };
    setVjState(prev => ({ ...prev, researchLog: [entry, ...prev.researchLog].slice(0, 20) }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'corpus' | 'layer', layerId?: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const type = file.type.startsWith('video') ? 'video' : 'image';

    if (target === 'corpus') {
      setVjState(prev => ({ ...prev, mediaUrl: url, mediaType: type as any }));
    } else if (target === 'layer' && layerId) {
      updateLayer(layerId, { url, type: type === 'video' ? LayerType.VIDEO : LayerType.IMAGE });
    }
  };

  const handleTextLayerChange = (id: string, updates: Partial<TextOverlayItem>) => {
    setVjState(prev => ({
      ...prev,
      textOverlays: prev.textOverlays.map(t => t.id === id ? { ...t, ...updates } : t)
    }));
  };

  const addTextLayer = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    const newLayer: TextOverlayItem = {
      id: newId,
      text: "NEW LAYER",
      font: "Orbitron",
      size: 4,
      posX: 50,
      posY: 50,
      color: "#ffffff",
      anim: TextAnimType.STATIC,
      blendMode: 'normal',
      outline: false,
      opacity: 1,
      letterSpacing: 0,
      rotation: 0,
      glow: 20,
      fontWeight: "900",
      isItalic: false
    };
    setVjState(prev => ({ ...prev, textOverlays: [...prev.textOverlays, newLayer] }));
    setSelectedTextId(newId);
  };

  const deleteTextLayer = (id: string) => {
    setVjState(prev => ({ ...prev, textOverlays: prev.textOverlays.filter(t => t.id !== id) }));
    if (selectedTextId === id) setSelectedTextId(null);
  };

  const toggleMic = async () => {
    const newState = !vjState.micActive;
    await audioService.toggleMicrophone(newState);
    handleChange('micActive', newState);
  };

  const startRecordingAction = async () => {
    if (vjState.isRecording) return;
    const canvas = document.querySelector('canvas');
    if (canvas) {
      const audioStream = audioService.getRecordingStream();
      await recordService.startRecording(canvas, audioStream, false, vjState.videoFormat || 'desktop'); 
      handleChange('isRecording', true);
    } else {
      showNotification('Nenhum Canvas 3D encontrado para gravação!');
    }
  };

  const stopRecordingAction = () => {
    if (!vjState.isRecording) return;
    recordService.stopRecording();
    handleChange('isRecording', false);
  };

  useEffect(() => {
    recordService.setListener({
      onStart: () => {
        showNotification('🎥 GRAVAÇÃO INICIADA! FAÇA SUA PERFORMANCE VJ...');
      },
      onStop: () => {
        showNotification('💾 CAPTURA INTERNA DE VÍDEO CONCLUÍDA! COMPILANDO...');
      },
      onComplete: (filename) => {
        showNotification(`✅ BAIXADO E ENVIADO COM SUCESSO PARA PASTA DOWNLOADS! (${filename})`);
      },
      onError: (err) => {
        showNotification(`❌ ERRO DE GRAVAÇÃO: ${err}`);
      }
    });

    return () => {
      recordService.setListener(null);
    };
  }, []);

  useEffect(() => {
    let interval: any;
    if (vjState.isRecording) {
      setRecordingSeconds(0);
      const startTime = Date.now();
      interval = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed >= 20.0) {
          setRecordingSeconds(20.0);
          recordService.stopRecording();
          handleChange('isRecording', false);
        } else {
          setRecordingSeconds(elapsed);
        }
      }, 100);
    } else {
      setRecordingSeconds(0);
    }
    return () => clearInterval(interval);
  }, [vjState.isRecording]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await audioService.loadFile(file);
      setHasFile(true);
      audioService.playFile();
      handleChange('isPlaying', true);
    }
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      const type = file.type.startsWith('video') ? 'video' : 'image';
      setVjState(prev => ({ ...prev, mediaUrl: url, mediaType: type }));
    }
  };

  const selectedLayer = vjState.textOverlays.find(t => t.id === selectedTextId);
  const standardEffects = Object.keys(EffectType).filter(k => isNaN(Number(k)) && (EffectType[k as keyof typeof EffectType] as unknown as number) > 0 && ((EffectType[k as keyof typeof EffectType] as unknown as number) <= 4 || (EffectType[k as keyof typeof EffectType] as unknown as number) === 16));
  const colorEffects = Object.keys(EffectType).filter(k => isNaN(Number(k)) && (EffectType[k as keyof typeof EffectType] as unknown as number) >= 5 && (EffectType[k as keyof typeof EffectType] as unknown as number) <= 15);

  const leftTabs: Tab[] = ['LAYERS', 'STICKERS', 'TEXT', 'MEDIA', 'AUDIO'];
  const rightTabs: Tab[] = ['MAIN', 'MOTION', 'FX', 'ARENA', 'RESEARCH'];
  const filteredTabs = side === 'left' ? leftTabs : rightTabs;

  return (
    <div className="w-full h-full flex flex-col overflow-hidden bg-black text-white text-xs font-mono">
      {/* Header and status info with custom Tektur Font styling */}
      <div className="p-3 border-b-2 border-white flex justify-between items-center bg-[#070707] select-none">
        <div className="flex items-center gap-1.5 font-sans">
          <Settings size={13} className="text-white animate-spin" />
          <span style={{ fontFamily: 'Tektur, sans-serif' }} className="font-extrabold text-[10px] tracking-widest text-white">
            {side === 'left' ? 'HTML // STRUCTURE' : 'CSS // EFFECTS & SPEED'}
          </span>
        </div>
        <div className="flex gap-2 items-center text-[9px]">
          {onClose && (
            <button 
              onClick={onClose} 
              className="mr-1 bg-white text-black border border-black hover:bg-rose-500 hover:text-white font-extrabold text-[10px] px-1.5 py-0.5 transition-colors uppercase leading-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5 active:translate-x-0.5 active:shadow-none"
              title="Close Panel"
            >
              ✕ CLOSE
            </button>
          )}
          <div className={`w-2 h-2 rounded-full ${vjState.isPlaying || vjState.micActive ? 'bg-[#22c55e] animate-pulse' : 'bg-rose-500'}`} />
          <span className="font-bold text-[9px] text-gray-400">{vjState.isPlaying || vjState.micActive ? 'LIVE' : 'STANDBY'}</span>
        </div>
      </div>

      {/* QUICK MASTER PANEL - Only rendered on right style panel as a CSS styling analog */}
      {side === 'right' && (
        <div className="p-3 border-b-2 border-white bg-[#0e0e0e]">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <button 
              onClick={toggleMic} 
              className={`py-1.5 text-[9px] font-black border-2 transition-all shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] ${vjState.micActive ? 'border-lime-400 bg-lime-400 text-black shadow-[2px_2px_0px_0px_rgba(163,230,53,0.4)]' : 'border-white text-white hover:bg-white hover:text-black'}`}
            >
              {vjState.micActive ? '● MIC_ON' : 'ENABLE_MIC'}
            </button>
            <button 
              onClick={() => fileInputRef.current?.click()} 
              className={`py-1.5 text-[9px] font-black border-2 transition-all shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] ${vjState.isPlaying ? 'border-sky-400 bg-sky-400 text-black shadow-[2px_2px_0px_0px_rgba(56,189,248,0.4)]' : 'border-white text-white hover:bg-white hover:text-black'}`}
            >
              {vjState.isPlaying ? '● MP3_PLAY' : 'LOAD_MP3'}
            </button>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
          </div>

          {/* PAINEL DE GRAVAÇÃO BRUTALISTA DE VÍDEO */}
          <div className="mb-3 p-2 bg-rose-950/20 border border-rose-500/20 rounded">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[8px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${vjState.isRecording ? 'bg-red-500 animate-ping' : 'bg-rose-500/50'}`}></span>
                Gravação de Vídeo (Máx 20s)
              </span>
              {vjState.isRecording && (
                <span className="text-[8px] font-mono font-bold text-red-400 bg-red-950/80 px-1 rounded animate-pulse">
                  {recordingSeconds.toFixed(1)}s / 20.0s
                </span>
              )}
            </div>

            {/* SELETOR DE FORMATO (PORTRAIT OU WIDESCREEN) */}
            <div className="grid grid-cols-2 gap-1 mb-2">
              <button 
                onClick={() => handleChange('videoFormat', 'desktop')}
                disabled={vjState.isRecording}
                className={`py-1 text-[7.5px] font-black border uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  vjState.videoFormat !== 'mobile' 
                    ? 'bg-rose-500/20 border-rose-500 text-white font-extrabold' 
                    : 'border-white/10 text-gray-400 hover:text-white'
                } ${vjState.isRecording ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                🖥️ Desktop 16:9
              </button>
              <button 
                onClick={() => handleChange('videoFormat', 'mobile')}
                disabled={vjState.isRecording}
                className={`py-1 text-[7.5px] font-black border uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  vjState.videoFormat === 'mobile' 
                    ? 'bg-rose-500/20 border-rose-500 text-white font-extrabold' 
                    : 'border-white/10 text-gray-400 hover:text-white'
                } ${vjState.isRecording ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                📱 Mobile 9:16
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={startRecordingAction}
                disabled={vjState.isRecording}
                className={`py-1 text-[8.5px] font-black border uppercase transition-colors flex items-center justify-center gap-1 cursor-pointer ${vjState.isRecording ? 'opacity-40 border-white/10 text-gray-400 cursor-not-allowed' : 'border-rose-500 text-rose-400 hover:bg-rose-500 hover:text-white'}`}
              >
                <Circle size={8} fill="currentColor" />
                Iniciar
              </button>
              <button 
                onClick={stopRecordingAction}
                disabled={!vjState.isRecording}
                className={`py-1 text-[8.5px] font-black border uppercase transition-colors flex items-center justify-center gap-1 cursor-pointer ${!vjState.isRecording ? 'opacity-40 border-white/10 text-gray-400 cursor-not-allowed' : 'border-red-500 bg-red-600 text-white hover:bg-red-700'}`}
              >
                <div className="w-1.5 h-1.5 bg-current mr-0.5" />
                Parar
              </button>
            </div>

            {vjState.isRecording && (
              <div className="mt-1.5 w-full bg-white/5 h-1 rounded overflow-hidden">
                <div 
                  className="bg-red-500 h-full transition-all duration-100" 
                  style={{ width: `${(recordingSeconds / 20) * 100}%` }}
                />
              </div>
            )}
          </div>

          <div className="space-y-2 border-t border-white/20 pt-2">
            <ControlSlider label="CHAOS_MORPH" value={vjState.deformationIntensity} min={0} max={5} step={0.1} onChange={v => handleChange('deformationIntensity', v)} />
            <ControlSlider label="SIGNAL_SPEED" value={vjState.animationSpeed} min={0} max={5} step={0.1} onChange={v => handleChange('animationSpeed', v)} />
            <ControlSlider label="PARTICLE_SIZE" value={vjState.pointSize} min={0.5} max={10} step={0.1} onChange={v => handleChange('pointSize', v)} />
          </div>
        </div>
      )}

      {/* DETAILED TABS AND CONTROLLERS PANEL */}
      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR DOCK LABELS */}
        <div className="w-16 border-r-2 border-white flex flex-col bg-[#050505] overflow-y-auto no-scrollbar py-1">
          {filteredTabs.map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)} 
              className={`py-3 px-1 text-[8px] font-black tracking-tight transition-all border-b border-white/10 flex flex-col items-center gap-1.5 text-center ${activeTab === tab ? 'bg-white text-black font-black' : 'text-gray-400 hover:bg-white/10'}`}
            >
              {tab === 'MAIN' && <Zap size={11} />}
              {tab === 'AUDIO' && <Activity size={11} />}
              {tab === 'MOTION' && <Maximize size={11} />}
              {tab === 'FX' && <Circle size={11} />}
              {tab === 'STICKERS' && <Smile size={11} />}
              {tab === 'TEXT' && <Plus size={11} />}
              {tab === 'MEDIA' && <Video size={11} />}
              {tab === 'LAYERS' && <Layers size={11} />}
              {tab === 'RESEARCH' && <Database size={11} />}
              {tab === 'ARENA' && <RefreshCw size={11} />}
              <span>{tab}</span>
            </button>
          ))}
        </div>

        {/* CONTAINER CONTENT */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0a]">
          <div className="p-2 border-b-2 border-white bg-white/5 flex justify-between items-center select-none font-sans">
            <span style={{ fontFamily: 'Tektur, sans-serif' }} className="text-[9px] font-extrabold uppercase tracking-widest text-[#22c55e]">{activeTab} // DIRECTIVE</span>
            <div className="flex gap-1.5">
              <div className="w-1.5 h-1.5 bg-[#22c55e] rounded-full"></div>
              <div className="w-1.5 h-1.5 bg-fuchsia-500 rounded-full animate-ping"></div>
            </div>
          </div>
          
          <div className="p-3 overflow-y-auto custom-scrollbar flex-1 space-y-4">
            
            {/* ABA ARENA: CLIP MATRIX & CROSSFADER */}
            {activeTab === 'ARENA' && (
              <div className="space-y-8">
                {/* BPM & SYNC */}
                <div className="space-y-4 border-2 border-white p-3 bg-white/5">
                  <h3 className="text-white font-black uppercase tracking-tighter border-b-2 border-white pb-1 flex items-center gap-2">
                    <Activity size={14} /> MASTER_CLOCK // BPM
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <ControlSlider label="BPM" value={vjState.bpm} min={40} max={240} step={1} onChange={v => handleChange('bpm', v)} />
                    </div>
                    <button 
                      onClick={() => handleChange('bpmSync', !vjState.bpmSync)}
                      className={`px-4 py-2 border-2 font-black text-[10px] transition-all ${vjState.bpmSync ? 'bg-white text-black border-white' : 'border-white/20 text-gray-500'}`}
                    >
                      SYNC
                    </button>
                  </div>
                </div>

                {/* CLIP MATRIX */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b-2 border-white pb-1">
                    <h3 className="text-white font-black uppercase tracking-tighter flex items-center gap-2">
                      <Layers size={14} /> CLIP_MATRIX // DECKS
                    </h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={resetSystem}
                        className="px-2 py-0.5 bg-red-600 text-white text-[8px] font-black hover:bg-red-500"
                      >
                        RESET_SYSTEM
                      </button>
                      <div className="flex bg-white/10 border border-white/20 p-0.5">
                        <button 
                          onClick={() => handleChange('activeDeck', 0)}
                          className={`px-2 py-0.5 text-[8px] font-black transition-all ${vjState.activeDeck === 0 ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
                        >
                          EDIT_A
                        </button>
                        <button 
                          onClick={() => handleChange('activeDeck', 1)}
                          className={`px-2 py-0.5 text-[8px] font-black transition-all ${vjState.activeDeck === 1 ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
                        >
                          EDIT_B
                        </button>
                      </div>
                    </div>
                  </div>
                  
                  {vjState.decks.map((deck, dIdx) => (
                    <div key={deck.id} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black text-gray-500">DECK_{dIdx === 0 ? 'A' : 'B'}</span>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => sendLiveToDeck(dIdx)}
                            className="text-[7px] text-blue-500 hover:text-blue-400 font-black"
                          >
                            SEND_LIVE
                          </button>
                          <button 
                            onClick={() => {
                              const newDecks = [...vjState.decks];
                              newDecks[dIdx].clips = Array(8).fill(null);
                              setVjState(prev => ({ ...prev, decks: newDecks }));
                            }}
                            className="text-[7px] text-gray-500 hover:text-white font-black"
                          >
                            CLEAR_DECK
                          </button>
                          <button 
                            onClick={() => setVjState(prev => ({ ...prev, [dIdx === 0 ? 'stateA' : 'stateB']: null }))}
                            className="text-[7px] text-red-500 hover:text-red-400 font-black"
                          >
                            EJECT_SIDE
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {deck.clips.map((clip, cIdx) => {
                          const isLoadedInA = vjState.stateA && clip && JSON.stringify(vjState.stateA) === JSON.stringify(clip.state);
                          const isLoadedInB = vjState.stateB && clip && JSON.stringify(vjState.stateB) === JSON.stringify(clip.state);
                          
                          return (
                            <div key={cIdx} className="relative group">
                              {clip ? (
                                <button 
                                  onClick={() => triggerClip(clip, dIdx)}
                                  className={`w-full aspect-square border-2 font-black text-[8px] flex flex-col items-center justify-center transition-all relative ${vjState.activeClipId === clip.id ? 'bg-white text-black border-white' : 'bg-white/10 border-white/20 text-white hover:border-white'}`}
                                >
                                  {clip.name}
                                  {(isLoadedInA || isLoadedInB) && (
                                    <div className={`absolute bottom-0 left-0 right-0 h-1 ${isLoadedInA ? 'bg-blue-500' : 'bg-orange-500'}`} />
                                  )}
                                </button>
                              ) : (
                                <button 
                                  onClick={() => saveClip(dIdx, cIdx)}
                                  className="w-full aspect-square border-2 border-dashed border-white/10 text-gray-700 flex items-center justify-center hover:border-white/40 hover:text-white transition-all"
                                >
                                  <Plus size={12} />
                                </button>
                              )}
                              {clip && (
                                <button 
                                  onClick={() => {
                                    const newDecks = [...vjState.decks];
                                    newDecks[dIdx].clips[cIdx] = null;
                                    setVjState(prev => ({ ...prev, decks: newDecks }));
                                  }}
                                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center text-[8px] opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* CROSSFADER */}
                <div className="space-y-4 border-2 border-white p-4 bg-white/10 shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]">
                  <h3 className="text-white font-black uppercase tracking-tighter border-b-2 border-white pb-1 flex items-center justify-center gap-2">
                    <RefreshCw size={14} /> MASTER_CROSSFADER
                  </h3>
                  <div className="flex justify-between text-[10px] font-black text-gray-500 px-2">
                    <span>DECK_A</span>
                    <span>DECK_B</span>
                  </div>
                  <input 
                    type="range" 
                    min={0} 
                    max={1} 
                    step={0.01} 
                    value={vjState.crossfader} 
                    onChange={e => handleChange('crossfader', parseFloat(e.target.value))}
                    className="w-full h-8 bg-gray-900 appearance-none cursor-pointer accent-white border-2 border-white"
                  />
                  <div className="text-center text-[8px] font-black text-white/50 uppercase">
                    Mixing between states in real-time
                  </div>
                </div>

                {/* LFO AUTOMATION */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b-2 border-white pb-1">
                    <h3 className="text-white font-black uppercase tracking-tighter flex items-center gap-2">
                      <Zap size={14} /> LFO_AUTOMATION
                    </h3>
                    <button 
                      onClick={() => {
                        const newLfo: LFO = {
                          id: `lfo_${Date.now()}`,
                          target: 'deformationIntensity',
                          type: 'sine',
                          frequency: 1,
                          amplitude: 1,
                          offset: 0,
                          active: true
                        };
                        setVjState(prev => ({ ...prev, lfos: [...prev.lfos, newLfo] }));
                      }}
                      className="text-[8px] bg-white text-black px-2 py-1 font-black hover:bg-gray-200"
                    >
                      ADD_LFO
                    </button>
                  </div>
                  <div className="space-y-2">
                    {vjState.lfos.map(lfo => (
                      <div key={lfo.id} className="p-3 bg-white/5 border-2 border-white/20 space-y-2">
                        <div className="flex justify-between items-center">
                          <select 
                            value={lfo.target} 
                            onChange={e => {
                              const newLfos = vjState.lfos.map(l => l.id === lfo.id ? { ...l, target: e.target.value as any } : l);
                              setVjState(prev => ({ ...prev, lfos: newLfos }));
                            }}
                            className="bg-black text-[8px] font-black uppercase border border-white/20 p-1"
                          >
                            <option value="deformationIntensity">CHAOS</option>
                            <option value="animationSpeed">FLOW</option>
                            <option value="displacementScale">DISPLACE</option>
                            <option value="pointSize">SCALE</option>
                            <option value="crossfader">X-FADE</option>
                          </select>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => {
                                const newLfos = vjState.lfos.map(l => l.id === lfo.id ? { ...l, active: !l.active } : l);
                                setVjState(prev => ({ ...prev, lfos: newLfos }));
                              }}
                              className={`p-1 border text-[8px] font-black ${lfo.active ? 'bg-green-600 text-white' : 'text-gray-500 border-white/10'}`}
                            >
                              {lfo.active ? 'ON' : 'OFF'}
                            </button>
                            <button 
                              onClick={() => setVjState(prev => ({ ...prev, lfos: prev.lfos.filter(l => l.id !== lfo.id) }))}
                              className="p-1 text-red-500"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <ControlSlider label="Freq" value={lfo.frequency} min={0.1} max={10} step={0.1} onChange={v => {
                            const newLfos = vjState.lfos.map(l => l.id === lfo.id ? { ...l, frequency: v } : l);
                            setVjState(prev => ({ ...prev, lfos: newLfos }));
                          }} />
                          <ControlSlider label="Amp" value={lfo.amplitude} min={0} max={5} step={0.1} onChange={v => {
                            const newLfos = vjState.lfos.map(l => l.id === lfo.id ? { ...l, amplitude: v } : l);
                            setVjState(prev => ({ ...prev, lfos: newLfos }));
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {/* ABA RESEARCH: DATA MERGING & LOGS */}
            {activeTab === 'RESEARCH' && (
              <div className="space-y-6">
                <div className="space-y-4 bg-white/5 p-3 border-2 border-white/10">
                  <h4 className="text-[10px] font-black uppercase tracking-tighter text-white mb-2">Research Guide</h4>
                  <ul className="text-[8px] text-gray-400 space-y-2 list-disc pl-4">
                    <li><span className="text-white">CORPUS:</span> Upload images/videos in MEDIA tab. This is your "Data Source".</li>
                    <li><span className="text-white">FUSION:</span> Select a Merge Mode to fuse the Corpus with the main Particle structure.</li>
                    <li><span className="text-white">SMEAR:</span> Use Feedback to create trails of corrupted data (Datamosh).</li>
                    <li><span className="text-white">ATTRACTION:</span> Add SHAPE or IMAGE layers. Particles will be sucked into their geometry.</li>
                    <li><span className="text-white">AUDIO:</span> Turn on MIC. Bass and Treble now directly modulate the Fusion intensity.</li>
                  </ul>
                </div>

                <div className="space-y-4">
                  <h3 className="text-white font-black uppercase tracking-tighter border-b-2 border-white pb-1 flex items-center gap-2">
                    <Activity size={14} /> DATA_FUSION // CORE
                  </h3>
                  <div className="grid grid-cols-2 gap-1">
                    {Object.values(MergeMode).map(mode => (
                      <button 
                        key={mode} 
                        onClick={() => handleChange('mergeMode', mode)}
                        className={`py-2 border-2 text-[8px] uppercase font-black transition-all ${vjState.mergeMode === mode ? 'bg-white text-black border-white' : 'border-white/20 text-gray-500 hover:border-white/40'}`}
                      >
                        {mode.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                  <ControlSlider label="Compression" value={vjState.compressionArtifacts} min={0} max={1} step={0.01} onChange={v => handleChange('compressionArtifacts', v)} />
                  <ControlSlider label="Datamosh" value={vjState.datamoshIntensity} min={0} max={1} step={0.01} onChange={v => handleChange('datamoshIntensity', v)} />
                  <ControlSlider label="Glitch" value={vjState.glitchIntensity} min={0} max={1} step={0.01} onChange={v => handleChange('glitchIntensity', v)} />
                  <ControlSlider label="Feedback (Smear)" value={vjState.feedbackIntensity} min={0} max={1} step={0.01} onChange={v => handleChange('feedbackIntensity', v)} />
                  <ControlSlider label="Geometry Attraction" value={vjState.geometryAttraction} min={0} max={1} step={0.01} onChange={v => handleChange('geometryAttraction', v)} />
                </div>

                <div className="space-y-4 border-2 border-white p-3 bg-white/5">
                  <h3 className="text-white font-black uppercase tracking-tighter border-b-2 border-white pb-1 flex items-center gap-2">
                    <Zap size={14} /> DIVINE_ENGINE // EXPERIMENTAL
                  </h3>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase text-gray-400 font-black">Divine Mode</span>
                    <input 
                      type="checkbox" 
                      checked={vjState.divineMode} 
                      onChange={e => handleChange('divineMode', e.target.checked)} 
                      className="accent-white w-4 h-4" 
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase text-gray-400 font-black">Sentimental AI</span>
                    <input 
                      type="checkbox" 
                      checked={vjState.sentimentalMode} 
                      onChange={e => handleChange('sentimentalMode', e.target.checked)} 
                      className="accent-white w-4 h-4" 
                    />
                  </div>
                  <ControlSlider 
                    label="Multi-Cursor Count" 
                    value={vjState.multiCursorCount} 
                    min={0} 
                    max={8} 
                    step={1} 
                    onChange={v => handleChange('multiCursorCount', v)} 
                  />
                  <ControlSlider 
                    label="Absurdity Intensity" 
                    value={vjState.absurdityIntensity} 
                    min={0} 
                    max={1} 
                    step={0.01} 
                    onChange={v => handleChange('absurdityIntensity', v)} 
                  />
                  <ControlSlider 
                    label="Latent Warp" 
                    value={vjState.latentWarp} 
                    min={0} 
                    max={1} 
                    step={0.01} 
                    onChange={v => handleChange('latentWarp', v)} 
                  />
                  <p className="text-[7px] text-gray-500 leading-tight uppercase font-black">
                    Multi-Corpus: The first 3 layers marked as 'Corpus' are now blended based on their opacity.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b-2 border-white pb-1">
                    <h3 className="text-white font-black uppercase tracking-tighter flex items-center gap-2">
                      <Database size={14} /> RESEARCH_LOG
                    </h3>
                    <button onClick={ingestCorpus} className="text-[8px] bg-white text-black px-2 py-1 font-black hover:bg-gray-200">INGEST_DATA</button>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                    {vjState.researchLog.length === 0 ? (
                      <div className="text-[9px] text-gray-600 italic text-center py-4">NO_DATA_RECORDED</div>
                    ) : (
                      vjState.researchLog.map((entry, i) => (
                        <div key={i} className="p-2 bg-white/5 border-2 border-white/20 text-[8px] space-y-1">
                          <div className="flex justify-between text-gray-500">
                            <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                            <span className="text-white">MUTATION_{vjState.researchLog.length - i}</span>
                          </div>
                          <div className="text-gray-300 truncate">{entry.prompt}</div>
                          <button 
                            onClick={() => setVjState(prev => ({ ...prev, ...entry.parameters }))}
                            className="w-full mt-1 py-1 bg-white/10 border border-white/20 text-[7px] font-black hover:bg-white hover:text-black transition-colors"
                          >
                            RESTORE_PARAMETERS
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* ABA LAYERS: CAMADAS DE 3D, IMAGEM, VIDEO */}
            {activeTab === 'LAYERS' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center border-b border-[#2D70FF]/30 pb-2">
                  <h3 className="text-[#2D70FF] font-bold uppercase tracking-widest">Layers</h3>
                  <div className="flex gap-1">
                    <button onClick={() => addLayer(LayerType.SHAPE)} className="p-1 hover:bg-white/10 rounded text-blue-400" title="Add Shape"><Circle size={14} /></button>
                    <button onClick={() => addLayer(LayerType.MODEL_3D)} className="p-1 hover:bg-white/10 rounded text-cyan-400" title="Add 3D Model"><Layers size={14} /></button>
                    <button onClick={() => addLayer(LayerType.SPLINE)} className="p-1 hover:bg-white/10 rounded text-purple-400" title="Add Spline Scene"><Box size={14} /></button>
                    <button onClick={() => addLayer(LayerType.IMAGE)} className="p-1 hover:bg-white/10 rounded text-green-400" title="Add Image"><Plus size={14} /></button>
                    <button onClick={() => addLayer(LayerType.IFRAME)} className="p-1 hover:bg-white/10 rounded text-yellow-400" title="Add Iframe/Web"><Globe size={14} /></button>
                  </div>
                </div>

                <div className="space-y-4">
                  {vjState.layers.map((layer, idx) => (
                    <div key={layer.id} className="p-3 bg-white/5 border border-white/10 rounded-lg space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase text-[#2D70FF]">{layer.name || `${layer.type.toUpperCase()} #${idx}`}</span>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => updateLayer(layer.id, { isCorpus: !layer.isCorpus })} 
                            className={`p-1 rounded text-[8px] font-bold border ${layer.isCorpus ? 'bg-red-500/20 border-red-500 text-red-500' : 'border-white/10 text-gray-600'}`}
                            title="Set as Data Corpus"
                          >
                            CORPUS
                          </button>
                          <button 
                            onClick={() => updateLayer(layer.id, { isCorrupted: !layer.isCorrupted })} 
                            className={`p-1 rounded text-[8px] font-bold border ${layer.isCorrupted ? 'bg-purple-500/20 border-purple-500 text-purple-500' : 'border-white/10 text-gray-600'}`}
                            title="Apply Corruption Engine"
                          >
                            CORRUPT
                          </button>
                          <button onClick={() => updateLayer(layer.id, { visible: !layer.visible })} className={`p-1 rounded ${layer.visible ? 'text-cyan-400' : 'text-gray-600'}`}>
                            {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                          </button>
                          {layer.id !== 'default_particles' && (
                            <button onClick={() => removeLayer(layer.id)} className="p-1 text-red-500 hover:bg-red-900/20 rounded">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Name / Rename property */}
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[7.5px] uppercase tracking-wider text-gray-500">RENAME LAYER</span>
                        <input 
                          type="text" 
                          value={layer.name || ''} 
                          onChange={(e) => updateLayer(layer.id, { name: e.target.value })}
                          placeholder={`${layer.type.toUpperCase()} Layer الاسم`}
                          className="bg-black/50 border border-white/10 rounded px-2 py-1 text-[10px] focus:border-[#2D70FF] outline-none font-bold text-lime-400"
                        />
                      </div>

                      {/* Adobe Illustrator Layer Depth / Lock / Clone utility bar */}
                      <div className="flex flex-wrap gap-1 border-t border-b border-white/10 py-2">
                        <button 
                          onClick={() => updateLayer(layer.id, { locked: !layer.locked })} 
                          className={`px-1.5 py-0.5 rounded text-[8px] font-bold border flex items-center gap-1 ${layer.locked ? 'bg-rose-500/20 border-rose-500 text-rose-500 font-extrabold' : 'border-white/10 text-gray-400 hover:text-white'}`}
                          title="Lock Position Dragging"
                        >
                          {layer.locked ? <Lock size={9} /> : <Unlock size={9} />}
                          {layer.locked ? 'LOCKED' : 'LOCK'}
                        </button>
                        <button 
                          onClick={() => duplicateLayer(layer.id)} 
                          className="px-1.5 py-0.5 rounded text-[8px] font-bold border border-white/10 text-gray-400 hover:text-white"
                        >
                          CLONE
                        </button>
                        <button 
                          onClick={() => bringToFront(layer.id)} 
                          className="px-1.5 py-0.5 rounded text-[8px] font-bold border border-white/10 text-gray-400 hover:text-white"
                          title="Bring to Top"
                        >
                          FRONT
                        </button>
                        <button 
                          onClick={() => sendToBack(layer.id)} 
                          className="px-1.5 py-0.5 rounded text-[8px] font-bold border border-white/10 text-gray-400 hover:text-white"
                          title="Send to Bottom"
                        >
                          BACK
                        </button>
                        <button 
                          onClick={() => moveUp(layer.id)} 
                          className="px-1.5 py-0.5 rounded text-[8px] font-bold border border-white/10 text-gray-400 hover:text-white"
                          title="Move Forward"
                        >
                          ▲ UP
                        </button>
                        <button 
                          onClick={() => moveDown(layer.id)} 
                          className="px-1.5 py-0.5 rounded text-[8px] font-bold border border-white/10 text-gray-400 hover:text-white"
                          title="Move Backward"
                        >
                          ▼ DWN
                        </button>
                      </div>

                      {layer.type === LayerType.SHAPE && (
                        <div className="grid grid-cols-2 gap-1">
                          {Object.values(ShapeType).slice(0, 8).map(s => (
                            <button 
                              key={s} 
                              onClick={() => updateLayer(layer.id, { shapeType: s })}
                              className={`py-1 border rounded text-[7px] uppercase ${layer.shapeType === s ? 'bg-blue-500/20 border-blue-500 text-white' : 'border-white/10 text-gray-600'}`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}

                      {layer.type !== LayerType.PARTICLES && (
                        <div className="space-y-2">
                          <div className="flex flex-col gap-1">
                            <span className="text-[8px] uppercase text-gray-500 font-bold">Source URL</span>
                            <div className="flex gap-1">
                              <input 
                                type="text" 
                                value={layer.url || ''} 
                                onChange={(e) => updateLayer(layer.id, { url: e.target.value })}
                                className="bg-black/50 border border-white/10 rounded px-2 py-1 text-[10px] flex-1 focus:border-[#2D70FF] outline-none"
                                placeholder="https://..."
                              />
                              <button 
                                onClick={() => {
                                  setUploadingForLayer(layer.id);
                                  layerFileInputRef.current?.click();
                                }}
                                className="px-2 py-1 bg-white/10 border border-white/20 rounded text-[8px] font-black hover:bg-white hover:text-black"
                              >
                                UPLOAD
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Dimensions, Scale, Positioning & Brand New Image Crop Slider system */}
                      <div className="space-y-2.5 pt-1">
                        <div className="space-y-1">
                          <span className="text-[7.5px] uppercase font-bold text-gray-500 tracking-wider">Transforms & Sizing</span>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                            <ControlSlider label="Opacity" value={layer.opacity} min={0} max={1} step={0.01} onChange={v => updateLayer(layer.id, { opacity: v })} />
                            <ControlSlider label="Scale Propor." value={layer.scale} min={0.1} max={5} step={0.05} onChange={v => updateLayer(layer.id, { scale: v })} />
                            <ControlSlider label="Stretch Width (scaleX)" value={layer.scaleX !== undefined ? layer.scaleX : 1.0} min={0.1} max={4} step={0.05} onChange={v => updateLayer(layer.id, { scaleX: v })} />
                            <ControlSlider label="Stretch Height (scaleY)" value={layer.scaleY !== undefined ? layer.scaleY : 1.0} min={0.1} max={4} step={0.05} onChange={v => updateLayer(layer.id, { scaleY: v })} />
                            <ControlSlider label="Pos X (%)" value={layer.posX} min={-100} max={100} step={1} onChange={v => updateLayer(layer.id, { posX: v })} />
                            <ControlSlider label="Pos Y (%)" value={layer.posY} min={-100} max={100} step={1} onChange={v => updateLayer(layer.id, { posY: v })} />
                            <ControlSlider label="Rot Z (Deg)" value={layer.rotZ || 0} min={0} max={360} step={1} onChange={v => updateLayer(layer.id, { rotZ: v })} />
                            <ControlSlider label="Pos Z" value={layer.posZ} min={-100} max={100} step={1} onChange={v => updateLayer(layer.id, { posZ: v })} />
                          </div>
                        </div>

                        {layer.type === LayerType.IMAGE && (
                          <div className="space-y-1 border-t border-white/10 pt-2.5">
                            <span className="text-[7.5px] uppercase font-bold text-fuchsia-400 tracking-wider">✂ Image Cropping (Cortar Lados)</span>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                              <ControlSlider label="Crop Left (%)" value={layer.cropLeft || 0} min={0} max={90} step={1} onChange={v => updateLayer(layer.id, { cropLeft: v })} />
                              <ControlSlider label="Crop Right (%)" value={layer.cropRight || 0} min={0} max={90} step={1} onChange={v => updateLayer(layer.id, { cropRight: v })} />
                              <ControlSlider label="Crop Top (%)" value={layer.cropTop || 0} min={0} max={90} step={1} onChange={v => updateLayer(layer.id, { cropTop: v })} />
                              <ControlSlider label="Crop Bottom (%)" value={layer.cropBottom || 0} min={0} max={90} step={1} onChange={v => updateLayer(layer.id, { cropBottom: v })} />
                            </div>
                            <div className="flex justify-end pt-1">
                              <button 
                                onClick={() => updateLayer(layer.id, { cropLeft: 0, cropRight: 0, cropTop: 0, cropBottom: 0 })}
                                className="text-[7px] text-red-400 hover:text-white hover:bg-rose-950 px-1 py-0.5 border border-red-500/20 font-black uppercase text-right"
                              >
                                Reset Crop Borders
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* ABA MAIN: GEOMETRIA E NOISE */}
            {activeTab === 'MAIN' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-purple-500 font-bold uppercase tracking-widest border-b border-purple-900/30 pb-1 flex items-center gap-2">
                    <Zap size={14} /> Research Presets
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => setVjState(prev => ({ 
                        ...prev, 
                        activeShape: ShapeType.MONOLITH, 
                        noiseMode: NoiseType.MESH_TEAR, 
                        effectMode: EffectType.GLITCH,
                        mergeMode: MergeMode.DNA_FUSION,
                        color: '#2D70FF',
                        deformationIntensity: 1.5,
                        compressionArtifacts: 0.4
                      }))} 
                      className="py-2 bg-purple-900/20 border border-purple-900/50 rounded text-[9px] font-bold text-purple-400 hover:bg-purple-900/40"
                    >
                      BRUTALIST FUSION
                    </button>
                    <button 
                      onClick={() => setVjState(prev => ({ 
                        ...prev, 
                        activeShape: ShapeType.DATA_GRID, 
                        noiseMode: NoiseType.BIT_CRUSH, 
                        effectMode: EffectType.SCANLINES,
                        mergeMode: MergeMode.COLLISION,
                        color: '#ffffff',
                        deformationIntensity: 0.8,
                        compressionArtifacts: 0.1
                      }))} 
                      className="py-2 bg-cyan-900/20 border border-cyan-900/50 rounded text-[9px] font-bold text-cyan-400 hover:bg-cyan-900/40"
                    >
                      NEURAL MATRIX
                    </button>
                    <button 
                      onClick={() => setVjState(prev => ({ 
                        ...prev, 
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
                      }))} 
                      className="py-2 bg-white/10 border border-white/50 rounded text-[9px] font-black text-white hover:bg-white hover:text-black col-span-2"
                    >
                      GRANDIOSO // SENTIMENTAL_STATE
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <button 
                    onClick={ingestCorpus}
                    className="w-full py-3 bg-white text-black font-black text-[10px] uppercase tracking-tighter hover:bg-gray-200 flex items-center justify-center gap-2"
                  >
                    <Database size={14} /> SAVE_RESEARCH_SNAPSHOT
                  </button>
                </div>

                <div>
                  <h3 className="text-[#2D70FF] font-bold mb-2 uppercase tracking-widest border-b border-[#2D70FF]/30 pb-1">Data Structure</h3>
                  <div className="grid grid-cols-3 gap-1">
                    {Object.values(ShapeType).map(shape => (
                      <button key={shape} onClick={() => handleChange('activeShape', shape)} className={`py-1.5 border rounded uppercase text-[8px] transition-all ${vjState.activeShape === shape ? 'bg-[#2D70FF]/20 border-[#2D70FF] text-white' : 'border-white/10 text-gray-600 hover:border-white/30'}`}>{shape}</button>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-white/5 border border-white/10 rounded-lg space-y-3">
                  <h3 className="text-cyan-400 font-bold text-[10px] uppercase tracking-widest border-b border-cyan-900/50 pb-1 flex justify-between">
                    Dual Shape Mixer
                    <span className="text-white">{vjState.shapeMix.toFixed(2)}</span>
                  </h3>
                  
                  <div className="grid grid-cols-3 gap-1">
                    {Object.values(ShapeType).slice(0, 9).map(shape => (
                      <button 
                        key={shape} 
                        onClick={() => handleChange('activeShapeB', shape)} 
                        className={`py-1 border rounded uppercase text-[7px] transition-all ${vjState.activeShapeB === shape ? 'bg-cyan-500/20 border-cyan-500 text-white' : 'border-white/10 text-gray-600'}`}
                      >
                        {shape}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-1 overflow-x-auto pb-1 custom-scrollbar">
                    {Object.values(ShapeMergeMode).map(mode => (
                      <button 
                        key={mode} 
                        onClick={() => handleChange('shapeMergeMode', mode)} 
                        className={`px-2 py-1 border rounded uppercase text-[7px] whitespace-nowrap ${vjState.shapeMergeMode === mode ? 'bg-white text-black border-white' : 'border-white/10 text-gray-500'}`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>

                  <ControlSlider label="Shape Mix" value={vjState.shapeMix} min={0} max={1} step={0.01} onChange={v => handleChange('shapeMix', v)} />
                </div>

                <div>
                  <h3 className="text-purple-500 font-bold mb-2 uppercase tracking-widest border-b border-purple-900/50 pb-1">Corruption Mode</h3>
                  <div className="grid grid-cols-2 gap-1 mb-2">
                    <button 
                      onClick={() => {
                        handleChange('noiseMode', NoiseType.NONE);
                        handleChange('deformationIntensity', 0);
                        handleChange('displacementScale', 1);
                        handleChange('mouseInteraction', false);
                        showNotification('PURE_GEOMETRY_MODE');
                      }}
                      className="py-1 border-2 border-white/20 text-[7px] uppercase font-black text-gray-400 hover:border-white hover:text-white"
                    >
                      PURE_GEOMETRY
                    </button>
                    <button 
                      onClick={() => {
                        handleChange('noiseMode', NoiseType.DATAMOSH);
                        handleChange('deformationIntensity', 1.5);
                        handleChange('displacementScale', 2.0);
                        handleChange('effectMode', EffectType.GLITCH);
                        showNotification('DATAMOSH_MODE_ACTIVE');
                      }}
                      className="py-1 border-2 border-purple-500/50 text-[7px] uppercase font-black text-purple-400 hover:border-purple-500 hover:text-white"
                    >
                      DATAMOSH_PRESET
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {Object.keys(NoiseType).filter(k => isNaN(Number(k))).map(key => {
                      const modeVal = NoiseType[key as any] as any;
                      return (
                        <button 
                          key={key} 
                          onClick={() => {
                            handleChange('noiseMode', modeVal);
                            if (modeVal !== NoiseType.NONE && vjState.deformationIntensity < 0.8) {
                              handleChange('deformationIntensity', 1.5);
                            }
                          }} 
                          className={`text-left px-2 py-1.5 border rounded text-[10px] transition-all ${vjState.noiseMode === modeVal ? 'bg-purple-900 border-purple-500 text-white' : 'border-white/10 text-gray-600 hover:text-gray-400'}`}
                        >
                          {key.replace('_', ' ')}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <ControlSlider label="Deformation Intensity" value={vjState.deformationIntensity} min={0} max={5} step={0.1} onChange={v => handleChange('deformationIntensity', v)} />
                  <ControlSlider label="Data Displacement" value={vjState.displacementScale} min={0} max={3} step={0.1} onChange={v => handleChange('displacementScale', v)} />
                  
                  {/* DJ MODULATORS BLOCK */}
                  <h3 className="text-yellow-500 font-bold mt-4 mb-2 uppercase tracking-widest border-b border-yellow-900/50 pb-1">DJ Modulators & Glitch</h3>
                  <ControlSlider label="Deformation Freq" value={vjState.noiseFrequency} min={0.1} max={5.0} step={0.1} onChange={v => handleChange('noiseFrequency', v)} />
                  <ControlSlider label="Chaos Disorder" value={vjState.chaosIntensity} min={0} max={10.0} step={0.2} onChange={v => handleChange('chaosIntensity', v)} />
                  <ControlSlider label="Glitch Speed/Freq" value={vjState.glitchFrequency} min={0.0} max={1.0} step={0.05} onChange={v => handleChange('glitchFrequency', v)} />

                  {/* DJ COLOR PALETTE BLOCK */}
                  <h3 className="text-[#2D70FF] font-bold mt-4 mb-2 uppercase tracking-widest border-b border-blue-900/50 pb-1">DJ Color Palettes</h3>
                  <div className="grid grid-cols-3 gap-1 mb-2">
                    {[
                      { id: 'default', label: 'Default' },
                      { id: 'cyberpunk', label: 'Cyberpunk' },
                      { id: 'acid_green', label: 'Acid Green' },
                      { id: 'toxic_pink', label: 'Toxic Pink' },
                      { id: 'neon', label: 'Neon Dual' },
                      { id: 'monochrome', label: 'B&W Mono' },
                      { id: 'dark_matter', label: 'Dark Matter' },
                      { id: 'vaporwave', label: 'Vaporwave' },
                      { id: 'inferno', label: 'Inferno' }
                    ].map(pal => (
                      <button 
                        key={pal.id} 
                        onClick={() => handleChange('djColorPalette', pal.id)} 
                        className={`py-1 border rounded uppercase text-[7px] transition-all truncate ${vjState.djColorPalette === pal.id ? 'bg-[#2D70FF]/25 border-[#2D70FF] text-white' : 'border-white/10 text-gray-500 hover:text-white'}`}
                      >
                        {pal.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase text-gray-500">Technical Overlay</span>
                    <input type="checkbox" checked={vjState.showTechnicalOverlay} onChange={e => handleChange('showTechnicalOverlay', e.target.checked)} className="accent-[#2D70FF]" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase text-gray-500">Auto Morph</span>
                    <input type="checkbox" checked={vjState.autoMorph} onChange={e => handleChange('autoMorph', e.target.checked)} className="accent-[#2D70FF]" />
                  </div>
                  <input type="color" value={vjState.color} onChange={e => handleChange('color', e.target.value)} className="w-full h-8 bg-transparent border border-white/20 rounded cursor-pointer" />

                  {/* DYNAMIC SCULPTING & MOUSE BEHAVIORS */}
                  <h3 className="text-cyan-400 font-bold mt-5 mb-2 uppercase tracking-widest border-b border-cyan-900/50 pb-1">Dynamic Math Sculpting</h3>
                  
                  <div className="bg-white/5 border border-white/10 p-3 rounded-lg space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      <ControlSlider label="Scale X" value={vjState.shapeScaleX ?? 1.0} min={0.1} max={3.0} step={0.05} onChange={v => handleChange('shapeScaleX', v)} />
                      <ControlSlider label="Scale Y" value={vjState.shapeScaleY ?? 1.0} min={0.1} max={3.0} step={0.05} onChange={v => handleChange('shapeScaleY', v)} />
                      <ControlSlider label="Scale Z" value={vjState.shapeScaleZ ?? 1.0} min={0.1} max={3.0} step={0.05} onChange={v => handleChange('shapeScaleZ', v)} />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <ControlSlider label="Freq X" value={vjState.shapeFreqX ?? 1.0} min={0.1} max={10.0} step={0.1} onChange={v => handleChange('shapeFreqX', v)} />
                      <ControlSlider label="Freq Y" value={vjState.shapeFreqY ?? 1.0} min={0.1} max={10.0} step={0.1} onChange={v => handleChange('shapeFreqY', v)} />
                      <ControlSlider label="Freq Z" value={vjState.shapeFreqZ ?? 1.0} min={0.1} max={10.0} step={0.1} onChange={v => handleChange('shapeFreqZ', v)} />
                    </div>

                    <ControlSlider label="Harmonic Modulation" value={vjState.shapeModulation ?? 0.0} min={0.0} max={2.0} step={0.05} onChange={v => handleChange('shapeModulation', v)} />
                    <ControlSlider label="Geometric Twist" value={vjState.shapeTwist ?? 0.0} min={-5.0} max={5.0} step={0.1} onChange={v => handleChange('shapeTwist', v)} />
                    <ControlSlider label="Sculpting Power" value={vjState.shapePower ?? 1.0} min={0.1} max={4.0} step={0.05} onChange={v => handleChange('shapePower', v)} />
                    <ControlSlider label="Structural Noise" value={vjState.shapeNoise ?? 0.0} min={0.0} max={3.0} step={0.05} onChange={v => handleChange('shapeNoise', v)} />

                    <div className="space-y-1">
                      <span className="text-[8px] uppercase text-gray-500 font-bold block">Symmetry Mirroring</span>
                      <div className="grid grid-cols-4 gap-1">
                        {[
                          { id: 1, label: 'None' },
                          { id: 2, label: 'Binary' },
                          { id: 4, label: 'Quad' },
                          { id: 8, label: 'Mandala' }
                        ].map(sym => (
                          <button
                            key={sym.id}
                            onClick={() => handleChange('shapeSymmetry', sym.id)}
                            className={`py-1 rounded border uppercase text-[8px] font-black transition-all ${vjState.shapeSymmetry === sym.id ? 'bg-cyan-500/25 border-cyan-500 text-cyan-300' : 'border-white/10 text-gray-500 hover:text-white'}`}
                          >
                            {sym.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* MATHEMATICAL SHAPE EQUATION PARAMETERS */}
                  <h3 className="text-yellow-500 font-bold mt-5 mb-2 uppercase tracking-widest border-b border-yellow-900/50 pb-1">Equation Sculpting</h3>
                  <div className="bg-white/5 border border-white/10 p-3 rounded-lg space-y-3 font-mono">
                    <div className="text-[8px] text-gray-400 mb-1">COORDINATES: SUPERFORMULA, ATTRACTOR, MANDELBULB, MANDALA</div>
                    <div className="grid grid-cols-2 gap-2">
                      <ControlSlider label="Param A (Symmetry)" value={vjState.mathParamA ?? 4.0} min={0.1} max={20.0} step={0.1} onChange={v => handleChange('mathParamA', v)} />
                      <ControlSlider label="Param B (Attractor Depth)" value={vjState.mathParamB ?? 1.0} min={0.1} max={28.0} step={0.1} onChange={v => handleChange('mathParamB', v)} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <ControlSlider label="Param C (Freq/Iteration)" value={vjState.mathParamC ?? 1.0} min={0.1} max={15.0} step={0.1} onChange={v => handleChange('mathParamC', v)} />
                      <ControlSlider label="Param D (Scale factor)" value={vjState.mathParamD ?? 1.0} min={0.1} max={10.0} step={0.1} onChange={v => handleChange('mathParamD', v)} />
                    </div>
                  </div>

                  {/* INTERACTIVE MOUSE BEHAVIORS */}
                  <h3 className="text-pink-500 font-bold mt-5 mb-2 uppercase tracking-widest border-b border-pink-900/50 pb-1">Tactile Mouse Behavior</h3>
                  <div className="bg-white/5 border border-white/10 p-3 rounded-lg space-y-3">
                    <div className="grid grid-cols-5 gap-1">
                      {[
                        { id: 'repel', label: 'Repel' },
                        { id: 'attract', label: 'Attract' },
                        { id: 'vortex', label: 'Vortex' },
                        { id: 'wave', label: '3D Wave' },
                        { id: 'none', label: 'Disable' }
                      ].map(mode => (
                        <button
                          key={mode.id}
                          onClick={() => handleChange('mouseMode', mode.id)}
                          className={`py-1 rounded border uppercase text-[7px] font-black transition-all ${vjState.mouseMode === mode.id ? 'bg-pink-500/25 border-pink-500 text-pink-300' : 'border-white/10 text-gray-500 hover:text-white'}`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ABA AUDIO: FISICA DO SOM */}
            {activeTab === 'AUDIO' && (
              <div className="space-y-5">
                <h3 className="text-green-500 font-bold mb-2 uppercase tracking-widest border-b border-green-900/50 pb-1">Audio Physics</h3>
                <ControlSlider label="Global Impact" value={vjState.audioForce} min={0} max={3} step={0.1} onChange={v => handleChange('audioForce', v)} />
                <ControlSlider label="Smoothing" value={vjState.audioSmoothing} min={0} max={0.99} step={0.01} onChange={v => handleChange('audioSmoothing', v)} />
                <div className="grid grid-cols-2 gap-4">
                  <ControlSlider label="Bass" value={vjState.bassImpact} min={0} max={2} step={0.1} onChange={v => handleChange('bassImpact', v)} />
                  <ControlSlider label="Treble" value={vjState.trebleImpact} min={0} max={2} step={0.1} onChange={v => handleChange('trebleImpact', v)} />
                </div>
                {midiDevices.length > 0 && (
                  <div className="pt-4 border-t border-white/5">
                    <span className="text-[9px] text-yellow-500 font-bold">MIDI INPUTS:</span>
                    <div className="text-[9px] text-gray-500 italic mt-1">{midiDevices.join(', ')}</div>
                  </div>
                )}
              </div>
            )}

            {/* ABA MOTION: DINAMICA E CAMERA */}
            {activeTab === 'MOTION' && (
              <div className="space-y-5">
                <h3 className="text-yellow-500 font-bold mb-2 uppercase tracking-widest border-b border-yellow-900/50 pb-1">Dynamics</h3>
                <ControlSlider label="Time Scale" value={vjState.timeScale} min={0.1} max={3.0} step={0.1} onChange={v => handleChange('timeScale', v)} />
                <ControlSlider label="Elasticity" value={vjState.elasticity} min={0.01} max={0.5} step={0.01} onChange={v => handleChange('elasticity', v)} />
                <div className="flex items-center justify-between bg-white/5 p-2 border border-white/10 rounded">
                  <span className="text-[10px] uppercase text-gray-500 font-black">Mouse Interaction</span>
                  <input type="checkbox" checked={vjState.mouseInteraction} onChange={e => handleChange('mouseInteraction', e.target.checked)} className="accent-yellow-500 w-4 h-4" />
                </div>
                
                {/* ADVANCED SCULPTURE SPACE CONTROLS */}
                <h3 className="text-cyan-500 font-bold mb-2 mt-4 uppercase tracking-widest border-b border-cyan-900/50 pb-1">3D Sculpture Space</h3>
                
                <div className="space-y-2">
                  <span className="text-[9px] uppercase text-gray-500 block font-mono">Drawing Representation:</span>
                  <div className="grid grid-cols-2 gap-1">
                    {[
                      { id: 'points', label: 'Points' },
                      { id: 'lines', label: 'Wires' },
                      { id: 'massive', label: 'Solid' },
                      { id: 'wireframe', label: 'Grid mesh' }
                    ].map(m => (
                      <button 
                        key={m.id} 
                        onClick={() => handleChange('drawingMode', m.id)} 
                        className={`py-1 rounded border uppercase text-[8px] font-black transition-all ${vjState.drawingMode === m.id ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'border-white/10 text-gray-500 hover:text-white'}`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <ControlSlider label="Sculpture Zoom" value={vjState.shape3DScale} min={0.1} max={4.0} step={0.05} onChange={v => handleChange('shape3DScale', v)} />
                <div className="grid grid-cols-2 gap-2">
                  <ControlSlider label="Offset X" value={vjState.geomPositionX} min={-50} max={50} step={0.5} onChange={v => handleChange('geomPositionX', v)} />
                  <ControlSlider label="Offset Y" value={vjState.geomPositionY} min={-50} max={50} step={0.5} onChange={v => handleChange('geomPositionY', v)} />
                </div>

                {/* NEOBRUTALIST HANDS-ON INTERACTIVE BOX */}
                <div className="p-2 border border-yellow-500/30 bg-yellow-500/5 rounded font-mono text-[8px] leading-tight text-yellow-400/80 uppercase">
                  <div className="font-black text-yellow-400 mb-1">● TACTILE INTERACTIONS (VJ GESTURES)</div>
                  <div>1. <span className="text-yellow-300 font-black">DRAG / MOVEMENT:</span> Hold <span className="text-white">SHIFT + LEFT CLICK</span> or <span className="text-white">RIGHT CLICK</span> on viewport and drag to translate the main shape.</div>
                  <div className="mt-1">2. <span className="text-yellow-300 font-black">DIRECT ZOOM:</span> Hold <span className="text-white">SHIFT + WHEEL SCROLL</span> to rescale 3D sculpture uniformly.</div>
                </div>

                <h3 className="text-orange-500 font-bold mb-2 mt-4 uppercase tracking-widest border-b border-orange-900/50 pb-1">Camera</h3>
                <ControlSlider label="Zoom" value={vjState.cameraZoom} min={10} max={150} step={1} onChange={v => handleChange('cameraZoom', v)} />
                <ControlSlider label="Rotation" value={vjState.rotationSpeed} min={-2} max={2} step={0.1} onChange={v => handleChange('rotationSpeed', v)} />
                <ControlSlider label="Shake" value={vjState.cameraShake} min={0} max={1} step={0.05} onChange={v => handleChange('cameraShake', v)} />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase text-gray-500">Auto Rotate</span>
                  <input type="checkbox" checked={vjState.autoRotate} onChange={e => handleChange('autoRotate', e.target.checked)} className="accent-orange-500" />
                </div>
              </div>
            )}

            {/* ABA FX: POS-PROCESSAMENTO */}
            {activeTab === 'FX' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-pink-500 font-bold mb-2 uppercase tracking-widest border-b border-pink-900/50 pb-1">Glitch FX</h3>
                  <div className="grid grid-cols-2 gap-1">
                    {standardEffects.map(key => (
                      <button key={key} onClick={() => handleChange('effectMode', EffectType[key as any])} className={`text-left px-2 py-1.5 border rounded text-[10px] transition-all truncate ${vjState.effectMode === EffectType[key as any] ? 'bg-pink-900 border-pink-500 text-white' : 'border-white/10 text-gray-600 hover:text-gray-400'}`}>{key}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-blue-500 font-bold mb-2 uppercase tracking-widest border-b border-blue-900/50 pb-1">Color Grade</h3>
                  <div className="grid grid-cols-2 gap-1">
                    {colorEffects.map(key => (
                      <button key={key} onClick={() => handleChange('effectMode', EffectType[key as any])} className={`text-left px-2 py-1.5 border rounded text-[10px] transition-all truncate ${vjState.effectMode === EffectType[key as any] ? 'bg-blue-900 border-blue-500 text-white' : 'border-white/10 text-gray-600 hover:text-gray-400'}`}>{key}</button>
                    ))}
                  </div>
                </div>
                <button onClick={() => handleChange('effectMode', 0)} className="w-full py-2 border border-white/20 rounded text-[10px] font-bold text-gray-500 hover:text-white hover:border-white/40">RESET FX</button>
              </div>
            )}

            {/* ABA STICKERS: BRUTALIST AND GEOMETRIC VECTOR COLLAGES */}
            {activeTab === 'STICKERS' && (
              <div className="space-y-4">
                <div className="text-[9px] text-gray-400 uppercase tracking-wide mb-2 leading-tight font-mono">
                  TAP A RETRO STICKER TO SPAWN IT ON THE INTERACTIVE CANVAS VIEWPORT. CLICK AND DRAG ON SCREEN TO REPOSITION.
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  {BRUTALIST_STICKERS.map(sticker => (
                    <button
                      key={sticker.id}
                      onClick={() => {
                        const newId = `sticker_${Date.now()}`;
                        const newLayer: LayerItem = {
                          id: newId,
                          type: LayerType.IMAGE,
                          url: sticker.id,
                          visible: true,
                          opacity: 1.0,
                          scale: 2.0,
                          posX: (Math.random() - 0.5) * 40,
                          posY: (Math.random() - 0.5) * 40,
                          posZ: 0,
                          rotX: 0,
                          rotY: 0,
                          rotZ: Math.floor(Math.random() * 40) - 20,
                          isCorrupted: false,
                          isCorpus: false,
                          blendMode: 'normal'
                        };
                        setVjState(prev => ({
                          ...prev,
                          layers: [...prev.layers, newLayer]
                        }));
                        showNotification(`SPAWNED_${sticker.id.toUpperCase()}`);
                      }}
                      className="p-3 bg-[#0a0a0a] border-2 border-white hover:border-fuchsia-400 text-left transition-all flex flex-col justify-between hover:bg-zinc-90 w-full shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] hover:shadow-[3px_3px_0px_0px_rgba(232,121,249,1)] hover:scale-[1.02]"
                    >
                      <span className="text-[9px] font-black tracking-widest text-white uppercase font-mono block truncate">{sticker.name}</span>
                      <div className="mt-4 flex items-center justify-between text-[7px] text-gray-400 font-mono w-full border-t border-white/10 pt-1">
                        <span>{sticker.type.toUpperCase()}</span>
                        <span style={{ color: sticker.color }} className="font-bold">■ THEME</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ABA TEXT: CAMADAS DE TEXTO */}
            {activeTab === 'TEXT' && (
              <div className="space-y-4">
                <button onClick={addTextLayer} className="w-full py-2 bg-cyan-900/20 border border-dashed border-cyan-500/50 rounded hover:bg-cyan-900/40 transition-colors text-cyan-400 font-bold">+ ADD TEXT LAYER</button>
                
                <div className="space-y-1">
                  {vjState.textOverlays.map(layer => (
                    <div key={layer.id} className={`flex items-center gap-2 p-1 px-2 border rounded ${selectedTextId === layer.id ? 'bg-cyan-900/20 border-cyan-500' : 'bg-white/5 border-white/10'}`}>
                      <button onClick={() => setSelectedTextId(layer.id)} className="flex-1 text-left truncate text-[10px] uppercase font-bold">{layer.text || 'LAYER'}</button>
                      <button onClick={() => deleteTextLayer(layer.id)} className="text-red-500 hover:text-red-400 text-sm">✕</button>
                    </div>
                  ))}
                </div>

                {selectedLayer && (
                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <textarea rows={2} value={selectedLayer.text} onChange={e => handleTextLayerChange(selectedLayer.id, { text: e.target.value })} className="w-full bg-black/50 border border-white/20 rounded p-2 text-white outline-none focus:border-cyan-500 text-xs font-mono" placeholder="Escreva o texto aqui..." />
                    
                    {/* SELETOR DE FONTE PERSONALIZADO GRANDE */}
                    <div className="py-2 bg-white/5 px-2 rounded border border-white/5 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[8px] uppercase tracking-wider font-extrabold text-cyan-400">CONFIG DE FONTES</span>
                        <span className="text-[7px] text-gray-400 font-mono">SUPORTA TODAS DO GOOGLE FONTS</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-[7.5px] uppercase font-bold text-gray-500">Presets Ousados</span>
                          <select 
                            value={PRESET_FONTS.includes(selectedLayer.font) ? selectedLayer.font : ""} 
                            onChange={e => {
                              if (e.target.value) {
                                handleTextLayerChange(selectedLayer.id, { font: e.target.value });
                              }
                            }} 
                            className="bg-black border border-white/20 rounded p-1 text-[9px] text-white"
                          >
                            <option value="">-- Customizar (Digitar) --</option>
                            {PRESET_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[7.5px] uppercase font-bold text-gray-500">Nome da Fonte Google</span>
                          <input 
                            type="text" 
                            value={selectedLayer.font} 
                            onChange={e => handleTextLayerChange(selectedLayer.id, { font: e.target.value })} 
                            className="bg-black border border-white/20 rounded p-1 text-[9px] text-cyan-400 font-mono outline-none focus:border-cyan-500" 
                            placeholder="Ex: Syne, Anton, Unbounded..." 
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-[7.5px] uppercase font-bold text-gray-500">Blend Mode</span>
                        <select value={selectedLayer.blendMode} onChange={e => handleTextLayerChange(selectedLayer.id, { blendMode: e.target.value as any })} className="bg-black border border-white/20 rounded p-1.5 text-[10px]">
                          {BLEND_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[7.5px] uppercase font-bold text-gray-500">Peso do Texto</span>
                        <select value={selectedLayer.fontWeight || "900"} onChange={e => handleTextLayerChange(selectedLayer.id, { fontWeight: e.target.value })} className="bg-black border border-white/20 rounded p-1.5 text-[10px]">
                          <option value="100">100 - Extra Fino</option>
                          <option value="300">300 - Leve</option>
                          <option value="400">400 - Normal</option>
                          <option value="700">700 - Negrito</option>
                          <option value="800">800 - Extra Negrito</option>
                          <option value="900">900 - Black (Ultra Ousada)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <ControlSlider label="Pos X (%)" value={selectedLayer.posX} min={0} max={100} step={1} onChange={v => handleTextLayerChange(selectedLayer.id, { posX: v })} />
                      <ControlSlider label="Pos Y (%)" value={selectedLayer.posY} min={0} max={100} step={1} onChange={v => handleTextLayerChange(selectedLayer.id, { posY: v })} />
                    </div>

                    <ControlSlider label="Tamanho Fonte (rem)" value={selectedLayer.size} min={0.5} max={20} step={0.1} onChange={v => handleTextLayerChange(selectedLayer.id, { size: v })} />
                    
                    {/* ADICIONADOS CONTROLES DETALHADOS REQUISITADOS */}
                    <div className="bg-black/30 p-2 border border-white/5 rounded space-y-2">
                      <span className="text-[8px] uppercase tracking-wider font-bold text-cyan-400 block border-b border-white/10 pb-0.5">Efeitos de Variáveis</span>
                      <ControlSlider label="Espaçamento (Letter-Spacing px)" value={selectedLayer.letterSpacing !== undefined ? selectedLayer.letterSpacing : 0} min={-10} max={60} step={0.5} onChange={v => handleTextLayerChange(selectedLayer.id, { letterSpacing: v })} />
                      <ControlSlider label="Rotação (Ângulo °)" value={selectedLayer.rotation !== undefined ? selectedLayer.rotation : 0} min={-180} max={180} step={1} onChange={v => handleTextLayerChange(selectedLayer.id, { rotation: v })} />
                      <ControlSlider label="Brilho / Glow (px)" value={selectedLayer.glow !== undefined ? selectedLayer.glow : 20} min={0} max={100} step={1} onChange={v => handleTextLayerChange(selectedLayer.id, { glow: v })} />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-[7.5px] uppercase font-bold text-gray-500">Cor</span>
                        <input type="color" value={selectedLayer.color} onChange={e => handleTextLayerChange(selectedLayer.id, { color: e.target.value })} className="w-full h-8 bg-transparent border border-white/20 rounded cursor-pointer p-0.5" />
                      </div>
                      <div className="flex flex-col gap-1 justify-end">
                        <div className="flex gap-1 h-8">
                          <button onClick={() => handleTextLayerChange(selectedLayer.id, { outline: !selectedLayer.outline })} className={`flex-1 border rounded text-[8px] font-mono font-black ${selectedLayer.outline ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400' : 'border-white/10 text-gray-500'}`}>HOLLOW</button>
                          <button onClick={() => handleTextLayerChange(selectedLayer.id, { isItalic: !selectedLayer.isItalic })} className={`flex-1 border rounded text-[8px] font-mono font-black ${selectedLayer.isItalic ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 italic' : 'border-white/10 text-gray-500'}`}>ITALIC</button>
                        </div>
                      </div>
                    </div>

                    <ControlSlider label="Opacidade" value={selectedLayer.opacity !== undefined ? selectedLayer.opacity : 1.0} min={0} max={1} step={0.05} onChange={v => handleTextLayerChange(selectedLayer.id, { opacity: v })} />

                    <div className="grid grid-cols-3 gap-1">
                      {Object.values(TextAnimType).map(anim => (
                        <button key={anim} onClick={() => handleTextLayerChange(selectedLayer.id, { anim: anim as any })} className={`py-1 border rounded text-[8px] uppercase font-bold ${selectedLayer.anim === anim ? 'bg-cyan-500/30 border-cyan-500 text-white' : 'border-white/10 text-gray-600'}`}>{anim}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ABA MEDIA: BACKGROUND IMAGE/VIDEO (CORPUS) */}
            {activeTab === 'MEDIA' && (
              <div className="space-y-4">
                <h3 className="text-red-500 font-bold mb-2 uppercase tracking-widest border-b border-red-900/50 pb-1">Primary Corpus Input</h3>
                <p className="text-[9px] text-gray-500 leading-tight mb-2">This is the base data source for Conceptual Data Merging. It will displace and corrupt other layers.</p>
                <div className="border border-dashed border-white/20 p-4 text-center rounded bg-white/5">
                  <input type="file" ref={mediaInputRef} accept="image/*,video/*" onChange={handleMediaChange} className="hidden" />
                  <button onClick={() => mediaInputRef.current?.click()} className="text-[10px] font-bold text-red-400 hover:text-red-300">UPLOAD CORPUS</button>
                </div>
                {vjState.mediaUrl && (
                  <div className="space-y-3 pt-4">
                    <div className="h-32 w-full overflow-hidden border border-white/10 rounded relative bg-black">
                      {vjState.mediaType === 'video' ? (
                        <video src={vjState.mediaUrl} autoPlay loop muted className="w-full h-full object-cover opacity-80" />
                      ) : (
                        <img src={vjState.mediaUrl} className="w-full h-full object-cover opacity-80" />
                      )}
                      <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-red-600 text-white text-[8px] font-bold rounded">LIVE_CORPUS</div>
                    </div>
                    <ControlSlider label="Corpus Opacity" value={vjState.mediaOpacity} min={0} max={1} step={0.05} onChange={v => handleChange('mediaOpacity', v)} />
                    <ControlSlider label="Corpus Scale" value={vjState.mediaScale} min={0.1} max={5} step={0.1} onChange={v => handleChange('mediaScale', v)} />
                    <ControlSlider label="Corpus Distortion" value={vjState.mediaDistortion} min={0} max={2} step={0.1} onChange={v => handleChange('mediaDistortion', v)} />
                    <button onClick={() => setVjState(prev => ({...prev, mediaUrl: null, mediaType: 'none'}))} className="w-full py-1.5 bg-red-900/30 text-red-400 border border-red-900/50 rounded text-[9px] font-bold">CLEAR CORPUS</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      
      <input 
        type="file" 
        ref={layerFileInputRef} 
        className="hidden" 
        onChange={e => handleFileUpload(e, 'layer', uploadingForLayer || undefined)} 
        accept="image/*,video/*"
      />

      {/* NOTIFICATION OVERLAY */}
      {notification && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-white text-black px-4 py-2 font-black text-[10px] border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] z-[100] animate-bounce">
          {notification}
        </div>
      )}
    </div>
  );
};

const ControlSlider = ({ label, value, min, max, step, onChange }: any) => (
  <div className="w-full">
    <div className="flex justify-between mb-1 text-[9px] uppercase tracking-tighter text-gray-500 font-bold">
      <span>{label}</span>
      <span className="text-white">{typeof value === 'number' ? value.toFixed(2) : value}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[#2D70FF] hover:accent-[#2D70FF]/80" />
  </div>
);
