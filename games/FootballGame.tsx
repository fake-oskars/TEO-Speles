import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playKick, playWhistle, playCheer, playPost, playBoing, playFanfare, playPop, playIncorrectSound } from '../services/audioService';
import { say } from '../services/speechService';
import { nameClip, praiseClip, PRAISE_KEYS } from '../speech/phrases';
import { trackInteraction } from '../services/analyticsService';
import { Burst, ConfettiRain, HomeButton, useElementSize } from '../components/ui';
import { INK, PAL } from '../components/art';

// "Futbols!" — a target ring sweeps across the goal; tap anywhere (or press space)
// to shoot at it. The goalie really dives for the ball and saves it if it gets
// there in time, and it gets quicker with every goal, so timing matters.
// After each goal a new animal takes over the goal and its name is said aloud.
//
// Everything is drawn from paper cut-out images in public/assets/football/, the
// same collage style as the menu card.

const ART = '/assets/football';

// Each goalie's name is also its word in constants.tsx, so it can be said aloud
const GOALIES = ['Bear', 'Frog', 'Pig', 'Panda', 'Lion', 'Rabbit'];
const keeperImage = (name: string) => `${ART}/keeper-${name.toLowerCase()}.webp`;

// Where the frame sits inside goal.webp, as fractions of the image size
const GOAL_IMG = { aspect: 671 / 1400, postL: 0.026, postR: 0.97, post: 0.048, bar: 0.05 };

const GOALS_TO_WIN = 10;
const FLIGHT_MS = 700;

type Outcome = 'goal' | 'save' | 'post' | 'miss';
interface Point { x: number; y: number; }
interface Shot { from: Point; to: Point; start: number; outcome: Outcome; keeperFrom: number; keeperTo: number; reaction: number; }

// How long the ball keeps moving after it reaches the goal, and when the next ball appears
const AFTER_MS: Record<Outcome, number> = { goal: 500, save: 600, post: 550, miss: 600 };
const RESET_MS: Record<Outcome, number> = { goal: 1700, save: 1500, post: 1300, miss: 1200 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 2);

// The goalie and the aiming ring both get quicker as the goals add up (0 → first shot, 1 → last)
const skillFor = (goals: number) => {
  const k = clamp(goals / (GOALS_TO_WIN - 1), 0, 1);
  return {
    reaction: lerp(330, 130, k),    // ms before the goalie starts its dive
    diveSpeed: lerp(0.18, 0.34, k), // goal widths per second
    patrol: lerp(0.22, 0.3, k),     // how far it wanders, in goal widths
    aimSpeed: lerp(1.7, 2.9, k),    // radians per second of the sweeping ring
  };
};

const useLayout = (width: number, height: number) =>
  useMemo(() => {
    // goal.x0 / x1 are the post centres; the picture is laid out around them
    const goalW = Math.min(width * (width < height ? 0.9 : 0.78), height * 0.85, 820);
    const imgW = goalW / (GOAL_IMG.postR - GOAL_IMG.postL);
    const imgH = imgW * GOAL_IMG.aspect;
    const top = Math.max(height * 0.2, 96);
    const goalH = imgH * (1 - GOAL_IMG.bar);
    const goal = { x0: (width - goalW) / 2, x1: (width + goalW) / 2, cx: width / 2, top, bottom: top + goalH, w: goalW, h: goalH, post: imgW * GOAL_IMG.post };
    const goalImg = { left: goal.x0 - imgW * GOAL_IMG.postL, top: top - imgH * GOAL_IMG.bar, width: imgW, height: imgH };
    const ballSize = Math.min(width * 0.2, height * 0.15);
    // On tall screens, bring the ball up towards the goal instead of leaving a field of empty grass
    const ballY = Math.min(height - ballSize * 0.9 - height * 0.06, top + goalH + Math.max(goalH * 1.6, ballSize * 3));
    const ball = { x: width / 2, y: ballY, size: ballSize };
    const horizon = goal.top + goalH * 0.5;
    const keeperH = goalH * 0.84;
    // Half the keeper's width with gloves out — anything inside this is caught
    const reach = keeperH * 0.5;
    return { goal, goalImg, ball, horizon, keeperH, reach };
  }, [width, height]);

interface FootballGameProps {
  t: (key: string) => string;
  onBack: () => void;
  language: string;
}

