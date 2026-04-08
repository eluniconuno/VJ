
import React, { useRef, useEffect, useState } from 'react';
import { VJState, ShapeType, NoiseType, EffectType, TextAnimType, TextOverlayItem, LayerType, LayerItem, MergeMode, Clip, Deck, LFO, ShapeMergeMode } from '../types';
import { recordService } from '../services/recordService';
import { Camera, Video, Eye, EyeOff, Settings, Maximize, Minimize, Plus, Trash2, Layers, Globe, Box, Database, Zap, Activity, Circle, Play, Save, RefreshCw } from 'lucide-react';

interface ControlsProps {
  vjState: VJState;
  setVjState: React.Dispatch<React.SetStateAction<VJState>>;
  audioService: any;
}

type Tab = 'MAIN' | 'AUDIO' | 'MOTION' | 'FX' | 'TEXT' | 'MEDIA' | 'LAYERS' | 'RESEARCH' | 'ARENA';

const PRESET_FONTS = [
  "Roboto Mono", "Orbitron", "Press Start 2P", "Monoton", "Creepster", 
  "Rubik Glitch", "Bungee Shade", "Permanent Marker", "Syncopate", "Faster One"
];

const BLEND_MODES = ['normal', 'overlay', 'screen', 'difference', 'exclusion', 'multiply', 'color-dodge'];

