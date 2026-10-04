import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playSound, playCorrectSound, playIncorrectSound, playFanfare } from '../services/audioService';
import { say } from '../services/speechService';
import { findClip, findText, nameClip, praiseClip, PRAISE_KEYS } from '../speech/phrases';
import { trackAnswer } from '../services/analyticsService';
import type { Item } from '../types';
import { Burst, ConfettiRain, HomeButton, RoundButton, useElementSize } from '../components/ui';
import { ItemArt, PaperStar, SpeakerIcon, toneFor } from '../components/paper';
import { PAL } from '../components/art';

const STARS_PER_TROPHY = 5;

const shuffle = <T,>(array: T[]): T[] => {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Picks the grid (cols x rows) that makes cells as large as possible for the area.
const bestGrid = (count: number, width: number, height: number) => {
  let best = { cols: 1, rows: count, cell: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cell = Math.min(width / cols, height / rows);
    if (cell > best.cell) best = { cols, rows, cell };
  }
  return best;
};

interface Scatter { left: number; top: number; rotate: number; }

interface FindItGameProps {
  activeItems: Item[];
  t: (key: string) => string;
  onBack: () => void;
  emojiCount: number;
  language: string;
  onGameEnd?: (stats: { correct: number; total: number }) => void;
}

const FindItGame: React.FC<FindItGameProps> = ({ activeItems, t, onBack, emojiCount, language, onGameEnd }) => {
  const [target, setTarget] = useState<Item | null>(null);
  const [options, setOptions] = useState<Item[]>([]);
  const [round, setRound] = useState(0);
  const [feedback, setFeedback] = useState<'idle' | 'correct'>('idle');
  const [wrongName, setWrongName] = useState<string | null>(null);
  const [misses, setMisses] = useState(0);
  const [stars, setStars] = useState(0);
  const [trophy, setTrophy] = useState(false);
  const [burst, setBurst] = useState<{ x: number; y: number; key: number } | null>(null);
  const [scatter, setScatter] = useState<Scatter[]>([]);
  const statsRef = useRef({ correct: 0, total: 0 });
  const questionStartRef = useRef(Date.now());
  const lastTargetRef = useRef<string | null>(null);
  const timersRef = useRef<number[]>([]);
  const [areaRef, area] = useElementSize<HTMLDivElement>();

  const count = Math.min(emojiCount, activeItems.length);
  const isScattered = count >= 7;

  const later = (fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const askFor = useCallback((item: Item) => {
    say(findClip(item.name), language);
  }, [t, language]);

  const newRound = useCallback(() => {
    if (activeItems.length < 2) return;
    let pool = shuffle(activeItems);
    // Avoid asking for the same thing twice in a row
    if (pool[0].name === lastTargetRef.current && pool.length > 1) pool = [...pool.slice(1), pool[0]];
    const nextTarget = pool[0];
    lastTargetRef.current = nextTarget.name;
    setTarget(nextTarget);
    setOptions(shuffle(pool.slice(0, count)));
    setFeedback('idle');
    setWrongName(null);
    setMisses(0);
    setRound(r => r + 1);
    questionStartRef.current = Date.now();
    askFor(nextTarget);
  }, [activeItems, count, askFor]);

  useEffect(() => {
    newRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItems, count]);

  // Scattered layout: jittered grid cells so nothing overlaps
  const scatterLayout = useMemo(() => {
    if (!isScattered || area.width === 0) return null;
    const grid = bestGrid(count, area.width, area.height);
    const size = Math.min(grid.cell * 0.78, 150);
    return { ...grid, size };
  }, [isScattered, count, area.width, area.height]);

  useEffect(() => {
    if (!scatterLayout) return;
    const { cols, rows, size } = scatterLayout;
    const cellW = area.width / cols;
    const cellH = area.height / rows;
    setScatter(options.map((_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const slackX = Math.max(0, cellW - size) * 0.8;
      const slackY = Math.max(0, cellH - size) * 0.8;
      return {
        left: col * cellW + (cellW - size) / 2 + (Math.random() - 0.5) * slackX,
        top: row * cellH + (cellH - size) / 2 + (Math.random() - 0.5) * slackY,
        rotate: Math.random() * 30 - 15,
      };
    }));
  }, [options, scatterLayout, area.width, area.height]);

  const handleBack = () => {
    onGameEnd?.(statsRef.current);
    onBack();
  };

  const handlePick = (item: Item, e: React.PointerEvent) => {
    if (feedback !== 'idle' || !target || trophy) return;
    const responseTime = Date.now() - questionStartRef.current;
    statsRef.current.total++;

    if (item.name === target.name) {
      statsRef.current.correct++;
      trackAnswer('correct', item.name, 'find-it', responseTime);
      setFeedback('correct');
      setBurst({ x: e.clientX, y: e.clientY, key: Date.now() });
      playCorrectSound();
      later(() => playSound(target.soundFrequency), 250);
      say(praiseClip(PRAISE_KEYS[Math.floor(Math.random() * PRAISE_KEYS.length)]), language);

      const nextStars = stars + 1;
      setStars(nextStars);
      if (nextStars >= STARS_PER_TROPHY) {
        later(() => { setTrophy(true); playFanfare(); say(praiseClip('amazing'), language); }, 700);
        later(() => { setTrophy(false); setStars(0); newRound(); }, 3600);
      } else {
        later(newRound, 1500);
      }
    } else {
      trackAnswer('incorrect', item.name, 'find-it', responseTime);
      playIncorrectSound();
      // Name what was tapped — still a chance to learn a word
      say(nameClip(item.name), language);
      setWrongName(item.name);
      setMisses(m => m + 1);
      later(() => setWrongName(w => (w === item.name ? null : w)), 820);
    }
  };

  if (activeItems.length < 2 || !target) return null;

  const showHint = misses >= 2 && feedback === 'idle';

  const renderOption = (item: Item, index: number, style: React.CSSProperties, emojiSize: number, rotate = 0) => {
    const isTarget = item.name === target.name;
    const isWrong = wrongName === item.name;
    const won = feedback === 'correct' && isTarget;
    const dimmed = feedback === 'correct' && !isTarget;
    return (
      <button
        key={`${round}-${item.name}`}
        onPointerDown={(e) => handlePick(item, e)}
        className={`flex items-center justify-center rounded-[22px] transition-all duration-300 active:scale-90
          ${isScattered ? 'absolute' : 'paper-card relative w-full h-full'}
          ${won ? `z-10 found ${isScattered ? 'scale-125' : 'scale-105'}` : ''}
          ${dimmed ? 'opacity-30 scale-90' : ''}
          ${isWrong ? 'animate-shake wrong' : ''}`}
        style={style}
      >
        <span style={{ transform: rotate ? `rotate(${rotate}deg)` : undefined, display: 'inline-block' }}>
          <ItemArt
            name={item.name}
            size={emojiSize}
            className={`block pop-in ${showHint && isTarget ? 'wiggle-loop' : ''}`}
            style={{ animationDelay: showHint && isTarget ? undefined : `${index * 45}ms` }}
          />
        </span>
      </button>
    );
  };

  let content: React.ReactNode = null;
  if (area.width > 0) {
    if (isScattered && scatterLayout) {
      content = options.map((item, i) => {
        const pos = scatter[i];
        if (!pos) return null;
        return renderOption(item, i, {
          left: pos.left,
          top: pos.top,
          width: scatterLayout.size,
          height: scatterLayout.size,
        }, scatterLayout.size * 0.8, pos.rotate);
      });
    } else {
      const grid = bestGrid(count, area.width, area.height);
      const gap = 14;
      const cell = Math.min((area.width - gap * (grid.cols - 1)) / grid.cols, (area.height - gap * (grid.rows - 1)) / grid.rows);
      content = (
        <div
          className="grid mx-auto"
          style={{
            gridTemplateColumns: `repeat(${grid.cols}, ${cell}px)`,
            gridTemplateRows: `repeat(${grid.rows}, ${cell}px)`,
            gap,
            width: 'fit-content',
            height: '100%',
            alignContent: 'center',
          }}
        >
          {options.map((item, i) => renderOption(item, i, {}, Math.min(cell * 0.74, 240)))}
        </div>
      );
    }
  }

  const tone = toneFor(target);

  return (
    <div
      className="paper-bg relative w-full h-full flex flex-col select-none overflow-hidden"
      style={{ '--bg': isScattered ? '#f4ead8' : tone.paper } as React.CSSProperties}
    >
      {/* Header */}
      <div className="shrink-0 flex items-start justify-between gap-2 px-4 pt-4">
        <HomeButton onClick={handleBack} />
        <div className="soft-btn flex gap-1 sm:gap-1.5 rounded-full px-3 py-2 mt-1">
          {Array.from({ length: STARS_PER_TROPHY }).map((_, i) => (
            <PaperStar key={i} filled={i < stars} className={`w-7 h-7 sm:w-9 sm:h-9 ${i < stars ? 'star-in' : ''}`} />
          ))}
        </div>
        <div className="w-14 sm:w-16" /> {/* space for the settings button */}
      </div>

      {/* The question on a strip of paper */}
      <div className="shrink-0 flex items-center justify-center gap-3 px-4 mt-3 mb-3">
        <span key={round} className="paper-banner pop-in" style={{ '--c': tone.deep, fontSize: 'clamp(26px, 6.5vmin, 64px)' } as React.CSSProperties}>
          {findText(language, target.name, t)}
        </span>
        <RoundButton onClick={() => askFor(target)} label="Say again" className="soft-btn shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full">
          <SpeakerIcon className="w-[58%] h-[58%]" />
        </RoundButton>
      </div>

      {/* Play area */}
      <div ref={areaRef} className="relative flex-1 min-h-0 mx-3 sm:mx-6 mb-4">
        {content}
      </div>

      {burst && <Burst key={burst.key} x={burst.x} y={burst.y} />}

      {trophy && (
        <>
          <ConfettiRain />
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none" style={{ background: 'rgba(45,36,64,0.15)' }}>
            <span className="paper-banner pop-in" style={{ '--c': PAL.sun, fontSize: 'clamp(56px, 15vmin, 140px)' } as React.CSSProperties}>
              {t('amazing')}
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default FindItGame;
