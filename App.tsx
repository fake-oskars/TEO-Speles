
import React, { Suspense, useState, useEffect, useRef } from 'react';
import { ALL_ITEMS, translations, availableLanguages } from './constants';
import {
  initializeAudio,
  playUIClick,
  playMenuOpen,
  playTransitionSound
} from './services/audioService';
import { unlockSpeech, stopSpeaking, loadVoicePack } from './services/speechService';
import {
  trackPageView,
  trackScreenView,
  trackGameStart,
  trackGameEnd,
  trackSettingsChange,
  trackAppInit
} from './services/analyticsService';
import { SettingsSheet, DIFFICULTY_COUNTS, type Difficulty } from './components/ui';
import NameItGame from './games/NameItGame';
import FindItGame from './games/FindItGame';
import DriveGame from './games/DriveGame';
import ColoringGame from './games/ColoringGame';

// The 3D game pulls in three.js — only download it when someone opens it
const VroomGame = React.lazy(() => import('./VroomGame'));

type GameMode = 'name-it' | 'find-it' | 'vroom' | 'drive' | 'coloring';

const TITLE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

// --- Menu card illustrations ---

const NameItArt: React.FC = () => {
  const emojis = ['🐄', '🍎', '🚗', '🎈', '🦁', '🌻'];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI(n => (n + 1) % emojis.length), 1800);
    return () => clearInterval(id);
  }, [emojis.length]);
  return (
    <div className="relative flex items-center justify-center">
      <div className="absolute rounded-full bg-white/30" style={{ width: '1.6em', height: '1.6em' }} />
      <span key={i} className="relative inline-block" style={{ animation: 'fadeInScale 0.5s cubic-bezier(.34,1.56,.64,1)' }}>{emojis[i]}</span>
    </div>
  );
};

const FindItArt: React.FC = () => (
  <div className="relative grid grid-cols-2 gap-[0.08em] text-[0.55em]">
    {['🐶', '🍌', '🚂', '⭐'].map(e => (
      <span key={e} className="bg-white/35 rounded-2xl p-[0.12em] leading-none text-center">{e}</span>
    ))}
    <span className="absolute left-1/2 top-1/2 text-[1.1em] orbit-animation" style={{ marginLeft: '-0.5em', marginTop: '-0.5em', '--orbit': '0.55em' } as React.CSSProperties}>🔍</span>
  </div>
);

const VroomArt: React.FC = () => (
  <div className="relative" style={{ width: '1.9em', height: '1.35em' }}>
    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 70" fill="none">
      <path d="M8 12 C8 52, 20 58, 38 58 C50 58, 56 56, 62 48 C68 40, 72 28, 74 18" stroke="white" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
      <rect x="82" y="48" width="7" height="7" rx="1" fill="white" opacity="0.6" />
      <rect x="82" y="40" width="7" height="7" rx="1" fill="white" opacity="0.45" />
      <rect x="75" y="48" width="7" height="7" rx="1" fill="white" opacity="0.45" />
    </svg>
    <span className="absolute vroom-jump-car text-[0.55em] leading-none">🏎️</span>
  </div>
);

const DriveArt: React.FC = () => (
  <div className="relative" style={{ width: '1.9em', height: '1.3em' }}>
    <span className="absolute text-[0.35em] leading-none" style={{ left: '8%', top: '0%' }}>☀️</span>
    <span className="absolute text-[0.42em] leading-none" style={{ right: '4%', top: '12%' }}>🌳</span>
    <span className="absolute text-[0.3em] leading-none" style={{ right: '34%', top: '28%' }}>🍎</span>
    <div className="absolute left-0 right-0 rounded-md bg-slate-600" style={{ bottom: '6%', height: '26%' }}>
      <div
        className="absolute left-0 right-0 top-1/2 h-[3px] -mt-[1.5px] road-dash"
        style={{ backgroundImage: 'linear-gradient(90deg, #fde047 0 50%, transparent 50% 100%)', backgroundSize: '40px 3px' }}
      />
    </div>
    <span className="absolute cruise text-[0.6em] leading-none" style={{ left: '14%', bottom: '14%' }}>🚙</span>
  </div>
);

const ColoringArt: React.FC = () => {
  const colors = ['#facc15', '#f472b6', '#22c55e', '#38bdf8', '#fb923c', '#a855f7'];
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI(n => (n + 1) % colors.length), 1100);
    return () => clearInterval(id);
  }, [colors.length]);
  return (
    <div className="relative" style={{ width: '1.3em', height: '1.1em' }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
        <path
          d="M50 6 L62 36 L94 38 L69 58 L78 90 L50 72 L22 90 L31 58 L6 38 L38 36 Z"
          fill={colors[i]}
          stroke="#1c1917"
          strokeWidth="5"
          strokeLinejoin="round"
          style={{ transition: 'fill 0.4s ease' }}
        />
      </svg>
      <span className="absolute bob text-[0.5em] leading-none" style={{ right: '-22%', bottom: '-6%' }}>🖍️</span>
    </div>
  );
};