export const Controls: React.FC<ControlsProps> = ({ vjState, setVjState, audioService }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const layerFileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>('MAIN');
  const [uploadingForLayer, setUploadingForLayer] = useState<string | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [midiActive, setMidiActive] = useState(false);
  const [midiDevices, setMidiDevices] = useState<string[]>([]);
  const [hasFile, setHasFile] = useState(false);

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
      opacity: 1
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

  const toggleRecording = async () => {
    if (vjState.isRecording) {
      recordService.stopRecording();
      handleChange('isRecording', false);
    } else {
      const canvas = document.querySelector('canvas');
      if (canvas) {
        const audioStream = audioService.getRecordingStream();
        // Try Screen Capture first if user wants "phone screen" feel
        // We can add a toggle for this later, but for now let's try to detect if we should use it
        await recordService.startRecording(canvas, audioStream, false); 
        handleChange('isRecording', true);
      }
    }
  };

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

  return (
    <>
      {/* BOTÃO DISCRETO PARA REEXIBIR UI */}
      {!vjState.showUI && (
        <button 
          onClick={() => handleChange('showUI', true)}
          className="fixed bottom-4 right-4 w-10 h-10 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center text-white/50 hover:text-white hover:bg-cyan-500/20 hover:border-cyan-500 transition-all z-50 shadow-lg"
          title="Show UI"
        >
          <Settings size={18} />
        </button>
      )}

      {/* PAINEL FLUTUANTE ESQUERDO (DECK PRINCIPAL) */}
      {vjState.showUI && (
        <div className="fixed top-4 left-4 w-64 p-4 bg-black border-2 border-white text-xs font-mono text-white shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] z-40">
          <div className="flex justify-between items-center mb-4 border-b-2 border-white pb-2">
            <h1 className="text-sm font-black uppercase tracking-tighter">CORRUPTED DATA // RESEARCH</h1>
            <div className="flex gap-2 items-center">
              {midiActive && <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />}
              <div className={`w-2 h-2 rounded-full ${vjState.isPlaying || vjState.micActive ? 'bg-[#2D70FF] animate-pulse' : 'bg-red-500'}`} />
              <button 
                onClick={() => handleChange('showUI', false)}
                className="ml-2 text-gray-500 hover:text-white transition-colors"
                title="Hide UI"
              >
                <EyeOff size={14} />
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={toggleMic} className={`py-2 font-black border-2 transition-all ${vjState.micActive ? 'border-white bg-white text-black' : 'border-white/20 text-gray-500'}`}>MIC</button>
              <button onClick={() => fileInputRef.current?.click()} className={`py-2 font-black border-2 transition-all ${vjState.isPlaying ? 'border-white bg-white text-black' : 'border-white/20 text-gray-500'}`}>MP3</button>
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button 
                onClick={toggleRecording} 
                className={`py-2 font-black border-2 transition-all flex items-center justify-center gap-2 ${vjState.isRecording ? 'border-red-600 bg-red-600 text-white animate-pulse' : 'border-white text-white hover:bg-white hover:text-black'}`}
              >
                <Video size={14} />
                {vjState.isRecording ? 'TERMINATE_REC' : 'INITIATE_REC'}
              </button>
            </div>

            <ControlSlider label="DATA_CHAOS" value={vjState.deformationIntensity} min={0} max={5} step={0.1} onChange={v => handleChange('deformationIntensity', v)} />
            <ControlSlider label="SIGNAL_FLOW" value={vjState.animationSpeed} min={0} max={5} step={0.1} onChange={v => handleChange('animationSpeed', v)} />
            <ControlSlider label="BIT_SCALE" value={vjState.pointSize} min={0.5} max={10} step={0.1} onChange={v => handleChange('pointSize', v)} />
            
            <button onClick={() => handleChange('showAdvancedPanel', !vjState.showAdvancedPanel)} className={`w-full py-2 border-2 font-black transition-all ${vjState.showAdvancedPanel ? 'bg-white text-black border-white' : 'bg-black border-white text-white hover:bg-white hover:text-black'}`}>
              {vjState.showAdvancedPanel ? 'CLOSE_ENGINE' : 'ACCESS_ENGINE'}
            </button>
          </div>
        </div>
      )}

      {/* PAINEL AVANÇADO (TABS) */}
      {vjState.showUI && vjState.showAdvancedPanel && (
        <div className="fixed top-4 left-72 w-[500px] bg-black border-2 border-white text-xs font-mono text-white shadow-[8px_8px_0px_0px_rgba(255,255,255,1)] z-40 max-h-[90vh] flex overflow-hidden">
          {/* SIDEBAR TABS */}
          <div className="w-20 border-r-2 border-white flex flex-col bg-black">
            {(['MAIN', 'AUDIO', 'MOTION', 'FX', 'TEXT', 'MEDIA', 'LAYERS', 'RESEARCH', 'ARENA'] as Tab[]).map(tab => (
              <button 
                key={tab} 
                onClick={() => setActiveTab(tab)} 
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 px-1 text-[7px] font-black tracking-tighter transition-all border-b border-white/20 last:border-b-0 ${activeTab === tab ? 'bg-white text-black' : 'text-white hover:bg-white/10'}`}
              >
                {tab === 'MAIN' && <Zap size={14} />}
                {tab === 'AUDIO' && <Activity size={14} />}
                {tab === 'MOTION' && <Maximize size={14} />}
                {tab === 'FX' && <Circle size={14} />}
                {tab === 'TEXT' && <Plus size={14} />}
                {tab === 'MEDIA' && <Video size={14} />}
                {tab === 'LAYERS' && <Layers size={14} />}
                {tab === 'RESEARCH' && <Database size={14} />}
                {tab === 'ARENA' && <RefreshCw size={14} />}
                <span>{tab}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-2 border-b-2 border-white bg-white/5 flex justify-between items-center">
              <span className="text-[9px] font-black uppercase tracking-widest">{activeTab} // ENGINE_MODULE</span>
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div>
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
              </div>
            </div>
            
            <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
            
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
                        <span className="text-[10px] font-bold uppercase text-[#2D70FF]">{layer.type} #{idx}</span>
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
                            <span className="text-[8px] uppercase text-gray-500">Source URL</span>
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

                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        <ControlSlider label="Opacity" value={layer.opacity} min={0} max={1} step={0.01} onChange={v => updateLayer(layer.id, { opacity: v })} />
                        <ControlSlider label="Scale" value={layer.scale} min={0.1} max={50} step={0.1} onChange={v => updateLayer(layer.id, { scale: v })} />
                        <ControlSlider label="Pos X" value={layer.posX} min={-100} max={100} step={1} onChange={v => updateLayer(layer.id, { posX: v })} />
                        <ControlSlider label="Pos Y" value={layer.posY} min={-100} max={100} step={1} onChange={v => updateLayer(layer.id, { posY: v })} />
                        <ControlSlider label="Pos Z" value={layer.posZ} min={-100} max={100} step={1} onChange={v => updateLayer(layer.id, { posZ: v })} />
                        <ControlSlider label="Distort" value={layer.distortion || 0} min={0} max={5} step={0.1} onChange={v => updateLayer(layer.id, { distortion: v })} />
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
                    {Object.keys(NoiseType).filter(k => isNaN(Number(k))).map(key => (
                      <button key={key} onClick={() => handleChange('noiseMode', NoiseType[key as any])} className={`text-left px-2 py-1.5 border rounded text-[10px] transition-all ${vjState.noiseMode === NoiseType[key as any] ? 'bg-purple-900 border-purple-500 text-white' : 'border-white/10 text-gray-600 hover:text-gray-400'}`}>{key.replace('_', ' ')}</button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <ControlSlider label="Data Displacement" value={vjState.displacementScale} min={0} max={3} step={0.1} onChange={v => handleChange('displacementScale', v)} />
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase text-gray-500">Technical Overlay</span>
                    <input type="checkbox" checked={vjState.showTechnicalOverlay} onChange={e => handleChange('showTechnicalOverlay', e.target.checked)} className="accent-[#2D70FF]" />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase text-gray-500">Auto Morph</span>
                    <input type="checkbox" checked={vjState.autoMorph} onChange={e => handleChange('autoMorph', e.target.checked)} className="accent-[#2D70FF]" />
                  </div>
                  <input type="color" value={vjState.color} onChange={e => handleChange('color', e.target.value)} className="w-full h-8 bg-transparent border border-white/20 rounded cursor-pointer" />
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
                    <textarea rows={2} value={selectedLayer.text} onChange={e => handleTextLayerChange(selectedLayer.id, { text: e.target.value })} className="w-full bg-black/50 border border-white/20 rounded p-2 text-white outline-none focus:border-cyan-500" placeholder="Type..." />
                    <div className="grid grid-cols-2 gap-2">
                      <select value={selectedLayer.font} onChange={e => handleTextLayerChange(selectedLayer.id, { font: e.target.value })} className="bg-black border border-white/20 rounded p-1.5 text-[10px]">
                        {PRESET_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                      <select value={selectedLayer.blendMode} onChange={e => handleTextLayerChange(selectedLayer.id, { blendMode: e.target.value as any })} className="bg-black border border-white/20 rounded p-1.5 text-[10px]">
                        {BLEND_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <ControlSlider label="Pos X" value={selectedLayer.posX} min={0} max={100} step={1} onChange={v => handleTextLayerChange(selectedLayer.id, { posX: v })} />
                      <ControlSlider label="Pos Y" value={selectedLayer.posY} min={0} max={100} step={1} onChange={v => handleTextLayerChange(selectedLayer.id, { posY: v })} />
                    </div>
                    <ControlSlider label="Size" value={selectedLayer.size} min={0.5} max={20} step={0.1} onChange={v => handleTextLayerChange(selectedLayer.id, { size: v })} />
                    <div className="flex gap-2">
                      <input type="color" value={selectedLayer.color} onChange={e => handleTextLayerChange(selectedLayer.id, { color: e.target.value })} className="w-12 h-6 bg-transparent border border-white/20 rounded cursor-pointer" />
                      <button onClick={() => handleTextLayerChange(selectedLayer.id, { outline: !selectedLayer.outline })} className={`flex-1 border rounded text-[10px] font-bold ${selectedLayer.outline ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400' : 'border-white/10 text-gray-500'}`}>HOLLOW</button>
                    </div>
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
    )}
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
    </>
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
