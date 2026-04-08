
import RecordRTC from 'recordrtc';

export class RecordService {
  private recorder: RecordRTC | null = null;

  async startRecording(canvas: HTMLCanvasElement, audioStream?: MediaStream, useScreenCapture: boolean = false) {
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
        // Record only the canvas
        const canvasStream = (canvas as any).captureStream(30);
        stream = canvasStream;
        
        if (audioStream && audioStream.getAudioTracks().length > 0) {
          console.log("VJ Recording: Attaching audio tracks to canvas stream");
          stream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...audioStream.getAudioTracks()
          ]);
        }
      }

      // Try to find the best MP4-compatible type
      const mimeTypes = [
        'video/mp4',
        'video/mp4;codecs=h264',
        'video/mp4;codecs=avc1',
        'video/webm;codecs=h264', // Some players handle H264 in WebM better
        'video/webm'
      ];

      let selectedMimeType = 'video/webm';
      for (const type of mimeTypes) {
        if (typeof MediaRecorder !== 'undefined' && (MediaRecorder as any).isTypeSupported(type)) {
          selectedMimeType = type;
          break;
        }
      }

      console.log("VJ Recording: Using MimeType:", selectedMimeType);

      this.recorder = new RecordRTC(stream, {
        type: 'video',
        mimeType: selectedMimeType,
        recorderType: (RecordRTC as any).MediaStreamRecorder,
        disableLogs: false,
        frameInterval: 30,
        // Forcing a bit rate can help with quality
        videoBitsPerSecond: 5000000, 
      });

      this.recorder.startRecording();
    } catch (e) {
      console.error("VJ Recording Error:", e);
      alert("Erro ao iniciar gravação. Verifique as permissões do navegador.");
    }
  }

  stopRecording() {
    if (this.recorder) {
      this.recorder.stopRecording(() => {
        const blob = this.recorder!.getBlob();
        const mimeType = this.recorder!.mimeType;
        const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
        
        RecordRTC.invokeSaveAsDialog(blob, `vj-session-${Date.now()}.${extension}`);
        
        // Cleanup
        const internalRecorder = (this.recorder as any).getInternalRecorder();
        if (internalRecorder && internalRecorder.stream) {
          internalRecorder.stream.getTracks().forEach((track: any) => track.stop());
        }
        this.recorder = null;
      });
    }
  }
}

export const recordService = new RecordService();
