import React, { useCallback, useEffect, useRef, useState } from 'react';
import { playSound, playFanfare, playUIClick, playPop, playTransitionSound } from '../services/audioService';
import { say } from '../services/speechService';
import { colorClip, nameClip, praiseClip } from '../speech/phrases';
import { trackInteraction } from '../services/analyticsService';
import { Burst, ConfettiRain, HomeButton, RoundButton, useElementSize } from '../components/ui';
import { BrushIcon, ClearIcon, NextIcon, PicturesIcon, PaperStar } from '../components/paper';
import { PAL } from '../components/art';
import { COLORING_PAGES, type ColoringPage, type Decor, type Region, type Shape } from './coloringPages';

// "Krāsosim!" — pick a paint blob (its name is said aloud), tap a part of the
// picture to fill it. There is also a blank page for free finger painting.

interface Paint { key: string; hex: string; note: number; }

const RAINBOW = 'rainbow';
const PALETTE: Paint[] = [
  { key: 'colorRed', hex: '#ef4444', note: 523.25 },
  { key: 'colorOrange', hex: '#fb923c', note: 587.33 },
  { key: 'colorYellow', hex: '#facc15', note: 659.25 },
  { key: 'colorGreen', hex: '#22c55e', note: 698.46 },
  { key: 'colorBlue', hex: '#3b82f6', note: 783.99 },
  { key: 'colorPurple', hex: '#a855f7', note: 880.0 },
  { key: 'colorPink', hex: '#f472b6', note: 987.77 },
  { key: 'colorBrown', hex: '#a16207', note: 392.0 },
  { key: 'colorBlack', hex: '#44403c', note: 329.63 },
  { key: 'colorWhite', hex: '#ffffff', note: 1046.5 },
  { key: 'Rainbow', hex: RAINBOW, note: 1174.66 },
];
const RAINBOW_COLORS = ['#ef4444', '#fb923c', '#facc15', '#22c55e', '#3b82f6', '#a855f7', '#f472b6', '#38bdf8', '#a3e635'];

const OUTLINE = '#1c1917';
const STORAGE_KEY = 'coloringFills';

type Fills = Record<string, Record<string, string>>;

const loadFills = (): Fills => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
};

const resolvePaint = (p: Paint) => (p.hex === RAINBOW ? RAINBOW_COLORS[Math.floor(Math.random() * RAINBOW_COLORS.length)] : p.hex);

const isComplete = (page: ColoringPage, fills: Record<string, string> = {}) =>
  page.regions.every(r => r.background || fills[r.id]);

// --- SVG rendering ---

const renderShape = (shape: Shape, props: React.SVGProps<SVGElement>, key?: string) => {
  switch (shape.kind) {
    case 'path': return <path key={key} d={shape.d} {...(props as React.SVGProps<SVGPathElement>)} />;
    case 'circle': return <circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} {...(props as React.SVGProps<SVGCircleElement>)} />;
    case 'ellipse': return <ellipse key={key} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} {...(props as React.SVGProps<SVGEllipseElement>)} />;
    case 'rect': return <rect key={key} x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={shape.rx} {...(props as React.SVGProps<SVGRectElement>)} />;
  }
};

const PageSvg: React.FC<{
  page: ColoringPage;
  fills: Record<string, string>;
  onRegion?: (region: Region, e: React.PointerEvent) => void;
  className?: string;
  style?: React.CSSProperties;
}> = ({ page, fills, onRegion, className, style }) => (
  <svg viewBox="0 0 400 400" className={className} style={style}>
    <defs>
      <filter id="paper-fibres" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
        <feColorMatrix values="0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0 0.12  0 0 0 0.35 0" />
      </filter>
      <clipPath id={`clip-${page.id}`}><rect x="0" y="0" width="400" height="400" rx="28" /></clipPath>
    </defs>
    <g clipPath={`url(#clip-${page.id})`}>
      {page.regions.map(r => renderShape(r.shape, {
        fill: fills[r.id] ?? '#ffffff',
        stroke: r.background ? 'none' : OUTLINE,
        strokeWidth: 5,
        strokeLinejoin: 'round',
        style: { transition: 'fill 0.25s ease', cursor: onRegion ? 'pointer' : undefined },
        onPointerDown: onRegion ? (e: React.PointerEvent) => onRegion(r, e) : undefined,
      } as React.SVGProps<SVGElement>, r.id))}
      {page.decor?.map((d: Decor, i) => renderShape(d.shape, {
        fill: d.fill ?? 'none',
        stroke: d.strokeWidth === 0 ? 'none' : OUTLINE,
        strokeWidth: d.strokeWidth ?? 5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        pointerEvents: 'none',
      } as React.SVGProps<SVGElement>, `decor-${i}`))}
      {/* Paper fibres over the whole page, so filled parts look like coloured paper */}
      <rect x="0" y="0" width="400" height="400" filter="url(#paper-fibres)" opacity="0.55" style={{ mixBlendMode: 'multiply' }} pointerEvents="none" />
    </g>
    <rect x="2.5" y="2.5" width="395" height="395" rx="26" fill="none" stroke={OUTLINE} strokeWidth="5" pointerEvents="none" />
  </svg>
);

