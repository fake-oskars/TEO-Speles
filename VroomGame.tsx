import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';
import { playEngineRev, playLaunchWhoosh, playBounce, playUIClick, playCorrectSound } from './services/audioService';
import { trackScreenView, trackGameStart, trackInteraction } from './services/analyticsService';

// --- Track generation ---
const GROUND_Y = -0.5;
const CAR_OFFSET_Y = 0.35;

// Fixed downhill section — dense points for smooth ride
const FIXED_POINTS: { x: number; y: number }[] = [
  { x: -5.5, y: 3.8 },
  { x: -5.1, y: 3.55 },
  { x: -4.7, y: 3.25 },
  { x: -4.3, y: 2.95 },
  { x: -3.9, y: 2.65 },
  { x: -3.5, y: 2.35 },
  { x: -3.1, y: 2.05 },
  { x: -2.7, y: 1.78 },
  { x: -2.3, y: 1.52 },
  { x: -1.9, y: 1.28 },
  { x: -1.5, y: 1.06 },
  { x: -1.1, y: 0.86 },
  { x: -0.7, y: 0.68 },
  { x: -0.3, y: 0.5 },
  { x: 0.1,  y: 0.35 },
  { x: 0.5,  y: 0.23 },
  { x: 0.8,  y: 0.16 },
  { x: 1.0,  y: 0.12 },
];

// Generate the curve-up section based on desired end angle
function generateTrack(endAngleDeg: number): { x: number; y: number }[] {
  const start = FIXED_POINTS[FIXED_POINTS.length - 1];
  const curveSteps = 12;
  const radius = 2.5;
  const startAngle = -5 * Math.PI / 180; // nearly horizontal at bottom
  const endAngle = endAngleDeg * Math.PI / 180;
  const curveCenter = { x: start.x, y: start.y + radius };

  const curvePoints: { x: number; y: number }[] = [];
  for (let i = 1; i <= curveSteps; i++) {
    const t = i / curveSteps;
    const angle = startAngle + (endAngle - startAngle) * t;
    // Parametric circle from bottom, sweeping up
    const a = -Math.PI / 2 + (angle - startAngle);
    curvePoints.push({
      x: curveCenter.x + radius * Math.cos(a),
      y: curveCenter.y + radius * Math.sin(a),
    });
  }
  return [...FIXED_POINTS, ...curvePoints];
}

function getTrackPos(points: { x: number; y: number }[], progress: number): { x: number; y: number; angle: number } {
  const t = Math.max(0, Math.min(1, progress));
  const n = points.length - 1;
  const idx = t * n;
  const i = Math.min(Math.floor(idx), n - 1);
  const frac = idx - i;
  const a = points[i];
  const b = points[i + 1];
  return {
    x: a.x + (b.x - a.x) * frac,
    y: a.y + (b.y - a.y) * frac + CAR_OFFSET_Y,
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  };
}

