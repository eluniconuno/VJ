import React, { useEffect, useRef, useState } from 'react';
import { audio } from '../engine/audio';
import { defaultComposition, store } from '../engine/store';
import { openOutputWindow, recorder } from '../engine/io';
import { Btn } from './Controls';
import { AutopilotControl, PcAudioButton, SpotifyButton } from './AudioPanels';
import { runtime, useRaf, useStore } from './hooks';

interface Props {
  onError: (msg: string) => void;
  midiDevices: string[];
  onFullscreen: () => void;
}

export const TopBar: React.FC<Props> = ({ onError, midiDevices, onFullscreen }) => {
  const s = useStore();
  const [, force] = useState(0);
  const audioFile = useRef<HTMLInputElement>(null);
  const compFile = useRef<HTMLInputElement>(null);

  useEffect(() => {
    audio.onChange = () => force(x => x + 1);
    audio.listDevices();
    return () => { audio.onChange = null; };
  }, []);

  const run = (fn: () => Promise<void> | void) => async () => {
    try { await fn(); } catch (e: any) { onError(e?.message ?? String(e)); }
  };

  const canvas = () => runtime.engine?.canvas;
  const comp = s.comp;

  return (
    <div className="relative flex h-12 shrink-0 items-center gap-2 border-b border-white/10 bg-black px-3">
      <div className="mr-2 flex items-center gap-2">
        <div className="rotate-[-2deg] border border-black bg-lime-300 px-1.5 py-0.5 text-[10px] font-black text-black shadow-[2px_2px_0_#fff]">VYXO</div>
        <span className="hidden text-[11px] font-black tracking-[0.25em] text-white lg:inline" style={{ fontFamily: 'Tektur, monospace' }}>STUDIO</span>
      </div>

      {/* --- Áudio --- */}
      <div className="flex items-center gap-1 border-l border-white/10 pl-2">
        <Btn active={audio.input === 'mic'} tone="#ff3b6b" onClick={run(() => audio.useMic())} title="Microfone ou placa de áudio">Mic</Btn>
        {audio.input === 'mic' && audio.devices.length > 1 && (
          <select onChange={e => run(() => audio.useMic(e.target.value))()} className="h-7 max-w-[140px] rounded-sm border border-white/15 bg-black text-[10px]">
            {audio.devices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Entrada'}</option>)}
          </select>
        )}
        <PcAudioButton onError={onError} />
        <Btn active={audio.input === 'file'} tone="#ff3b6b" onClick={() => audioFile.current?.click()} title="Tocar um arquivo de música">Arquivo</Btn>
        {audio.input === 'file' && (
          <Btn onClick={() => audio.togglePlay()} title={audio.fileName}>{audio.mediaEl?.paused ? '▶' : '❚❚'}</Btn>
        )}
        {audio.input !== 'none' && <Btn onClick={() => audio.stop()} title="Parar áudio">✕</Btn>}
        <input ref={audioFile} type="file" accept="audio/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) run(() => audio.useFile(f))(); e.target.value = ''; }} />
        <SpotifyButton onError={onError} />
        <Meters />
      </div>

      {/* --- BPM --- */}
      <div className="flex items-center gap-1 border-l border-white/10 pl-2">
        <BeatLed />
        <button className="h-7 w-5 text-white/50 hover:text-white" onClick={() => store.update(c => { c.bpm = Math.max(40, c.bpm - 1); c.autoBpm = false; })}>−</button>
        <BpmReadout />
        <button className="h-7 w-5 text-white/50 hover:text-white" onClick={() => store.update(c => { c.bpm = Math.min(220, c.bpm + 1); c.autoBpm = false; })}>+</button>
        <Btn onClick={() => runtime.engine?.tap()} title="Tap tempo (barra de espaço)">Tap</Btn>
        <Btn active={comp.autoBpm} onClick={() => store.update(c => (c.autoBpm = !c.autoBpm))} title="Detectar BPM pelo áudio">Auto</Btn>
        <Btn onClick={() => runtime.engine?.resync()} title="Realinhar a batida agora">Sync</Btn>
      </div>
      <AutopilotControl />

      <div className="ml-auto flex items-center gap-1">
        <Fps />
        <Btn active={s.midiLearn} tone="#e879f9" title={midiDevices.length ? `MIDI: ${midiDevices.join(', ')}` : 'Nenhum controlador MIDI detectado'}
          onClick={() => { store.midiLearn = !store.midiLearn; store.learnTarget = null; store.touch(false); }}>
          MIDI{midiDevices.length ? ` (${midiDevices.length})` : ''}
        </Btn>
        <RecButton onError={onError} />
        <Btn onClick={run(() => { const c = canvas(); if (c) openOutputWindow(c); })} title="Abre uma janela de saída para arrastar ao projetor">Saída ⧉</Btn>
        <Btn onClick={onFullscreen} title="Tela cheia (F)">⛶</Btn>
        <div className="ml-1 flex items-center gap-1 border-l border-white/10 pl-2">
          <Btn title="Exportar composição (.json)" onClick={() => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([store.exportJson()], { type: 'application/json' }));
            a.download = `${comp.name.replace(/\s+/g, '-').toLowerCase() || 'composicao'}.vyxo.json`;
            a.click();
          }}>Salvar</Btn>
          <Btn title="Importar composição" onClick={() => compFile.current?.click()}>Abrir</Btn>
          <Btn title="Voltar à composição inicial" onClick={() => { if (confirm('Substituir a composição atual pela inicial?')) store.replace(defaultComposition()); }}>Nova</Btn>
          <input ref={compFile} type="file" accept=".json,application/json" className="hidden" onChange={async e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) run(async () => store.importJson(await f.text()))();
          }} />
        </div>
      </div>
    </div>
  );
};

