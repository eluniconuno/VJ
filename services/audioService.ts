import { AudioData } from '../types';

export class AudioService {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private filterNode: BiquadFilterNode | null = null;
  private gainNode: GainNode | null = null;
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  
  // Input Sources
  private micSource: MediaStreamAudioSourceNode | null = null;
  private fileSource: AudioBufferSourceNode | null = null;
  private fileBuffer: AudioBuffer | null = null;
  
  // Data containers
  private dataArray: Uint8Array | null = null;
  private timeArray: Uint8Array | null = null;
  
  // State
  private startTime: number = 0;
  private pauseTime: number = 0;
  private isPlaying: boolean = false;
  
  // Beat Detection State
  private beatThreshold = 0;
  private beatDecay = 0.95; // How fast the threshold drops
  private beatHold = 0;
  private pulseValue = 0;
  
  // MIDI State
  public detectedMidiInputs: string[] = [];
  
  // Constants
  private readonly FFT_SIZE = 1024;

  constructor() {
    this.setupMIDI();
  }

  // --- Initialization & Context ---

  private getContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // GRAPH ARCHITECTURE FOR MIXING:
      // Sources (Mic, File) -> Filter -> Gain -> Analyser
      // File -> Destination (To hear the music)
      // Mic -> X (Not connected to destination to prevent feedback loop)

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.FFT_SIZE;
      this.analyser.smoothingTimeConstant = 0.5;

      this.filterNode = this.audioContext.createBiquadFilter();
      this.filterNode.type = 'allpass';
      this.filterNode.frequency.value = 20000;

      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 1.0;

      this.recordingDestination = this.audioContext.createMediaStreamDestination();