function getEndAngle(points: { x: number; y: number }[]): number {
  const a = points[points.length - 2];
  const b = points[points.length - 1];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function getLandingX(points: { x: number; y: number }[], speed: number, gravity: number): number {
  const angle = getEndAngle(points);
  const endPos = getTrackPos(points, 1);
  const vx = speed * Math.cos(angle);
  const vy = speed * Math.sin(angle);
  const targetY = GROUND_Y + CAR_OFFSET_Y;
  const a = 0.5 * gravity;
  const b = -vy;
  const c = targetY - endPos.y;
  const disc = b * b - 4 * a * c;
  const t = (-b + Math.sqrt(Math.max(0, disc))) / (2 * a);
  return endPos.x + vx * t;
}

// --- Destructible blocks ---
interface Block {
  id: number;
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  color: string;
  vx: number; vy: number; vz: number;
  rotSpeed: number;
  hit: boolean;
}

// Toy colors
const C = {
  red: '#dc2626', scarlet: '#ef4444', orange: '#f97316', amber: '#f59e0b', yellow: '#eab308',
  lime: '#84cc16', green: '#16a34a', emerald: '#10b981', cyan: '#06b6d4', sky: '#0ea5e9',
  blue: '#2563eb', indigo: '#4f46e5', purple: '#7c3aed', pink: '#ec4899', rose: '#f43f5e',
  white: '#e2e8f0', brown: '#78350f', wood: '#a16207',
};

let patternIdx = 0;

function createTargets(centerX: number): Block[] {
  const blocks: Block[] = [];
  let id = 0;
  const b = (x: number, y: number, z: number, w: number, h: number, d: number, c: string) => {
    blocks.push({ id: id++, x, y, z, w, h, d, color: c, vx: 0, vy: 0, vz: 0, rotSpeed: 0, hit: false });
  };
  const Y = GROUND_Y;
  const x = centerX;
  const p = patternIdx++ % 6;

  if (p === 0) {
    // 🏠 HOUSE
    b(x, Y + 0.5, 0, 1.1, 0.9, 1.0, C.scarlet);        // main wall
    b(x, Y + 1.15, 0, 1.1, 0.35, 1.0, C.red);           // upper wall
    b(x, Y + 0.4, 0.45, 0.3, 0.7, 0.12, C.sky);          // door
    b(x - 0.3, Y + 0.9, 0.45, 0.18, 0.18, 0.08, C.cyan); // window L
    b(x + 0.3, Y + 0.9, 0.45, 0.18, 0.18, 0.08, C.cyan); // window R
    b(x, Y + 1.5, 0, 1.3, 0.15, 1.1, C.amber);            // roof base
    b(x, Y + 1.75, 0, 0.9, 0.15, 0.9, C.orange);          // roof mid
    b(x, Y + 1.95, 0, 0.5, 0.15, 0.6, C.orange);          // roof top
    b(x, Y + 2.1, 0, 0.15, 0.2, 0.15, C.brown);           // chimney
  } else if (p === 1) {
    // ⛄ SNOWMAN
    b(x, Y + 0.5, 0, 1.0, 0.9, 1.0, C.white);          // bottom
    b(x, Y + 1.2, 0, 0.75, 0.65, 0.75, C.white);        // middle
    b(x, Y + 1.75, 0, 0.55, 0.5, 0.55, C.white);        // head
    b(x, Y + 2.1, 0, 0.6, 0.1, 0.6, C.indigo);          // hat brim
    b(x, Y + 2.25, 0, 0.4, 0.22, 0.4, C.indigo);        // hat top
    b(x, Y + 1.75, 0.28, 0.22, 0.08, 0.08, C.orange);   // nose
    b(x - 0.1, Y + 1.82, 0.25, 0.08, 0.08, 0.08, C.brown); // eye L
    b(x + 0.1, Y + 1.82, 0.25, 0.08, 0.08, 0.08, C.brown); // eye R
    b(x, Y + 1.05, 0.36, 0.1, 0.1, 0.1, C.red);         // button 1
    b(x, Y + 1.3, 0.34, 0.08, 0.08, 0.08, C.red);       // button 2
    b(x, Y + 0.55, 0.48, 0.08, 0.08, 0.08, C.red);      // button 3
  } else if (p === 2) {
    // 🗼 RAINBOW TOWER — 7 colorful layers
    const colors = [C.red, C.orange, C.yellow, C.green, C.blue, C.indigo, C.purple];
    colors.forEach((c, i) => {
      const s = 0.9 - i * 0.08;
      b(x, Y + 0.2 + i * 0.38, 0, s, 0.35, s, c);
    });
    b(x, Y + 0.2 + 7 * 0.38, 0, 0.2, 0.3, 0.2, C.rose); // star top
  } else if (p === 3) {
    // 🌳 TREE
    b(x, Y + 0.5, 0, 0.35, 0.9, 0.35, C.wood);           // trunk
    b(x, Y + 1.2, 0, 1.1, 0.6, 1.1, C.green);             // foliage bottom
    b(x, Y + 1.7, 0, 0.85, 0.5, 0.85, C.emerald);         // foliage mid
    b(x, Y + 2.1, 0, 0.55, 0.4, 0.55, C.lime);            // foliage top
    b(x, Y + 2.35, 0, 0.15, 0.15, 0.15, C.yellow);        // star/fruit
    // Small presents under tree
    b(x - 0.5, Y + 0.15, 0.3, 0.25, 0.25, 0.25, C.red);
    b(x + 0.4, Y + 0.15, 0.2, 0.2, 0.2, 0.2, C.blue);
  } else if (p === 4) {
    // 🤖 ROBOT
    b(x - 0.22, Y + 0.4, 0, 0.28, 0.7, 0.35, C.blue);    // leg L
    b(x + 0.22, Y + 0.4, 0, 0.28, 0.7, 0.35, C.blue);    // leg R
    b(x, Y + 1.1, 0, 0.8, 0.7, 0.55, C.sky);              // body
    b(x, Y + 1.1, 0.26, 0.25, 0.25, 0.06, C.yellow);      // belly panel
    b(x - 0.55, Y + 1.05, 0, 0.18, 0.55, 0.25, C.cyan);   // arm L
    b(x + 0.55, Y + 1.05, 0, 0.18, 0.55, 0.25, C.cyan);   // arm R
    b(x, Y + 1.6, 0, 0.22, 0.12, 0.22, C.indigo);         // neck
    b(x, Y + 1.85, 0, 0.55, 0.4, 0.5, C.indigo);          // head
    b(x - 0.13, Y + 1.9, 0.24, 0.12, 0.12, 0.06, C.lime); // eye L
    b(x + 0.13, Y + 1.9, 0.24, 0.12, 0.12, 0.06, C.lime); // eye R
    b(x, Y + 1.78, 0.24, 0.08, 0.06, 0.06, C.red);        // mouth
    b(x, Y + 2.15, 0, 0.06, 0.2, 0.06, C.rose);           // antenna
    b(x, Y + 2.3, 0, 0.12, 0.12, 0.12, C.red);            // antenna ball
  } else {
    // 🏰 CASTLE
    // Base wall
    b(x, Y + 0.4, 0, 1.6, 0.7, 0.8, C.amber);
    // Gate
    b(x, Y + 0.3, 0.35, 0.35, 0.5, 0.12, C.wood);
    // Battlements
    b(x - 0.65, Y + 0.9, 0, 0.25, 0.2, 0.25, C.orange);
    b(x - 0.2, Y + 0.9, 0, 0.25, 0.2, 0.25, C.orange);
    b(x + 0.2, Y + 0.9, 0, 0.25, 0.2, 0.25, C.orange);
    b(x + 0.65, Y + 0.9, 0, 0.25, 0.2, 0.25, C.orange);
    // Left tower
    b(x - 0.6, Y + 1.3, 0, 0.35, 0.6, 0.4, C.amber);
    b(x - 0.6, Y + 1.7, 0, 0.4, 0.12, 0.45, C.red);
    b(x - 0.6, Y + 1.85, 0, 0.2, 0.2, 0.2, C.scarlet);
    // Right tower
    b(x + 0.6, Y + 1.3, 0, 0.35, 0.6, 0.4, C.amber);
    b(x + 0.6, Y + 1.7, 0, 0.4, 0.12, 0.45, C.red);
    b(x + 0.6, Y + 1.85, 0, 0.2, 0.2, 0.2, C.scarlet);
    // Center tower (tallest)
    b(x, Y + 1.3, 0, 0.4, 0.7, 0.45, C.yellow);
    b(x, Y + 1.8, 0, 0.5, 0.12, 0.5, C.red);
    b(x, Y + 2.0, 0, 0.25, 0.3, 0.25, C.scarlet);
    // Flag
    b(x, Y + 2.3, 0, 0.06, 0.25, 0.06, C.brown);
    b(x + 0.08, Y + 2.4, 0, 0.12, 0.1, 0.04, C.blue);
  }
  return blocks;
}

// --- Reusable materials (optimization) ---
const rampMat = new THREE.MeshStandardMaterial({ color: '#f59e0b', flatShading: true });
const railMat = new THREE.MeshStandardMaterial({ color: '#d97706', flatShading: true });
const pillarMat = new THREE.MeshStandardMaterial({ color: '#92400e', flatShading: true });
const groundMat = new THREE.MeshStandardMaterial({ color: '#7ec850', flatShading: true });

// --- 3D Components ---

const TargetBlock: React.FC<{ block: Block }> = React.memo(({ block }) => {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (!ref.current || !block.hit) return;
    block.x += block.vx * delta;
    block.y += block.vy * delta;
    block.z += block.vz * delta;
    block.vy -= 12 * delta;
    if (block.y < GROUND_Y + block.h / 2) {
      block.y = GROUND_Y + block.h / 2;
      block.vy *= -0.3;
      block.vx *= 0.8;
      block.vz *= 0.8;
      if (Math.abs(block.vy) < 0.1) block.vy = 0;
    }
    ref.current.rotation.x += block.rotSpeed * delta;
    ref.current.rotation.z += block.rotSpeed * 0.7 * delta;
    ref.current.position.set(block.x, block.y, block.z);
  });
  return (
    <mesh ref={ref} position={[block.x, block.y, block.z]}>
      <boxGeometry args={[block.w, block.h, block.d]} />
      <meshStandardMaterial color={block.color} flatShading />
    </mesh>
  );
});

