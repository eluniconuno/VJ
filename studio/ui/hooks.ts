import { useEffect, useRef, useSyncExternalStore } from 'react';
import { store } from '../engine/store';
import type { Engine } from '../engine/renderer';

/** Referência global ao motor, preenchida pelo Preview ao montar. */
export const runtime: { engine: Engine | null } = { engine: null };

/** Re-renderiza o componente sempre que a store muda. */
export function useStore() {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}

/** Executa `fn` a cada frame enquanto o componente estiver montado. */
export function useRaf(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let id = 0;
    const loop = () => { ref.current(); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
}

export const MOD_COLORS: Record<string, string> = {
  none: '#555', bass: '#ff3b6b', mid: '#ffb02e', high: '#36d6ff', level: '#b6ff3b',
  beat: '#ffffff', sine: '#c77dff', saw: '#9b8cff', square: '#7d9bff', random: '#ff7de9',
};

export const MOD_LABELS: Record<string, string> = {
  none: 'Nenhuma', bass: 'Grave', mid: 'Médio', high: 'Agudo', level: 'Volume', beat: 'Batida',
  sine: 'LFO Seno', saw: 'LFO Rampa', square: 'LFO Quadrado', random: 'Aleatório',
};