const Meters: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);
  useRaf(() => {
    const c = ref.current, e = runtime.engine;
    if (!c || !e) return;
    const g = c.getContext('2d')!;
    const { bass, mid, high, level, beatPulse } = e.ctx;
    g.clearRect(0, 0, c.width, c.height);
    [[bass, '#ff3b6b'], [mid, '#ffb02e'], [high, '#36d6ff'], [level, '#b6ff3b'], [beatPulse, '#ffffff']].forEach(([v, col], i) => {
      const h = Math.max(1, (v as number) * c.height);
      g.fillStyle = col as string;
      g.fillRect(i * 9, c.height - h, 7, h);
    });
  });
  return <canvas ref={ref} width={44} height={24} className="ml-1" title="Grave · Médio · Agudo · Volume · Batida" />;
};

const BeatLed: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  useRaf(() => {
    const e = runtime.engine;
    if (!ref.current || !e) return;
    ref.current.style.opacity = String(0.15 + e.ctx.beatPulse * 0.85);
    ref.current.style.boxShadow = `0 0 ${e.ctx.beatPulse * 10}px #b6ff3b`;
  });
  return <div ref={ref} className="h-2.5 w-2.5 rounded-full bg-lime-300" />;
};

const BpmReadout: React.FC = () => {
  const ref = useRef<HTMLSpanElement>(null);
  useRaf(() => { if (ref.current) ref.current.textContent = store.comp.bpm.toFixed(store.comp.bpm % 1 ? 1 : 0); });
  return <span ref={ref} className="w-10 text-center text-[15px] font-black tabular-nums text-white" style={{ fontFamily: 'Tektur, monospace' }} />;
};

const Fps: React.FC = () => {
  const ref = useRef<HTMLSpanElement>(null);
  useRaf(() => {
    const e = runtime.engine;
    if (!ref.current || !e) return;
    const f = Math.round(e.fps);
    ref.current.textContent = `${f} FPS`;
    ref.current.style.color = f >= 50 ? '#b6ff3b' : f >= 30 ? '#ffb02e' : '#ff3b6b';
  });
  return <span ref={ref} className="mr-1 w-12 text-right text-[10px] tabular-nums" />;
};

const RecButton: React.FC<{ onError: (m: string) => void }> = ({ onError }) => {
  const [rec, setRec] = useState(false);
  const label = useRef<HTMLSpanElement>(null);
  useRaf(() => {
    if (!label.current || !rec) return;
    const s = Math.floor((performance.now() - recorder.startedAt) / 1000);
    label.current.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
  return (
    <Btn active={rec} tone="#ff3b6b" title="Gravar a saída em vídeo (com o áudio)" onClick={() => {
      try {
        if (rec) { recorder.stop(); setRec(false); return; }
        const c = runtime.engine?.canvas;
        if (!c) return;
        recorder.start(c);
        setRec(true);
      } catch (e: any) { onError(e.message); }
    }}>● {rec ? <span ref={label}>0:00</span> : 'Rec'}</Btn>
  );
};