const Ground: React.FC = React.memo(() => {
  const geo = useMemo(() => new THREE.PlaneGeometry(120, 120), []);
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, GROUND_Y, 0]} geometry={geo} material={groundMat} />;
});

const Ramp: React.FC<{ trackPoints: { x: number; y: number }[] }> = React.memo(({ trackPoints }) => {
  const segments = useMemo(() => {
    const segs: { cx: number; cy: number; length: number; angle: number }[] = [];
    for (let i = 0; i < trackPoints.length - 1; i++) {
      const a = trackPoints[i], b = trackPoints[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      segs.push({ cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, length: Math.sqrt(dx * dx + dy * dy), angle: Math.atan2(dy, dx) });
    }
    return segs;
  }, [trackPoints]);

  const pillars = useMemo(() => {
    const result: { x: number; h: number }[] = [];
    const indices = [0, 3, 6, 9];
    indices.forEach(idx => {
      const p = trackPoints[idx];
      if (!p) return;
      const h = p.y - GROUND_Y;
      if (h >= 0.4) result.push({ x: p.x, h });
    });
    return result;
  }, [trackPoints]);

  return (
    <group>
      {segments.map((seg, i) => (
        <group key={i} position={[seg.cx, seg.cy, 0]} rotation={[0, 0, seg.angle]}>
          <mesh material={rampMat}><boxGeometry args={[seg.length + 0.04, 0.2, 2.0]} /></mesh>
          <mesh position={[0, 0.18, -0.9]} material={railMat}><boxGeometry args={[seg.length + 0.04, 0.2, 0.1]} /></mesh>
          <mesh position={[0, 0.18, 0.9]} material={railMat}><boxGeometry args={[seg.length + 0.04, 0.2, 0.1]} /></mesh>
        </group>
      ))}
      {pillars.map((p, i) => (
        <mesh key={`p${i}`} position={[p.x, GROUND_Y + p.h / 2, 0]} material={pillarMat}>
          <boxGeometry args={[0.25, p.h, 0.25]} />
        </mesh>
      ))}
    </group>
  );
});

const Wheel: React.FC<{ position: [number, number, number]; big: boolean; spinning: boolean }> = React.memo(({ position, big, spinning }) => {
  const spinRef = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => { if (spinRef.current && spinning) spinRef.current.rotation.y += delta * 15; });
  return (
    <group position={position} scale={big ? 1.5 : 1}>
      <group rotation={[Math.PI / 2, 0, 0]}>
        <mesh ref={spinRef}><cylinderGeometry args={[0.22, 0.22, 0.18, 12]} /><meshStandardMaterial color="#333" flatShading /></mesh>
        <mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.08, 0.08, 0.02, 6]} /><meshStandardMaterial color="#999" flatShading /></mesh>
      </group>
    </group>
  );
});

interface CarProps {
  color: string; bigWheels: boolean; hasWings: boolean; hasRocket: boolean; hasFlag: boolean; launched: boolean;
  carRef: React.RefObject<THREE.Group | null>;
}