interface CardDef {
  mode: GameMode;
  titleKey: string;
  gradient: string;
  Art: React.FC;
  isNew?: boolean;
}

const CARDS: CardDef[] = [
  { mode: 'name-it', titleKey: 'popItGameTitle', gradient: 'linear-gradient(160deg, #38bdf8 0%, #2563eb 100%)', Art: NameItArt },
  { mode: 'find-it', titleKey: 'findItGameTitle', gradient: 'linear-gradient(160deg, #f472b6 0%, #e11d48 100%)', Art: FindItArt },
  { mode: 'vroom', titleKey: 'vroomGameTitle', gradient: 'linear-gradient(160deg, #34d399 0%, #059669 100%)', Art: VroomArt },
  { mode: 'drive', titleKey: 'driveGameTitle', gradient: 'linear-gradient(160deg, #fbbf24 0%, #f97316 100%)', Art: DriveArt, isNew: true },
  { mode: 'coloring', titleKey: 'coloringGameTitle', gradient: 'linear-gradient(160deg, #c084fc 0%, #7c3aed 100%)', Art: ColoringArt, isNew: true },
];

// --- Menu ---

const GameSelection: React.FC<{
  onSelect: (mode: GameMode) => void;
  onOpenSettings: () => void;
  t: (key: string) => string;
  language: string;
}> = ({ onSelect, onOpenSettings, t, language }) => {
  const flag = availableLanguages.find(l => l.code === language)?.flag ?? '🌐';
  const title = t('selectGame');

  const handleSelection = (mode: GameMode) => {
    playTransitionSound();
    setTimeout(() => onSelect(mode), 120);
  };

  return (
    <div className="relative w-full h-full flex flex-col select-none overflow-hidden" style={{ background: 'linear-gradient(180deg, #7dd3fc 0%, #bae6fd 55%, #e0f2fe 100%)' }}>
      {/* Sky decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-10 -left-10 w-40 h-40 sm:w-56 sm:h-56 rounded-full bg-yellow-300 shadow-[0_0_80px_30px_rgba(253,224,71,0.5)]" />
        {[
          { top: '10%', size: 64, dur: 60, delay: -10 },
          { top: '24%', size: 44, dur: 45, delay: -30 },
          { top: '6%', size: 52, dur: 75, delay: -50 },
        ].map((c, i) => (
          <span key={i} className="absolute left-0 drift opacity-90" style={{ top: c.top, fontSize: c.size, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}>☁️</span>
        ))}
        <svg className="absolute bottom-0 left-0 w-full h-[28%]" viewBox="0 0 1200 300" preserveAspectRatio="none">
          <path d="M0 140 C 200 60, 380 60, 560 130 S 900 210, 1200 100 L1200 300 L0 300 Z" fill="#86efac" />
          <path d="M0 210 C 250 150, 450 170, 700 220 S 1050 250, 1200 190 L1200 300 L0 300 Z" fill="#4ade80" />
        </svg>
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 sm:px-6 pt-3 sm:pt-5 shrink-0">
        <h1 className="font-bold text-outline tracking-tight leading-none" style={{ fontSize: 'clamp(34px, 8vmin, 76px)' }}>
          {Array.from(title).map((ch, i) => (
            <span key={i} className="inline-block" style={{ color: ch === ' ' ? undefined : TITLE_COLORS[i % TITLE_COLORS.length], transform: `rotate(${(i % 2 ? 1 : -1) * 3}deg)` }}>
              {ch === ' ' ? ' ' : ch}
            </span>
          ))}
        </h1>
        <button
          onClick={onOpenSettings}
          className="toy-btn h-14 sm:h-16 px-4 rounded-2xl bg-white/95 flex items-center gap-2 text-3xl"
          aria-label={t('Settings')}
        >
          <span>{flag}</span>
          <span className="text-2xl">⚙️</span>
        </button>
      </div>

      {/* Game cards */}
      <div className="relative z-10 flex-1 min-h-0 grid portrait:grid-cols-2 landscape:grid-cols-5 gap-3 sm:gap-5 p-4 sm:p-6 w-full max-w-6xl mx-auto">
        {CARDS.map(({ mode, titleKey, gradient, Art, isNew }, i) => (
          <button
            key={mode}
            onClick={() => handleSelection(mode)}
            className={`toy-btn pop-in relative rounded-[28px] sm:rounded-[36px] flex flex-col items-center justify-center overflow-hidden min-h-0 focus:outline-none ${i === CARDS.length - 1 && CARDS.length % 2 === 1 ? 'portrait:col-span-2' : ''}`}
            style={{ background: gradient, animationDelay: `${i * 80}ms` }}
          >
            <span className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-white/15" />
            <span className="absolute -bottom-10 -left-6 w-24 h-24 rounded-full bg-white/10" />
            {isNew && (
              <span className="absolute top-2 right-2 sm:top-3 sm:right-3 text-2xl sm:text-3xl wiggle-loop">✨</span>
            )}
            <div className="flex-1 min-h-0 flex items-center justify-center" style={{ fontSize: 'clamp(48px, 14vmin, 130px)' }}>
              <Art />
            </div>
            <h2 className="pb-3 sm:pb-5 font-bold text-white text-outline leading-none" style={{ fontSize: 'clamp(22px, 5.5vmin, 50px)' }}>
              {t(titleKey)}
            </h2>
          </button>
        ))}
      </div>
    </div>
  );
};

