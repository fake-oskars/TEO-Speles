import React from 'react';
import type { Item } from '../types';
import { INK, PAL } from './art';

// Shared pieces of the paper cut-out look used across the games.

// Every item (and the extra scenery) has a paper cut-out picture in public/assets/items/
export const itemImage = (name: string) => `/assets/items/${name.toLowerCase().replace(/\s+/g, '-')}.webp`;

export const ItemArt: React.FC<{ name: string; size: number | string; className?: string; style?: React.CSSProperties }> = ({ name, size, className, style }) => (
  <img
    src={itemImage(name)}
    alt=""
    draggable={false}
    className={className}
    style={{ width: size, height: size, objectFit: 'contain', filter: 'drop-shadow(0 4px 4px rgba(45,36,64,0.28))', ...style }}
  />
);

// Each item's colour family picks a sheet of coloured paper for the background,
// and a deeper shade of it for word strips
const TONES: Record<string, { paper: string; deep: string }> = {
  sky: { paper: '#a9cfec', deep: PAL.sea },
  blue: { paper: '#a9cfec', deep: PAL.sea },
  cyan: { paper: '#a5d8dc', deep: PAL.teal },
  teal: { paper: '#a5d8dc', deep: PAL.teal },
  pink: { paper: '#f3bccb', deep: PAL.pink },
  red: { paper: '#f4bcae', deep: PAL.tomato },
  rose: { paper: '#f3bccb', deep: PAL.pink },
  green: { paper: '#b6dcb8', deep: PAL.leaf },
  lime: { paper: '#c9e2a6', deep: PAL.leaf },
  emerald: { paper: '#b6dcb8', deep: PAL.leaf },
  yellow: { paper: '#f6dc94', deep: PAL.sunShade },
  amber: { paper: '#f5d29a', deep: PAL.sunShade },
  orange: { paper: '#f6c7a0', deep: PAL.tomato },
  purple: { paper: '#cebded', deep: PAL.grape },
  violet: { paper: '#cebded', deep: PAL.grape },
  slate: { paper: '#d8d3cc', deep: '#6b6478' },
  gray: { paper: '#d8d3cc', deep: '#6b6478' },
};

export const toneFor = (item: Item) => {
  const family = item.color.match(/bg-([a-z]+)-/)?.[1] ?? 'sky';
  return TONES[family] ?? TONES.sky;
};

// --- Icons, drawn to match the paper look ---

export const SpeakerIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9.5 H7.5 L12 5.5 V18.5 L7.5 14.5 H4 Z" fill={PAL.sun} />
    <path d="M15.5 9 Q17.5 12 15.5 15 M18 6.5 Q22 12 18 17.5" />
  </svg>
);

export const GearIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke={INK} strokeWidth="2.2" strokeLinejoin="round">
    <path d="M18.96 10.15 L21.46 10.38 L21.46 13.62 L18.96 13.85 L18.23 15.61 L19.84 17.54 L17.54 19.84 L15.61 18.23 L13.85 18.96 L13.62 21.46 L10.38 21.46 L10.15 18.96 L8.39 18.23 L6.46 19.84 L4.16 17.54 L5.77 15.61 L5.04 13.85 L2.54 13.62 L2.54 10.38 L5.04 10.15 L5.77 8.39 L4.16 6.46 L6.46 4.16 L8.39 5.77 L10.15 5.04 L10.38 2.54 L13.62 2.54 L13.85 5.04 L15.61 5.77 L17.54 4.16 L19.84 6.46 L18.23 8.39 Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

// A star cut from yellow paper (or an empty cream one, still to be earned)
export const PaperStar: React.FC<{ filled: boolean; className?: string }> = ({ filled, className }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <path
      d="M12 2.6 L14.7 8.6 L21.2 9.2 L16.3 13.5 L17.8 19.9 L12 16.5 L6.2 19.9 L7.7 13.5 L2.8 9.2 L9.3 8.6 Z"
      fill={filled ? PAL.sun : '#eadcc5'}
      stroke={filled ? PAL.sunShade : '#d9c8ab'}
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);

// Round cream paper dots drifting in the background, as on the menu cards
const BUBBLES = Array.from({ length: 10 }, (_, i) => ({
  left: (i * 37) % 100,
  top: (i * 29) % 90,
  size: 26 + ((i * 53) % 80),
  duration: 4.5 + ((i * 7) % 8) / 2,
  delay: -((i * 3) % 10),
}));