const Car: React.FC<CarProps> = React.memo(({ color, bigWheels, hasWings, hasRocket, hasFlag, launched, carRef }) => {
  const flameRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (flameRef.current) {
      if (launched && hasRocket) {
        const s = 0.8 + Math.sin(state.clock.elapsedTime * 30) * 0.3;
        flameRef.current.scale.set(s, s * 1.2, s);
        flameRef.current.visible = true;
      } else { flameRef.current.visible = false; }
    }
  });

  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, flatShading: true }), [color]);
  const glassMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#87ceeb', flatShading: true, transparent: true, opacity: 0.7 }), []);

  return (
    <group ref={carRef}>
      <mesh position={[0, 0.25, 0]} material={mat}><boxGeometry args={[1.8, 0.4, 1]} /></mesh>
      <mesh position={[0.1, 0.55, 0]} material={mat}><boxGeometry args={[0.9, 0.3, 0.85]} /></mesh>
      <mesh position={[0.55, 0.55, 0]} material={glassMat}><boxGeometry args={[0.05, 0.25, 0.8]} /></mesh>
      <mesh position={[0.92, 0.28, 0.3]}><boxGeometry args={[0.05, 0.1, 0.12]} /><meshStandardMaterial color="#fde68a" emissive="#fde68a" emissiveIntensity={0.5} flatShading /></mesh>
      <mesh position={[0.92, 0.28, -0.3]}><boxGeometry args={[0.05, 0.1, 0.12]} /><meshStandardMaterial color="#fde68a" emissive="#fde68a" emissiveIntensity={0.5} flatShading /></mesh>
      <Wheel position={[0.6, 0, 0.55]} big={bigWheels} spinning={launched} />
      <Wheel position={[0.6, 0, -0.55]} big={bigWheels} spinning={launched} />
      <Wheel position={[-0.6, 0, 0.55]} big={bigWheels} spinning={launched} />
      <Wheel position={[-0.6, 0, -0.55]} big={bigWheels} spinning={launched} />
      {hasWings && (
        <group position={[-0.8, 0.6, 0]}>
          <mesh position={[0, 0.15, 0]}><boxGeometry args={[0.3, 0.05, 1.2]} /><meshStandardMaterial color="#ef4444" flatShading /></mesh>
          <mesh position={[0, 0, 0.4]}><boxGeometry args={[0.05, 0.3, 0.05]} /><meshStandardMaterial color="#666" flatShading /></mesh>
          <mesh position={[0, 0, -0.4]}><boxGeometry args={[0.05, 0.3, 0.05]} /><meshStandardMaterial color="#666" flatShading /></mesh>
        </group>
      )}
      {hasRocket && (
        <group position={[-0.95, 0.25, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.1, 0.15, 0.3, 6]} /><meshStandardMaterial color="#666" flatShading /></mesh>
          <mesh ref={flameRef} position={[-0.25, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <coneGeometry args={[0.12, 0.4, 6]} /><meshStandardMaterial color="#ff6600" emissive="#ff4400" emissiveIntensity={2} flatShading transparent opacity={0.8} />
          </mesh>
        </group>
      )}
      {hasFlag && (
        <group position={[0.1, 0.72, 0]}>
          <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.02, 0.02, 0.4, 4]} /><meshStandardMaterial color="#666" flatShading /></mesh>
          <mesh position={[0.12, 0.35, 0]}><boxGeometry args={[0.22, 0.15, 0.02]} /><meshStandardMaterial color="#ef4444" flatShading /></mesh>
        </group>
      )}
    </group>
  );
});

// Particle trail
const Particles: React.FC<{ active: boolean; carRef: React.RefObject<THREE.Group | null> }> = React.memo(({ active, carRef }) => {
  const ref = useRef<THREE.Points>(null);
  const pos = useRef(new Float32Array(60 * 3));
  const vels = useRef<Array<{ x: number; y: number; z: number; life: number }>>([]);
  useFrame(() => {
    if (!ref.current) return;
    if (active && carRef.current) {
      const cp = carRef.current.position;
      if (vels.current.length < 60) {
        for (let i = 0; i < 3; i++) vels.current.push({ x: cp.x - 0.5 + (Math.random() - 0.5) * 0.4, y: cp.y + (Math.random() - 0.5) * 0.4, z: (Math.random() - 0.5) * 0.6, life: 1 });
      }
    }
    const alive: typeof vels.current = [];
    vels.current.forEach(p => { p.life -= 0.025; p.y -= 0.01; if (p.life > 0) alive.push(p); });
    vels.current = alive;
    for (let i = 0; i < 60; i++) {
      const p = vels.current[i];
      pos.current[i * 3] = p ? p.x : 0;
      pos.current[i * 3 + 1] = p ? p.y : -10;
      pos.current[i * 3 + 2] = p ? p.z : 0;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });
  return (
    <points ref={ref}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[pos.current, 3]} count={60} /></bufferGeometry>
      <pointsMaterial color="#ffaa00" size={0.2} transparent opacity={0.7} />
    </points>
  );
});

// --- Animation ---
type Phase = 'idle' | 'rev' | 'roll' | 'flight' | 'land' | 'reset';

interface SceneProps {
  carColor: string; bigWheels: boolean; hasWings: boolean; hasRocket: boolean; hasFlag: boolean;
  phase: Phase; onPhaseChange: (phase: Phase) => void; onCrash: () => void;
  difficulty: string; blocks: Block[]; launchSpeed: number; trackPoints: { x: number; y: number }[];
}

const CameraFollow: React.FC<{ carRef: React.RefObject<THREE.Group | null>; phase: Phase; targetX: number }> = ({ carRef, phase, targetX: blocksX }) => {
  const { camera, size } = useThree();
  const isPortrait = size.width < size.height;

  useFrame(() => {
    if (!carRef.current) return;
    const carX = carRef.current.position.x;
    const carY = carRef.current.position.y;

    let tX: number, tY: number, tZ: number, lerp: number;

    if (phase === 'idle' || phase === 'rev') {
      // OVERVIEW: zoom out to show ramp + targets together
      // Center camera between ramp start and target blocks
      const midX = (-5.5 + blocksX) / 2;
      const span = Math.abs(blocksX - (-5.5)) + 4; // total distance to show
      // Pull back Z enough to fit the span in view (fov=45 → visible width ≈ Z * 0.83)
      const neededZ = span / (0.83 * (size.width / size.height));
      tZ = Math.max(isPortrait ? 22 : 18, neededZ);
      tX = midX;
      tY = isPortrait ? 4 : 3.5;
      lerp = 0.04;
    } else if (phase === 'flight' || phase === 'land') {
      // FOLLOW: track the car
      tX = Math.max(0, carX * 0.5);
      tY = (isPortrait ? 4 : 3) + Math.max(0, (carY - 2) * 0.3);
      tZ = isPortrait ? 22 : 18;
      lerp = 0.08;
    } else {
      // RESET: smoothly return to overview
      const midX = (-5.5 + blocksX) / 2;
      const span = Math.abs(blocksX - (-5.5)) + 4;
      const neededZ = span / (0.83 * (size.width / size.height));
      tZ = Math.max(isPortrait ? 22 : 18, neededZ);
      tX = midX;
      tY = isPortrait ? 4 : 3.5;
      lerp = 0.04;
    }

    camera.position.x += (tX - camera.position.x) * lerp;
    camera.position.y += (tY - camera.position.y) * lerp;
    camera.position.z += (tZ - camera.position.z) * lerp;
    camera.lookAt(camera.position.x, 1.5, 0);
  });
  return null;
};

