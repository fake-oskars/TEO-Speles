import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ALL_ITEMS } from '../constants';
import {
  playBoing, playCollect, playDing, playFanfare, playHorn, playSound, playEngineRev, playUIClick, type HornKind,
} from '../services/audioService';
import { say as sayClip } from '../services/speechService';
import { ARRIVE_CLIP, lightClip, nameClip } from '../speech/phrases';
import { trackInteraction } from '../services/analyticsService';
import type { Item } from '../types';
import { ConfettiRain, HomeButton } from '../components/ui';
import { BasketIcon, FlagIcon, HornIcon, ItemArt, itemImage } from '../components/paper';

// "Braucam!" — a no-fail driving game for ~3 year olds.
// The vehicle drives by itself. Tap anywhere to hop and catch floating goodies,
// tap the traffic light to make it green, tap (or honk at) animals on the crossing,
// and every trip ends at a destination with a celebration and new scenery.
//
// World units: 1u = S pixels, where S is the "scene size" derived from the screen.

// --- Vehicles ---

interface Vehicle { emoji: string; name: string; horn: HornKind; flasher?: boolean; }

const VEHICLES: Vehicle[] = [
  { emoji: '🚗', name: 'Car', horn: 'car' },
  { emoji: '🚕', name: 'Taxi', horn: 'car' },
  { emoji: '🏎️', name: 'Race Car', horn: 'car' },
  { emoji: '🚌', name: 'Bus', horn: 'truck' },
  { emoji: '🚚', name: 'Truck', horn: 'truck' },
  { emoji: '🚜', name: 'Tractor', horn: 'tractor' },
  { emoji: '🚓', name: 'Police Car', horn: 'siren', flasher: true },
  { emoji: '🚑', name: 'Ambulance', horn: 'siren', flasher: true },
  { emoji: '🚒', name: 'Fire Truck', horn: 'siren', flasher: true },
];

// --- Scenery themes (one per trip) ---

interface Theme {
  sky: [string, string];
  ground: 'hills' | 'skyline' | 'sea';
  far: string;
  near: string;
  grassFar: string;
  grassNear: string;
  road: string;
  roadEdge: string;
  lane: string;
  back: string[];
  front: string[];
  frontScale: number;
  flowers: string[];
  items: string[];
  animals: string[];
  destination: string;
  sky_body: 'sun' | 'moon' | 'sunset';
  stars?: boolean;
  snow?: boolean;
  headlights?: boolean;
  puff: string;
}

const THEMES: Theme[] = [
  {
    // Countryside
    sky: ['#4fb8f5', '#d9f2ff'], ground: 'hills', far: '#a5e4b8', near: '#6fd08c',
    grassFar: '#86dc8f', grassNear: '#55c46e', road: '#5b6070', roadEdge: '#f8fafc', lane: '#fde047',
    back: ['🌳', '🌲', '🌳', '🏡', '🌲'], front: ['🌳', '🌻', '🏡', '🐄', '🌲', '🐑', '🌻', '🌳'], frontScale: 1,
    flowers: ['🌷', '🌼', '🌱', '🍄'],
    items: ['Apple', 'Carrot', 'Strawberry', 'Corn', 'Egg', 'Star', 'Cherry', 'Flower'],
    animals: ['Cow', 'Sheep', 'Pig', 'Chicken', 'Horse', 'Duck'],
    destination: '🏡', sky_body: 'sun', puff: 'rgba(255,255,255,0.75)',
  },
  {
    // Town
    sky: ['#6aa8f0', '#e6f0ff'], ground: 'skyline', far: '#b7c4de', near: '#9aaacb',
    grassFar: '#9fdf9d', grassNear: '#cbd5e1', road: '#4b5160', roadEdge: '#ffffff', lane: '#ffffff',
    back: ['🌳', '🌳', '🌳'], front: ['🏢', '🏬', '🌳', '🏫', '🏥', '🌳', '🏨', '🏦'], frontScale: 1.5,
    flowers: ['🌷', '🌼', '🌱'],
    items: ['Balloon', 'Ice Cream', 'Donut', 'Gift', 'Ball', 'Star', 'Lollipop', 'Cookie'],
    animals: ['Dog', 'Cat', 'Duck', 'Mouse'],
    destination: '🎪', sky_body: 'sun', puff: 'rgba(255,255,255,0.75)',
  },
  {
    // Beach at sunset
    sky: ['#f97361', '#fde68a'], ground: 'sea', far: '#38bdf8', near: '#0ea5e9',
    grassFar: '#fde68a', grassNear: '#fcd34d', road: '#57534e', roadEdge: '#fef3c7', lane: '#ffffff',
    back: ['⛵', '⛵', '🚢'], front: ['🌴', '⛱️', '🌴', '🐚', '🌴', '🦀'], frontScale: 1.1,
    flowers: ['🐚', '🦀', '⭐'],
    items: ['Shell', 'Watermelon', 'Ice Cream', 'Orange', 'Banana', 'Star', 'Fish'],
    animals: ['Turtle', 'Duck', 'Frog'],
    destination: '🏖️', sky_body: 'sunset', puff: 'rgba(255,255,255,0.7)',
  },
  {
    // Night
    sky: ['#0b1437', '#3b3a8f'], ground: 'hills', far: '#2e2a6e', near: '#1f3b5c',
    grassFar: '#1c5e3a', grassNear: '#164e30', road: '#343a46', roadEdge: '#cbd5e1', lane: '#fde047',
    back: ['🌲', '🌲', '🏠', '🌲'], front: ['🌲', '🏡', '🌲', '🦉', '🌲', '🏠'], frontScale: 1,
    flowers: ['🍄', '🌱'],
    items: ['Star', 'Moon', 'Heart', 'Gift', 'Crown', 'Key', 'Balloon'],
    animals: ['Rabbit', 'Cat', 'Mouse', 'Bear'],
    destination: '🏰', sky_body: 'moon', stars: true, headlights: true, puff: 'rgba(203,213,225,0.5)',
  },
  {
    // Winter
    sky: ['#9fb3cc', '#f1f5f9'], ground: 'hills', far: '#e2e8f0', near: '#f8fafc',
    grassFar: '#f1f5f9', grassNear: '#e8eef5', road: '#5f6b7d', roadEdge: '#ffffff', lane: '#fde047',
    back: ['🌲', '🌲', '🌲', '🏔️'], front: ['🌲', '☃️', '🌲', '🏠', '🌲', '⛄'], frontScale: 1,
    flowers: ['❄️', '🌲'],
    items: ['Snowflake', 'Gift', 'Cookie', 'Star', 'Heart', 'Hat'],
    animals: ['Penguin', 'Rabbit', 'Bear'],
    destination: '🎄', sky_body: 'sun', snow: true, puff: 'rgba(255,255,255,0.8)',
  },
];

