export interface StickerAsset {
  id: string;
  name: string;
  type: 'svg' | 'retro-alert' | 'stamp';
  color: string;
  markup?: string; // Inline SVG markup
  badgeText?: string;
  subText?: string;
}

export const BRUTALIST_STICKERS: StickerAsset[] = [
  {
    id: 'sticker_barcode',
    name: 'BARCODE SYSTEM // 001',
    type: 'svg',
    color: '#ffffff',
    markup: `<svg viewBox="0 0 100 40" fill="currentColor" class="w-full h-full">
      <rect x="0" y="0" width="4" height="40"/>
      <rect x="6" y="0" width="2" height="40"/>
      <rect x="10" y="0" width="8" height="40"/>
      <rect x="20" y="0" width="1" height="40"/>
      <rect x="23" y="0" width="4" height="40"/>
      <rect x="30" y="0" width="6" height="40"/>
      <rect x="38" y="0" width="2" height="40"/>
      <rect x="42" y="0" width="10" height="40"/>
      <rect x="54" y="0" width="1" height="40"/>
      <rect x="57" y="0" width="5" height="40"/>
      <rect x="64" y="0" width="8" height="40"/>
      <rect x="74" y="0" width="2" height="40"/>
      <rect x="78" y="0" width="6" height="40"/>
      <rect x="86" y="0" width="3" height="40"/>
      <rect x="91" y="0" width="1" height="40"/>
      <rect x="94" y="0" width="6" height="40"/>
      <text x="50" y="38" font-family="monospace" font-size="5" fill="black" text-anchor="middle" font-weight="bold">CORRUPTED_ID_09X</text>
    </svg>`
  },
  {
    id: 'sticker_smiley',
    name: 'GLITCHED SMILE',
    type: 'svg',
    color: '#eab308', // Tailwind yellow-500
    markup: `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="4" class="w-full h-full">
      <circle cx="50" cy="50" r="45" fill="currentColor" fill-opacity="0.1" />
      <g stroke-width="6">
        <line x1="30" y1="35" x2="30" y2="45" />
        <line x1="70" y1="35" x2="70" y2="45" />
        <line x1="26" y1="38" x2="34" y2="38" />
        <line x1="66" y1="38" x2="74" y2="38" />
      </g>
      <path d="M25,65 Q50,90 75,65" stroke-width="6" fill="none" />
      <line x1="10" y1="50" x2="90" y2="50" stroke="currentColor" stroke-dasharray="5,5" stroke-width="2" />
    </svg>`
  },
  {
    id: 'sticker_caution',
    name: 'CAUTION // MESH STRIP',
    type: 'svg',
    color: '#eab308',
    markup: `<svg viewBox="0 0 150 30" fill="currentColor" class="w-full h-full">
      <rect width="150" height="30" fill="#000000" />
      <g fill="#eab308">
        <polygon points="0,0 20,0 0,20" />
        <polygon points="20,0 50,0 20,30 0,30" />
        <polygon points="50,0 80,0 50,30 20,30" />
        <polygon points="80,0 110,0 80,30 50,30" />
        <polygon points="110,0 140,0 110,30 80,30" />
        <polygon points="140,0 150,0 150,10 140,30 110,30" />
        <polygon points="150,10 150,30 140,30" />
      </g>
      <text x="75" y="19" font-family="'Courier New', monospace" font-size="10" fill="black" font-weight="900" text-anchor="middle">SYSTEM_CRITICAL_DO_NOT_REBOOT</text>
    </svg>`
  },
  {
    id: 'sticker_heavy_star',
    name: '8-POINT RETRO STAR',
    type: 'svg',
    color: '#fb7185', // Rose-400
    markup: `<svg viewBox="0 0 100 100" fill="currentColor" class="w-full h-full">
      <path d="M50 0 L55 35 L90 10 L65 45 L100 50 L65 55 L90 90 L55 65 L50 100 L45 65 L10 90 L35 55 L0 50 L35 45 L10 10 L45 35 Z" />
    </svg>`
  },
  {
    id: 'sticker_safety_warning',
    name: 'SYS_TEMP HOT BADGE',
    type: 'retro-alert',
    color: '#f43f5e',
    badgeText: 'CORE OVERLOAD',
    subText: 'THERMAL_THROTTLING_ACTIVE 99°C'
  },
  {
    id: 'sticker_ok_badge',
    name: 'NEO APPROVED SEAL',
    type: 'retro-alert',
    color: '#22c55e',
    badgeText: '✓ NEO_APPROVED',
    subText: 'STABLE_DECENTRALIZED'
  },
  {
    id: 'sticker_parental',
    name: 'PARENTAL ADVISORY',
    type: 'svg',
    color: '#ffffff',
    markup: `<svg viewBox="0 0 100 65" fill="black" class="w-full h-full">
      <rect width="100" height="65" fill="white" />
      <rect x="3" y="3" width="94" height="59" fill="black" />
      <rect x="5" y="5" width="90" height="55" fill="white" />
      <text x="50" y="24" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="black" font-weight="bold" text-anchor="middle" letter-spacing="1">PARENTAL</text>
      <text x="50" y="38" font-family="Arial, Helvetica, sans-serif" font-size="13" fill="black" font-weight="900" text-anchor="middle" letter-spacing="2.5">ADVISORY</text>
      <rect x="5" y="44" width="90" height="13" fill="black" />
      <text x="50" y="53" font-family="Arial, Helvetica, sans-serif" font-size="7.5" fill="white" font-weight="bold" text-anchor="middle" letter-spacing="0.8">EXPLICIT GLITCH ART</text>
    </svg>`
  }
];