// --- Free finger painting ---

let savedDrawing: string | null = null; // survives leaving and re-opening the page this session

const DrawCanvas: React.FC<{ paint: Paint; clearSignal: number; size: number }> = ({ paint, clearSignal, size }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef(new Map<number, { x: number; y: number }>());
  const hue = useRef(0);
  const paintRef = useRef(paint);
  const initialized = useRef(false);
  paintRef.current = paint;

  // Size the backing store, keeping whatever is already drawn
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size <= 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ctx = canvas.getContext('2d')!;
    const previous = initialized.current ? canvas.toDataURL() : savedDrawing;
    initialized.current = true;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    if (previous && previous !== 'data:,') {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, size, size);
      img.src = previous;
    }
  }, [size]);

  useEffect(() => {
    if (clearSignal === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    savedDrawing = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSignal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    return () => { if (canvas && initialized.current) savedDrawing = canvas.toDataURL(); };
  }, []);

  const strokeColor = () => {
    if (paintRef.current.hex !== RAINBOW) return paintRef.current.hex;
    hue.current = (hue.current + 6) % 360;
    return `hsl(${hue.current}, 90%, 55%)`;
  };

  const point = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const brush = Math.max(12, size * 0.045);

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e);
    strokes.current.set(e.pointerId, p);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.fillStyle = strokeColor();
    ctx.beginPath();
    ctx.arc(p.x, p.y, brush / 2, 0, Math.PI * 2);
    ctx.fill();
    playSound(paintRef.current.note, 0.12);
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const last = strokes.current.get(e.pointerId);
    if (!last) return;
    const p = point(e);
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.strokeStyle = strokeColor();
    ctx.lineWidth = brush;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    strokes.current.set(e.pointerId, p);
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => { strokes.current.delete(e.pointerId); };

  return (
    <canvas
      ref={canvasRef}
      className="rounded-[28px] bg-white shadow-xl"
      style={{ width: size, height: size, border: `5px solid ${OUTLINE}`, touchAction: 'none' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    />
  );
};

// --- Palette ---

const PaletteBar: React.FC<{ paint: Paint; onPick: (p: Paint) => void; landscape: boolean; blob: number }> = ({ paint, onPick, landscape, blob }) => (
  <div
    className="grid gap-2 sm:gap-3 shrink-0 place-content-center"
    style={landscape
      ? { gridTemplateColumns: `repeat(2, ${blob}px)`, gridAutoRows: `${blob}px` }
      : { gridTemplateColumns: `repeat(6, ${blob}px)`, gridAutoRows: `${blob}px` }}
  >
    {PALETTE.map(p => {
      const selected = p.key === paint.key;
      return (
        <button
          key={p.key}
          onPointerDown={(e) => { e.stopPropagation(); onPick(p); }}
          className={`paint-disc rounded-full transition-transform duration-150 ${selected ? 'scale-110 z-10' : 'active:scale-90'}`}
          style={{
            background: p.hex === RAINBOW ? 'conic-gradient(#ef4444, #facc15, #22c55e, #3b82f6, #a855f7, #ef4444)' : p.hex,
            boxShadow: selected
              ? `0 0 0 4px #fffaf0, 0 0 0 8px ${p.hex === RAINBOW ? '#a855f7' : p.hex === '#ffffff' ? '#d9c8ab' : p.hex}, 0 8px 18px rgba(45,36,64,0.3)`
              : '0 5px 9px -3px rgba(45,36,64,0.35)',
            border: p.hex === '#ffffff' ? '2px solid #eadcc5' : undefined,
          }}
          aria-label={p.key}
        >
          {selected && (
            <svg viewBox="0 0 24 24" className="w-1/2 h-1/2 mx-auto" fill="none" stroke={p.hex === '#ffffff' || p.hex === '#facc15' ? '#2d2440' : '#fffaf0'} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5 L10 17 L19 7.5" />
            </svg>
          )}
        </button>
      );
    })}
  </div>
);

// --- Main component ---

interface ColoringGameProps {
  t: (key: string) => string;
  onBack: () => void;
  language: string;
}

const DRAW = 'draw';

const ColoringGame: React.FC<ColoringGameProps> = ({ t, onBack, language }) => {
  const [view, setView] = useState<string | null>(null); // null = gallery
  const [paint, setPaint] = useState<Paint>(PALETTE[0]);
  const [fills, setFills] = useState<Fills>(loadFills);
  const [burst, setBurst] = useState<{ x: number; y: number; key: number } | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [overlay, setOverlay] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);
  const [rootRef, rootSize] = useElementSize<HTMLDivElement>();
  const [areaRef, area] = useElementSize<HTMLDivElement>();
  const celebrateTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fills));
  }, [fills]);
  useEffect(() => () => clearTimeout(celebrateTimer.current), []);

  const landscape = rootSize.width > rootSize.height;
  const blob = landscape
    ? Math.max(34, Math.min(68, (rootSize.height - 110) / 6 - 10))
    : Math.max(34, Math.min(68, (rootSize.width - 40) / 6 - 10));

  const page = COLORING_PAGES.find(p => p.id === view) || null;

  const openView = (id: string) => {
    playTransitionSound();
    setCelebrate(false);
    setView(id);
    const p = COLORING_PAGES.find(pg => pg.id === id);
    if (p) say(nameClip(p.name), language);
    trackInteraction('coloring_open', { item: id });
  };

  const pickPaint = (p: Paint) => {
    setPaint(p);
    playSound(p.note);
    say(colorClip(p.key), language);
  };

  const fillRegion = useCallback((region: Region, e: React.PointerEvent) => {
    if (!page) return;
    const color = resolvePaint(paint);
    const pageFills = { ...(fills[page.id] || {}), [region.id]: color };
    const wasDone = isComplete(page, fills[page.id]);
    setFills(f => ({ ...f, [page.id]: pageFills }));
    playSound(paint.note);
    if (!region.background) setBurst({ x: e.clientX, y: e.clientY, key: Date.now() });

    if (!wasDone && isComplete(page, pageFills)) {
      celebrateTimer.current = window.setTimeout(() => {
        setCelebrate(true);
        setOverlay(true);
        celebrateTimer.current = window.setTimeout(() => setOverlay(false), 3200);
        playFanfare();
        say(praiseClip('amazing'), language);
        trackInteraction('coloring_done', { item: page.id });
      }, 350);
    }
  }, [page, paint, fills, t, language]);

  const clearPage = () => {
    playPop();
    setCelebrate(false);
    if (view === DRAW) setClearSignal(n => n + 1);
    else if (page) setFills(f => ({ ...f, [page.id]: {} }));
  };

  const nextPage = () => {
    const idx = COLORING_PAGES.findIndex(p => p.id === view);
    openView(COLORING_PAGES[(idx + 1) % COLORING_PAGES.length].id);
  };

  // --- Gallery ---
  if (view === null) {
    const count = COLORING_PAGES.length + 1;
    const cols = landscape ? 5 : 3;
    const rows = Math.ceil(count / cols);
    const gap = 14;
    const tile = Math.max(60, Math.min((area.width - gap * (cols - 1)) / cols, (area.height - gap * (rows - 1)) / rows));
    return (
      <div ref={rootRef} className="paper-bg w-full h-full flex flex-col select-none" style={{ '--bg': '#f4ead8' } as React.CSSProperties}>
        <div className="shrink-0 flex items-center gap-3 px-4 pt-4">
          <HomeButton onClick={onBack} />
          <span className="paper-banner" style={{ '--c': PAL.pink, fontSize: 'clamp(26px, 5.5vmin, 50px)' } as React.CSSProperties}>{t('coloringGameTitle')}</span>
        </div>
        <div ref={areaRef} className="flex-1 min-h-0 m-4 overflow-y-auto" style={{ touchAction: 'pan-y' }}>
          {area.width > 0 && (
            <div className="grid mx-auto" style={{ gridTemplateColumns: `repeat(${cols}, ${tile}px)`, gridAutoRows: `${tile}px`, gap, width: 'fit-content' }}>
              <button
                onClick={() => openView(DRAW)}
                className="toy-btn pop-in rounded-[24px] flex items-center justify-center"
                style={{ background: 'conic-gradient(from 45deg, #fca5a5, #fde68a, #86efac, #93c5fd, #d8b4fe, #fca5a5)' }}
                aria-label="Draw"
              >
                <BrushIcon className="bob" style={{ width: tile * 0.5, height: tile * 0.5 }} />
              </button>
              {COLORING_PAGES.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => openView(p.id)}
                  className="toy-btn pop-in relative rounded-[24px] bg-white overflow-hidden"
                  style={{ animationDelay: `${(i + 1) * 40}ms` }}
                  aria-label={t(p.name)}
                >
                  <PageSvg page={p} fills={fills[p.id] || {}} className="w-full h-full" />
                  {isComplete(p, fills[p.id]) && <PaperStar filled className="absolute top-1.5 right-1.5 w-8 h-8" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Picture / drawing view ---
  const pictureSize = Math.max(100, Math.min(area.width, area.height) - 8);

  return (
    <div ref={rootRef} className="paper-bg relative w-full h-full flex flex-col select-none overflow-hidden" style={{ '--bg': '#f4ead8' } as React.CSSProperties}>
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 pt-3 sm:px-4 sm:pt-4">
        <div className="flex gap-2">
          <HomeButton onClick={onBack} />
          <RoundButton onClick={() => { playUIClick(); setView(null); setCelebrate(false); }} label="Pictures" className="soft-btn w-14 h-14 sm:w-16 sm:h-16 rounded-full"><PicturesIcon className="w-[56%] h-[56%]" /></RoundButton>
        </div>
        <div className="flex gap-2">
          <RoundButton onClick={clearPage} label="Clear" className="soft-btn w-14 h-14 sm:w-16 sm:h-16 rounded-full"><ClearIcon className="w-[56%] h-[56%]" /></RoundButton>
          {page && (
            <RoundButton onClick={nextPage} label="Next" className={`soft-btn w-14 h-14 sm:w-16 sm:h-16 rounded-full ${celebrate ? 'wiggle-loop ring-4 ring-pink-400' : ''}`}><NextIcon className="w-[56%] h-[56%]" /></RoundButton>
          )}
        </div>
      </div>

      <div className={`flex-1 min-h-0 flex ${landscape ? 'flex-row' : 'flex-col'} items-center gap-3 p-3 sm:p-4`}>
        <div ref={areaRef} className="flex-1 min-h-0 min-w-0 self-stretch flex items-center justify-center">
          {area.width > 0 && (page ? (
            <PageSvg
              key={page.id}
              page={page}
              fills={fills[page.id] || {}}
              onRegion={fillRegion}
              className="pop-in drop-shadow-xl"
              style={{ width: pictureSize, height: pictureSize, touchAction: 'none' }}
            />
          ) : (
            <DrawCanvas paint={paint} clearSignal={clearSignal} size={pictureSize} />
          ))}
        </div>
        <PaletteBar paint={paint} onPick={pickPaint} landscape={landscape} blob={blob} />
      </div>

      {burst && <Burst key={burst.key} x={burst.x} y={burst.y} count={12} />}

      {celebrate && overlay && (
        <>
          <ConfettiRain />
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none">
            <PaperStar filled className="pop-in w-40 h-40 sm:w-52 sm:h-52 drop-shadow-xl" />
            <span className="paper-banner pop-in" style={{ '--c': PAL.pink, fontSize: 'clamp(48px, 12vmin, 110px)', animationDelay: '0.15s' } as React.CSSProperties}>{t('amazing')}</span>
          </div>
        </>
      )}
    </div>
  );
};

export default ColoringGame;
