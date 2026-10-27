// Integração com o Spotify (Web API, OAuth PKCE — sem servidor).
//
// Importante: o Spotify NÃO entrega o áudio para análise (é protegido por DRM)
// e a "audio-analysis" foi bloqueada para apps novos em nov/2024. Por isso o
// visual reage capturando o áudio do PC; daqui vêm música atual, capa e controles.

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
const K_CLIENT = 'vyxo-spotify-client';
const K_TOKEN = 'vyxo-spotify-token';
const K_VERIFIER = 'vyxo-spotify-verifier';

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: string;
  album: string;
  art: string | null;
  progressMs: number;
  durationMs: number;
  playing: boolean;
  fetchedAt: number;
}

interface Token { access: string; refresh: string; expires: number; }

function b64url(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  arr.forEach(b => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

class SpotifyService {
  clientId = localStorage.getItem(K_CLIENT) ?? '';
  track: SpotifyTrack | null = null;
  error: string | null = null;
  private token: Token | null = null;
  private timer: number | undefined;
  private listeners = new Set<() => void>();

  constructor() {
    try { this.token = JSON.parse(localStorage.getItem(K_TOKEN) ?? 'null'); } catch { this.token = null; }
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.listeners.forEach(l => l()); }

  get connected() { return !!this.token; }

  /** URI que precisa estar cadastrada no app do Spotify. */
  get redirectUri() { return `${location.origin}${location.pathname}`; }

  /** O Spotify não aceita "localhost"; é preciso abrir por 127.0.0.1. */
  get needsLoopbackIp() { return location.hostname === 'localhost' || !window.isSecureContext; }

  /** Rótulo usado no gerador de texto ({musica}). */
  get label() { return this.track ? `${this.track.artists} — ${this.track.name}` : ''; }

  setClientId(id: string) {
    this.clientId = id.trim();
    localStorage.setItem(K_CLIENT, this.clientId);
    this.emit();
  }

  async login() {
    if (!this.clientId) throw new Error('Informe o Client ID do seu app do Spotify.');
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    sessionStorage.setItem(K_VERIFIER, verifier);
    const q = new URLSearchParams({
      response_type: 'code', client_id: this.clientId, scope: SCOPES,
      redirect_uri: this.redirectUri, code_challenge_method: 'S256', code_challenge: challenge,
    });
    location.href = `${AUTH_URL}?${q}`;
  }

  logout() {
    this.token = null;
    this.track = null;
    localStorage.removeItem(K_TOKEN);
    window.clearInterval(this.timer);
    this.emit();
  }

  /** Chamar na inicialização: conclui o login se voltamos do Spotify com ?code=. */
  async init() {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    const err = params.get('error');
    if (code || err) history.replaceState(null, '', this.redirectUri);
    if (err) this.error = `Spotify recusou o login: ${err}`;
    if (code) {
      try {
        await this.tokenRequest({
          grant_type: 'authorization_code', code, redirect_uri: this.redirectUri,
          client_id: this.clientId, code_verifier: sessionStorage.getItem(K_VERIFIER) ?? '',
        });
      } catch (e: any) {
        this.error = e.message;
      }
    }
    if (this.token) this.startPolling();
    this.emit();
  }

  private async tokenRequest(body: Record<string, string>) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(`Spotify: ${j.error_description ?? j.error ?? res.status}`);
    this.token = {
      access: j.access_token,
      refresh: j.refresh_token ?? this.token?.refresh ?? '',
      expires: Date.now() + (j.expires_in - 60) * 1000,
    };
    localStorage.setItem(K_TOKEN, JSON.stringify(this.token));
  }

  private async api(path: string, init: RequestInit = {}, retry = true): Promise<any> {
    if (!this.token) throw new Error('Spotify não conectado');
    if (Date.now() > this.token.expires) {
      await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: this.token.refresh, client_id: this.clientId });
    }
    const res = await fetch(API + path, { ...init, headers: { Authorization: `Bearer ${this.token.access}`, ...(init.headers ?? {}) } });
    if (res.status === 401 && retry && this.token.refresh) {
      this.token.expires = 0;
      return this.api(path, init, false);
    }
    if (res.status === 204) return null;
    if (res.status === 403) throw new Error('O Spotify só permite controlar a reprodução com conta Premium.');
    if (!res.ok) throw new Error(`Spotify ${res.status}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  private startPolling() {
    window.clearInterval(this.timer);
    this.poll();
    this.timer = window.setInterval(() => this.poll(), 3000);
  }

  private async poll() {
    try {
      const j = await this.api('/me/player/currently-playing');
      const item = j?.item;
      this.track = item ? {
        id: item.id,
        name: item.name,
        artists: (item.artists ?? []).map((a: any) => a.name).join(', '),
        album: item.album?.name ?? '',
        art: item.album?.images?.[0]?.url ?? null,
        progressMs: j.progress_ms ?? 0,
        durationMs: item.duration_ms ?? 0,
        playing: !!j.is_playing,
        fetchedAt: Date.now(),
      } : null;
      this.error = null;
    } catch (e: any) {
      this.error = e.message;
      if (String(e.message).includes('invalid')) this.logout();
    }
    this.emit();
  }

  async control(action: 'play' | 'pause' | 'next' | 'previous') {
    const method = action === 'play' || action === 'pause' ? 'PUT' : 'POST';
    await this.api(`/me/player/${action}`, { method });
    setTimeout(() => this.poll(), 400);
  }
}

export const spotify = new SpotifyService();
