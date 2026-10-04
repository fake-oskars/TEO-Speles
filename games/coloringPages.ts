// Line-art pages for the coloring game, drawn in a 400x400 viewBox.
// Every `region` is a closed shape a toddler can tap to fill; `decor` is
// non-tappable detail drawn on top (eyes, door knobs, waffle lines...).

export type Shape =
  | { kind: 'path'; d: string }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx?: number };

export interface Region { id: string; shape: Shape; background?: boolean; }
export interface Decor { shape: Shape; fill?: string; strokeWidth?: number; }

export interface ColoringPage {
  id: string;
  name: string; // translation key, also spoken aloud
  regions: Region[];
  decor?: Decor[];
}

const path = (d: string): Shape => ({ kind: 'path', d });
const circle = (cx: number, cy: number, r: number): Shape => ({ kind: 'circle', cx, cy, r });
const ellipse = (cx: number, cy: number, rx: number, ry: number): Shape => ({ kind: 'ellipse', cx, cy, rx, ry });
const rect = (x: number, y: number, w: number, h: number, rx = 0): Shape => ({ kind: 'rect', x, y, w, h, rx });

const star = (cx: number, cy: number, R: number, r: number): Shape => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    pts.push(`${(cx + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad).toFixed(1)}`);
  }
  return path(`M${pts.join(' L')} Z`);
};

const cloud = (cx: number, cy: number): Shape =>
  path(`M${cx - 60} ${cy + 20} A22 22 0 0 1 ${cx - 50} ${cy - 18} A30 30 0 0 1 ${cx - 5} ${cy - 35} A28 28 0 0 1 ${cx + 42} ${cy - 15} A22 22 0 0 1 ${cx + 60} ${cy + 20} Z`);

const band = (R: number, r: number, cx = 200, cy = 300): Shape =>
  path(`M${cx - R} ${cy} A${R} ${R} 0 0 1 ${cx + R} ${cy} L${cx + r} ${cy} A${r} ${r} 0 0 0 ${cx - r} ${cy} Z`);

const petals = [0, 60, 120, 180, 240, 300].map((deg, i) => {
  const a = (deg * Math.PI) / 180;
  return { id: `petal${i}`, shape: circle(200 + 55 * Math.cos(a), 140 + 55 * Math.sin(a), 38) };
});

const bg = (id = 'sky'): Region => ({ id, shape: rect(0, 0, 400, 400), background: true });