const FootballGame: React.FC<FootballGameProps> = ({ t, onBack, language }) => {
  const [measureRef, { width, height }] = useElementSize<HTMLDivElement>();
  const elRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useCallback((el: HTMLDivElement | null) => { elRef.current = el; measureRef(el); }, [measureRef]);
  const layout = useLayout(width, height);
  const { goal, ball } = layout;

  const [goals, setGoals] = useState(0);
  const [goalieIdx, setGoalieIdx] = useState(0);
  const [banner, setBanner] = useState<Outcome | null>(null);
  const [burst, setBurst] = useState<{ x: number; y: number; key: number } | null>(null);
  const [won, setWon] = useState(false);
  const [ballKey, setBallKey] = useState(0);
  const [idle, setIdle] = useState(false);
  const [kickerMove, setKickerMove] = useState<{ kind: 'kick' | 'cheer'; key: number } | null>(null);
  const [, setFrame] = useState(0);

  const skill = skillFor(goals);
  const shotRef = useRef<Shot | null>(null);
  const keeperXRef = useRef<number | null>(null);
  const pressedRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const later = (fn: () => void, ms: number) => { timersRef.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  useEffect(() => { playWhistle(); }, []);

  // Nudge with a pointing hand when nobody has kicked for a while
  useEffect(() => {
    if (idle || shotRef.current) return;
    const id = window.setTimeout(() => setIdle(true), 4000);
    return () => clearTimeout(id);
  }, [idle, ballKey]);

  // Where the sweeping ring is aiming right now
  const aimAt = useCallback((now: number): Point => {
    const sweep = goal.w / 2 + goal.w * 0.06; // a little past the posts, so a badly timed shot misses
    // Constant speed back and forth, so it doesn't linger by the posts
    const phase = ((now / 1000) * skill.aimSpeed) / (2 * Math.PI);
    const tri = 2 * Math.abs(2 * (phase - Math.floor(phase + 0.5))) - 1;
    return {
      x: goal.cx + tri * sweep,
      y: goal.top + goal.h * (0.5 + 0.18 * Math.sin((now / 1000) * 0.9)),
    };
  }, [goal, skill.aimSpeed]);

  // --- Animation loop ---
  useEffect(() => {
    if (!width) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const shot = shotRef.current;
      if (shot && now - shot.start < FLIGHT_MS + AFTER_MS[shot.outcome]) {
        // Diving: hold still for the reaction time, then cover as much ground as it can
        const k = clamp((now - shot.start - shot.reaction) / (FLIGHT_MS - shot.reaction), 0, 1);
        keeperXRef.current = lerp(shot.keeperFrom, shot.keeperTo, easeOut(k));
      } else {
        // Patrolling: wander from post to post
        const target = goal.cx + Math.sin(now / 1300) * goal.w * skill.patrol;
        const x = keeperXRef.current ?? goal.cx;
        keeperXRef.current = x + (target - x) * Math.min(1, dt * 2.5);
      }
      setFrame(f => f + 1);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [width, goal, skill.patrol]);

  // --- Shooting ---
  const onGoal = (to: Point) => {
    playCheer();
    setKickerMove({ kind: 'cheer', key: Date.now() });
    say(praiseClip(PRAISE_KEYS[Math.floor(Math.random() * PRAISE_KEYS.length)]), language);
    const rect = elRef.current?.getBoundingClientRect();
    setBurst({ x: to.x + (rect?.left ?? 0), y: to.y + (rect?.top ?? 0), key: Date.now() });
    const total = goals + 1;
    setGoals(total);
    if (total >= GOALS_TO_WIN) {
      later(() => { setWon(true); playFanfare(); say(praiseClip('amazing'), language); }, 900);
      later(() => { setWon(false); setGoals(0); }, 5000);
    }
    // A new animal takes over the goal and introduces itself
    later(() => {
      const next = (goalieIdx + 1) % GOALIES.length;
      setGoalieIdx(next);
      playPop();
      if (total < GOALS_TO_WIN) say(nameClip(GOALIES[next]), language);
    }, RESET_MS.goal - 300);
  };

  const kick = () => {
    if (shotRef.current || won || !width) return;
    const start = performance.now();
    const to = aimAt(start);

    // Work out the dive up front: how far the goalie can get before the ball arrives
    const keeperFrom = keeperXRef.current ?? goal.cx;
    const reachable = skill.diveSpeed * goal.w * ((FLIGHT_MS - skill.reaction) / 1000);
    const keeperTo = clamp(keeperFrom + clamp(to.x - keeperFrom, -reachable, reachable), goal.x0, goal.x1);

    let outcome: Outcome;
    if (Math.min(Math.abs(to.x - goal.x0), Math.abs(to.x - goal.x1)) < goal.post * 1.6) outcome = 'post';
    else if (to.x < goal.x0 || to.x > goal.x1) outcome = 'miss';
    else if (Math.abs(to.x - keeperTo) < layout.reach) outcome = 'save';
    else outcome = 'goal';

    shotRef.current = { from: { x: ball.x, y: ball.y }, to, start, outcome, keeperFrom, keeperTo, reaction: skill.reaction };
    setIdle(false);
    setKickerMove({ kind: 'kick', key: start });
    playKick();
    trackInteraction('football_kick', { item: outcome });

    later(() => {
      setBanner(outcome);
      if (outcome === 'goal') onGoal(to);
      else if (outcome === 'post') playPost();
      else if (outcome === 'save') playIncorrectSound();
      else playBoing();
    }, FLIGHT_MS);

    later(() => {
      shotRef.current = null;
      setBanner(null);
      setBallKey(k => k + 1);
    }, RESET_MS[outcome]);
  };

  // Space bar shoots too
  const kickRef = useRef(kick);
  kickRef.current = kick;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      e.preventDefault();
      if (!e.repeat) kickRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- Where the ball is right now ---
  const ballState = (now: number) => {
    const shot = shotRef.current;
    if (!shot) return { x: ball.x, y: ball.y, ground: ball.y, scale: 1, rot: 0, opacity: 1 };
    const { from, to, outcome } = shot;
    const elapsed = now - shot.start;
    const end = 0.42;
    if (elapsed < FLIGHT_MS) {
      const k = easeOut(elapsed / FLIGHT_MS);
      const ground = lerp(from.y, to.y, k);
      const arc = Math.sin(Math.PI * k) * (from.y - to.y) * 0.3;
      return { x: lerp(from.x, to.x, k), y: ground - arc, ground, scale: lerp(1, end, k), rot: k * 720, opacity: 1 };
    }
    const k = easeOut(Math.min(1, (elapsed - FLIGHT_MS) / AFTER_MS[outcome]));
    switch (outcome) {
      case 'goal': {
        const y = lerp(to.y, Math.min(to.y + goal.h * 0.1, goal.bottom - goal.h * 0.08), k);
        return { x: to.x, y, ground: y, scale: lerp(end, end * 0.9, k), rot: 720 + k * 90, opacity: 1 };
      }
      case 'save': {
        // Punched away, back onto the grass
        const x = lerp(to.x, to.x + (ball.x - to.x) * 0.4, k);
        const y = lerp(to.y, goal.bottom + (ball.y - goal.bottom) * 0.35, k) - Math.sin(Math.PI * k) * goal.h * 0.3;
        return { x, y, ground: y, scale: lerp(end, 0.6, k), rot: 720 - k * 540, opacity: 1 - k * 0.5 };
      }
      case 'post': {
        const x = lerp(to.x, to.x + (goal.cx - to.x) * 0.25, k);
        const y = lerp(to.y, goal.bottom + (ball.y - goal.bottom) * 0.45, k);
        return { x, y, ground: y, scale: lerp(end, 0.7, k), rot: 720 - k * 360, opacity: 1 - k * 0.6 };
      }
      default: {
        const dir = Math.sign(to.x - goal.cx) || 1;
        const x = to.x + dir * width * 0.25 * k;
        return { x, y: to.y, ground: to.y, scale: end * (1 - k * 0.3), rot: 720 + k * 360, opacity: 1 - k };
      }
    }
  };

  const now = performance.now();
  const b = width ? ballState(now) : null;
  const shot = shotRef.current;
  const keeperX = keeperXRef.current ?? goal.cx;
  // Lean into the dive, more the further it has to go
  const diveLean = shot && now - shot.start < FLIGHT_MS + AFTER_MS[shot.outcome]
    ? clamp((shot.keeperTo - shot.keeperFrom) / (layout.reach * 2), -1, 1) * 55 * clamp((now - shot.start - shot.reaction) / 250, 0, 1)
    : 0;
  const aim = aimAt(now);
  const bannerColor = banner === 'goal' ? PAL.tomato : banner === 'save' ? PAL.teal : PAL.grape;

  return (
    <div
      ref={rootRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{ touchAction: 'none', background: '#f4ead8' }}
      onPointerDown={() => { pressedRef.current = true; }}
      onPointerUp={() => { if (pressedRef.current) kick(); pressedRef.current = false; }}
    >
      {width > 0 && b && (
        <>
          <Pitch width={width} height={height} layout={layout} cheering={banner === 'goal'} />

          {/* Goal */}
          <img
            src={`${ART}/goal.webp`}
            alt=""
            draggable={false}
            className={`absolute pointer-events-none ${banner === 'goal' ? 'net-shake' : ''}`}
            style={{ ...layout.goalImg, transformOrigin: '50% 0%', filter: 'drop-shadow(0 6px 6px rgba(45,36,64,0.25))' }}
          />

          {/* Goalie: leans into the dive */}
          <div
            className="absolute pointer-events-none"
            style={{ left: keeperX, top: goal.bottom + layout.keeperH * 0.02, transform: `translate(-50%, -100%) rotate(${diveLean}deg)`, transformOrigin: '50% 85%' }}
          >
            <img
              key={`goalie-${goalieIdx}`}
              src={keeperImage(GOALIES[goalieIdx])}
              alt=""
              draggable={false}
              className="pop-in block"
              style={{ height: layout.keeperH, width: 'auto', filter: 'drop-shadow(0 5px 4px rgba(45,36,64,0.3))' }}
            />
          </div>

          {/* Aiming ring and its dotted line from the ball */}
          {!shot && !won && (
            <svg className="absolute inset-0 pointer-events-none" width={width} height={height}>
              <line x1={ball.x} y1={ball.y} x2={aim.x} y2={aim.y} stroke={PAL.cream} strokeWidth="5" strokeDasharray="0.1 14" strokeLinecap="round" opacity="0.9" />
              <circle cx={aim.x} cy={aim.y} r={ball.size * 0.32} fill="rgba(255,250,240,0.35)" stroke={PAL.cream} strokeWidth="7" style={{ filter: 'drop-shadow(0 2px 2px rgba(45,36,64,0.35))' }} />
              <circle cx={aim.x} cy={aim.y} r={ball.size * 0.1} fill={PAL.tomato} />
            </svg>
          )}

          {/* Kicker, just behind and left of the ball */}
          <div
            className="absolute pointer-events-none"
            style={{ left: ball.x - ball.size * 1.2, top: ball.y + ball.size * 0.55, transform: 'translate(-50%, -100%)' }}
          >
            <img
              key={kickerMove?.key ?? 'still'}
              src={`${ART}/kid.webp`}
              alt=""
              draggable={false}
              className={`block ${kickerMove?.kind === 'kick' ? 'paper-kick' : kickerMove?.kind === 'cheer' ? 'kicker-cheer' : ''}`}
              style={{ height: Math.min(ball.size * 2.2, (ball.y - goal.bottom) * 0.95 + ball.size * 0.5), width: 'auto', transformOrigin: '50% 100%', filter: 'drop-shadow(0 5px 4px rgba(45,36,64,0.3))' }}
            />
          </div>

          {/* Ball shadow */}
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              left: b.x,
              top: b.ground + ball.size * 0.42 * b.scale,
              width: ball.size * 0.8 * b.scale,
              height: ball.size * 0.22 * b.scale,
              background: 'radial-gradient(closest-side, rgba(45,36,64,0.4), rgba(45,36,64,0))',
              transform: 'translate(-50%, -50%)',
              opacity: b.opacity,
            }}
          />

          {/* Ball */}
          <div
            key={`ball-${ballKey}`}
            className="absolute pointer-events-none"
            style={{ left: b.x, top: b.y, transform: `translate(-50%, -50%) scale(${b.scale}) rotate(${b.rot}deg)`, opacity: b.opacity }}
          >
            <img src={`${ART}/ball.webp`} alt="" draggable={false} className="pop-in block" style={{ width: ball.size, height: ball.size, objectFit: 'contain' }} />
          </div>

          {/* After a while without a kick, the ball pulses to say "tap me" */}
          {idle && !shot && (
            <span
              className="absolute rounded-full pointer-events-none tap-pulse"
              style={{ left: ball.x, top: ball.y, width: ball.size * 1.5, height: ball.size * 1.5 }}
            />
          )}
        </>
      )}

      {/* Header: home + goal tally */}
      <div className="absolute top-0 left-0 right-0 flex items-start justify-between gap-3 p-3 sm:p-4 pointer-events-none">
        <div className="pointer-events-auto"><HomeButton onClick={onBack} /></div>
        <div className="soft-btn flex gap-1 rounded-full px-3 py-2" aria-label={`${goals} / ${GOALS_TO_WIN}`}>
          {Array.from({ length: GOALS_TO_WIN }, (_, i) => (
            <span
              key={i}
              className={`block rounded-full ${i < goals ? 'star-in' : ''}`}
              style={{ width: 'clamp(18px, 4.2vmin, 34px)', height: 'clamp(18px, 4.2vmin, 34px)', background: i < goals ? 'transparent' : '#eadcc5' }}
            >
              {i < goals && <img src={`${ART}/ball.webp`} alt="" className="block w-full h-full object-contain" />}
            </span>
          ))}
        </div>
      </div>

      {banner && !won && (
        // Above the crossbar, so the goalie's reaction stays in view
        <div className="absolute inset-x-0 flex justify-center pointer-events-none" style={{ top: goal.top - goal.h * 0.12, transform: 'translateY(-50%)' }}>
          <span
            className="paper-banner pop-in"
            style={{ '--c': bannerColor, fontSize: banner === 'goal' ? 'clamp(48px, 13vmin, 120px)' : 'clamp(34px, 9vmin, 84px)' } as React.CSSProperties}
          >
            {t(banner === 'goal' ? 'goal' : banner === 'save' ? 'saved' : 'missed')}
          </span>
        </div>
      )}

      {burst && <Burst key={burst.key} x={burst.x} y={burst.y} count={22} />}

      {won && (
        <>
          <ConfettiRain />
          <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
            <span className="paper-banner pop-in" style={{ '--c': PAL.sun, fontSize: 'clamp(56px, 15vmin, 140px)' } as React.CSSProperties}>
              {t('amazing')}
            </span>
          </div>
        </>
      )}
    </div>
  );
};

