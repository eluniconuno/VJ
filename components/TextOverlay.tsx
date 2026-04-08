
import React, { useEffect } from 'react';
import { VJState, TextAnimType, TextOverlayItem } from '../types';

interface TextOverlayProps {
  vjState: VJState;
}

export const TextOverlay: React.FC<TextOverlayProps> = ({ vjState }) => {
  const { textOverlays } = vjState;

  // Dynamic Font Loader for all active fonts
  useEffect(() => {
    // Explicitly type fonts as string[] to resolve 'unknown' property access error during map
    const fonts: string[] = Array.from(new Set(textOverlays.map(t => t.font).filter(Boolean)));
    if (fonts.length === 0) return;

    const linkId = 'dynamic-font-loader';
    let link = document.getElementById(linkId) as HTMLLinkElement;
    
    if (!link) {
      link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }

    const fontQuery = fonts.map(f => f.trim().replace(/ /g, '+')).join('|');
    link.href = `https://fonts.googleapis.com/css?family=${fontQuery}:wght@400;700;900&display=swap`;
  }, [textOverlays]);

  const getAnimationClass = (anim: TextAnimType) => {
    switch (anim) {
      case TextAnimType.PULSE: return 'animate-pulse-fast';
      case TextAnimType.GLITCH: return 'animate-glitch';
      case TextAnimType.NEON_FLICKER: return 'animate-flicker';
      case TextAnimType.SLIDE: return 'animate-slide-scan';
      case TextAnimType.SPIN: return 'animate-slow-spin';
      case TextAnimType.MARQUEE: return 'animate-marquee';
      case TextAnimType.WAVE: return 'animate-wave';
      case TextAnimType.BOUNCE: return 'animate-bounce-vj';
      case TextAnimType.CHROMA: return 'animate-chroma';
      default: return '';
    }
  };

  if (textOverlays.length === 0) return null;

  return (
    <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden" style={{ isolation: 'isolate' }}>
      <style>{`
        @keyframes glitch {
          0% { transform: translate(0); }
          20% { transform: translate(-3px, 3px); }
          40% { transform: translate(3px, -3px); }
          60% { transform: translate(-3px, 0); }
          80% { transform: translate(3px, 3px); }
          100% { transform: translate(0); }
        }
        .animate-glitch { animation: glitch 0.2s steps(2, start) infinite; }
        
        @keyframes flicker {
          0%, 19%, 21%, 23%, 25%, 54%, 56%, 100% { opacity: 1; }
          20%, 24%, 55% { opacity: 0.2; }
        }
        .animate-flicker { animation: flicker 0.15s infinite; }

        @keyframes pulse-fast {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.1); filter: brightness(1.5); }
        }
        .animate-pulse-fast { animation: pulse-fast 0.4s ease-in-out infinite; }
        
        @keyframes marquee {
          0% { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
        .animate-marquee { animation: marquee 10s linear infinite; width: max-content; }

        @keyframes wave {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-30px); }
        }
        .animate-wave { animation: wave 2s ease-in-out infinite; }

        @keyframes bounce-vj {
          0%, 100% { transform: translateY(0) scale(1); }
          30% { transform: translateY(-50px) scale(0.9, 1.1); }
          50% { transform: translateY(0) scale(1.2, 0.8); }
        }
        .animate-bounce-vj { animation: bounce-vj 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) infinite; }

        @keyframes chroma {
          0% { color: #ff0000; text-shadow: 0 0 20px #ff0000; }
          33% { color: #00ff00; text-shadow: 0 0 20px #00ff00; }
          66% { color: #0000ff; text-shadow: 0 0 20px #0000ff; }
          100% { color: #ff0000; text-shadow: 0 0 20px #ff0000; }
        }
        .animate-chroma { animation: chroma 3s linear infinite; }

        .animate-slow-spin { animation: spin 12s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {textOverlays.map((layer) => (
        <div 
          key={layer.id}
          className="absolute overflow-visible flex items-center justify-center whitespace-pre-wrap leading-tight text-center"
          style={{ 
            left: `${layer.posX}%`, 
            top: `${layer.posY}%`, 
            transform: 'translate(-50%, -50%)',
            mixBlendMode: layer.blendMode as any,
            opacity: layer.opacity,
            width: layer.anim === TextAnimType.MARQUEE ? '100vw' : 'auto'
          }}
        >
          <div className={getAnimationClass(layer.anim)}
            style={{
              fontFamily: `"${layer.font}", sans-serif`,
              fontSize: `${layer.size}rem`,
              color: layer.color,
              fontWeight: 900,
              textShadow: layer.outline 
                ? `-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000` 
                : `0 0 40px ${layer.color}66`,
              WebkitTextStroke: layer.outline ? `2px ${layer.color}` : 'none',
              WebkitTextFillColor: layer.outline ? 'transparent' : 'inherit',
              transition: 'all 0.3s ease'
            }}
          >
            {layer.text}
          </div>
        </div>
      ))}
    </div>
  );
};
