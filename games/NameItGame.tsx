import React, { useCallback, useEffect, useRef, useState } from 'react';
import { pronunciations } from '../constants';
import { playSound, playPop } from '../services/audioService';
import { say } from '../services/speechService';
import { nameClip } from '../speech/phrases';
import { trackInteraction } from '../services/analyticsService';
import type { Item } from '../types';
import { Burst, HomeButton } from '../components/ui';
import { ItemArt, PaperBubbles, SpeakerIcon, toneFor } from '../components/paper';

const shuffle = <T,>(array: T[]): T[] => {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

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
  const { name } = current;
  const tone = toneFor(current);
  const pron = pronunciations[language]?.[name];

  return (
    <div
      className="paper-bg relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none cursor-pointer"
      style={{ '--bg': tone.paper } as React.CSSProperties}
      onPointerDown={handleTap}
    >
      <PaperBubbles />

      <div className="absolute top-4 left-4 z-20">
        <HomeButton onClick={onBack} />
      </div>

      <div key={round} className={`relative flex flex-col items-center px-4 ${leaving ? 'pop-out' : 'pop-in'}`}>
        {/* The picture sits in a big see-through paper bubble */}
        <div
          className="paper-bubble rounded-full flex items-center justify-center"
          style={{ width: 'clamp(210px, 58vmin, 560px)', height: 'clamp(210px, 58vmin, 560px)' }}
        >
          <ItemArt
            key={revealed ? 'said' : 'quiet'}
            name={name}
            size="72%"
            className={revealed ? 'wiggle' : 'bob'}
          />
        </div>
        <div className="mt-4 sm:mt-6 flex flex-col items-center" style={{ minHeight: 'clamp(56px, 13vmin, 150px)' }}>
          {revealed ? (
            <span className="paper-banner pop-in" style={{ '--c': tone.deep, fontSize: 'clamp(38px, 10vmin, 112px)' } as React.CSSProperties}>
              {t(name)}
            </span>
          ) : (
            <span className="paper-question" style={{ '--c': tone.deep } as React.CSSProperties}>?</span>
          )}
          {revealed && pron && (
            <div className="mt-2 font-semibold text-center" style={{ color: '#2d2440', opacity: 0.55, fontSize: 'clamp(16px, 4.5vmin, 44px)' }}>
              [{pron}]
            </div>
          )}
        </div>
      </div>

      <button
        onPointerDown={(e) => { e.stopPropagation(); reveal(); }}
        className="soft-btn absolute bottom-5 right-5 w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center z-20"
        aria-label="Say again"
      >
        <SpeakerIcon className="w-[55%] h-[55%]" />
      </button>

      {burst && <Burst key={burst.key} x={burst.x} y={burst.y} />}
    </div>
  );
};

export default NameItGame;
