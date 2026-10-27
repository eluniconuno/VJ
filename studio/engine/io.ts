import { audio } from './audio';
import { store } from './store';
import { GENERATOR_MAP } from './generators';
import { EFFECT_MAP } from './effects';

// ---------------------------------------------------------------------------
// Gravação da saída (vídeo do canvas + áudio analisado)
// ---------------------------------------------------------------------------
export class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  startedAt = 0;

  get recording() { return !!this.rec; }

  start(canvas: HTMLCanvasElement) {
    const stream = canvas.captureStream(60);
    audio.recordStream?.getAudioTracks().forEach(t => stream.addTrack(t));
    const types = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const mimeType = types.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
    this.chunks = [];
    this.rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 16_000_000 });
    this.rec.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.onstop = () => {
      const type = this.rec?.mimeType || mimeType || 'video/webm';
      const blob = new Blob(this.chunks, { type });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vyxo-${new Date().toISOString().replace(/[:.]/g, '-')}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      this.rec = null;
    };
    this.rec.start(1000);
    this.startedAt = performance.now();
  }

  stop() { this.rec?.stop(); }
}

export const recorder = new Recorder();

// ---------------------------------------------------------------------------
// Janela de saída: espelha o canvas via captureStream (arraste para o projetor)
// ---------------------------------------------------------------------------
export function openOutputWindow(canvas: HTMLCanvasElement) {
  const { resW, resH } = store.comp.master;
  const win = window.open('', 'vyxo-output', `popup,width=${Math.min(resW, 1280)},height=${Math.min(resH, 720)}`);
  if (!win) throw new Error('O navegador bloqueou a janela. Permita pop-ups para este site.');
  win.document.title = 'VYXO // SAÍDA';
  win.document.body.innerHTML = '';
  win.document.body.style.cssText = 'margin:0;background:#000;overflow:hidden;cursor:none';
  const video = win.document.createElement('video');
  video.style.cssText = 'width:100vw;height:100vh;object-fit:contain;display:block';
  video.muted = true;
  video.autoplay = true;
  video.srcObject = canvas.captureStream(60);
  win.document.body.appendChild(video);
  const hint = win.document.createElement('div');
  hint.textContent = 'Duplo clique = tela cheia';
  hint.style.cssText = 'position:fixed;top:12px;left:12px;color:#fff;font:12px monospace;opacity:.6;transition:opacity 1s';
  win.document.body.appendChild(hint);
  setTimeout(() => (hint.style.opacity = '0'), 2500);
  video.addEventListener('dblclick', () => {
    if (win.document.fullscreenElement) win.document.exitFullscreen(); else video.requestFullscreen();
  });
  video.play().catch(() => {});
}

// ---------------------------------------------------------------------------
// MIDI: mapeamento por "learn". Alvos:
//   xf | master:opacity | layer:<id>:opacity | col:<n> | tap
//   param:<clipId|master>:<effectId|gen>:<key>
// ---------------------------------------------------------------------------
type TapFn = () => void;
let tapFn: TapFn = () => {};
export function setTapHandler(fn: TapFn) { tapFn = fn; }

export async function initMidi(onDevices: (names: string[]) => void) {
  const nav = navigator as any;
  if (!nav.requestMIDIAccess) return;
  try {
    const access = await nav.requestMIDIAccess();
    const bind = () => {
      const names: string[] = [];
      access.inputs.forEach((input: any) => {
        names.push(input.name);
        input.onmidimessage = (msg: any) => handleMidi(msg.data);
      });
      onDevices(names);
    };
    bind();
    access.onstatechange = bind;
  } catch (e) {
    console.warn('MIDI indisponível', e);
  }
}

function handleMidi(data: Uint8Array) {
  const [status, d1, d2] = data;
  const type = status & 0xf0;
  const ch = status & 0x0f;
  let key: string | null = null;
  let value = 0;
  if (type === 0xb0) { key = `cc:${ch}:${d1}`; value = d2 / 127; }
  else if (type === 0x90 && d2 > 0) { key = `note:${ch}:${d1}`; value = 1; }
  if (!key) return;

  if (store.midiLearn && store.learnTarget) {
    const target = store.learnTarget;
    store.update(c => {
      c.midi = c.midi.filter(m => m.target !== target && m.key !== key);
      c.midi.push({ key: key!, target });
    });
    store.learnTarget = null;
    store.touch(false);
    return;
  }
  const maps = store.comp.midi.filter(m => m.key === key);
  if (maps.length) store.update(c => maps.forEach(m => applyTarget(c, m.target, value)));
}

function applyTarget(c: typeof store.comp, target: string, v: number) {
  const parts = target.split(':');
  switch (parts[0]) {
    case 'xf': c.crossfader = v; break;
    case 'master': c.master.opacity = v; break;
    case 'tap': tapFn(); break;
    case 'col': c.layers.forEach(l => { const col = Number(parts[1]); if (l.clips[col]) l.active = col; }); break;
    case 'layer': { const l = c.layers.find(x => x.id === parts[1]); if (l) l.opacity = v; break; }
    case 'param': applyParam(c, parts[1], parts[2], parts[3], v); break;
  }
}


function applyParam(c: typeof store.comp, owner: string, slot: string, key: string, v: number) {
  const effects = owner === 'master' ? c.master.effects : store.findClip(owner)?.effects;
  if (slot === 'gen') {
    const clip = store.findClip(owner);
    const def = clip && GENERATOR_MAP[clip.generator].params.find(p => p.key === key);
    if (clip && def) clip.params[key].value = def.min + v * (def.max - def.min);
    return;
  }
  const fx = effects?.find(e => e.id === slot);
  if (!fx) return;
  if (key === '__mix') { fx.mix = v; return; }
  const def = EFFECT_MAP[fx.type].params.find(p => p.key === key);
  if (def) fx.params[key].value = def.min + v * (def.max - def.min);
}