// --- Tuning (in world units / seconds) ---

const ROUTE_LENGTH = 22;
const GRAVITY = 3.4;
const JUMP_HEIGHT = 0.32;
const CAR_CENTER = 0.092;   // car centre height above the road
const GROUND_ITEM_H = 0.095;
const AIR_ITEM_H = 0.37;
const BRAKE = 0.7;
const ACCEL = 0.45;
const AUTO_GO_AFTER = 9;    // seconds before a waiting light/animal clears itself
const HINT_AFTER = 1.2;

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

// --- Helpers ---

const itemByName = (name: string): Item | undefined => ALL_ITEMS.find(i => i.name === name);
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const mod = (a: number, b: number) => ((a % b) + b) % b;
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Paper cut-out pictures replace the emoji wherever there is one (public/assets/items/)
const SCENERY_ART: Record<string, string> = {
  '🌳': 'tree', '🌲': 'pine', '🏡': 'house', '🏠': 'house', '🌻': 'flower', '🌷': 'tulip', '🌼': 'daisy', '🌱': 'sprout',
  '🍄': 'mushroom', '🏢': 'building', '🏬': 'shop', '🏫': 'school', '🏥': 'hospital', '🏨': 'building', '🏦': 'building',
  '⛵': 'boat', '🚢': 'ship', '🌴': 'palm', '⛱️': 'beach-umbrella', '🐚': 'shell', '🦀': 'crab', '⭐': 'star',
  '🦉': 'owl', '🏔️': 'mountain', '☃️': 'snowman', '⛄': 'snowman', '❄️': 'snowflake', '🌙': 'moon', '☁️': 'cloud',
  '🎪': 'circus', '🏖️': 'beach-umbrella', '🏰': 'castle', '🎄': 'christmas-tree', '🐄': 'cow', '🐑': 'sheep',
};
const artFor = (emoji: string): string | undefined =>
  SCENERY_ART[emoji] ?? ALL_ITEMS.find(i => i.emoji === emoji)?.name ?? VEHICLES.find(v => v.emoji === emoji)?.name;

