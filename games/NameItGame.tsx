import React, { useCallback, useEffect, useRef, useState } from 'react';
import { pronunciations } from '../constants';
import { playSound, playPop } from '../services/audioService';
import { say } from '../services/speechService';
import { nameClip } from '../speech/phrases';
import { trackInteraction } from '../services/analyticsService';
import type { Item } from '../types';
import { Burst, HomeButton } from '../components/ui';

const shuffle = <T,>(array: T[]): T[] => {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const BUBBLES = Array.from({ length: 10 }, (_, i) => ({
  left: (i * 37) % 100,
  size: 30 + ((i * 53) % 90),
  duration: 9 + ((i * 7) % 8),
  delay: -((i * 3) % 10),
}));

interface NameItGameProps {
  activeItems: Item[];
  t: (key: string) => string;
  onBack: () => void;
  language: string;
}

// The child names the picture first. First tap reveals the answer (spoken + written),
// the next tap brings a new picture. Items come from a shuffled deck so every picture
// is seen before any repeats.
const NameItGame: React.FC<NameItGameProps> = ({ activeItems, t, onBack, language }) => {
  const deckRef = useRef<Item[]>([]);
  const [current, setCurrent] = useState<Item | null>(null);
  const [round, setRound] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [burst, setBurst] = useState<{ x: number; y: number; key: number } | null>(null);
  const busyRef = useRef(false);

  const drawNext = useCallback((previous: Item | null): Item | null => {
    if (activeItems.length === 0) return null;
    if (deckRef.current.length === 0) {
      deckRef.current = shuffle(activeItems);
      // Never show the same picture twice in a row across deck boundaries
      if (previous && deckRef.current.length > 1 && deckRef.current[0].name === previous.name) {
        deckRef.current.push(deckRef.current.shift()!);
      }
    }
    return deckRef.current.shift()!;
  }, [activeItems]);

  useEffect(() => {
    deckRef.current = [];
    const first = drawNext(null);
    setCurrent(first);
    setRevealed(false);
    // Only restart when the item pool changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItems]);

  const reveal = useCallback(() => {
    if (!current) return;
    playSound(current.soundFrequency);
    say(nameClip(current.name), language);
    setRevealed(true);
  }, [current, language]);

  const handleTap = useCallback((e: React.PointerEvent) => {
    if (busyRef.current || !current) return;
    busyRef.current = true;

    if (!revealed) {
      reveal();
      setBurst({ x: e.clientX, y: e.clientY, key: Date.now() });
      trackInteraction('name_it_reveal', { item: current.name });
      // Short pause so a quick double tap doesn't skip straight past the answer
      setTimeout(() => { busyRef.current = false; }, 700);
      return;
    }

    playPop();
    setLeaving(true);
    setTimeout(() => {
      setCurrent(drawNext(current));
      setRevealed(false);
      setLeaving(false);
      setRound(r => r + 1);
      busyRef.current = false;
    }, 250);
  }, [current, revealed, reveal, drawNext]);

  if (!current) return null;
  const { emoji, color, textColor, name } = current;
  const pron = pronunciations[language]?.[name];

  return (
    <div
      className={`relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none cursor-pointer transition-colors duration-500 ${color}`}
      onPointerDown={handleTap}
    >
      {/* Soft floating bubbles */}
      <div className="absolute inset-0 pointer-events-none">
        {BUBBLES.map((b, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white/25 floaty"
            style={{
              left: `${b.left}%`,
              top: `${(i * 29) % 90}%`,
              width: b.size,
              height: b.size,
              animationDuration: `${b.duration / 2}s`,
              animationDelay: `${b.delay}s`,
            }}
          />
        ))}
      </div>

      <div className="absolute top-4 left-4 z-20">
        <HomeButton onClick={onBack} />
      </div>

      <div key={round} className={`relative flex flex-col items-center px-4 ${leaving ? 'pop-out' : 'pop-in'}`}>
        <div
          className="rounded-full bg-white/50 flex items-center justify-center shadow-[0_20px_60px_rgba(0,0,0,0.12)]"
          style={{ width: 'clamp(200px, 58vmin, 560px)', height: 'clamp(200px, 58vmin, 560px)' }}
        >
          <span key={revealed ? 'said' : 'quiet'} className={`inline-block ${revealed ? 'wiggle' : 'bob'}`} style={{ fontSize: 'clamp(110px, 36vmin, 380px)', lineHeight: 1 }}>{emoji}</span>
        </div>
        {revealed ? (
          <div
            className={`pop-in font-bold mt-4 sm:mt-6 text-center text-outline ${textColor}`}
            style={{ fontSize: 'clamp(40px, 11vmin, 128px)', lineHeight: 1.05 }}
          >
            {t(name)}
          </div>
        ) : (
          <div
            className={`font-bold mt-4 sm:mt-6 text-center opacity-40 ${textColor}`}
            style={{ fontSize: 'clamp(40px, 11vmin, 128px)', lineHeight: 1.05 }}
          >
            ?
          </div>
        )}
        {revealed && pron && (
          <div className={`mt-1 font-semibold opacity-60 text-center ${textColor}`} style={{ fontSize: 'clamp(16px, 4.5vmin, 44px)' }}>
            [{pron}]
          </div>
        )}
      </div>

      <button
        onPointerDown={(e) => { e.stopPropagation(); reveal(); }}
        className="toy-btn absolute bottom-5 right-5 w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/95 text-3xl sm:text-4xl flex items-center justify-center z-20"
        aria-label="Say again"
      >
        🔊
      </button>

      {burst && <Burst key={burst.key} x={burst.x} y={burst.y} emoji={emoji} />}
    </div>
  );
};

export default NameItGame;
