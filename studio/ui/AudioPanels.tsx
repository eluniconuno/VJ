import React, { useEffect, useState } from 'react';
import { audio } from '../engine/audio';
import { spotify } from '../engine/spotify';
import { makeClip, store } from '../engine/store';
import { Btn } from './Controls';
import { useRaf } from './hooks';

const Popover: React.FC<{ onClose: () => void; children: React.ReactNode; width?: number }> = ({ onClose, children, width = 360 }) => (
  <>
    <div className="fixed inset-0 z-40" onClick={onClose} />
    <div className="absolute left-0 top-9 z-50 rounded-sm border border-white/20 bg-[#0c0c10] p-3 text-[11px] leading-relaxed text-white/80 shadow-2xl"
      style={{ width }}>
      {children}
    </div>
  </>
);

// ---------------------------------------------------------------------------

export const PcAudioButton: React.FC<{ onError: (m: string) => void }> = ({ onError }) => {
  const [open, setOpen] = useState(false);
  const capture = async () => {
    setOpen(false);
    try { await audio.useSystem(); } catch (e: any) { if (e?.name !== 'NotAllowedError') onError(e.message); }
  };
  return (
    <div className="relative">
      <Btn active={audio.input === 'system'} tone="#ff3b6b" onClick={() => setOpen(!open)}
        title="Capturar o som que está tocando no computador (Spotify, YouTube, software de DJ…)">Áudio do PC</Btn>
      {open && (
        <Popover onClose={() => setOpen(false)}>
          <h4 className="mb-1 font-black text-white">Usar o som do computador</h4>
          <ol className="mb-2 list-decimal space-y-0.5 pl-4">
            <li>Clique em <b>Escolher</b> abaixo.</li>
            <li>Na janela do Chrome, vá em <b>Tela inteira</b>.</li>
            <li>Ative <b>“Compartilhar áudio do sistema”</b> e confirme.</li>
          </ol>
          <p className="mb-2 text-white/50">
            Para usar só uma aba (ex.: Spotify Web ou YouTube), escolha <b>Aba do Chrome</b> e ative “Compartilhar áudio da aba”.
            Tudo que tocar no PC (app do Spotify, Serato, Rekordbox…) passa a mover o visual.
          </p>
          <p className="mb-3 text-white/40">
            Alternativa sem compartilhar tela: ative “Mixagem estéreo” no Windows ou instale o VB-Cable e escolha-o no botão <b>Mic</b>.
          </p>
          <div className="flex gap-1">
            <Btn active tone="#ff3b6b" onClick={capture}>Escolher</Btn>
            {audio.input === 'system' && <Btn onClick={() => { audio.stop(); setOpen(false); }}>Parar</Btn>}
          </div>
        </Popover>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

function fmtTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const SpotifyButton: React.FC<{ onError: (m: string) => void }> = ({ onError }) => {
  const [open, setOpen] = useState(false);
  const [, force] = useState(0);
  const [cid, setCid] = useState(spotify.clientId);
  useEffect(() => spotify.subscribe(() => force(x => x + 1)), []);
  useEffect(() => { if (spotify.error) onError(spotify.error); }, [spotify.error]);

  const t = spotify.track;
  const run = (fn: () => Promise<void>) => () => fn().catch(e => onError(e.message));

  const addClip = (make: () => ReturnType<typeof makeClip>) => store.update(c => {
    // primeira célula vazia da camada de Overlay (ou da última camada)
    const li = Math.max(0, c.layers.findIndex(l => l.name === 'Overlay'));
    const layer = c.layers[li] ?? c.layers[c.layers.length - 1];
    const col = layer.clips.findIndex(x => !x);
    if (col < 0) { onError('Sem célula livre na camada Overlay.'); return; }
    layer.clips[col] = make();
    layer.active = col;
    store.selection = { kind: 'clip', layer: c.layers.indexOf(layer), col };
  });

  return (
    <div className="relative">
      <Btn active={spotify.connected} tone="#1DB954" onClick={() => setOpen(!open)} title="Conectar ao Spotify">
        {spotify.connected && t ? `♫ ${t.name.slice(0, 18)}` : 'Spotify'}
      </Btn>
      {open && (
        <Popover onClose={() => setOpen(false)} width={380}>
          {!spotify.connected ? (
            <>
              <h4 className="mb-1 font-black text-white">Conectar ao Spotify</h4>
              {spotify.needsLoopbackIp && (
                <p className="mb-2 rounded-sm bg-amber-500/15 p-1.5 text-amber-200">
                  O Spotify só aceita 127.0.0.1 ou HTTPS. Abra o estúdio por{' '}
                  <a className="underline" href={`http://127.0.0.1:${location.port}/`}>{`http://127.0.0.1:${location.port}`}</a> (ou use <code>npm run dev:rede</code> para HTTPS).
                </p>
              )}
              <ol className="mb-2 list-decimal space-y-0.5 pl-4">
                <li>Entre em <a className="text-[#1DB954] underline" href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">developer.spotify.com/dashboard</a> e crie um app (Web API).</li>
                <li>Em <b>Redirect URIs</b>, cadastre exatamente:
                  <div className="mt-0.5 flex items-center gap-1">
                    <code className="flex-1 truncate rounded-sm bg-white/10 px-1">{spotify.redirectUri}</code>
                    <button className="text-white/50 hover:text-white" onClick={() => navigator.clipboard.writeText(spotify.redirectUri)}>copiar</button>
                  </div>
                </li>
                <li>Cole o <b>Client ID</b> do app aqui:</li>
              </ol>
              <input value={cid} onChange={e => setCid(e.target.value)} placeholder="Client ID"
                className="mb-2 w-full rounded-sm border border-white/15 bg-black px-2 py-1 font-mono outline-none focus:border-[#1DB954]" />
              <Btn active tone="#1DB954" disabled={!cid.trim()} onClick={run(async () => { spotify.setClientId(cid); await spotify.login(); })}>Conectar</Btn>
              <p className="mt-2 text-white/40">
                O Spotify não libera o áudio das músicas para análise. O visual reage pelo <b>Áudio do PC</b>;
                daqui vêm a música atual, a capa e os controles.
              </p>
            </>
          ) : (
            <>
              {t ? (
                <div className="mb-2 flex gap-2">
                  {t.art && <img src={t.art} className="h-16 w-16 rounded-sm object-cover" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold text-white">{t.name}</div>
                    <div className="truncate text-white/60">{t.artists}</div>
                    <Progress />
                  </div>
                </div>
              ) : <p className="mb-2 text-white/50">Nada tocando agora. Dê play no Spotify (app, web ou celular).</p>}
              <div className="mb-2 flex gap-1">
                <Btn onClick={run(() => spotify.control('previous'))}>⏮</Btn>
                <Btn onClick={run(() => spotify.control(t?.playing ? 'pause' : 'play'))}>{t?.playing ? '❚❚' : '▶'}</Btn>
                <Btn onClick={run(() => spotify.control('next'))}>⏭</Btn>
              </div>
              <div className="mb-2 flex flex-wrap gap-1">
                <Btn active={audio.input === 'system'} tone="#ff3b6b" onClick={run(() => audio.useSystem())}>Reagir ao áudio do PC</Btn>
                <Btn onClick={() => addClip(() => Object.assign(makeClip('text', { name: 'Música atual' }), { text: '{musica}' }))}>+ Texto da música</Btn>
                <Btn onClick={() => addClip(() => Object.assign(makeClip('media', { name: 'Capa do Spotify', params: { tint: 0.2 } }), { media: { kind: 'spotify' as const, name: 'Capa do Spotify' } }))}>+ Capa como clip</Btn>
              </div>
              <p className="mb-2 text-white/40">Controlar a reprodução exige Spotify Premium.</p>
              <Btn onClick={() => spotify.logout()}>Desconectar</Btn>
            </>
          )}
        </Popover>
      )}
    </div>
  );
};

const Progress: React.FC = () => {
  const bar = React.useRef<HTMLDivElement>(null);
  const label = React.useRef<HTMLSpanElement>(null);
  useRaf(() => {
    const t = spotify.track;
    if (!t || !bar.current || !label.current) return;
    const pos = Math.min(t.durationMs, t.progressMs + (t.playing ? Date.now() - t.fetchedAt : 0));
    bar.current.style.width = `${(pos / Math.max(1, t.durationMs)) * 100}%`;
    label.current.textContent = `${fmtTime(pos)} / ${fmtTime(t.durationMs)}`;
  });
  return (
    <div className="mt-1">
      <div className="h-1 rounded bg-white/10"><div ref={bar} className="h-1 rounded bg-[#1DB954]" /></div>
      <span ref={label} className="text-[9px] text-white/40" />
    </div>
  );
};

// ---------------------------------------------------------------------------

export const AutopilotControl: React.FC = () => {
  const ap = store.comp.autopilot;
  const upd = (fn: () => void) => store.update(() => fn());
  return (
    <div className="flex items-center gap-1 border-l border-white/10 pl-2">
      <Btn active={ap.on} tone="#36d6ff" title="Troca de coluna automaticamente no compasso" onClick={() => upd(() => (ap.on = !ap.on))}>Auto VJ</Btn>
      <select value={ap.bars} onChange={e => upd(() => (ap.bars = Number(e.target.value)))} title="A cada quantos compassos"
        className="h-7 rounded-sm border border-white/15 bg-black px-1 text-[10px]">
        {[1, 2, 4, 8, 16, 32].map(b => <option key={b} value={b}>{b} comp.</option>)}
      </select>
      <select value={ap.mode} onChange={e => upd(() => (ap.mode = e.target.value as 'next' | 'random'))}
        className="h-7 rounded-sm border border-white/15 bg-black px-1 text-[10px]">
        <option value="next">em ordem</option>
        <option value="random">aleatório</option>
      </select>
    </div>
  );
};
