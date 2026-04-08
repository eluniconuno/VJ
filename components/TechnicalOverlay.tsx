
import React, { useEffect, useState } from 'react';
import { VJState } from '../types';

interface TechnicalOverlayProps {
  vjState: VJState;
}

export const TechnicalOverlay: React.FC<TechnicalOverlayProps> = ({ vjState }) => {
  const [time, setTime] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(t => t + 0.1);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  if (!vjState.showTechnicalOverlay || !vjState.showUI) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden mix-blend-screen opacity-40">
      <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {/* Grid Lines */}
        <defs>
          <pattern id="smallGrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#FFFFFF" strokeWidth="0.5" />
          </pattern>
          <pattern id="grid" width="200" height="200" patternUnits="userSpaceOnUse">
            <rect width="200" height="200" fill="url(#smallGrid)" />
            <path d="M 200 0 L 0 0 0 200" fill="none" stroke="#FFFFFF" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Dynamic Technical Elements */}
        <g stroke="#FFFFFF" strokeWidth="1" fill="none">
          {/* Corner Brackets */}
          <path d="M 20 40 L 20 20 L 40 20" />
          <path d="M 20 40 L 20 20 L 40 20" transform="translate(100, 0) scale(-1, 1) translate(-100, 0)" className="translate-x-[calc(100%-40px)]" />
          <path d="M 20 40 L 20 20 L 40 20" transform="translate(0, 100) scale(1, -1) translate(0, -100)" className="translate-y-[calc(100%-40px)]" />
          <path d="M 20 40 L 20 20 L 40 20" transform="translate(100, 100) scale(-1, -1) translate(-100, -100)" className="translate-x-[calc(100%-40px)] translate-y-[calc(100%-40px)]" />

          {/* Scanning Line */}
          <line x1="0" y1={(time * 50) % 100 + "%"} x2="100%" y2={(time * 50) % 100 + "%"} strokeOpacity="0.5" />
        </g>

        {/* Data Readouts */}
        <g fill="#FFFFFF" fontSize="10" fontFamily="monospace" className="uppercase font-black">
          <text x="30" y="50">SYSTEM_STATUS: CORRUPTED</text>
          <text x="30" y="65">DATA_STREAM: {vjState.activeShape}</text>
          <text x="30" y="80">NOISE_MODE: {vjState.noiseMode}</text>
          <text x="30" y="95">MERGE_MODE: {vjState.mergeMode}</text>
          <text x="30" y="110">COMPRESSION: {(vjState.compressionArtifacts * 100).toFixed(0)}%</text>
          <text x="30" y="125">LATENCY: {(Math.random() * 10).toFixed(2)}MS</text>
          
          <text x="calc(100% - 180px)" y="50">COORD_X: {(Math.sin(time) * 100).toFixed(4)}</text>
          <text x="calc(100% - 180px)" y="65">COORD_Y: {(Math.cos(time) * 100).toFixed(4)}</text>
          <text x="calc(100% - 180px)" y="80">COORD_Z: {(Math.sin(time * 0.5) * 100).toFixed(4)}</text>
          
          <text x="30" y="calc(100% - 30px)">© CORRUPTED DATA // 2025-2026</text>
        </g>
      </svg>
    </div>
  );
};