const Loading: React.FC = () => (
  <div className="w-full h-full flex items-center justify-center bg-sky-200">
    <span className="text-8xl bob">🏎️</span>
  </div>
);

// --- Main App ---

const App: React.FC = () => {
  const [gameMode, setGameMode] = useState<GameMode | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // A ref, so stats reported right before leaving a game are not read stale
  const gameStatsRef = useRef<{ correct: number; total: number } | null>(null);

  // --- Settings state with localStorage ---
  const [language, setLanguage] = useState<string>(() => localStorage.getItem('toddlerPopLanguage') || 'lv');
  const [emojiCount, setEmojiCount] = useState<number>(() => {
    const savedCount = localStorage.getItem('toddlerPopEmojiCount');
    return savedCount ? parseInt(savedCount, 10) : DIFFICULTY_COUNTS.easy;
  });
  const [difficulty, setDifficulty] = useState<Difficulty>(() => (localStorage.getItem('toddlerPopDifficulty') as Difficulty) || 'easy');

  useEffect(() => {
    localStorage.setItem('toddlerPopLanguage', language);
    document.documentElement.lang = language;
    loadVoicePack(language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem('toddlerPopEmojiCount', emojiCount.toString());
  }, [emojiCount]);

  useEffect(() => {
    localStorage.setItem('toddlerPopDifficulty', difficulty);
  }, [difficulty]);

  // Initialize analytics, audio and speech
  useEffect(() => {
    trackAppInit();
    trackPageView('/', 'Teo Spēles - Bērnu Emoji spēles');
    trackScreenView('menu');

    const unlock = () => {
      initializeAudio();
      unlockSpeech();
    };

    window.addEventListener('touchstart', unlock, { once: true });
    window.addEventListener('click', unlock, { once: true });

    return () => {
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('click', unlock);
    };
  }, []);

  const handleDifficultyChange = (level: Difficulty) => {
    setDifficulty(level);
    setEmojiCount(DIFFICULTY_COUNTS[level]);
    trackSettingsChange('difficulty', level);
  };

  const handleEmojiCountChange = (count: number) => {
    playUIClick();
    setEmojiCount(count);
    setDifficulty(count <= 4 ? 'easy' : count <= 6 ? 'medium' : 'hard');
    trackSettingsChange('emoji_count', count);
  };

  const handleSelectGame = (mode: GameMode) => {
    setGameMode(mode);
    // Vroom tracks its own start
    if (mode === 'vroom') return;
    trackScreenView(mode);
    if (mode === 'find-it') {
      trackGameStart(mode, difficulty, emojiCount);
    } else {
      trackGameStart(mode);
    }
  };

  const handleGoBack = () => {
    playUIClick();
    stopSpeaking();
    if (gameMode) {
      trackGameEnd(gameStatsRef.current || undefined);
    }
    setGameMode(null);
    gameStatsRef.current = null;
    setIsSettingsOpen(false);
    trackScreenView('menu');
  };

  const openSettings = () => {
    playMenuOpen();
    setIsSettingsOpen(true);
  };

  const t = (key: string) => translations[language]?.[key] || translations['en'][key] || key;

  const renderContent = () => {
    switch (gameMode) {
      case 'name-it':
        return <NameItGame activeItems={ALL_ITEMS} t={t} onBack={handleGoBack} language={language} />;
      case 'find-it':
        return <FindItGame activeItems={ALL_ITEMS} t={t} onBack={handleGoBack} emojiCount={emojiCount} language={language} onGameEnd={(stats) => { gameStatsRef.current = stats; }} />;
      case 'vroom':
        return (
          <Suspense fallback={<Loading />}>
            <VroomGame t={t} onBack={handleGoBack} language={language} />
          </Suspense>
        );
      case 'drive':
        return <DriveGame t={t} onBack={handleGoBack} language={language} />;
      case 'coloring':
        return <ColoringGame t={t} onBack={handleGoBack} language={language} />;
      default:
        return <GameSelection onSelect={handleSelectGame} onOpenSettings={openSettings} t={t} language={language} />;
    }
  };

  const showGear = gameMode === 'name-it' || gameMode === 'find-it';

  return (
    <>
      <div key={gameMode ?? 'menu'} className="screen-in w-full h-full">
        {renderContent()}
      </div>

      {showGear && (
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); openSettings(); }}
          className="toy-btn absolute top-4 right-4 z-50 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/95 flex items-center justify-center text-3xl"
          aria-label={t('Settings')}
        >
          ⚙️
        </button>
      )}

      <SettingsSheet
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        t={t}
        language={language}
        onLanguageChange={setLanguage}
        difficulty={difficulty}
        onDifficultyChange={handleDifficultyChange}
        emojiCount={emojiCount}
        onEmojiCountChange={handleEmojiCountChange}
      />
    </>
  );
};

export default App;