const Scene: React.FC<SceneProps> = ({ carColor, bigWheels, hasWings, hasRocket, hasFlag, phase, onPhaseChange, onCrash, difficulty, blocks, launchSpeed, trackPoints }) => {
  const carRef = useRef<THREE.Group>(null);
  const phaseTimeRef = useRef(0);
  const launchPosRef = useRef({ x: 0, y: 0 });
  const launchVelRef = useRef({ x: 0, y: 0 });
  const resetStartRef = useRef({ x: 0, y: 0, rot: 0, captured: false });
  const hasCrashedRef = useRef(false);
  const phaseRef = useRef<Phase>(phase);
  const prevPhaseRef = useRef<Phase>(phase);
  if (phase !== prevPhaseRef.current) { prevPhaseRef.current = phase; phaseRef.current = phase; }

  const gravity = useMemo(() => ({ easy: 7, medium: 8, hard: 9 }[difficulty] || 7), [difficulty]);
  const rollDuration = useMemo(() => ({ easy: 1.8, medium: 1.4, hard: 1.0 }[difficulty] || 1.8), [difficulty]);
  const launchAngle = useMemo(() => getEndAngle(trackPoints), [trackPoints]);

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    prevPhaseRef.current = p;
    onPhaseChange(p);
  }, [onPhaseChange]);

  const checkCollisions = useCallback((carX: number, carY: number) => {
    const carHW = 0.9, carHH = 0.35;
    let hitCount = 0;
    blocks.forEach(block => {
      if (block.hit) return;
      if ((carHW + block.w / 2) - Math.abs(carX - block.x) > 0 && (carHH + block.h / 2) - Math.abs(carY - block.y) > 0) {
        block.hit = true;
        const dx = carX - block.x;
        block.vx = (dx > 0 ? 1 : -1) * 2 + (Math.random() - 0.5) * 3 + 3;
        block.vy = Math.random() * 5 + 3;
        block.vz = (Math.random() - 0.5) * 6;
        block.rotSpeed = (Math.random() - 0.5) * 14;
        hitCount++;
      }
    });
    if (hitCount > 0) {
      blocks.forEach(block => {
        if (block.hit) return;
        if (blocks.some(o => o.hit && Math.abs(o.x - block.x) < 1.0 && Math.abs(o.y - block.y) < 1.0)) {
          block.hit = true;
          block.vx = (Math.random() - 0.3) * 4;
          block.vy = Math.random() * 3 + 1;
          block.vz = (Math.random() - 0.5) * 4;
          block.rotSpeed = (Math.random() - 0.5) * 10;
        }
      });
      if (!hasCrashedRef.current) { hasCrashedRef.current = true; onCrash(); }
    }
  }, [blocks, onCrash]);

  useFrame((_, delta) => {
    if (!carRef.current) return;
    const car = carRef.current;
    phaseTimeRef.current += delta;
    const t = phaseTimeRef.current;
    const p = phaseRef.current;

    switch (p) {
      case 'idle':
        { const pos = getTrackPos(trackPoints, 0); car.position.set(pos.x, pos.y, 0); car.rotation.set(0, 0, pos.angle); hasCrashedRef.current = false; }
        break;
      case 'rev':
        { const pos = getTrackPos(trackPoints, 0); car.position.x = pos.x + Math.sin(t * 40) * 0.03; car.position.y = pos.y + Math.sin(t * 30) * 0.02; car.rotation.set(0, 0, pos.angle); }
        if (t > 0.4) { phaseTimeRef.current = 0; setPhase('roll'); }
        break;
      case 'roll': {
        const progress = Math.min(t / rollDuration, 1);
        const eased = progress * progress * progress;
        const pos = getTrackPos(trackPoints, eased);
        car.position.set(pos.x, pos.y, 0);
        car.rotation.set(0, 0, pos.angle);
        if (progress >= 1) {
          phaseTimeRef.current = 0;
          const endPos = getTrackPos(trackPoints, 1);
          launchPosRef.current = { x: endPos.x, y: endPos.y };
          launchVelRef.current = { x: launchSpeed * Math.cos(launchAngle), y: launchSpeed * Math.sin(launchAngle) };
          setPhase('flight');
        }
        break;
      }
      case 'flight': {
        const lp = launchPosRef.current, lv = launchVelRef.current;
        const x = lp.x + lv.x * t, y = lp.y + lv.y * t - 0.5 * gravity * t * t;
        car.position.set(x, y, 0);
        car.rotation.z = Math.atan2(lv.y - gravity * t, lv.x);
        checkCollisions(x, y);
        if (y <= GROUND_Y + CAR_OFFSET_Y && t > 0.3) { car.position.y = GROUND_Y + CAR_OFFSET_Y; phaseTimeRef.current = 0; setPhase('land'); }
        break;
      }
      case 'land':
        car.position.y = GROUND_Y + CAR_OFFSET_Y + 0.5 * Math.exp(-t * 5) * Math.abs(Math.sin(t * 14));
        car.rotation.z *= 0.9;
        checkCollisions(car.position.x, car.position.y);
        if (t > 1.5) { phaseTimeRef.current = 0; setPhase('reset'); }
        break;
      case 'reset': {
        if (!resetStartRef.current.captured) resetStartRef.current = { x: car.position.x, y: car.position.y, rot: car.rotation.z, captured: true };
        const progress = Math.min(t / 1.5, 1), eased = progress * (2 - progress);
        const target = getTrackPos(trackPoints, 0), s = resetStartRef.current;
        car.position.x = s.x + (target.x - s.x) * eased;
        car.position.y = s.y + (target.y - s.y) * eased;
        car.rotation.z = s.rot + (target.angle - s.rot) * eased;
        if (progress >= 1) { phaseTimeRef.current = 0; resetStartRef.current.captured = false; setPhase('idle'); }
        break;
      }
    }
  });

  return (
    <>
      <CameraFollow carRef={carRef} phase={phase} targetX={blocks.length > 0 ? blocks.reduce((s, b) => s + b.x, 0) / blocks.length : 8} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[8, 12, 6]} intensity={1.2} color="#fff8e7" />
      <hemisphereLight args={['#87ceeb', '#7ec850', 0.3]} />
      <Sky sunPosition={[100, 50, 100]} />
      <Ground />
      <Ramp trackPoints={trackPoints} />
      {blocks.map(b => <TargetBlock key={b.id} block={b} />)}
      <Car carRef={carRef} color={carColor} bigWheels={bigWheels} hasWings={hasWings} hasRocket={hasRocket} hasFlag={hasFlag} launched={phase === 'flight' || phase === 'roll'} />
      <Particles active={phase === 'flight'} carRef={carRef} />
    </>
  );
};