// --- Scenery: paper stands and grass, with the pitch markings cut from cream paper ---

const Pitch: React.FC<{
  width: number;
  height: number;
  layout: ReturnType<typeof useLayout>;
  cheering: boolean;
}> = React.memo(({ width, height, layout, cheering }) => {
  const { goal, ball, horizon } = layout;
  const boxDepth = (ball.y - goal.bottom) * 0.38;
  const boxSpread = goal.w * 0.12;
  const line = Math.max(4, goal.w * 0.01);

  return (
    <>
      <div
        className={`absolute left-0 right-0 top-0 ${cheering ? 'stands-cheer' : ''}`}
        style={{ height: horizon, backgroundImage: `url(${ART}/stands.webp)`, backgroundSize: 'cover', backgroundPosition: 'center bottom' }}
      />
      <div
        className="absolute left-0 right-0 bottom-0"
        style={{ top: horizon, backgroundImage: `url(${ART}/grass.webp)`, backgroundSize: `${Math.max(width, 600)}px auto`, backgroundPosition: 'center top', boxShadow: 'inset 0 10px 14px -8px rgba(45,36,64,0.35)' }}
      />
      <svg className="absolute inset-0 pointer-events-none" width={width} height={height}>
        <defs>
          {/* Wobbly, hand-cut edges for the paper lines */}
          <filter id="hand-cut" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="4" />
            <feDisplacementMap in="SourceGraphic" scale="3" />
            <feDropShadow dx="0" dy="1.5" stdDeviation="1" floodColor={INK} floodOpacity="0.25" />
          </filter>
        </defs>
        <g stroke="#fbf3e3" strokeWidth={line} fill="none" strokeLinejoin="round" filter="url(#hand-cut)">
          <line x1="0" y1={goal.bottom} x2={width} y2={goal.bottom} />
          <path d={`M${goal.x0 - boxSpread} ${goal.bottom} L${goal.x0 - boxSpread * 2} ${goal.bottom + boxDepth} L${goal.x1 + boxSpread * 2} ${goal.bottom + boxDepth} L${goal.x1 + boxSpread} ${goal.bottom}`} />
          <path d={`M${goal.x0 - boxSpread * 3} ${goal.bottom} L${goal.x0 - boxSpread * 5} ${goal.bottom + boxDepth * 2.1} L${goal.x1 + boxSpread * 5} ${goal.bottom + boxDepth * 2.1} L${goal.x1 + boxSpread * 3} ${goal.bottom}`} />
          <ellipse cx={ball.x} cy={ball.y + ball.size * 0.42} rx={ball.size * 0.12} ry={ball.size * 0.045} fill="#fbf3e3" strokeWidth="0" />
        </g>
      </svg>
    </>
  );
});

export default FootballGame;
