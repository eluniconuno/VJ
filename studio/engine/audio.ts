// Análise de áudio para reatividade: bandas normalizadas (ganho automático),
// envelopes com attack/release, detecção de batida por fluxo espectral no
// grave e estimativa de BPM pelos intervalos entre batidas.

export type AudioInput = 'none' | 'mic' | 'file' | 'system';

export interface AudioFrame {
  bass: number;
  mid: number;
  high: number;
  level: number;
  onset: boolean;
  active: boolean;
}

export const SPECTRUM_BINS = 256;

/** Motivo pelo qual mic/áudio do PC/webcam estão bloqueados, ou null se liberados. */
export function mediaBlockedReason(): string | null {
  if (window.isSecureContext && navigator.mediaDevices) return null;
  const port = location.port ? `:${location.port}` : '';
  return `O navegador só libera áudio e câmera em endereço seguro. Neste PC, abra http://127.0.0.1${port}. `
    + 'Para usar pelo IP da rede, inicie com "npm run dev:rede" (HTTPS) e abra o endereço https:// que aparecer.';
}

function requireMedia() {
  const reason = mediaBlockedReason();
  if (reason) throw new Error(reason);
}

class BandFollower {
  private peak = 0.05;
  private floor = 0;
  value = 0;

  update(raw: number, attack: number, release: number) {
    // seguidor de pico que decai devagar e piso que sobe devagar
    this.peak = Math.max(raw, this.peak * 0.997, 0.04);
    this.floor = raw < this.floor ? raw : this.floor + (raw - this.floor) * 0.002;
    const norm = Math.min(1, Math.max(0, (raw - this.floor) / Math.max(this.peak - this.floor, 0.04)));
    const k = norm > this.value ? attack : release;
    this.value += (norm - this.value) * k;
    return this.value;
  }
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  input: AudioInput = 'none';
  fileName = '';
  devices: MediaDeviceInfo[] = [];

  private analyser: AnalyserNode | null = null;
  private inputGain: GainNode | null = null;
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private stream: MediaStream | null = null;
  private source: AudioNode | null = null;
  mediaEl: HTMLAudioElement | null = null;

  private freq = new Uint8Array(1024);
  private time = new Uint8Array(2048);
  /** 2 linhas × SPECTRUM_BINS: espectro (log) e forma de onda. */
  readonly texData = new Uint8Array(SPECTRUM_BINS * 2);

  private bands = [new BandFollower(), new BandFollower(), new BandFollower(), new BandFollower()];
  private prevBass = 0;
  private fluxHist: number[] = [];
  private lastOnset = 0;
  private onsetTimes: number[] = [];
  bpmEstimate = 0;

  gain = 1;
  onChange: (() => void) | null = null;

  private ensure() {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.inputGain = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.55;
    this.analyser.minDecibels = -90;
    this.analyser.maxDecibels = -20;
    this.recordDest = ctx.createMediaStreamDestination();
    this.inputGain.connect(this.analyser);
    this.inputGain.connect(this.recordDest);
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.time = new Uint8Array(this.analyser.fftSize);
    return ctx;
  }