const artCache = new Map<string, HTMLImageElement>();
const paperArt = (emoji: string): HTMLImageElement | null => {
  const name = artFor(emoji);
  if (!name) return null;
  let img = artCache.get(name);
  if (!img) {
    img = new Image();
    img.src = itemImage(name);
    artCache.set(name, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
};

const spriteCache = new Map<string, HTMLCanvasElement>();
const sprite = (emoji: string, px: number): HTMLCanvasElement => {
  const key = `${emoji}@${px}`;
  let c = spriteCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = px;
    const g = c.getContext('2d')!;
    g.font = `${Math.round(px * 0.78)}px ${EMOJI_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(emoji, px / 2, px * 0.54);
    spriteCache.set(key, c);
  }
  return c;
};

interface DrawOpts { flip?: boolean; rot?: number; alpha?: number; sx?: number; sy?: number; }

// Draws a thing centred at (x, y), about `size` big: its paper picture once loaded,
// the emoji until then.
const drawEmoji = (ctx: CanvasRenderingContext2D, emoji: string, x: number, y: number, size: number, o: DrawOpts = {}) => {
  const art = paperArt(emoji);
  ctx.save();
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  ctx.scale((o.flip ? -1 : 1) * (o.sx ?? 1), o.sy ?? 1);
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  if (art) {
    const k = (size * 1.05) / Math.max(art.naturalWidth, art.naturalHeight);
    const w = art.naturalWidth * k;
    const h = art.naturalHeight * k;
    // Sit the picture on the same baseline the emoji used
    ctx.drawImage(art, -w / 2, size * 0.5 - h, w, h);
  } else {
    const res = size * (window.devicePixelRatio || 1) > 170 ? 384 : 160;
    const box = size / 0.78;
    ctx.drawImage(sprite(emoji, res), -box / 2, -box / 2, box, box);
  }
  ctx.restore();
};

// A pulsing paper ring that says "tap here"
const drawTapRing = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, time: number) => {
  const k = (time * 1.2) % 1;
  ctx.save();
  ctx.globalAlpha = 0.9 * (1 - k);
  ctx.strokeStyle = '#fffaf0';
  ctx.lineWidth = Math.max(3, r * 0.14);
  ctx.beginPath();
  ctx.arc(x, y, r * (0.7 + 0.5 * k), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

// --- World objects ---

interface Goodie { x: number; h: number; item: Item; taken: boolean; t: number; }
interface Light { x: number; state: 'red' | 'yellow' | 'green'; t: number; wait: number; announced: boolean; hit?: { x: number; y: number; w: number; h: number }; }
interface Animal { x: number; item: Item; state: 'waiting' | 'entering' | 'blocking' | 'leaving' | 'gone'; p: number; t: number; wait: number; hit?: { x: number; y: number; r: number }; }
interface Particle { x: number; h: number; vx: number; vh: number; life: number; r: number; color: string; }
interface Route { themeIdx: number; goodies: Goodie[]; lights: Light[]; animals: Animal[]; stopX: number; bag: string[]; }

interface Layout { W: number; H: number; S: number; roadTop: number; roadBottom: number; roadH: number; laneY: number; horizon: number; carX: number; }

const computeLayout = (W: number, H: number): Layout => {
  // Portrait phones get a bigger scene (less sky, larger car)
  const S = W < H ? Math.min(H * 0.55, W * 1.15) : Math.min(H, W * 0.9);
  const roadBottom = H - Math.max(H * 0.12, 64);
  const roadH = S * 0.26;
  const roadTop = roadBottom - roadH;
  return {
    W, H, S, roadTop, roadBottom, roadH,
    laneY: roadTop + roadH * 0.72,
    horizon: roadTop - S * 0.07,
    carX: Math.max(W * 0.2, S * 0.2),
  };
};

const buildRoute = (themeIdx: number): Route => {
  const theme = THEMES[themeIdx % THEMES.length];
  const kinds: ('light' | 'animal')[] = ['light', 'animal', Math.random() < 0.5 ? 'light' : 'animal'].sort(() => Math.random() - 0.5) as ('light' | 'animal')[];
  const eventXs = [0.27, 0.52, 0.77].map(f => ROUTE_LENGTH * f);
  const lights: Light[] = [];
  const animals: Animal[] = [];
  kinds.forEach((kind, i) => {
    if (kind === 'light') {
      lights.push({ x: eventXs[i], state: 'red', t: 0, wait: 0, announced: false });
    } else {
      const item = itemByName(pick(theme.animals)) || ALL_ITEMS[0];
      animals.push({ x: eventXs[i], item, state: 'waiting', p: 0, t: 0, wait: 0 });
    }
  });

  const itemPool = theme.items.map(itemByName).filter(Boolean) as Item[];
  const goodies: Goodie[] = [];
  let x = 1.3;
  let n = 0;
  while (x < ROUTE_LENGTH - 1.2) {
    const nearEvent = eventXs.some(ex => x > ex - 1.0 && x < ex + 0.5);
    if (!nearEvent) {
      const air = n >= 2 && Math.random() < 0.4;
      goodies.push({ x, h: air ? AIR_ITEM_H : GROUND_ITEM_H, item: pick(itemPool), taken: false, t: 0 });
      n++;
    }
    x += 0.85 + Math.random() * 0.6;
  }
  return { themeIdx, goodies, lights, animals, stopX: ROUTE_LENGTH, bag: [] };
};

// --- Scene drawing ---

const STARS = Array.from({ length: 70 }, (_, i) => ({ x: hash(i + 1), y: hash(i + 101) * 0.55, s: 0.6 + hash(i + 201) * 1.6, p: hash(i + 301) * 6 }));

const drawSky = (ctx: CanvasRenderingContext2D, L: Layout, th: Theme, camX: number, time: number) => {
  const g = ctx.createLinearGradient(0, 0, 0, L.roadTop);
  g.addColorStop(0, th.sky[0]);
  g.addColorStop(1, th.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.W, L.roadTop + 2);

  if (th.stars) {
    ctx.fillStyle = '#fff';
    STARS.forEach(s => {
      ctx.globalAlpha = 0.45 + 0.45 * Math.sin(time * 2 + s.p);
      ctx.beginPath();
      ctx.arc(s.x * L.W, s.y * L.horizon, s.s, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  if (th.sky_body === 'sun') {
    const x = L.W * 0.84, y = L.H * 0.12 + 20, r = L.S * 0.07;
    ctx.fillStyle = 'rgba(253, 224, 71, 0.3)';
    ctx.beginPath(); ctx.arc(x, y, r * (1.5 + 0.08 * Math.sin(time * 2)), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  } else if (th.sky_body === 'sunset') {
    const x = L.W * 0.7, y = L.horizon - L.S * 0.12, r = L.S * 0.14;
    const sg = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 2.2);
    sg.addColorStop(0, 'rgba(255, 237, 160, 0.9)');
    sg.addColorStop(1, 'rgba(255, 237, 160, 0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fb923c';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  } else {
    drawEmoji(ctx, '🌙', L.W * 0.82, L.H * 0.12 + 24, L.S * 0.13);
  }

  // Clouds drift slowly on their own and a little with the car
  const cloudCount = th.stars ? 2 : 5;
  const span = L.W + L.S * 0.6;
  for (let i = 0; i < cloudCount; i++) {
    const size = L.S * (0.11 + hash(i + 7) * 0.09);
    const x = mod(hash(i + 3) * span - camX * L.S * 0.06 - time * L.S * 0.015 * (1 + hash(i)), span) - L.S * 0.3;
    const y = L.H * 0.06 + hash(i + 11) * (L.horizon - L.S * 0.35 - L.H * 0.06);
    drawEmoji(ctx, '☁️', x, Math.max(y, 30), size, { alpha: th.stars ? 0.35 : 0.95 });
  }
};

const drawHills = (ctx: CanvasRenderingContext2D, L: Layout, camX: number, factor: number, color: string, base: number, amp: number, seed: number) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, L.roadTop);
  for (let sx = 0; sx <= L.W + 12; sx += 12) {
    const wx = (sx + camX * factor * L.S) / L.S;
    const h = amp * (0.55 + 0.3 * Math.sin(wx * 1.3 + seed) + 0.15 * Math.sin(wx * 3.1 + seed * 2));
    ctx.lineTo(sx, base - h * L.S);
  }
  ctx.lineTo(L.W, L.roadTop);
  ctx.closePath();
  ctx.fill();
};

const drawSkyline = (ctx: CanvasRenderingContext2D, L: Layout, camX: number, factor: number, color: string, base: number, seed: number, tall: number) => {
  const w = L.S * 0.17;
  const off = camX * factor * L.S;
  const k0 = Math.floor(off / w) - 1;
  const k1 = Math.ceil((off + L.W) / w) + 1;
  for (let k = k0; k <= k1; k++) {
    const x = k * w - off;
    const h = (0.12 + tall * hash(k + seed)) * L.S;
    ctx.fillStyle = color;
    ctx.fillRect(x, base - h, w * 0.86, h + 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    const win = L.S * 0.022;
    for (let wy = base - h + win; wy < base - win * 2; wy += win * 2.2) {
      for (let wx = x + win * 0.8; wx < x + w * 0.86 - win; wx += win * 2) {
        if (hash(k * 31 + wy * 0.7 + wx) > 0.45) ctx.fillRect(wx, wy, win, win * 1.2);
      }
    }
  }
};

const drawSea = (ctx: CanvasRenderingContext2D, L: Layout, th: Theme, camX: number, time: number) => {
  const top = L.horizon - L.S * 0.13;
  ctx.fillStyle = th.far;
  ctx.fillRect(0, top, L.W, L.roadTop - top);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = Math.max(2, L.S * 0.006);
  for (let row = 0; row < 3; row++) {
    const y = top + L.S * (0.03 + row * 0.035);
    const period = L.S * 0.16;
    const off = mod(camX * L.S * (0.1 + row * 0.05) + time * 12 * (row + 1), period);
    for (let x = -off; x < L.W; x += period) {
      ctx.beginPath();
      ctx.arc(x + period / 2, y, period * 0.18, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
  }
};

// Two rows of emoji scenery: small far away, bigger right behind the road
const drawSceneryRow = (
  ctx: CanvasRenderingContext2D, L: Layout, camX: number, list: string[], factor: number,
  spacing: number, fill: number, baseY: number, minSize: number, sizeVar: number, seed: number,
) => {
  if (list.length === 0) return;
  const off = camX * factor;
  const k0 = Math.floor((off - 0.5) / spacing);
  const k1 = Math.ceil((off + L.W / L.S + 0.5) / spacing);
  for (let k = k0; k <= k1; k++) {
    if (hash(k + seed) > fill) continue;
    const emoji = list[Math.floor(hash(k * 3 + seed) * list.length)];
    const size = (minSize + sizeVar * hash(k * 7 + seed)) * L.S;
    const x = (k * spacing + hash(k * 13 + seed) * spacing * 0.4 - off) * L.S;
    drawEmoji(ctx, emoji, x, baseY - size * 0.45, size);
  }
};

const drawRoad = (ctx: CanvasRenderingContext2D, L: Layout, th: Theme, camX: number) => {
  ctx.fillStyle = th.road;
  ctx.fillRect(0, L.roadTop, L.W, L.roadH);
  const edge = Math.max(3, L.S * 0.02);
  ctx.fillStyle = th.roadEdge;
  ctx.fillRect(0, L.roadTop, L.W, edge);
  ctx.fillRect(0, L.roadBottom - edge, L.W, edge);
  ctx.fillStyle = th.lane;
  const period = L.S * 0.3;
  const dash = L.S * 0.15;
  const h = Math.max(3, L.S * 0.018);
  const y = L.roadTop + L.roadH * 0.4;
  for (let x = -mod(camX * L.S, period); x < L.W; x += period) {
    ctx.fillRect(x, y, dash, h);
  }
  ctx.fillStyle = th.grassNear;
  ctx.fillRect(0, L.roadBottom, L.W, L.H - L.roadBottom);
};

// --- Component ---

interface DriveGameProps {
  t: (key: string) => string;
  onBack: () => void;
  language: string;
}

const DriveGame: React.FC<DriveGameProps> = ({ t, onBack, language }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressCarRef = useRef<HTMLSpanElement>(null);
  const langRef = useRef(language);
  langRef.current = language;

  const [picking, setPicking] = useState(true);
  const [vehicle, setVehicle] = useState<Vehicle>(VEHICLES[0]);
  const [count, setCount] = useState(0);
  const [themeIdx, setThemeIdx] = useState(0);
  const [celebration, setCelebration] = useState<{ dest: string; bag: string[] } | null>(null);
  const [fading, setFading] = useState(false);
  const [jumpHint, setJumpHint] = useState(false);

  // All per-frame game state lives in a ref so the loop never waits on React
  const game = useRef({
    started: false,
    celebrating: false,
    vehicle: VEHICLES[0],
    route: buildRoute(0),
    carX: 0,
    speed: 0,
    jy: 0,
    vy: 0,
    squash: 0,
    hornT: 0,
    flashT: 0,
    lastHorn: 0,
    everJumped: false,
    puffT: 0,
    particles: [] as Particle[],
    snow: Array.from({ length: 80 }, () => ({ x: Math.random(), y: Math.random(), s: 1.5 + Math.random() * 3, v: 0.05 + Math.random() * 0.08 })),
    layout: computeLayout(window.innerWidth, window.innerHeight),
    time: 0,
    hintShown: false,
  });
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };

  const say = (clip: string) => sayClip(clip, langRef.current);

  // --- Actions ---

  const jump = useCallback(() => {
    const g = game.current;
    if (!g.started || g.celebrating || g.jy > 0.001) return;
    g.vy = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
    g.jy = 0.0011;
    g.everJumped = true;
    playBoing();
  }, []);

  const releaseAnimal = (a: Animal) => {
    if (a.state !== 'entering' && a.state !== 'blocking') return;
    a.state = 'leaving';
    a.t = 0;
    playSound(a.item.soundFrequency);
    say(nameClip(a.item.name));
    trackInteraction('drive_animal', { item: a.item.name });
  };

  const advanceLight = (l: Light) => {
    if (l.state !== 'red') return;
    l.state = 'yellow';
    l.t = 0;
    playDing();
    say(lightClip('yellow'));
    trackInteraction('drive_light', { item: 'light' });
  };

  const honk = useCallback(() => {
    const g = game.current;
    const now = performance.now();
    if (now - g.lastHorn < 350) return;
    g.lastHorn = now;
    playHorn(g.vehicle.horn);
    g.hornT = 0.6;
    if (g.vehicle.flasher) g.flashT = 1.6;
    trackInteraction('drive_horn', { item: g.vehicle.name });
    // Honking also shoos animals off the road
    g.route.animals.forEach(a => {
      if (a.x - g.carX < 1.2) releaseAnimal(a);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = game.current;
    if (!g.started) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    for (const l of g.route.lights) {
      const h = l.hit;
      if (h && l.state === 'red' && px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) {
        advanceLight(l);
        return;
      }
    }
    for (const a of g.route.animals) {
      const h = a.hit;
      if (h && (a.state === 'entering' || a.state === 'blocking') && Math.hypot(px - h.x, py - h.y) <= h.r) {
        releaseAnimal(a);
        return;
      }
    }
    jump();
  };

  const chooseVehicle = (v: Vehicle) => {
    const g = game.current;
    g.vehicle = v;
    g.started = true;
    setVehicle(v);
    setPicking(false);
    playHorn(v.horn);
    say(nameClip(v.name));
    trackInteraction('drive_vehicle', { item: v.name });
  };

  const openPicker = () => {
    playUIClick();
    game.current.started = false;
    setPicking(true);
  };

  const nextTrip = useCallback(() => {
    setFading(true);
    later(() => {
      const g = game.current;
      const idx = g.route.themeIdx + 1;
      g.route = buildRoute(idx);
      g.carX = 0;
      g.speed = 0;
      g.jy = 0;
      g.vy = 0;
      g.particles = [];
      g.celebrating = false;
      setThemeIdx(idx);
      setCelebration(null);
      setFading(false);
    }, 450);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Main loop ---

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    let hintState = false;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = canvas.clientWidth, H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      game.current.layout = computeLayout(W, H);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const burstAt = (x: number, h: number, colors: string[]) => {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        game.current.particles.push({
          x, h, vx: Math.cos(a) * 0.5, vh: Math.sin(a) * 0.5 + 0.2, life: 1, r: 0.012 + Math.random() * 0.01,
          color: colors[i % colors.length],
        });
      }
    };

    const update = (dt: number) => {
      const g = game.current;
      const L = g.layout;
      const r = g.route;
      const cruise = Math.min(0.6, (0.5 * L.W) / L.S);

      // What is the next thing the car must stop for?
      let stopAt = Infinity;
      r.lights.forEach(l => { if (l.state !== 'green' && g.carX <= l.x - 0.3 + 0.001) stopAt = Math.min(stopAt, l.x - 0.3); });
      r.animals.forEach(a => {
        const blocking = a.state === 'waiting' || a.state === 'entering' || a.state === 'blocking' || (a.state === 'leaving' && a.p < 0.72);
        if (blocking && g.carX <= a.x - 0.4 + 0.001) stopAt = Math.min(stopAt, a.x - 0.4);
      });
      stopAt = Math.min(stopAt, r.stopX);

      const dist = stopAt - g.carX;
      let target = g.started && !g.celebrating ? cruise : 0;
      target = Math.min(target, Math.sqrt(2 * BRAKE * Math.max(0, dist)));
      if (target < g.speed) g.speed = target;
      else g.speed = Math.min(target, g.speed + ACCEL * dt);
      g.carX = Math.min(g.carX + g.speed * dt, stopAt);
      const stopped = g.speed < 0.01 && dist < 0.02;

      // Jump physics
      if (g.jy > 0) {
        g.vy -= GRAVITY * dt;
        g.jy += g.vy * dt;
        if (g.jy <= 0) { g.jy = 0; g.vy = 0; g.squash = 1; }
      }
      g.squash = Math.max(0, g.squash - dt * 5);
      g.hornT = Math.max(0, g.hornT - dt);
      g.flashT = Math.max(0, g.flashT - dt);

      // Goodies
      r.goodies.forEach(gd => {
        if (gd.taken) { gd.t += dt; return; }
        const cy = g.jy + CAR_CENTER;
        if (Math.abs(gd.x - g.carX) < 0.13 && Math.abs(gd.h - cy) < 0.14) {
          gd.taken = true;
          gd.t = 0;
          r.bag.push(gd.item.name);
          setCount(c => c + 1);
          playCollect();
          say(nameClip(gd.item.name));
          burstAt(gd.x, gd.h, ['#facc15', '#f472b6', '#60a5fa', '#4ade80']);
          trackInteraction('drive_collect', { item: gd.item.name });
        }
      });

      // Traffic lights
      r.lights.forEach(l => {
        l.t += dt;
        if (l.state === 'red') {
          if (!l.announced && l.x - g.carX < 1.4) { l.announced = true; say(lightClip('red')); }
          if (stopped && Math.abs(stopAt - (l.x - 0.3)) < 0.001) {
            l.wait += dt;
            if (l.wait > AUTO_GO_AFTER) advanceLight(l);
          }
        } else if (l.state === 'yellow' && l.t > 0.9) {
          l.state = 'green';
          l.t = 0;
          playDing(true);
          playEngineRev();
          say(lightClip('green'));
        }
      });

      // Animals crossing
      r.animals.forEach(a => {
        a.t += dt;
        if (a.state === 'waiting' && a.x - g.carX < 2.0 && g.started) {
          a.state = 'entering';
          a.t = 0;
          playSound(a.item.soundFrequency);
        } else if (a.state === 'entering') {
          a.p = Math.min(0.5, a.t / 1.4 * 0.5);
          if (a.p >= 0.5) { a.state = 'blocking'; a.t = 0; }
        } else if (a.state === 'blocking') {
          if (stopped) {
            a.wait += dt;
            if (a.wait > AUTO_GO_AFTER) releaseAnimal(a);
          }
        } else if (a.state === 'leaving') {
          a.p = Math.min(1.15, 0.5 + a.t / 1.3 * 0.65);
          if (a.p >= 1.15) a.state = 'gone';
        }
      });

      // Arrived!
      if (!g.celebrating && g.started && g.carX >= r.stopX - 0.001 && g.speed < 0.01) {
        g.celebrating = true;
        playFanfare();
        say(ARRIVE_CLIP);
        setCelebration({ dest: THEMES[r.themeIdx % THEMES.length].destination, bag: r.bag.slice() });
        trackInteraction('drive_arrive', { item: THEMES[r.themeIdx % THEMES.length].destination });
        later(nextTrip, 4800);
      }

      // Exhaust puffs
      g.puffT -= dt;
      if (g.speed > 0.05 && g.jy === 0 && g.puffT <= 0) {
        g.puffT = 0.09;
        g.particles.push({ x: g.carX - 0.11, h: 0.03, vx: -0.05, vh: 0.06, life: 1, r: 0.012, color: '' });
      }
      g.particles.forEach(p => {
        p.x += p.vx * dt;
        p.h += p.vh * dt;
        if (p.color) { p.vh -= 1.2 * dt; } else { p.r += 0.03 * dt; }
        p.life -= dt * (p.color ? 1.3 : 1.5);
      });
      g.particles = g.particles.filter(p => p.life > 0);

      // Snow drifts past faster while driving
      if (THEMES[r.themeIdx % THEMES.length].snow) {
        g.snow.forEach(f => {
          f.y += f.v * dt;
          f.x -= (g.speed * 0.35 + 0.01) * dt;
          if (f.y > 1) f.y -= 1;
          if (f.x < 0) f.x += 1;
        });
      }

      // Jump hint when the first floating goodie comes up
      const wantHint = g.started && !g.everJumped && r.goodies.some(gd => !gd.taken && gd.h > 0.2 && gd.x - g.carX > 0 && gd.x - g.carX < 1.3);
      if (wantHint !== hintState) { hintState = wantHint; setJumpHint(wantHint); }

      if (progressCarRef.current) {
        progressCarRef.current.style.left = `${clamp(g.carX / r.stopX, 0, 1) * 100}%`;
      }
    };

    const draw = () => {
      const g = game.current;
      const L = g.layout;
      const r = g.route;
      const th = THEMES[r.themeIdx % THEMES.length];
      const cam = g.carX;
      const S = L.S;
      const time = g.time;
      const toX = (x: number) => L.carX + (x - cam) * S;

      drawSky(ctx, L, th, cam, time);

      if (th.ground === 'hills') {
        drawHills(ctx, L, cam, 0.12, th.far, L.horizon - S * 0.02, 0.3, 1.7);
        drawHills(ctx, L, cam, 0.25, th.near, L.horizon + S * 0.02, 0.17, 4.2);
      } else if (th.ground === 'skyline') {
        drawSkyline(ctx, L, cam, 0.12, th.far, L.horizon, 5, 0.35);
        drawSkyline(ctx, L, cam, 0.22, th.near, L.horizon + S * 0.02, 17, 0.2);
      } else {
        drawSea(ctx, L, th, cam, time);
      }

      // Far meadow / sand
      ctx.fillStyle = th.grassFar;
      ctx.fillRect(0, L.horizon, L.W, L.roadTop - L.horizon + 1);

      if (th.ground === 'sea') {
        drawSceneryRow(ctx, L, cam, th.back, 0.15, 1.6, 0.6, L.horizon - S * 0.035, 0.08, 0.04, 21);
      } else {
        drawSceneryRow(ctx, L, cam, th.back, 0.4, 0.42, 0.55, L.horizon + S * 0.01, 0.09, 0.04, 21);
      }

      drawSceneryRow(ctx, L, cam, th.front, 0.7, 0.55, 0.65, L.roadTop + S * 0.005, 0.14 * th.frontScale, 0.07 * th.frontScale, 57);

      // Destination stands behind the road, in front of the scenery
      const destX = toX(r.stopX + 0.32);
      if (destX < L.W + S) {
        drawEmoji(ctx, th.destination, destX, L.roadTop + S * 0.01 - S * 0.25, S * 0.5);
      }

      // Traffic light poles stand on the far kerb
      r.lights.forEach(l => {
        const x = toX(l.x);
        if (x < -S || x > L.W + S) { l.hit = undefined; return; }
        const poleW = Math.max(4, S * 0.025);
        const boxW = S * 0.13, boxH = S * 0.34;
        const top = L.roadTop - S * 0.6;
        ctx.fillStyle = '#374151';
        ctx.fillRect(x - poleW / 2, top + boxH - 2, poleW, L.roadTop + S * 0.01 - top - boxH + 2);
        ctx.fillStyle = '#1f2937';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - boxW / 2, top, boxW, boxH, S * 0.03);
        else ctx.rect(x - boxW / 2, top, boxW, boxH);
        ctx.fill();
        const lamps: ('red' | 'yellow' | 'green')[] = ['red', 'yellow', 'green'];
        const colors = { red: '#ef4444', yellow: '#facc15', green: '#22c55e' };
        lamps.forEach((c, i) => {
          const cy = top + boxH * (0.18 + i * 0.32);
          const on = l.state === c;
          ctx.save();
          if (on) { ctx.shadowColor = colors[c]; ctx.shadowBlur = S * 0.08; }
          ctx.fillStyle = on ? colors[c] : 'rgba(255,255,255,0.12)';
          ctx.beginPath();
          ctx.arc(x, cy, S * (on && c === 'red' ? 0.047 + 0.005 * Math.sin(time * 6) : 0.045), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
        const pad = Math.max(0, 70 - boxW) / 2;
        l.hit = { x: x - boxW / 2 - pad, y: top - pad, w: boxW + pad * 2, h: boxH + pad * 2 };
        // Stop line on the road
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(toX(l.x - 0.18), L.roadTop + S * 0.03, Math.max(4, S * 0.025), L.roadH - S * 0.06);
        if (l.state === 'red' && l.wait > HINT_AFTER) {
          drawTapRing(ctx, x, top + boxH / 2, Math.max(boxW, boxH) * 0.7, time);
        }
      });

      drawRoad(ctx, L, th, cam);

      // Zebra crossings where animals cross
      r.animals.forEach(a => {
        const x = toX(a.x);
        if (x < -S || x > L.W + S) return;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        const bar = S * 0.035;
        for (let i = -3; i <= 3; i++) {
          ctx.fillRect(x + i * bar * 1.9 - bar / 2, L.roadTop + S * 0.035, bar, L.roadH - S * 0.07);
        }
      });

      // Flowers in the near grass (move a bit faster than the road)
      drawSceneryRow(ctx, L, cam, th.flowers, 1.25, 0.33, 0.5, L.roadBottom + Math.min(S * 0.1, (L.H - L.roadBottom) * 0.8), 0.05, 0.03, 91);

      const animalPos = (a: Animal) => {
        const far = L.roadTop - S * 0.02, lane = L.laneY, near = L.roadBottom + S * 0.2;
        const y = a.p < 0.5 ? far + (lane - far) * (a.p / 0.5) : lane + (near - lane) * ((a.p - 0.5) / 0.5);
        return { x: toX(a.x), y, scale: 0.9 + a.p * 0.25 };
      };
      const drawAnimal = (a: Animal) => {
        const { x, y, scale } = animalPos(a);
        if (x < -S || x > L.W + S) { a.hit = undefined; return; }
        const size = S * 0.17 * scale;
        const walking = a.state === 'entering' || a.state === 'leaving';
        const hop = walking ? Math.abs(Math.sin(a.t * 9)) * S * 0.03 : Math.abs(Math.sin(time * 3)) * S * 0.008;
        const alpha = a.p > 1 ? Math.max(0, 1 - (a.p - 1) / 0.15) : 1;
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(x, y, size * 0.35, size * 0.08, 0, 0, Math.PI * 2);
        ctx.fill();
        drawEmoji(ctx, a.item.emoji, x, y - size * 0.45 - hop, size, { alpha, rot: walking ? Math.sin(a.t * 9) * 0.08 : 0 });
        a.hit = { x, y: y - size * 0.45, r: Math.max(size * 0.8, 50) };
        if (a.state === 'blocking' && a.wait > HINT_AFTER) {
          drawTapRing(ctx, x, y - size * 0.45, size * 0.75, time);
        }
      };

      // Animals still on the far half go behind the car
      r.animals.forEach(a => { if (a.state !== 'gone' && a.p < 0.5) drawAnimal(a); });

      // Goodies
      const basketX = L.W - 60, basketY = 44;
      r.goodies.forEach(gd => {
        const size = S * 0.11;
        if (!gd.taken) {
          const x = toX(gd.x);
          if (x < -size || x > L.W + size) return;
          const y = L.laneY - gd.h * S + Math.sin(time * 3 + gd.x * 2) * S * 0.012;
          if (gd.h > 0.2) {
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.beginPath(); ctx.arc(x, y, size * (0.72 + 0.06 * Math.sin(time * 5)), 0, Math.PI * 2); ctx.fill();
          }
          drawEmoji(ctx, gd.item.emoji, x, y, size);
        } else if (gd.t < 0.7) {
          const k = gd.t / 0.7;
          const e = 1 - (1 - k) * (1 - k);
          const x0 = toX(gd.x), y0 = L.laneY - gd.h * S;
          drawEmoji(ctx, gd.item.emoji, x0 + (basketX - x0) * e, y0 + (basketY - y0) * e - Math.sin(k * Math.PI) * S * 0.15, size * (1.3 - 0.6 * k), { alpha: 1 - k * 0.6 });
        }
      });

      // Exhaust & sparkles
      g.particles.forEach(p => {
        const x = toX(p.x), y = L.laneY - p.h * S;
        ctx.globalAlpha = Math.max(0, p.life) * (p.color ? 1 : 0.8);
        ctx.fillStyle = p.color || th.puff;
        ctx.beginPath();
        ctx.arc(x, y, p.r * S, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;

      // The vehicle
      const v = g.vehicle;
      const size = S * 0.22;
      const cx = L.carX;
      const groundY = L.laneY;
      const lift = g.jy * S;
      const bob = g.speed > 0.02 && g.jy === 0 ? Math.abs(Math.sin(time * 16)) * S * 0.006 : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(cx, groundY, size * 0.5 * Math.max(0.4, 1 - g.jy * 1.5), size * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      if (th.headlights) {
        const hy = groundY - lift - size * 0.25;
        const beam = ctx.createLinearGradient(cx, 0, cx + S * 0.9, 0);
        beam.addColorStop(0, 'rgba(254, 240, 138, 0.55)');
        beam.addColorStop(1, 'rgba(254, 240, 138, 0)');
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(cx + size * 0.4, hy - size * 0.04);
        ctx.lineTo(cx + S * 0.9, hy - size * 0.35);
        ctx.lineTo(cx + S * 0.9, hy + size * 0.45);
        ctx.lineTo(cx + size * 0.4, hy + size * 0.06);
        ctx.closePath();
        ctx.fill();
      }
      const sq = g.squash;
      const rot = clamp(-g.vy * 0.12, -0.28, 0.28) + (g.hornT > 0 ? Math.sin(time * 45) * 0.05 : 0);
      drawEmoji(ctx, v.emoji, cx, groundY - lift - size * 0.42 - bob, size, { flip: true, rot, sx: 1 + sq * 0.12, sy: 1 - sq * 0.14 });
      if (v.flasher && g.flashT > 0) {
        const on = Math.floor(time * 8) % 2 === 0;
        ctx.save();
        ctx.shadowBlur = S * 0.08;
        ctx.shadowColor = on ? '#ef4444' : '#3b82f6';
        ctx.fillStyle = on ? '#ef4444' : '#3b82f6';
        ctx.beginPath();
        ctx.arc(cx, groundY - lift - size * 0.86, S * 0.03, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Animals on the near half walk in front of the car
      r.animals.forEach(a => { if (a.state !== 'gone' && a.p >= 0.5) drawAnimal(a); });

      if (th.snow) {
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        g.snow.forEach(f => {
          ctx.beginPath();
          ctx.arc(f.x * L.W, f.y * L.H, f.s, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      game.current.time += dt;
      update(dt);
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      timers.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const theme = THEMES[themeIdx % THEMES.length];

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-sky-200" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" onPointerDown={handlePointer} />
      {/* Paper grain over the whole scene */}
      <div className="paper-grain absolute inset-0 pointer-events-none" />

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between gap-3 p-3 sm:p-4 pointer-events-none">
        <div className="pointer-events-auto"><HomeButton onClick={onBack} /></div>

        {/* Trip progress */}
        <div className="soft-btn flex-1 max-w-md mt-2 flex items-center gap-2 rounded-full px-3 py-2">
          <FlagIcon className="w-6 h-6 sm:w-7 sm:h-7 shrink-0" />
          <div className="relative flex-1 h-3 rounded-full" style={{ background: '#eadcc5' }}>
            <span
              ref={progressCarRef}
              className="absolute top-1/2"
              style={{ left: '0%', transform: 'translate(-50%, -60%) scaleX(-1)' }}
            >
              <ItemArt name={vehicle.name} size="clamp(30px, 5vmin, 42px)" className="block" />
            </span>
          </div>
          <ItemArt name={artFor(theme.destination) ?? 'house'} size="clamp(30px, 5vmin, 42px)" className="block shrink-0" />
        </div>

        <div className="flex gap-2 pointer-events-auto">
          <button
            onPointerDown={(e) => { e.stopPropagation(); openPicker(); }}
            className="soft-btn w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center"
            aria-label="Choose vehicle"
          >
            <ItemArt name={vehicle.name} size="76%" style={{ transform: 'scaleX(-1)' }} />
          </button>
          <div className="soft-btn h-14 sm:h-16 min-w-[4.5rem] px-3 rounded-full flex items-center justify-center gap-1">
            <BasketIcon className="w-8 h-8 sm:w-9 sm:h-9" />
            <span key={count} className="pop-in text-2xl sm:text-3xl font-bold" style={{ color: '#d99a1f' }}>{count}</span>
          </div>
        </div>
      </div>

      {/* Big toddler buttons */}
      {!picking && (
        <>
          <button
            onPointerDown={(e) => { e.stopPropagation(); jump(); }}
            className={`toy-btn absolute left-4 bottom-4 sm:left-6 sm:bottom-6 w-20 h-20 sm:w-24 sm:h-24 [@media(max-height:500px)]:w-16 [@media(max-height:500px)]:h-16 [@media(max-height:500px)]:bottom-2 [@media(max-height:500px)]:left-2 rounded-full bg-green-500 flex items-center justify-center ${jumpHint ? 'wiggle-loop ring-8 ring-white/80' : ''}`}
            aria-label="Jump"
          >
            <svg viewBox="0 0 24 24" className="w-12 h-12 sm:w-14 sm:h-14" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <button
            onPointerDown={(e) => { e.stopPropagation(); honk(); }}
            className="toy-btn absolute right-4 bottom-4 sm:right-6 sm:bottom-6 w-20 h-20 sm:w-24 sm:h-24 [@media(max-height:500px)]:w-16 [@media(max-height:500px)]:h-16 [@media(max-height:500px)]:bottom-2 [@media(max-height:500px)]:right-2 rounded-full bg-yellow-400 flex items-center justify-center"
            aria-label="Horn"
          >
            <HornIcon className="w-[58%] h-[58%]" />
          </button>
        </>
      )}

      {/* Vehicle picker */}
      {picking && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center p-4 backdrop-blur-sm" style={{ background: 'rgba(45,36,64,0.35)' }}>
          <div className="paper-bg pop-in rounded-[32px] shadow-2xl p-4 sm:p-6 w-full max-w-lg landscape:max-w-2xl max-h-full overflow-y-auto" style={{ '--bg': '#f4ead8' } as React.CSSProperties}>
            <div className="flex justify-center mb-3 sm:mb-4 [@media(max-height:500px)]:mb-2">
              <span className="paper-banner" style={{ '--c': '#3e8ede', fontSize: 'clamp(26px, 6vmin, 40px)' } as React.CSSProperties}>{t('driveGameTitle')}</span>
            </div>
            <div className="grid grid-cols-3 landscape:grid-cols-5 gap-3 sm:gap-4">
              {VEHICLES.map((v, i) => (
                <button
                  key={v.name}
                  onClick={() => chooseVehicle(v)}
                  className="paper-card aspect-square rounded-3xl flex items-center justify-center pop-in active:scale-95 transition-transform"
                  style={{ animationDelay: `${i * 40}ms` }}
                  aria-label={t(v.name)}
                >
                  <ItemArt name={v.name} size="80%" className="bob" style={{ transform: 'scaleX(-1)' }} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Arrival celebration */}
      {celebration && (
        <>
          <ConfettiRain />
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none px-4">
            <ItemArt name={artFor(celebration.dest) ?? 'house'} size="clamp(140px, 34vmin, 260px)" className="pop-in" />
            <span className="paper-banner pop-in mt-3" style={{ '--c': '#ef5b45', fontSize: 'clamp(44px, 11vmin, 96px)', animationDelay: '0.15s' } as React.CSSProperties}>
              {t('hooray')}
            </span>
            {celebration.bag.length > 0 && (
              <div className="paper-card mt-5 max-w-xl flex flex-wrap justify-center gap-1 rounded-3xl px-4 py-3">
                {celebration.bag.map((name, i) => (
                  <ItemArt key={i} name={name} size="clamp(34px, 6vmin, 48px)" className="pop-in" style={{ animationDelay: `${0.3 + i * 0.07}s` }} />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className={`absolute inset-0 z-50 bg-white pointer-events-none transition-opacity duration-500 ${fading ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  );
};

export default DriveGame;
