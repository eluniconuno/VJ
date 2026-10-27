import { audioService } from './audioService';

export interface RecordServiceListener {
  onStart?: () => void;
  onStop?: () => void;
  onComplete?: (filename: string) => void;
  onError?: (err: string) => void;
}

export class RecordService {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordingCanvas: HTMLCanvasElement | null = null;
  private recordingCtx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private svgCache = new Map<string, HTMLImageElement>();
  private listener: RecordServiceListener | null = null;

  setListener(listener: RecordServiceListener | null) {
    this.listener = listener;
  }

  async startRecording(
    canvas: HTMLCanvasElement, 
    audioStream?: MediaStream | null, 
    useScreenCapture: boolean = false,
    videoFormat: 'desktop' | 'mobile' = 'desktop'
  ) {
    this.recordedChunks = [];
    if (this.listener?.onStart) this.listener.onStart();
    let stream: MediaStream;

    try {
      if (useScreenCapture && navigator.mediaDevices.getDisplayMedia) {
        // Record the entire screen/tab (includes UI)
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: 'browser',
          },
          audio: true
        });
        console.log("VJ Recording: Screen Capture started");
      } else {
        // Encontra o container master de trabalho (workspace)
        const workspace = document.getElementById('brutalist-workspace');
        if (workspace) {
          console.log("VJ Recording: Workspace found, starting compositor with format:", videoFormat);
          this.startCompositingLoop(canvas, workspace, videoFormat);
        } else {
          console.warn("VJ Recording: Workspace NOT found, falling back to raw canvas stream");
        }

        // Se o compositor foi iniciado, grava a partir do canvas composto. Caso contrário, cai de volta para o canvas cru.
        const sourceCanvas = this.recordingCanvas || canvas;
        let canvasStream: MediaStream;
        try {
          canvasStream = (sourceCanvas as any).captureStream(30);
        } catch (captureErr) {
          console.warn("captureStream failed, using fallback custom capture", captureErr);
          canvasStream = (canvas as any).captureStream ? (canvas as any).captureStream(30) : (canvas as any).transferControlToOffscreen ? new MediaStream() : new MediaStream();
        }

        // Create actual stream to record
        const trackStreams: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
        
        // Add active audio tracks *only* if available and actively playing/recording to avoid 0-byte stream lock
        if (audioStream && audioStream.getAudioTracks().length > 0 && audioService.isAudioActive()) {
          console.log("VJ Recording: Attaching active audio tracks to recording stream");
          trackStreams.push(...audioStream.getAudioTracks());
        } else {
          console.log("VJ Recording: No active audio source found, recording pure visual video.");
        }

        stream = new MediaStream(trackStreams);
      }

      // Try to find the best high quality codec
      const mimeTypes = [
        'video/mp4;codecs=h264',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=h264',
        'video/webm',
        'video/mp4'
      ];

      let selectedMimeType = '';
      for (const type of mimeTypes) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
          selectedMimeType = type;
          break;
        }
      }

      console.log("VJ Recording: Selected compatible MediaRecorder MimeType:", selectedMimeType);

      const options: MediaRecorderOptions = {
        videoBitsPerSecond: 6000000 // 6 Mbps for pristine crisp resolution
      };
      if (selectedMimeType) {
        options.mimeType = selectedMimeType;
      }

      this.mediaRecorder = new MediaRecorder(stream, options);
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
          console.log(`VJ Recording: Received video block of ${event.data.size} bytes`);
        }
      };

      this.mediaRecorder.onstop = () => {
        console.log("VJ Recording: Recording sequence finished. Compiling chunks...");
        if (this.listener?.onStop) this.listener.onStop();
        
        const finalBlob = new Blob(this.recordedChunks, { type: selectedMimeType || 'video/webm' });
        console.log("VJ Recording: Final recorded file size:", finalBlob.size, "bytes");

        if (finalBlob.size === 0) {
          console.error("VJ Recording: Failed with 0 bytes. Trying raw canvas fallback.");
          if (this.listener?.onError) this.listener.onError("Arquivo compilado com 0 bytes.");
          return;
        }

        // Detect correct extension based on MIME type
        let extension = 'webm';
        if (finalBlob.type.includes('mp4')) {
          extension = 'mp4';
        } else if (finalBlob.type.includes('webm')) {
          extension = 'webm';
        }

        // Auto-download automatically as high quality video
        const filename = `vj-digital-sculpture-${Date.now()}.${extension}`;
        const url = URL.createObjectURL(finalBlob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 500);

        if (this.listener?.onComplete) {
          this.listener.onComplete(filename);
        }

        // Turn off stream tracks
        stream.getTracks().forEach(track => track.stop());
      };

      // Request data chunks every 1000ms to guarantee persistent writing
      this.mediaRecorder.start(1000);
      console.log("VJ Recording: MediaRecorder active and spinning!");
    } catch (e: any) {
      console.error("VJ Recording Error:", e);
      if (this.listener?.onError) {
        this.listener.onError(e?.message || String(e));
      } else {
        alert("Erro ao iniciar gravação. Ative as permissões necessárias.");
      }
    }
  }

  private startCompositingLoop(webglCanvas: HTMLCanvasElement, workspace: HTMLElement, videoFormat: 'desktop' | 'mobile' = 'desktop') {
    if (this.animationFrameId) {
      clearTimeout(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.recordingCanvas = document.createElement('canvas');
    if (videoFormat === 'mobile') {
      // Mobile TikTok/Reels vertical mode: 720 x 1280
      this.recordingCanvas.width = 720;
      this.recordingCanvas.height = 1280;
    } else {
      // Classic widescreen: 1280 x 720
      this.recordingCanvas.width = 1280;
      this.recordingCanvas.height = 720;
    }
    this.recordingCtx = this.recordingCanvas.getContext('2d');
    
    const drawFrame = () => {
      if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') return;
      if (!this.recordingCtx || !this.recordingCanvas) return;
      
      try {
        const ctx = this.recordingCtx;
        const rCanvas = this.recordingCanvas;
        
        // Background color fill (pure neobrutalist dark)
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, rCanvas.width, rCanvas.height);
        
        // 1. Draw 3D WebGL Canvas
        ctx.drawImage(webglCanvas, 0, 0, rCanvas.width, rCanvas.height);
        
        // 2. Map coordinates relative to the Master Workspace
        const workspaceRect = workspace.getBoundingClientRect();
        const scaleX = workspaceRect.width ? (rCanvas.width / workspaceRect.width) : 1.0;
        const scaleY = workspaceRect.height ? (rCanvas.height / workspaceRect.height) : 1.0;
        
        // 3. Draw HTML elements matching exactly style, rotation, scale and position
        const overlays = Array.from(document.querySelectorAll('#brutalist-collages-overlay > div'));
        
        for (const el of overlays) {
          try {
            const type = el.getAttribute('data-type');
            if (!type) continue;
            
            const opacity = parseFloat(el.getAttribute('data-opacity') || '1.0');
            const rotationDeg = parseFloat(el.getAttribute('data-rotation') || '0');
            const blendMode = el.getAttribute('data-blend-mode') || 'normal';
            
            const rect = el.getBoundingClientRect();
            
            // Map the exact center of the DOM element
            const cx = (rect.left - workspaceRect.left + rect.width / 2) * scaleX;
            const cy = (rect.top - workspaceRect.top + rect.height / 2) * scaleY;
            
            // Layout scale factor
            const valScaleX = parseFloat(el.getAttribute('data-scale-x') || '1.0');
            const valScaleY = parseFloat(el.getAttribute('data-scale-y') || '1.0');
            
            // Use layout-unrotated offset dimensions
            const w = (el as HTMLElement).offsetWidth * scaleX * valScaleX;
            const h = (el as HTMLElement).offsetHeight * scaleY * valScaleY;
            
            ctx.save();
            ctx.globalAlpha = opacity;
            
            // Set canvas blend-mode
            if (blendMode !== 'normal') {
              if (blendMode === 'difference') ctx.globalCompositeOperation = 'difference';
              else if (blendMode === 'multiply') ctx.globalCompositeOperation = 'multiply';
              else if (blendMode === 'screen') ctx.globalCompositeOperation = 'screen';
              else if (blendMode === 'overlay') ctx.globalCompositeOperation = 'overlay';
              else if (blendMode === 'exclusion') ctx.globalCompositeOperation = 'difference';
              else if (blendMode === 'color-dodge') ctx.globalCompositeOperation = 'color-dodge';
            }
            
            ctx.translate(cx, cy);
            ctx.rotate((rotationDeg * Math.PI) / 180);
            
            if (type === 'text') {
              const text = el.getAttribute('data-text') || 'TYPOGRAPHY';
              const font = el.getAttribute('data-font') || 'Space Grotesk';
              const size = parseFloat(el.getAttribute('data-size') || '3');
              const color = el.getAttribute('data-color') || '#ffffff';
              const outline = el.getAttribute('data-outline') === 'true';
              const glow = parseFloat(el.getAttribute('data-glow') || '20');
              const weight = el.getAttribute('data-weight') || '900';
              const italic = el.getAttribute('data-italic') === 'true';
              const letterSpacing = parseFloat(el.getAttribute('data-letter-spacing') || '0');
              
              const computedFontSize = size * 16 * scaleX;
              ctx.font = `${italic ? 'italic' : 'normal'} ${weight} ${computedFontSize}px "${font}", sans-serif`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              
              if (!outline && glow > 0) {
                ctx.shadowColor = color;
                ctx.shadowBlur = glow * scaleX;
              } else {
                ctx.shadowBlur = 0;
              }
              
              ctx.fillStyle = outline ? 'transparent' : color;
              
              if (letterSpacing !== 0 && 'letterSpacing' in ctx) {
                (ctx as any).letterSpacing = `${letterSpacing * scaleX}px`;
              }
              
              if (outline) {
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5 * scaleX;
                ctx.strokeText(text, 0, 0);
              } else {
                ctx.fillText(text, 0, 0);
              }
              
              if ('letterSpacing' in ctx) {
                (ctx as any).letterSpacing = '0px';
              }
            } 
            else if (type === 'image' || type === 'video') {
              const img = el.querySelector('img');
              const video = el.querySelector('video');
              
              if (img && img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, -w / 2, -h / 2, w, h);
              } else if (video) {
                ctx.drawImage(video, -w / 2, -h / 2, w, h);
              }
            } 
            else if (type === 'sticker') {
              const stickerId = el.getAttribute('data-sticker-id') || '';
              const svgEl = el.querySelector('svg');
              
              if (svgEl && stickerId) {
                const cachedImg = this.svgCache.get(stickerId);
                if (cachedImg) {
                  ctx.drawImage(cachedImg, -w / 2, -h / 2, w, h);
                } else {
                  const svgString = new XMLSerializer().serializeToString(svgEl);
                  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                  const url = URL.createObjectURL(svgBlob);
                  const img = new Image();
                  img.onload = () => {
                    this.svgCache.set(stickerId, img);
                    URL.revokeObjectURL(url);
                  };
                  img.src = url;
                }
              } else {
                // Warning flags stamp rendering standard fallback
                ctx.fillStyle = '#0a0a0a';
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2 * scaleX;
                ctx.fillRect(-w/2, -h/2, w, h);
                ctx.strokeRect(-w/2, -h/2, w, h);
                
                const badge = el.querySelector('.text-black');
                const detail = el.querySelector('.font-mono');
                
                if (badge) {
                  ctx.fillStyle = '#ff0055';
                  ctx.fillRect(-w/2 + 2 * scaleX, -h/2 + 2 * scaleY, w - 4 * scaleX, 15 * scaleY);
                  ctx.fillStyle = '#000000';
                  ctx.font = `bold ${8 * scaleX}px sans-serif`;
                  ctx.textAlign = 'center';
                  ctx.fillText(badge.textContent || '', 0, -h/2 + 10 * scaleY);
                }
                if (detail) {
                  ctx.fillStyle = '#ef4444';
                  ctx.font = `${6 * scaleX}px "JetBrains Mono", monospace`;
                  ctx.textAlign = 'center';
                  ctx.fillText(detail.textContent || '', 0, h/2 - 5 * scaleY);
                }
              }
            }
            ctx.restore();
          } catch (itemErr) {
            console.error("Item rendering error in draw loop:", itemErr);
            ctx.restore();
          }
        }
      } catch (err) {
        console.error("Critical error in composites compositor frame tick:", err);
      }
      
      this.animationFrameId = setTimeout(drawFrame, 33) as any;
    };
    
    drawFrame();
  }

  stopRecording() {
    if (this.animationFrameId) {
      clearTimeout(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) {
        console.error("Error calling mediaRecorder.stop():", e);
      }
    }
  }
}

export const recordService = new RecordService();
