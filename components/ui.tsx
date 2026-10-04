import React, { useEffect, useMemo, useState } from 'react';
import { availableLanguages } from '../constants';
import { playUIClick, playMenuClose } from '../services/audioService';
import { hasVoice, isSpeechEnabled, onVoicesChanged, setSpeechEnabled } from '../services/speechService';
import { trackSettingsChange } from '../services/analyticsService';
import { GearIcon, PaperStar, SpeakerIcon } from './paper';

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTY_COUNTS: Record<Difficulty, number> = { easy: 4, medium: 6, hard: 12 };

// --- Buttons ---

export const HomeButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onPointerDown={(e) => e.stopPropagation()}
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className="soft-btn w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center"
    aria-label="Home"
  >
    <svg viewBox="0 0 24 24" className="w-[52%] h-[52%]" strokeLinejoin="round" strokeLinecap="round">
      <path d="M3.5 11 L12 3.8 L20.5 11" fill="none" stroke="#2d2440" strokeWidth="2.6" />
      <path d="M6 9.6 V19.2 Q6 20.2 7 20.2 H17 Q18 20.2 18 19.2 V9.6 L12 4.6 Z" fill="#ef5b45" stroke="#2d2440" strokeWidth="2.2" />
      <path d="M10 20.2 V15 Q10 14 11 14 H13 Q14 14 14 15 V20.2" fill="#f6b93b" stroke="#2d2440" strokeWidth="2" />
    </svg>
  </button>
);

export const RoundButton: React.FC<{
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}> = ({ onClick, label, children, className = '' }) => (
  <button
    onPointerDown={(e) => e.stopPropagation()}
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    className={`toy-btn rounded-2xl bg-white/95 flex items-center justify-center ${className}`}
    aria-label={label}
  >
    {children}
  </button>
);

// --- Hooks ---

// Callback ref, so measuring starts whenever the element actually mounts
export const useElementSize = <T extends HTMLElement>() => {
  const [el, setEl] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size] as const;
};

// --- Celebration effects ---

const BURST_COLORS = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#facc15'];

// A one-shot burst of confetti from a point (viewport coordinates).
export const Burst: React.FC<{ x: number; y: number; count?: number; emoji?: string }> = ({ x, y, count = 18, emoji }) => {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 70 + Math.random() * 110;
        return {
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist - 30,
          r: (Math.random() - 0.5) * 720,
          color: BURST_COLORS[i % BURST_COLORS.length],
          size: 8 + Math.random() * 10,
          round: Math.random() > 0.5,
          useEmoji: !!emoji && i % 3 === 0,
        };
      }),
    [count, emoji]
  );
  return (
    <div className="fixed pointer-events-none z-[60]" style={{ left: x, top: y }}>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="burst-piece absolute block"
          style={{
            '--dx': `${p.dx}px`,
            '--dy': `${p.dy}px`,
            '--r': `${p.r}deg`,
            width: p.useEmoji ? undefined : p.size,
            height: p.useEmoji ? undefined : p.size * (p.round ? 1 : 0.5),
            background: p.useEmoji ? undefined : p.color,
            borderRadius: p.round ? '50%' : 3,
            fontSize: p.useEmoji ? 26 : undefined,
            marginLeft: -p.size / 2,
            marginTop: -p.size / 2,
          } as React.CSSProperties}
        >
          {p.useEmoji ? emoji : null}
        </span>
      ))}
    </div>
  );
};

// Full-screen confetti shower for big wins.
export const ConfettiRain: React.FC<{ count?: number }> = ({ count = 60 }) => {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 1.8 + Math.random() * 1.6,
        r: (Math.random() - 0.5) * 900,
        color: BURST_COLORS[i % BURST_COLORS.length],
        w: 8 + Math.random() * 8,
        h: 10 + Math.random() * 12,
      })),
    [count]
  );
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-[60]">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="rain-piece absolute top-0 block rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.w,
            height: p.h,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            '--r': `${p.r}deg`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
};

// --- Settings ---

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  t: (key: string) => string;
  language: string;
  onLanguageChange: (lang: string) => void;
  difficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  emojiCount: number;
  onEmojiCountChange: (n: number) => void;
}