// --- UI ---
const CAR_COLORS = [
  { value: '#ef4444', tw: 'bg-red-500' },
  { value: '#3b82f6', tw: 'bg-blue-500' },
  { value: '#22c55e', tw: 'bg-green-500' },
  { value: '#eab308', tw: 'bg-yellow-500' },
  { value: '#a855f7', tw: 'bg-purple-500' },
];

const POWER_LEVELS = [
  { label: '🐢', speed: 4 },
  { label: '🐇', speed: 6 },
  { label: '🚀', speed: 9 },
];

const ANGLE_LEVELS = [
  { label: '↗', angle: 25, desc: 'Low' },
  { label: '⬆', angle: 50, desc: 'Mid' },
  { label: '🔝', angle: 75, desc: 'High' },
];

interface VroomGameProps {
  t: (key: string) => string;
  onBack: () => void;
  difficulty: string;
}

const VroomGame: React.FC<VroomGameProps> = ({ t, onBack, difficulty }) => {
  const [carColor, setCarColor] = useState(CAR_COLORS[0].value);
  const [bigWheels, setBigWheels] = useState(false);
  const [hasWings, setHasWings] = useState(false);
  const [hasRocket, setHasRocket] = useState(false);
  const [hasFlag, setHasFlag] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [launches, setLaunches] = useState(0);
  const [score, setScore] = useState(0);
  const [powerIdx, setPowerIdx] = useState(1);
  const [angleIdx, setAngleIdx] = useState(1);
  const hasTrackedRef = useRef(false);

  const trackPoints = useMemo(() => generateTrack(ANGLE_LEVELS[angleIdx].angle), [angleIdx]);
  const currentPower = POWER_LEVELS[powerIdx];
  const gravityVal = useMemo(() => ({ easy: 7, medium: 8, hard: 9 }[difficulty] || 7), [difficulty]);

  const [blocks, setBlocks] = useState<Block[]>(() => {
    const pts = generateTrack(ANGLE_LEVELS[1].angle);
    const minX = getLandingX(pts, POWER_LEVELS[0].speed, 7);
    const maxX = getLandingX(pts, POWER_LEVELS[2].speed, 7);
    return createTargets(minX + Math.random() * (maxX - minX));
  });

  const rebuildBlocks = useCallback(() => {
    const minX = getLandingX(trackPoints, POWER_LEVELS[0].speed, gravityVal);
    const maxX = getLandingX(trackPoints, POWER_LEVELS[2].speed, gravityVal);
    setBlocks(createTargets(minX + Math.random() * (maxX - minX)));
  }, [trackPoints, gravityVal]);

  // Don't rebuild blocks on angle change — player adjusts angle to aim at existing blocks

  if (!hasTrackedRef.current) {
    trackScreenView('vroom');
    trackGameStart('vroom', difficulty);
    hasTrackedRef.current = true;
  }

  const handleLaunch = useCallback(() => {
    if (phase !== 'idle') return;
    playEngineRev();
    setTimeout(() => playLaunchWhoosh(), 400);
    setPhase('rev');
    setLaunches(prev => prev + 1);
    trackInteraction('vroom_launch', { item: 'car' });
  }, [phase]);

  const handleCrash = useCallback(() => { playCorrectSound(); setScore(prev => prev + 1); }, []);
  const handlePhaseChange = useCallback((newPhase: Phase) => {
    setPhase(newPhase);
    if (newPhase === 'land') playBounce();
    // After crash, rebuild with next structure when car resets
    if (newPhase === 'idle') {
      const anyHit = blocks.some(b => b.hit);
      if (anyHit) rebuildBlocks();
    }
  }, [rebuildBlocks, blocks]);
  const handleBack = useCallback(() => { playUIClick(); onBack(); }, [onBack]);

  return (
    <div className="fixed inset-0 select-none overflow-hidden" style={{ touchAction: 'none' }}>
      <div className="absolute inset-0" onClick={handleLaunch} onTouchStart={(e) => { e.preventDefault(); handleLaunch(); }}>
        <Canvas
          camera={{ position: [0, 4, 22], fov: 45, near: 0.1, far: 200 }}
          style={{ background: 'linear-gradient(to bottom, #87CEEB, #E0F2FE)' }}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          dpr={[1, 1.5]}
          performance={{ min: 0.5 }}
        >
          <Scene
            carColor={carColor} bigWheels={bigWheels} hasWings={hasWings} hasRocket={hasRocket} hasFlag={hasFlag}
            phase={phase} onPhaseChange={handlePhaseChange} onCrash={handleCrash}
            difficulty={difficulty} blocks={blocks} launchSpeed={currentPower.speed} trackPoints={trackPoints}
          />
        </Canvas>
      </div>

      {/* ===== TODDLER CAR DASHBOARD ===== */}
      <style>{`
        .dash {
          background: linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 40%, #111 100%);
          border-top: 4px solid #444;
          box-shadow: 0 -8px 30px rgba(0,0,0,0.7), inset 0 2px 0 rgba(255,255,255,0.05);
          border-radius: 50% 50% 0 0 / 18% 18% 0 0;
        }
        .gauge {
          background: radial-gradient(circle at 50% 40%, #1a1a1a 0%, #080808 70%, #000 100%);
          border: 4px solid #555; border-radius: 50%;
          box-shadow: inset 0 4px 15px rgba(0,0,0,0.9), 0 3px 0 rgba(255,255,255,0.08), 0 0 0 2px #222;
          position: relative; display: flex; align-items: center; justify-content: center;
        }
        .needle {
          width: 4px; background: linear-gradient(to top, #ff2222, #ff6644);
          border-radius: 3px; transform-origin: bottom center; position: absolute; bottom: 50%;
          left: calc(50% - 2px); box-shadow: 0 0 10px rgba(255,50,50,0.7);
          transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .hub { width: 14px; height: 14px; border-radius: 50%; background: radial-gradient(circle, #888, #333);
          position: absolute; top: calc(50% - 7px); left: calc(50% - 7px); z-index: 2; border: 2px solid #666; }
        .tick { position: absolute; background: #555; }
        .tick-big { background: #eee; }
        .wheel-outer {
          background: conic-gradient(from 0deg, #444, #888, #444, #888, #444, #888, #444, #888, #444);
          box-shadow: 0 6px 25px rgba(0,0,0,0.7), inset 0 0 20px rgba(0,0,0,0.3), 0 0 0 3px #333;
          border-radius: 50%;
        }
        .wheel-face { background: radial-gradient(circle at 40% 35%, #3a3a3a, #151515);
          box-shadow: inset 0 4px 15px rgba(0,0,0,0.7); border-radius: 50%;
          display: flex; align-items: center; justify-content: center; position: relative;
        }
        .spoke { position: absolute; background: #555; border-radius: 3px; }
        .horn-center {
          background: radial-gradient(circle at 40% 35%, #555, #222);
          box-shadow: inset 0 3px 10px rgba(0,0,0,0.6), 0 3px 0 rgba(255,255,255,0.06);
          border: 3px solid #666; border-radius: 50%;
        }
        .horn-center:active { transform: scale(0.9); box-shadow: inset 0 4px 12px rgba(0,0,0,0.8); }
        .screen {
          background: linear-gradient(180deg, #001122 0%, #002244 100%);
          border: 3px solid #444; border-radius: 14px;
          box-shadow: inset 0 3px 12px rgba(0,0,0,0.9), 0 2px 0 rgba(255,255,255,0.06), 0 0 0 2px #222;
        }
        .lcd2 { background: #081808; border: 2px solid #333; box-shadow: inset 0 2px 4px rgba(0,0,0,0.8);
          font-family: 'Courier New', monospace; color: #44ff44; border-radius: 6px; }
        .dbtn { background: linear-gradient(180deg, #3a3a3a 0%, #1a1a1a 100%); border: 2px solid #555;
          box-shadow: 0 3px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1);
          border-radius: 10px; transition: all 0.15s; }
        .dbtn:active { transform: scale(0.88); }
        .dbtn-on { border-color: #22c55e; box-shadow: 0 0 12px rgba(34,197,94,0.6), 0 0 4px rgba(34,197,94,0.3), inset 0 1px 0 rgba(255,255,255,0.1); }
        .colordot { border: 4px solid #333; box-shadow: inset 0 3px 5px rgba(0,0,0,0.4); transition: all 0.2s; }
        .colordot-on { border-color: #fff; box-shadow: 0 0 14px var(--c), 0 0 4px var(--c); transform: scale(1.25); }
        @keyframes pulse-glow { 0%,100% { box-shadow: 0 0 15px rgba(255,200,0,0.3); } 50% { box-shadow: 0 0 25px rgba(255,200,0,0.7); } }
        .go-pulse { animation: pulse-glow 1.5s infinite; }
      `}</style>

      {/* Top bar: back + score */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-2 sm:px-3 py-1.5 sm:py-2">
        <button onClick={(e) => { e.stopPropagation(); handleBack(); }}
          className="flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 bg-white/90 rounded-full shadow-lg border-2 border-white hover:bg-white transition-transform duration-200 active:scale-90">
          <span className="text-lg sm:text-xl">⬅️</span>
        </button>
        <div className="lcd2 px-3 sm:px-5 py-1 sm:py-2 text-center tracking-widest text-sm sm:text-xl">
          💥 {String(score).padStart(2,'0')}  🏁 {String(launches).padStart(2,'0')}
        </div>
        <div className="w-9 sm:w-11" />
      </div>

      {/* Tap hint */}
      {phase === 'idle' && launches === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none" style={{ marginBottom: '40%' }}>
          <div className="animate-pulse text-center">
            <div className="text-5xl sm:text-7xl mb-2 sm:mb-3">👇</div>
            <div className="text-white text-xl sm:text-3xl font-black drop-shadow-lg tracking-wide">{t('vroomGameTitle')}</div>
          </div>
        </div>
      )}

      {/* ===== DASHBOARD ===== */}
      <div className="absolute bottom-0 left-0 right-0 z-20" style={{ maxHeight: '35vh' }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
        <div className="dash px-1 sm:px-2 pt-1.5 sm:pt-3 pb-1.5 sm:pb-3">

          {/* Always single row: Speedo + Wheel + Angle + Controls */}
          {/* Use landscape: prefix (w>h via @media) to shrink everything */}
          <div className="flex items-center justify-center w-full gap-1 sm:gap-3">

            {/* Speedo + Wheel + Angle in a tight row */}
            <div className="flex items-center justify-center gap-1 sm:gap-3">

              {/* SPEEDOMETER */}
              <div className="gauge shrink-0 cursor-pointer" style={{ width: 'clamp(60px, 18vw, 150px)', height: 'clamp(60px, 18vw, 150px)' }}
                onClick={() => { setPowerIdx((powerIdx + 1) % 3); playUIClick(); }}>
                {Array.from({ length: 11 }).map((_, i) => {
                  const a = -130 + i * 26;
                  const big = i % 2 === 0;
                  return <div key={i} className={`tick ${big ? 'tick-big' : ''}`}
                    style={{ width: big ? '3px' : '2px', height: big ? '12%' : '7%', top: '7%',
                      left: `calc(50% - ${big ? 1.5 : 1}px)`, transformOrigin: `center 290%`, transform: `rotate(${a}deg)` }} />;
                })}
                <div className="needle" style={{ height: '38%', transform: `rotate(${-130 + powerIdx * 130}deg)` }} />
                <div className="hub" />
                <span className="absolute font-black" style={{ bottom: '22%', fontSize: 'clamp(18px, 6vw, 32px)',
                  color: powerIdx === 0 ? '#22c55e' : powerIdx === 1 ? '#eab308' : '#ef4444' }}>
                  {POWER_LEVELS[powerIdx].label}
                </span>
                <span className="absolute text-gray-400 font-bold tracking-widest" style={{ bottom: '8%', fontSize: 'clamp(7px, 2vw, 11px)' }}>SPEED</span>
              </div>

              {/* STEERING WHEEL */}
              <div className={`wheel-outer shrink-0 cursor-pointer p-[5px] sm:p-[7px] ${phase === 'idle' ? 'go-pulse' : ''}`}
                style={{ width: 'clamp(70px, 22vw, 160px)', height: 'clamp(70px, 22vw, 160px)' }}
                onClick={handleLaunch}>
                <div className="wheel-face w-full h-full">
                  <div className="spoke" style={{ width: '100%', height: '5px' }} />
                  <div className="spoke" style={{ width: '5px', height: '100%' }} />
                  <div className="spoke" style={{ width: '100%', height: '5px', transform: 'rotate(45deg)' }} />
                  <div className="spoke" style={{ width: '5px', height: '100%', transform: 'rotate(45deg)' }} />
                  <div className="horn-center flex items-center justify-center z-10" style={{ width: '52%', height: '52%' }}>
                    <span style={{ fontSize: 'clamp(24px, 7vw, 44px)' }}>{phase === 'idle' ? '🏎️' : phase === 'flight' ? '🔥' : '💨'}</span>
                  </div>
                </div>
              </div>

              {/* ANGLE GAUGE */}
              <div className="gauge shrink-0 cursor-pointer" style={{ width: 'clamp(60px, 18vw, 150px)', height: 'clamp(60px, 18vw, 150px)' }}
                onClick={() => { if (phase === 'idle') { setAngleIdx((angleIdx + 1) % 3); playUIClick(); } }}>
                {Array.from({ length: 7 }).map((_, i) => {
                  const a = -130 + i * 43.3;
                  const big = i % 2 === 0;
                  return <div key={i} className={`tick ${big ? 'tick-big' : ''}`}
                    style={{ width: big ? '3px' : '2px', height: big ? '12%' : '7%', top: '7%',
                      left: `calc(50% - ${big ? 1.5 : 1}px)`, transformOrigin: `center 290%`, transform: `rotate(${a}deg)` }} />;
                })}
                <div className="needle" style={{
                  height: '38%', transform: `rotate(${-130 + angleIdx * 130}deg)`,
                  background: 'linear-gradient(to top, #3b82f6, #60a5fa)',
                  boxShadow: '0 0 12px rgba(59,130,246,0.7)',
                }} />
                <div className="hub" />
                <span className="absolute font-black text-sky-400" style={{ bottom: '22%', fontSize: 'clamp(18px, 6vw, 32px)' }}>
                  {ANGLE_LEVELS[angleIdx].label}
                </span>
                <span className="absolute text-gray-400 font-bold tracking-widest" style={{ bottom: '8%', fontSize: 'clamp(7px, 2vw, 11px)' }}>ANGLE</span>
              </div>
            </div>

            {/* Controls: Colors + Accessories in column */}
            <div className="flex flex-col gap-1 sm:gap-2">
              {/* Colors */}
              <div className="flex justify-center gap-1 sm:gap-2">
                {CAR_COLORS.map(c => (
                  <button key={c.value} onClick={() => { setCarColor(c.value); playUIClick(); }}
                    className={`colordot rounded-full ${c.tw} ${carColor === c.value ? 'colordot-on' : ''}`}
                    style={{ width: 'clamp(24px, 6vw, 44px)', height: 'clamp(24px, 6vw, 44px)',
                      ...(carColor === c.value ? { '--c': c.value } as React.CSSProperties : {}) }} />
                ))}
              </div>
              {/* Accessories */}
              <div className="flex justify-center gap-1 sm:gap-2">
                {[
                  { active: bigWheels, toggle: () => setBigWheels(v => !v), icon: '🛞' },
                  { active: hasWings, toggle: () => setHasWings(v => !v), icon: '🪽' },
                  { active: hasRocket, toggle: () => setHasRocket(v => !v), icon: '🚀' },
                  { active: hasFlag, toggle: () => setHasFlag(v => !v), icon: '🚩' },
                ].map((acc, i) => (
                  <button key={i} onClick={() => { acc.toggle(); playUIClick(); }}
                    className={`dbtn flex items-center justify-center ${acc.active ? 'dbtn-on' : ''}`}
                    style={{ width: 'clamp(24px, 6vw, 44px)', height: 'clamp(24px, 6vw, 44px)', fontSize: 'clamp(12px, 3.5vw, 24px)' }}>
                    {acc.icon}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VroomGame;
