
import React from 'react';
import { VJState, LayerType } from '../types';

interface LayerOverlayProps {
  vjState: VJState;
}

export const LayerOverlay: React.FC<LayerOverlayProps> = ({ vjState }) => {
  if (!vjState.showUI) return null;

  const domLayers = vjState.layers.filter(l => l.type === LayerType.IFRAME || l.type === LayerType.SPLINE);

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      {domLayers.map(layer => {
        if (!layer.visible || !layer.url) return null;

        return (
          <div
            key={layer.id}
            className="absolute pointer-events-auto overflow-hidden"
            style={{
              left: `${50 + layer.posX}%`,
              top: `${50 - layer.posY}%`,
              width: `${layer.scale * 10}%`,
              height: `${layer.scale * 10}%`,
              transform: `translate(-50%, -50%) rotateX(${layer.rotX}rad) rotateY(${layer.rotY}rad) rotateZ(${layer.rotZ}rad)`,
              opacity: layer.opacity,
              mixBlendMode: layer.blendMode as any
            }}
          >
            <iframe
              src={layer.url}
              className="w-full h-full border-none pointer-events-auto"
              title={`layer-${layer.id}`}
              allow="autoplay; fullscreen; xr-spatial-tracking; accelerometer; gyroscope; picture-in-picture"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            />
          </div>
        );
      })}
    </div>
  );
};