export const SettingsSheet: React.FC<SettingsSheetProps> = ({
  open, onClose, t, language, onLanguageChange, difficulty, onDifficultyChange, emojiCount, onEmojiCountChange,
}) => {
  const [speakOn, setSpeakOn] = useState(isSpeechEnabled());
  const [, forceUpdate] = useState(0);
  useEffect(() => onVoicesChanged(() => forceUpdate(n => n + 1)), []);
  const voiceAvailable = hasVoice(language);

  const close = () => { playMenuClose(); onClose(); };

  return (
    <div
      className={`fixed inset-0 z-[70] flex items-center justify-center p-4 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      style={{ background: 'rgba(30, 27, 75, 0.45)', backdropFilter: 'blur(4px)' }}
      onClick={close}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className={`w-full max-w-md max-h-full overflow-y-auto rounded-[28px] bg-white shadow-2xl p-5 sm:p-6 text-slate-800 transition-transform duration-300 ${open ? 'scale-100' : 'scale-90'}`}
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: 'pan-y' }}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold flex items-center gap-2"><GearIcon className="w-7 h-7" />{t('Settings')}</h2>
          <button onClick={close} className="w-11 h-11 rounded-full bg-slate-100 text-2xl text-slate-600 active:scale-90 transition-transform" aria-label="Close">
            <svg viewBox="0 0 24 24" className="w-6 h-6 mx-auto" fill="none" stroke="#2d2440" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6 L18 18 M18 6 L6 18" /></svg>
          </button>
        </div>

        <section className="mb-5">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">{t('language')}</h3>
          <div className="grid grid-cols-4 gap-2">
            {availableLanguages.map(({ code, flag, name }) => (
              <button
                key={code}
                onClick={() => { playUIClick(); onLanguageChange(code); trackSettingsChange('language', code); }}
                className={`rounded-2xl py-2 flex flex-col items-center transition-all active:scale-95 ${language === code ? 'bg-sky-100 ring-4 ring-sky-400' : 'bg-slate-50 hover:bg-slate-100'}`}
              >
                <span className="text-3xl leading-none">{flag}</span>
                <span className="text-[11px] font-semibold mt-1 text-slate-600">{name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mb-5">
          <button
            onClick={() => { playUIClick(); const next = !speakOn; setSpeakOn(next); setSpeechEnabled(next); trackSettingsChange('speak_words', next ? 'on' : 'off'); }}
            className="w-full flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 active:scale-[0.98] transition-transform"
          >
            <span className="flex items-center gap-3 text-lg font-semibold">
              <SpeakerIcon className="w-7 h-7" />{t('speakWords')}
            </span>
            <span className={`w-14 h-8 rounded-full p-1 transition-colors ${speakOn ? 'bg-green-500' : 'bg-slate-300'}`}>
              <span className={`block w-6 h-6 rounded-full bg-white shadow transition-transform ${speakOn ? 'translate-x-6' : ''}`} />
            </span>
          </button>
          {speakOn && !voiceAvailable && (
            <p className="text-xs text-slate-500 mt-2 px-1">{t('noVoice')}</p>
          )}
        </section>

        <section className="mb-4">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">{t('difficulty')} · {t('findItGameTitle')}</h3>
          <div className="grid grid-cols-3 gap-2">
            {(['easy', 'medium', 'hard'] as const).map((level, i) => (
              <button
                key={level}
                onClick={() => { playUIClick(); onDifficultyChange(level); }}
                className={`rounded-2xl py-3 flex flex-col items-center font-semibold transition-all active:scale-95 ${difficulty === level ? 'bg-amber-100 ring-4 ring-amber-400' : 'bg-slate-50 hover:bg-slate-100'}`}
              >
                <span className="flex">{Array.from({ length: i + 1 }, (_, k) => <PaperStar key={k} filled className="w-6 h-6" />)}</span>
                <span className="text-sm mt-1">{t(level)}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <label htmlFor="emoji-count-slider" className="flex justify-between text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">
            <span>{t('itemCount')}</span>
            <span className="text-slate-800">{emojiCount}</span>
          </label>
          <input
            id="emoji-count-slider"
            type="range"
            min={4}
            max={36}
            value={emojiCount}
            onChange={(e) => onEmojiCountChange(parseInt(e.target.value, 10))}
            className="w-full accent-sky-500"
            style={{ touchAction: 'pan-x' }}
          />
        </section>
      </div>
    </div>
  );
};