export const PaperBubbles: React.FC = () => (
  <div className="absolute inset-0 pointer-events-none">
    {BUBBLES.map((b, i) => (
      <span
        key={i}
        className="absolute rounded-full floaty paper-dot"
        style={{ left: `${b.left}%`, top: `${b.top}%`, width: b.size, height: b.size, animationDuration: `${b.duration}s`, animationDelay: `${b.delay}s` }}
      />
    ))}
  </div>
);

export const FlagIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} strokeLinejoin="round" strokeLinecap="round">
    <path d="M6 21 V3.5" stroke={INK} strokeWidth="2.2" />
    <path d="M6.5 4 H18 L15.5 8 L18 12 H6.5 Z" fill={PAL.tomato} stroke={INK} strokeWidth="1.6" />
  </svg>
);

export const BasketIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} strokeLinejoin="round" strokeLinecap="round">
    <path d="M7 10 Q12 1.5 17 10" fill="none" stroke={PAL.woodShade} strokeWidth="2.2" />
    <path d="M3 10 H21 L19 20 Q18.8 21 17.8 21 H6.2 Q5.2 21 5 20 Z" fill={PAL.wood} stroke={PAL.woodShade} strokeWidth="1.4" />
    <path d="M4 13.5 H20 M4.6 17 H19.4 M9 10.5 L9.6 21 M15 10.5 L14.4 21" stroke={PAL.woodShade} strokeWidth="1.2" />
  </svg>
);

export const HornIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} strokeLinejoin="round" strokeLinecap="round">
    <path d="M3 10 H7 L17 4 V20 L7 14 H3 Z" fill="#fffaf0" stroke={INK} strokeWidth="1.8" />
    <path d="M19.5 9 Q21 12 19.5 15" fill="none" stroke={INK} strokeWidth="1.8" />
  </svg>
);

export const BrushIcon: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => (
  <svg viewBox="0 0 24 24" className={className} style={style} strokeLinejoin="round" strokeLinecap="round">
    <path d="M14.5 9.5 L20.5 3.5" stroke={PAL.tomatoShade} strokeWidth="3.4" />
    <path d="M14.5 9.5 L20.5 3.5" stroke={PAL.tomato} strokeWidth="2" />
    <path d="M12.6 9.2 L14.8 11.4 L13.6 12.6 L11.4 10.4 Z" fill="#c9c3d6" stroke={INK} strokeWidth="1" />
    <path d="M11.4 10.4 L13.6 12.6 Q13.4 17 8.5 19.5 Q5 21 3.5 20.5 Q5.5 18.5 6 15.5 Q7 11.5 11.4 10.4 Z" fill={PAL.sea} stroke={INK} strokeWidth="1.2" />
  </svg>
);

export const PicturesIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} strokeLinejoin="round">
    <rect x="3" y="3" width="8" height="8" rx="2" fill={PAL.sun} stroke={INK} strokeWidth="1.8" />
    <rect x="13" y="3" width="8" height="8" rx="2" fill={PAL.pink} stroke={INK} strokeWidth="1.8" />
    <rect x="3" y="13" width="8" height="8" rx="2" fill={PAL.leaf} stroke={INK} strokeWidth="1.8" />
    <rect x="13" y="13" width="8" height="8" rx="2" fill={PAL.sea} stroke={INK} strokeWidth="1.8" />
  </svg>
);

// A sponge, for wiping the page clean
export const ClearIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} strokeLinejoin="round" strokeLinecap="round">
    <rect x="3" y="7" width="18" height="11" rx="3" fill={PAL.sun} stroke={INK} strokeWidth="1.8" />
    <path d="M3 14 H21" stroke={INK} strokeWidth="1.4" />
    <path d="M3.9 14.9 H20.1 V15 Q20.1 17.1 18 17.1 H6 Q3.9 17.1 3.9 15 Z" fill={PAL.leaf} />
    <circle cx="8" cy="10.5" r="1" fill={PAL.sunShade} /><circle cx="13" cy="9.6" r="0.9" fill={PAL.sunShade} /><circle cx="17" cy="11" r="1.1" fill={PAL.sunShade} />
  </svg>
);

export const NextIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12 H19 M13 6 L19 12 L13 18" />
  </svg>
);