  async listDevices() {
    if (mediaBlockedReason()) return this.devices;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      this.devices = all.filter(d => d.kind === 'audioinput');
    } catch {
      this.devices = [];
    }
    this.onChange?.();
    return this.devices;
  }

  stop() {
    this.source?.disconnect();
    this.source = null;
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    if (this.mediaEl) {
      this.mediaEl.pause();
      this.mediaEl.src = '';
      this.mediaEl = null;
    }
    this.input = 'none';
    this.fileName = '';
    this.onChange?.();
  }

  async useMic(deviceId?: string) {
    requireMedia();
    const ctx = this.ensure();
    await ctx.resume();
    this.stop();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      },
    });
    this.stream = stream;
    const src = ctx.createMediaStreamSource(stream);
    src.connect(this.inputGain!);
    this.source = src;
    this.input = 'mic';
    await this.listDevices(); // rótulos só aparecem após a permissão
  }

  /** Captura o áudio de uma aba ou da tela inteira (Spotify, software de DJ...). */
  async useSystem() {
    requireMedia();
    const ctx = this.ensure();
    await ctx.resume();
    this.stop();
    // systemAudio/monitorTypeSurfaces: o Chrome no Windows oferece "Compartilhar áudio do sistema"
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      systemAudio: 'include',
      monitorTypeSurfaces: 'include',
      selfBrowserSurface: 'exclude',
    } as DisplayMediaStreamOptions);
    stream.getVideoTracks().forEach(t => t.stop());
    if (stream.getAudioTracks().length === 0) {
      throw new Error('Nenhum áudio foi compartilhado. Escolha "Tela inteira" e ative "Compartilhar áudio do sistema".');
    }
    // se o usuário clicar em "Parar compartilhamento"
    stream.getAudioTracks()[0].addEventListener('ended', () => { if (this.stream === stream) this.stop(); });
    this.stream = stream;
    const src = ctx.createMediaStreamSource(stream);
    src.connect(this.inputGain!);
    this.source = src;
    this.input = 'system';
    this.onChange?.();
  }

  async useFile(file: File) {
    const ctx = this.ensure();
    await ctx.resume();
    this.stop();
    const el = new Audio();
    el.src = URL.createObjectURL(file);
    el.loop = true;
    el.crossOrigin = 'anonymous';
    const src = ctx.createMediaElementSource(el);
    src.connect(this.inputGain!);
    src.connect(ctx.destination);
    this.mediaEl = el;
    this.source = src;
    this.input = 'file';
    this.fileName = file.name;
    await el.play();
    this.onChange?.();
  }

  togglePlay() {
    if (!this.mediaEl) return;
    if (this.mediaEl.paused) this.mediaEl.play(); else this.mediaEl.pause();
    this.onChange?.();
  }

  get recordStream(): MediaStream | null {
    return this.recordDest?.stream ?? null;
  }

  private bandAvg(fromHz: number, toHz: number) {
    if (!this.ctx) return 0;
    const binHz = this.ctx.sampleRate / 2 / this.freq.length;
    const a = Math.max(1, Math.floor(fromHz / binHz));
    const b = Math.min(this.freq.length - 1, Math.ceil(toHz / binHz));
    let s = 0;
    for (let i = a; i <= b; i++) s += this.freq[i];
    return s / ((b - a + 1) * 255);
  }

  update(now: number): AudioFrame {
    const active = !!this.source && this.input !== 'none';
    if (!this.analyser || !active) {
      for (let i = 0; i < this.bands.length; i++) this.bands[i].update(0, 0.5, 0.08);
      this.texData.fill(0, 0, SPECTRUM_BINS);
      this.texData.fill(128, SPECTRUM_BINS);
      return { bass: 0, mid: 0, high: 0, level: 0, onset: false, active: false };
    }
    if (this.inputGain) this.inputGain.gain.value = this.gain;
    this.analyser.getByteFrequencyData(this.freq);
    this.analyser.getByteTimeDomainData(this.time);

    // espectro em escala logarítmica (40Hz..16kHz) para a textura
    const nyq = this.ctx!.sampleRate / 2;
    const n = this.freq.length;
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const hz = 40 * Math.pow(16000 / 40, i / (SPECTRUM_BINS - 1));
      const bin = Math.min(n - 1, Math.round((hz / nyq) * n));
      this.texData[i] = this.freq[bin];
    }
    const step = this.time.length / SPECTRUM_BINS;
    for (let i = 0; i < SPECTRUM_BINS; i++) this.texData[SPECTRUM_BINS + i] = this.time[Math.floor(i * step)];

    const rawBass = this.bandAvg(30, 150);
    const rawMid = this.bandAvg(150, 2000);
    const rawHigh = this.bandAvg(2000, 12000);
    const rawLevel = this.bandAvg(30, 12000);

    const bass = this.bands[0].update(rawBass, 0.7, 0.12);
    const mid = this.bands[1].update(rawMid, 0.5, 0.1);
    const high = this.bands[2].update(rawHigh, 0.6, 0.15);
    const level = this.bands[3].update(rawLevel, 0.4, 0.06);

    // fluxo espectral no grave com limiar adaptativo
    const flux = Math.max(0, rawBass - this.prevBass);
    this.prevBass = rawBass;
    this.fluxHist.push(flux);
    if (this.fluxHist.length > 43) this.fluxHist.shift();
    const mean = this.fluxHist.reduce((a, b) => a + b, 0) / this.fluxHist.length;
    const sd = Math.sqrt(this.fluxHist.reduce((a, b) => a + (b - mean) ** 2, 0) / this.fluxHist.length);
    let onset = false;
    if (flux > mean + sd * 1.5 && flux > 0.015 && rawBass > 0.15 && now - this.lastOnset > 0.28) {
      onset = true;
      this.lastOnset = now;
      this.onsetTimes.push(now);
      if (this.onsetTimes.length > 24) this.onsetTimes.shift();
      this.estimateBpm();
    }
    return { bass, mid, high, level, onset, active: true };
  }

  private estimateBpm() {
    const t = this.onsetTimes;
    if (t.length < 8) return;
    // histograma de intervalos dobrados para a faixa 85..175 BPM
    const votes = new Map<number, number>();
    for (let i = 1; i < t.length; i++) {
      for (let j = Math.max(0, i - 4); j < i; j++) {
        let bpm = 60 / (t[i] - t[j]);
        if (!isFinite(bpm) || bpm <= 0) continue;
        while (bpm < 85) bpm *= 2;
        while (bpm > 175) bpm /= 2;
        const key = Math.round(bpm);
        votes.set(key, (votes.get(key) ?? 0) + 1);
        votes.set(key - 1, (votes.get(key - 1) ?? 0) + 0.5);
        votes.set(key + 1, (votes.get(key + 1) ?? 0) + 0.5);
      }
    }
    let best = 0, bestV = 0;
    votes.forEach((v, k) => { if (v > bestV) { bestV = v; best = k; } });
    if (best) this.bpmEstimate = this.bpmEstimate ? this.bpmEstimate * 0.7 + best * 0.3 : best;
  }
}

export const audio = new AudioEngine();
