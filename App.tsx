
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
import FootballGame from './games/FootballGame';
import { PAL } from './components/art';
import { GearIcon, ItemArt } from './components/paper';

// The 3D game pulls in three.js — only download it when someone opens it
const VroomGame = React.lazy(() => import('./VroomGame'));

type GameMode = 'name-it' | 'find-it' | 'vroom' | 'drive' | 'coloring' | 'football';

// Wordmark letters, each cut from a different colour of paper
const TITLE_COLORS: [string, string][] = [
  [PAL.tomato, PAL.tomatoShade], [PAL.sun, PAL.sunShade], [PAL.leaf, PAL.leafShade], [PAL.sea, PAL.seaShade],
  [PAL.grape, PAL.grapeShade], [PAL.pink, PAL.pinkShade], [PAL.teal, PAL.tealShade],
];

interface CardDef {
  mode: GameMode;
  titleKey: string;
  color: string;
  shade: string;
  image: string; // a scene from the game in the paper-collage house style, in public/assets/menu
  isNew?: boolean;
}

const CARDS: CardDef[] = [
  { mode: 'name-it', titleKey: 'popItGameTitle', color: PAL.sea, shade: PAL.seaShade, image: '/assets/menu/kas.webp' },
  { mode: 'find-it', titleKey: 'findItGameTitle', color: PAL.grape, shade: PAL.grapeShade, image: '/assets/menu/kur.webp' },
  { mode: 'vroom', titleKey: 'vroomGameTitle', color: PAL.teal, shade: PAL.tealShade, image: '/assets/menu/brrum.webp' },
  { mode: 'drive', titleKey: 'driveGameTitle', color: PAL.sun, shade: PAL.sunShade, image: '/assets/menu/braucam.webp', isNew: true },
  { mode: 'coloring', titleKey: 'coloringGameTitle', color: PAL.pink, shade: PAL.pinkShade, image: '/assets/menu/krasosim.webp', isNew: true },
  { mode: 'football', titleKey: 'footballGameTitle', color: PAL.leaf, shade: PAL.leafShade, image: '/assets/menu/futbols.webp', isNew: true },
];

// --- Menu ---

// Each picture sits a little crooked, as if taped on by hand
const TILTS = [-1.4, 1, -0.6, 1.3, -1.1, 0.7];
// Washi tape: soft stripes in house colours
const TAPES = [PAL.sun, PAL.pink, PAL.sea, PAL.leaf, PAL.grape, PAL.tomato].map(
  c => `repeating-linear-gradient(-45deg, ${c}cc 0 7px, ${c}88 7px 14px)`
);

// A string of paper flags across the top of the page
const Bunting: React.FC = () => {
  const colors = [PAL.tomato, PAL.sun, PAL.teal, PAL.pink, PAL.sea, PAL.leaf, PAL.grape];
  const n = 18;
  return (
    <svg className="bunting absolute top-0 left-0 w-full pointer-events-none" viewBox="0 0 1000 70" preserveAspectRatio="none" aria-hidden="true">
      <path d="M-10 4 Q500 30 1010 4" fill="none" stroke="#b9a68a" strokeWidth="1.6" />
      {Array.from({ length: n }, (_, i) => {
        const x = (i + 0.5) * (1000 / n);
        const y = 4 + 13 * (1 - Math.pow((x - 500) / 510, 2));
        return (
          <path
            key={i}
            className="bunting-flag"
            d={`M${x - 18} ${y - 1} L${x + 18} ${y - 1} L${x} ${y + 30} Z`}
            fill={colors[i % colors.length]}
            style={{ animationDelay: `${-i * 0.37}s`, transformOrigin: `${x}px ${y}px` }}
          />
        );
      })}
    </svg>
  );
};

// Cut-paper hills along the bottom of the page
const PaperHills: React.FC = () => (
  <svg className="absolute bottom-0 left-0 w-full pointer-events-none" style={{ height: '26%' }} viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">
    <path className="paper-cut" d="M0 120 C 160 40, 300 60, 450 110 S 780 150, 1000 70 L1000 200 L0 200 Z" fill="#e9dcc3" />
    <path className="paper-cut" d="M0 170 C 200 110, 380 130, 560 160 S 860 170, 1000 130 L1000 200 L0 200 Z" fill="#e1d1b4" />
  </svg>
);

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

  let letter = 0;
  return (
    <div className="paper relative w-full h-full flex flex-col select-none overflow-hidden">
      <PaperHills />
      <Bunting />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between gap-3 px-5 sm:px-8 shrink-0" style={{ paddingTop: 'clamp(24px, 5vmin, 46px)' }}>
        <h1 className="wordmark leading-none whitespace-nowrap" style={{ fontSize: 'clamp(30px, 8.5vmin, 84px)' }} aria-label={title}>
          {Array.from(title).map((ch, i) => {
            if (ch === ' ') return <span key={i} className="inline-block" style={{ width: '0.3em' }} />;
            const [c] = TITLE_COLORS[letter++ % TITLE_COLORS.length];
            return (
              <span key={i} className="wordmark-letter inline-block" style={{ color: c, animationDelay: `${i * 0.12}s` }}>
                {ch}
              </span>
            );
          })}
        </h1>
        <button onClick={onOpenSettings} className="soft-btn pl-[0.3em] pr-[0.15em] rounded-full flex items-center gap-[0.12em] shrink-0" style={{ height: 'clamp(44px, 10vmin, 68px)', fontSize: 'clamp(44px, 10vmin, 68px)' }} aria-label={t('Settings')}>
          <span className="leading-none" style={{ fontSize: '0.48em' }}>{flag}</span>
          <GearIcon className="w-[46%] h-[46%]" />
        </button>
      </div>

      {/* Game cards: one big column to scroll on phones, a grid that fits the screen elsewhere */}
      <div className="menu-scroll relative z-10 flex-1 min-h-0">
        <div className="menu-grid">
          {CARDS.map(({ mode, titleKey, color, shade, image, isNew }, i) => (
            <button
              key={mode}
              onClick={() => handleSelection(mode)}
              className="game-card"
              style={{ '--c': color, '--s': shade, '--tilt': `${TILTS[i % TILTS.length]}deg`, '--tape': TAPES[i % TAPES.length], animationDelay: `${120 + i * 90}ms` } as React.CSSProperties}
            >
              <img className="game-card-scene" src={image} alt="" draggable={false} />
              <span className="game-card-tape" />
              <span className="game-card-title">{t(titleKey)}</span>
              {isNew && <span className="game-card-new">{t('newBadge')}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const Loading: React.FC = () => (
  <div className="paper-bg w-full h-full flex items-center justify-center">
    <ItemArt name="Race Car" size="clamp(120px, 26vmin, 220px)" className="bob" />
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
      case 'football':
        return <FootballGame t={t} onBack={handleGoBack} language={language} />;
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
          className="soft-btn absolute top-4 right-4 z-50 w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center"
          aria-label={t('Settings')}
        >
          <GearIcon className="w-[52%] h-[52%]" />
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