export const COLORING_PAGES: ColoringPage[] = [
  {
    id: 'car',
    name: 'Car',
    regions: [
      bg(),
      { id: 'ground', shape: rect(-10, 300, 420, 110) },
      { id: 'body', shape: path('M40 250 L40 200 Q40 180 60 178 L110 175 L150 120 Q158 110 172 110 L260 110 Q275 110 283 122 L320 175 L345 180 Q362 184 362 202 L362 250 Q362 262 350 262 L52 262 Q40 262 40 250 Z') },
      { id: 'window1', shape: path('M168 128 L140 172 L205 172 L205 128 Z') },
      { id: 'window2', shape: path('M220 128 L220 172 L300 172 L270 128 Z') },
      { id: 'light', shape: circle(346, 205, 11) },
      { id: 'wheel1', shape: circle(115, 262, 38) },
      { id: 'wheel2', shape: circle(290, 262, 38) },
      { id: 'hub1', shape: circle(115, 262, 15) },
      { id: 'hub2', shape: circle(290, 262, 15) },
    ],
    decor: [
      { shape: path('M212 178 L212 250') },
      { shape: rect(222, 190, 22, 7, 3), fill: '#27272a', strokeWidth: 0 },
    ],
  },
  {
    id: 'house',
    name: 'House',
    regions: [
      bg(),
      { id: 'ground', shape: rect(-10, 320, 420, 90) },
      { id: 'sun', shape: circle(335, 70, 35) },
      { id: 'chimney', shape: rect(255, 95, 32, 70) },
      { id: 'roof', shape: path('M65 192 L200 80 L335 192 Z') },
      { id: 'wall', shape: rect(95, 192, 210, 140) },
      { id: 'door', shape: path('M175 332 L175 274 Q175 250 200 250 Q225 250 225 274 L225 332 Z') },
      { id: 'window1', shape: rect(115, 215, 46, 46, 4) },
      { id: 'window2', shape: rect(239, 215, 46, 46, 4) },
    ],
    decor: [
      { shape: path('M138 215 L138 261 M115 238 L161 238') },
      { shape: path('M262 215 L262 261 M239 238 L285 238') },
      { shape: circle(214, 295, 4), fill: '#27272a', strokeWidth: 0 },
    ],
  },
  {
    id: 'fish',
    name: 'Fish',
    regions: [
      bg('water'),
      { id: 'seaweed', shape: path('M40 410 Q18 345 45 300 Q72 345 58 410 Z') },
      { id: 'bubble1', shape: circle(75, 95, 15) },
      { id: 'bubble2', shape: circle(100, 55, 10) },
      { id: 'bubble3', shape: circle(66, 32, 7) },
      { id: 'finTop', shape: path('M150 135 Q185 68 252 142 Z') },
      { id: 'finBottom', shape: path('M170 266 Q195 312 238 262 Z') },
      { id: 'tail', shape: path('M285 200 L362 138 Q344 200 362 262 Z') },
      { id: 'body', shape: ellipse(190, 200, 110, 75) },
      { id: 'stripe1', shape: path('M190 125 Q180 200 190 275 L215 273 Q205 200 215 127 Z') },
      { id: 'stripe2', shape: path('M240 133 Q230 200 240 267 L260 258 Q250 200 260 142 Z') },
      { id: 'eye', shape: circle(125, 185, 17) },
    ],
    decor: [
      { shape: circle(121, 185, 7), fill: '#27272a', strokeWidth: 0 },
      { shape: path('M92 222 Q105 232 118 224') },
    ],
  },
  {
    id: 'flower',
    name: 'Flower',
    regions: [
      bg(),
      { id: 'stem', shape: path('M192 290 Q186 230 194 170 L208 170 Q202 230 208 290 Z') },
      { id: 'leaf1', shape: path('M198 252 Q140 232 122 195 Q175 200 198 236 Z') },
      { id: 'leaf2', shape: path('M204 232 Q262 217 282 176 Q226 180 204 216 Z') },
      { id: 'pot', shape: path('M142 300 L258 300 L244 382 L156 382 Z') },
      { id: 'rim', shape: rect(128, 282, 144, 26, 8) },
      ...petals,
      { id: 'center', shape: circle(200, 140, 33) },
    ],
    decor: [
      { shape: circle(189, 132, 4), fill: '#27272a', strokeWidth: 0 },
      { shape: circle(211, 132, 4), fill: '#27272a', strokeWidth: 0 },
      { shape: path('M187 150 Q200 162 213 150') },
    ],
  },
  {
    id: 'butterfly',
    name: 'Butterfly',
    regions: [
      bg(),
      { id: 'wingTL', shape: path('M195 190 Q120 55 58 100 Q28 150 80 192 Q140 218 195 202 Z') },
      { id: 'wingTR', shape: path('M205 190 Q280 55 342 100 Q372 150 320 192 Q260 218 205 202 Z') },
      { id: 'wingBL', shape: path('M195 212 Q130 215 100 262 Q95 322 150 312 Q190 292 197 232 Z') },
      { id: 'wingBR', shape: path('M205 212 Q270 215 300 262 Q305 322 250 312 Q210 292 203 232 Z') },
      { id: 'spot1', shape: circle(112, 142, 21) },
      { id: 'spot2', shape: circle(288, 142, 21) },
      { id: 'spot3', shape: circle(146, 266, 15) },
      { id: 'spot4', shape: circle(254, 266, 15) },
      { id: 'body', shape: ellipse(200, 215, 15, 78) },
      { id: 'head', shape: circle(200, 128, 19) },
      { id: 'tip1', shape: circle(158, 58, 10) },
      { id: 'tip2', shape: circle(242, 58, 10) },
    ],
    decor: [
      { shape: path('M193 113 Q178 72 162 64 M207 113 Q222 72 238 64') },
      { shape: circle(193, 126, 3.5), fill: '#27272a', strokeWidth: 0 },
      { shape: circle(207, 126, 3.5), fill: '#27272a', strokeWidth: 0 },
    ],
  },
  {
    id: 'rocket',
    name: 'Rocket',
    regions: [
      bg('space'),
      { id: 'planet', shape: circle(72, 318, 42) },
      { id: 'star1', shape: star(70, 70, 26, 11) },
      { id: 'star2', shape: star(335, 110, 20, 8) },
      { id: 'star3', shape: star(330, 320, 24, 10) },
      { id: 'flame', shape: path('M168 298 Q200 392 232 298 Z') },
      { id: 'finL', shape: path('M152 248 L108 312 L162 300 Z') },
      { id: 'finR', shape: path('M248 248 L292 312 L238 300 Z') },
      { id: 'body', shape: path('M150 300 L150 150 Q150 92 200 48 Q250 92 250 150 L250 300 Z') },
      { id: 'nose', shape: path('M163 104 Q180 72 200 48 Q220 72 237 104 Z') },
      { id: 'band', shape: rect(150, 238, 100, 22) },
      { id: 'window', shape: circle(200, 172, 28) },
    ],
    decor: [
      { shape: ellipse(72, 318, 66, 14) },
    ],
  },
  {
    id: 'icecream',
    name: 'Ice Cream',
    regions: [
      bg(),
      { id: 'cone', shape: path('M140 200 L260 200 L200 372 Z') },
      { id: 'scoop1', shape: circle(160, 186, 45) },
      { id: 'scoop2', shape: circle(240, 186, 45) },
      { id: 'scoop3', shape: circle(200, 122, 52) },
      { id: 'cherry', shape: circle(206, 62, 17) },
    ],
    decor: [
      { shape: path('M168.7 232 L160 256.7 M208.7 232 L180 313.3 M231.3 232 L240 256.7 M191.3 232 L220 313.3') },
      { shape: path('M208 46 Q214 24 232 18') },
    ],
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    regions: [
      bg(),
      { id: 'sun', shape: circle(345, 60, 30) },
      { id: 'band1', shape: band(180, 155) },
      { id: 'band2', shape: band(155, 130) },
      { id: 'band3', shape: band(130, 105) },
      { id: 'band4', shape: band(105, 80) },
      { id: 'band5', shape: band(80, 55) },
      { id: 'cloud1', shape: cloud(82, 300) },
      { id: 'cloud2', shape: cloud(318, 300) },
    ],
  },
];