      // Analysis Chain
      this.filterNode.connect(this.gainNode);
      this.gainNode.connect(this.analyser);
      // NOTE: Analyser is NOT connected to destination to allow mixing without mic feedback

      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
      this.timeArray = new Uint8Array(bufferLength);
    }
    return this.audioContext;
  }

  async resume() {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  // --- Microphone / Line In ---

  async toggleMicrophone(active: boolean): Promise<void> {
    const ctx = this.getContext();
    await this.resume();

    if (active) {
      if (this.micSource) return; // Already active

      try {
        const constraints = {
            audio: {
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false,
                latency: 0
            }
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.micSource = ctx.createMediaStreamSource(stream);
        
        // Connect ONLY to analysis chain (Filter), not speakers
        if (this.filterNode) {
          this.micSource.connect(this.filterNode);
        }
        if (this.recordingDestination) {
          this.micSource.connect(this.recordingDestination);
        }
      } catch (error) {
        console.error("Mic/Line Error:", error);
        throw error;
      }
    } else {
      if (this.micSource) {
        this.micSource.disconnect();
        this.micSource = null;
      }
    }
  }

  // --- File Playback ---

  async loadFile(file: File): Promise<void> {
    const ctx = this.getContext();
    const arrayBuffer = await file.arrayBuffer();
    this.fileBuffer = await ctx.decodeAudioData(arrayBuffer);
    
    // If it was playing, stop the previous instance, but keep state ready
    if (this.isPlaying) {
        this.stopFilePlayback();
    }
    this.pauseTime = 0;
  }

  playFile(): void {
    if (!this.fileBuffer || this.isPlaying) return;
    
    const ctx = this.getContext();
    
    // Create new source
    this.fileSource = ctx.createBufferSource();
    this.fileSource.buffer = this.fileBuffer;
    this.fileSource.loop = true;

    // Route 1: To Speakers (So we can hear it)
    this.fileSource.connect(ctx.destination);

    // Route 2: To Visualizer (So we can see it)
    if (this.filterNode) {
      this.fileSource.connect(this.filterNode);
    }

    if (this.recordingDestination) {
      this.fileSource.connect(this.recordingDestination);
    }

    // Handle pause/resume offset
    this.startTime = ctx.currentTime - this.pauseTime;
    this.fileSource.start(0, this.pauseTime);
    this.isPlaying = true;
  }

  pauseFile(): void {
    if (!this.fileSource || !this.isPlaying || !this.audioContext) return;
    
    try {
        this.fileSource.stop();
    } catch(e) {
        console.warn(e);
    }
    
    this.pauseTime = this.audioContext.currentTime - this.startTime;
    this.isPlaying = false;
    this.fileSource = null;
  }

  stopFilePlayback(): void {
    if (this.fileSource) {
      try { this.fileSource.stop(); } catch (e) {}
      this.fileSource = null;
    }
    this.isPlaying = false;
    this.pauseTime = 0;
  }

  // --- DJ Effects ---

  setVolume(val: number) {
    if (this.gainNode) {
      this.gainNode.gain.setTargetAtTime(val, this.audioContext?.currentTime || 0, 0.1);
    }
  }

  setSmoothing(val: number) {
    if (this.analyser) {
        this.analyser.smoothingTimeConstant = Math.max(0, Math.min(0.99, val));
    }
  }

  setFilter(val: number) {
    if (!this.filterNode || !this.audioContext) return;
    const currentTime = this.audioContext.currentTime;
    
    if (val < -0.05) {
      this.filterNode.type = 'lowpass';
      const freq = 20000 * Math.pow(10, val * 2);
      this.filterNode.frequency.setTargetAtTime(Math.max(100, freq), currentTime, 0.1);
      this.filterNode.Q.value = 5;
    } else if (val > 0.05) {
      this.filterNode.type = 'highpass';
      const freq = 20 * Math.pow(10, val * 3); 
      this.filterNode.frequency.setTargetAtTime(Math.min(10000, freq), currentTime, 0.1);
      this.filterNode.Q.value = 5;
    } else {
      this.filterNode.type = 'allpass';
      this.filterNode.frequency.setTargetAtTime(20000, currentTime, 0.1);
    }
  }

  // --- Analysis ---

  getRecordingStream(): MediaStream | null {
    return this.recordingDestination?.stream || null;
  }

  getAudioData(): AudioData {
    const fallbackSize = this.FFT_SIZE / 2;
    
    // Auto-resume if suspended (browser policy)
    if (this.audioContext?.state === 'suspended') {
        this.audioContext.resume().catch(e => console.warn("Auto-resume failed", e));
    }

    if (!this.analyser || !this.dataArray || !this.timeArray) {
      return {
        frequencyData: new Uint8Array(fallbackSize),
        timeData: new Uint8Array(fallbackSize),
        bass: 0, mid: 0, treble: 0, average: 0, peak: 0, pulse: 0
      };
    }

    this.analyser.getByteFrequencyData(this.dataArray);
    this.analyser.getByteTimeDomainData(this.timeArray);

    const length = this.dataArray.length;
    let sum = 0;
    let bassSum = 0;
    let midSum = 0;
    let trebleSum = 0;
    let peak = 0;

    for (let i = 0; i < length; i++) {
      const val = this.dataArray[i];
      sum += val;
      if (val > peak) peak = val;
      if (i < length * 0.1) bassSum += val;
      else if (i < length * 0.5) midSum += val;
      else trebleSum += val;
    }

    const bass = bassSum / (length * 0.1 * 255);
    const mid = midSum / (length * 0.4 * 255);
    const treble = trebleSum / (length * 0.5 * 255);

    // Debug logging (throttled)
    if (Math.random() < 0.01 && (bass > 0 || mid > 0 || treble > 0)) {
        console.log("Audio Data:", { bass: bass.toFixed(2), mid: mid.toFixed(2), treble: treble.toFixed(2) });
    }

    // Dynamic Threshold for Beat Detection
    if (bass > this.beatThreshold && bass > 0.3) { 
       this.beatThreshold = bass;
       this.pulseValue = 1.0; 
       this.beatHold = 10;
    } else {
       this.pulseValue *= 0.85; 
       if (this.beatHold > 0) {
           this.beatHold--;
       } else {
           this.beatThreshold *= 0.95;
           this.beatThreshold = Math.max(this.beatThreshold, bass * 1.2);
       }
    }

    return {
      frequencyData: this.dataArray,
      timeData: this.timeArray,
      bass, mid, treble,
      average: sum / (length * 255),
      peak: peak / 255,
      pulse: this.pulseValue 
    };
  }

  // --- MIDI Support ---
  
  onMidiMessage: ((data: { type: string, note: number, value: number }) => void) | null = null;
  onMidiConnectionChange: ((inputs: string[]) => void) | null = null;

  async setupMIDI() {
    if (!(navigator as any).requestMIDIAccess) return;
    try {
      const access = await (navigator as any).requestMIDIAccess();
      const updateInputs = () => {
          this.detectedMidiInputs = [];
          const inputs = access.inputs.values();
          for (const input of inputs) {
              this.detectedMidiInputs.push(input.name);
              input.onmidimessage = this.handleMidiMessage.bind(this);
          }
          if (this.onMidiConnectionChange) this.onMidiConnectionChange(this.detectedMidiInputs);
      };
      updateInputs();
      access.onstatechange = (e: any) => { updateInputs(); };
    } catch (e) { console.warn("MIDI Access failed", e); }
  }

  private handleMidiMessage(message: any) {
      const [status, note, velocity] = message.data;
      const val = velocity / 127;
      if (status >= 176 && status <= 191) {
        if (this.onMidiMessage) this.onMidiMessage({ type: 'CC', note: note, value: val });
      }
      if (status >= 144 && status <= 159 && velocity > 0) {
          if (this.onMidiMessage) this.onMidiMessage({ type: 'NOTE_ON', note: note, value: val });
      }
  }
}

export const audioService = new AudioService();