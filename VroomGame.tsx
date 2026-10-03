import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  playEngineRev, playLaunchWhoosh, playBounce, playUIClick, playFanfare, playIncorrectSound,
  playCollect, playCoin, playThud, playCrash, startEngine, type EngineSound,
} from './services/audioService';
import { say } from './services/speechService';
import { praiseClip } from './speech/phrases';
import { trackScreenView, trackGameStart, trackInteraction } from './services/analyticsService';

// "Brrūm!" — the car rolls down a big track (hills, loop-the-loops, jumps), flies off
// the final ramp and crashes into a block structure with real physics. Every block knocked
// over earns a coin, and coins buy car upgrades in the garage.

const G = 12;              // gravity for both the track ride and the crash physics
const STEP = 0.12;         // track sampling distance
const ROAD_W = 1.7;
const SPEED_SCALE = 0.85;
const V_MIN = 3.2;

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

interface RawPoint { p: THREE.Vector3; air: boolean; loop: boolean; }
interface TrackPoint extends RawPoint { t: THREE.Vector3; u: THREE.Vector3; s: number; }
interface Track { pts: TrackPoint[]; length: number; startY: number; }

const smooth = (k: number) => k * k * (3 - 2 * k);

// Builds a track as a chain of pieces, like snapping toy track together
class PathBuilder {
  pts: RawPoint[] = [];
  private x = 0; private y = 0; private z = 0; private a = 0;
  constructor() { this.push(false, false); }
  private push(air: boolean, loop: boolean) { this.pts.push({ p: new THREE.Vector3(this.x, this.y, this.z), air, loop }); }
  line(len: number) {
    const n = Math.ceil(len / STEP);
    for (let i = 0; i < n; i++) { this.x += Math.cos(this.a) * len / n; this.y += Math.sin(this.a) * len / n; this.push(false, false); }
    return this;
  }
  // Bend up (positive degrees) or down (negative)
  arc(r: number, deg: number) {
    const rad = deg * Math.PI / 180;
    const n = Math.max(2, Math.ceil(Math.abs(rad) * r / STEP));
    const da = rad / n;
    for (let i = 0; i < n; i++) {
      this.a += da / 2;
      this.x += Math.cos(this.a) * r * Math.abs(da);
      this.y += Math.sin(this.a) * r * Math.abs(da);
      this.a += da / 2;
      this.push(false, false);
    }
    return this;
  }
  // Loop-the-loop; drifts sideways (dz) so the exit lane passes beside the entry
  loop(r: number, dz: number) {
    const cx = this.x, cy = this.y + r, z0 = this.z;
    const n = Math.ceil(2 * Math.PI * r / STEP);
    for (let i = 1; i <= n; i++) {
      const th = -Math.PI / 2 + 2 * Math.PI * i / n;
      this.x = cx + r * Math.cos(th);
      this.y = cy + r * Math.sin(th);
      this.z = z0 + dz * smooth(i / n);
      this.push(false, true);
    }
    this.x = cx; this.y = cy - r; this.a = 0;
    return this;
  }
  // Gap in the track: the car flies a parabola and lands on a matching down-slope
  gap(len: number) {
    const k = Math.tan(this.a), x0 = this.x, y0 = this.y;
    const n = Math.ceil(len / STEP);
    for (let i = 1; i <= n; i++) {
      const X = len * i / n;
      this.x = x0 + X;
      this.y = y0 + X * k - X * X * k / len;
      this.push(true, false);
    }
    this.a = -this.a;
    return this;
  }
  shiftZ(len: number, dz: number) {
    const z0 = this.z, n = Math.ceil(len / STEP);
    for (let i = 1; i <= n; i++) { this.x += len / n; this.z = z0 + dz * smooth(i / n); this.push(false, false); }
    return this;
  }
}

type TrackId = 'hill' | 'loop' | 'jumps' | 'mega';
const TRACK_IDS: TrackId[] = ['hill', 'loop', 'jumps', 'mega'];

const TRACK_RECIPES: Record<TrackId, (b: PathBuilder) => void> = {
  hill: b => b.line(1.6).arc(3, -55).line(4.5).arc(3, 55).line(2.5).arc(4, 38),
  loop: b => b.line(1.6).arc(3, -62).line(4.5).arc(3, 62).line(2).loop(2.3, -2.8).shiftZ(3.5, 2.8).line(0.5).arc(4, 36),
  jumps: b => b.line(1.6).arc(3, -58).line(4).arc(3, 58).line(1.2)
    .arc(2.5, 28).gap(4).arc(2.5, 28).line(1.4)
    .arc(2.5, 28).gap(4.2).arc(2.5, 28).line(1.4).arc(4, 36),
  mega: b => b.line(1.6).arc(3, -70).line(7).arc(3.5, 70).line(2).loop(2.7, -3).shiftZ(3.5, 3)
    .arc(2.5, 28).gap(4.5).arc(2.5, 28).line(1.5).loop(2.2, -2.8).shiftZ(3.5, 2.8).arc(4, 40),
};

const buildTrack = (id: TrackId): Track => {
  const b = new PathBuilder();
  TRACK_RECIPES[id](b);
  const raw = b.pts;
  const minY = Math.min(...raw.filter(r => !r.air).map(r => r.p.y));
  raw.forEach(r => { r.p.y += 0.3 - minY; });
  let s = 0;
  const pts: TrackPoint[] = raw.map((r, i) => {
    const prev = raw[Math.max(0, i - 1)].p, next = raw[Math.min(raw.length - 1, i + 1)].p;
    const t = next.clone().sub(prev).normalize();
    const u = new THREE.Vector3(-t.y, t.x, 0).normalize();
    if (i > 0) s += r.p.distanceTo(raw[i - 1].p);
    return { ...r, t, u, s };
  });
  return { pts, length: s, startY: pts[0].p.y };
};

// Position / direction on the track at arc length s
const trackAt = (track: Track, s: number) => {
  const pts = track.pts;
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].s <= s) lo = mid; else hi = mid; }
  const a = pts[lo], b = pts[hi];
  const k = b.s > a.s ? Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s))) : 0;
  return {
    p: a.p.clone().lerp(b.p, k),
    t: a.t.clone().lerp(b.t, k).normalize(),
    u: a.u.clone().lerp(b.u, k).normalize(),
    air: a.air,
  };
};

const poseQuaternion = (t: THREE.Vector3, u: THREE.Vector3) => {
  const side = t.clone().cross(u).normalize();
  const fwd = u.clone().cross(side).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd, u, side));
};

// Speed from how far below the start we are (like a real roller coaster), never too slow
const rideSpeed = (track: Track, y: number, engine: number) =>
  Math.max(V_MIN, SPEED_SCALE * Math.sqrt(2 * G * Math.max(0, track.startY + 0.6 - y))) * (1 + 0.15 * (engine - 1));

// ---------------------------------------------------------------------------
// Car
// ---------------------------------------------------------------------------

type BodyType = 'race' | 'jeep' | 'monster' | 'fire';

interface CarConfig {
  body: BodyType;
  color: string;
  wheels: 0 | 1 | 2;
  engine: 1 | 2 | 3;
  rocket: boolean;
  wings: boolean;
  flag: boolean;
}

const BODY_SPECS: Record<BodyType, { len: number; h: number; w: number; cabin: [number, number, number, number]; wheelR: number; lift: number; mass: number }> = {
  race: { len: 1.9, h: 0.34, w: 0.95, cabin: [0.75, 0.28, 0.78, -0.15], wheelR: 0.24, lift: 0, mass: 4 },
  jeep: { len: 1.7, h: 0.5, w: 1.0, cabin: [0.9, 0.45, 0.9, -0.2], wheelR: 0.3, lift: 0.05, mass: 6 },
  monster: { len: 1.8, h: 0.5, w: 1.05, cabin: [0.85, 0.42, 0.9, -0.15], wheelR: 0.4, lift: 0.28, mass: 8 },
  fire: { len: 2.3, h: 0.6, w: 1.0, cabin: [0.6, 0.45, 0.95, 0.78], wheelR: 0.3, lift: 0.05, mass: 12 },
};
const WHEEL_SCALE = [1, 1.3, 1.65];

const carDims = (c: CarConfig) => {
  const spec = BODY_SPECS[c.body];
  const wr = spec.wheelR * WHEEL_SCALE[c.wheels];
  const chassisY = wr * 0.9 + spec.lift;
  const height = chassisY + spec.h + spec.cabin[1];
  return { spec, wr, chassisY, height };
};

interface CarLive { spin: number; flame: boolean; }

const Wheel: React.FC<{ pos: [number, number, number]; r: number; chunky: boolean; live: React.MutableRefObject<CarLive> }> = ({ pos, r, chunky, live }) => {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => { if (ref.current) ref.current.rotation.z = -live.current.spin; });
  return (
    <group position={pos}>
      <group ref={ref}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[r, r, chunky ? r * 0.9 : r * 0.7, 16]} />
          <meshStandardMaterial color="#27272a" roughness={0.9} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, pos[2] > 0 ? r * 0.36 : -r * 0.36]}>
          <cylinderGeometry args={[r * 0.45, r * 0.45, 0.04, 6]} />
          <meshStandardMaterial color="#d4d4d8" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
};

const CarModel: React.FC<{ config: CarConfig; live: React.MutableRefObject<CarLive> }> = ({ config, live }) => {
  const { spec, wr, chassisY } = carDims(config);
  const flameRef = useRef<THREE.Group>(null);
  useFrame(state => {
    if (!flameRef.current) return;
    flameRef.current.visible = live.current.flame;
    const s = 0.8 + Math.sin(state.clock.elapsedTime * 40) * 0.25;
    flameRef.current.scale.set(s, 1, 1);
  });
  const paint = useMemo(() => new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.35, metalness: 0.15 }), [config.color]);
  const glass = useMemo(() => new THREE.MeshStandardMaterial({ color: '#bae6fd', roughness: 0.1, metalness: 0.3 }), []);
  const [cl, ch, cw, cx] = spec.cabin;
  const bodyY = chassisY + spec.h / 2;
  const topY = chassisY + spec.h;
  const wx = spec.len * 0.33;
  const wz = spec.w / 2 + 0.02;
  const chunky = config.wheels === 2 || config.body === 'monster';

  return (
    <group>
      <mesh position={[0, bodyY, 0]} material={paint} castShadow><boxGeometry args={[spec.len, spec.h, spec.w]} /></mesh>
      <mesh position={[cx, topY + ch / 2, 0]} material={paint} castShadow><boxGeometry args={[cl, ch, cw]} /></mesh>
      {/* Windows */}
      <mesh position={[cx + cl / 2 + 0.005, topY + ch / 2, 0]} material={glass}><boxGeometry args={[0.02, ch * 0.7, cw * 0.85]} /></mesh>
      <mesh position={[cx, topY + ch / 2, cw / 2 + 0.005]} material={glass}><boxGeometry args={[cl * 0.8, ch * 0.6, 0.02]} /></mesh>
      <mesh position={[cx, topY + ch / 2, -cw / 2 - 0.005]} material={glass}><boxGeometry args={[cl * 0.8, ch * 0.6, 0.02]} /></mesh>
      {/* Headlights */}
      {[-1, 1].map(side => (
        <mesh key={side} position={[spec.len / 2 + 0.01, bodyY, side * spec.w * 0.3]}>
          <boxGeometry args={[0.03, 0.12, 0.18]} />
          <meshStandardMaterial color="#fef9c3" emissive="#fde047" emissiveIntensity={0.8} />
        </mesh>
      ))}
      {config.body === 'race' && (
        <group position={[-spec.len / 2 + 0.12, topY + 0.18, 0]}>
          <mesh position={[0, 0.1, 0]} castShadow><boxGeometry args={[0.25, 0.05, spec.w + 0.1]} /><meshStandardMaterial color="#18181b" /></mesh>
          <mesh position={[0, -0.02, 0.3]}><boxGeometry args={[0.05, 0.22, 0.05]} /><meshStandardMaterial color="#18181b" /></mesh>
          <mesh position={[0, -0.02, -0.3]}><boxGeometry args={[0.05, 0.22, 0.05]} /><meshStandardMaterial color="#18181b" /></mesh>
          <mesh position={[0.4, -0.2, 0]}><boxGeometry args={[0.5, 0.02, 0.12]} /><meshStandardMaterial color="#ffffff" /></mesh>
        </group>
      )}
      {config.body === 'fire' && (
        <group position={[-0.3, topY + 0.08, 0]}>
          {[-0.28, 0.28].map(z => (
            <mesh key={z} position={[0, 0, z]}><boxGeometry args={[1.3, 0.05, 0.05]} /><meshStandardMaterial color="#e4e4e7" /></mesh>
          ))}
          {[-0.5, -0.25, 0, 0.25, 0.5].map(x => (
            <mesh key={x} position={[x, 0, 0]}><boxGeometry args={[0.04, 0.04, 0.56]} /><meshStandardMaterial color="#e4e4e7" /></mesh>
          ))}
          <mesh position={[1.08, 0.5, 0]}><boxGeometry args={[0.16, 0.08, 0.5]} /><meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.9} /></mesh>
        </group>
      )}
      {config.body === 'monster' && (
        <mesh position={[0, chassisY - 0.05, 0]}><boxGeometry args={[spec.len * 0.7, 0.1, spec.w * 0.6]} /><meshStandardMaterial color="#3f3f46" /></mesh>
      )}
      {[-wx, wx].flatMap(x => [wz, -wz].map(z => (
        <Wheel key={`${x}-${z}`} pos={[x, wr, z * (chunky ? 1.06 : 1)]} r={wr} chunky={chunky} live={live} />
      )))}
      {config.wings && (
        <group position={[-0.1, topY + 0.05, 0]}>
          {[-1, 1].map(side => (
            <mesh key={side} position={[0, 0, side * (spec.w / 2 + 0.55)]} rotation={[side * 0.15, 0, 0]} castShadow>
              <boxGeometry args={[0.7, 0.05, 1.1]} />
              <meshStandardMaterial color="#f8fafc" />
            </mesh>
          ))}
        </group>
      )}
      {config.rocket && (
        <group position={[-spec.len / 2 - 0.15, bodyY + 0.05, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.16, 0.2, 0.4, 12]} /><meshStandardMaterial color="#71717a" metalness={0.7} roughness={0.3} /></mesh>
          <group ref={flameRef} position={[-0.45, 0, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]}><coneGeometry args={[0.15, 0.6, 10]} /><meshStandardMaterial color="#fb923c" emissive="#f97316" emissiveIntensity={2} transparent opacity={0.85} /></mesh>
            <mesh rotation={[0, 0, Math.PI / 2]} position={[0.1, 0, 0]}><coneGeometry args={[0.08, 0.35, 8]} /><meshStandardMaterial color="#fef08a" emissive="#fde047" emissiveIntensity={2} /></mesh>
          </group>
        </group>
      )}
      {config.flag && (
        <group position={[cx - cl / 2 + 0.05, topY + ch, spec.w * 0.3]}>
          <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.015, 0.015, 0.6, 6]} /><meshStandardMaterial color="#d4d4d8" /></mesh>
          <mesh position={[-0.14, 0.5, 0]}><boxGeometry args={[0.28, 0.18, 0.02]} /><meshStandardMaterial color="#ef4444" /></mesh>
        </group>
      )}
    </group>
  );
};

// ---------------------------------------------------------------------------
// Things to knock over
// ---------------------------------------------------------------------------

interface Decor { shape: 'box' | 'cyl' | 'cone'; pos: [number, number, number]; size: [number, number, number]; color: string; }
interface BlockDef { shape: 'box' | 'cyl'; pos: [number, number, number]; size: [number, number, number]; color: string; decor?: Decor[]; }

type StructureKind = 'tower' | 'wall' | 'crates' | 'castle' | 'pins' | 'house' | 'barrels' | 'dominos' | 'skyscraper';
const STRUCTURES: StructureKind[] = ['tower', 'wall', 'crates', 'castle', 'pins', 'house', 'barrels', 'dominos', 'skyscraper'];
const RAINBOW = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6'];

const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: string, decor?: Decor[]): BlockDef =>
  ({ shape: 'box', pos: [x, y, z], size: [w, h, d], color, decor });

const buildStructure = (kind: StructureKind, cx: number): BlockDef[] => {
  const out: BlockDef[] = [];
  if (kind === 'tower') {
    // Tall rainbow tower, two colours around
    let y = 0;
    for (let i = 0; i < 10; i++) {
      const s = 1.6 - i * 0.08, h = 0.62;
      out.push(box(cx, y + h / 2, 0, s, h, s, RAINBOW[i % RAINBOW.length]));
      y += h;
    }
    out.push(box(cx, y + 0.22, 0, 0.44, 0.44, 0.44, '#fde047'));
  } else if (kind === 'wall') {
    const bw = 0.72, bh = 0.46, bd = 0.9;
    for (let r = 0; r < 7; r++) {
      const odd = r % 2 === 1;
      const n = odd ? 6 : 7;
      for (let c = 0; c < n; c++) {
        const x = cx - 3 * bw + c * bw + (odd ? bw / 2 : 0);
        out.push(box(x, r * bh + bh / 2, 0, bw - 0.02, bh, bd, (r + c) % 2 ? '#dc2626' : '#f97316'));
      }
    }
  } else if (kind === 'crates') {
    const s = 0.9;
    for (let r = 0; r < 5; r++) {
      const n = 5 - r;
      for (let c = 0; c < n; c++) {
        const x = cx + (c - (n - 1) / 2) * (s + 0.02);
        out.push(box(x, r * s + s / 2, 0, s, s, s, '#d97706', [
          { shape: 'box', pos: [0, s * 0.3, s / 2 + 0.01], size: [s * 0.9, 0.08, 0.02], color: '#92400e' },
          { shape: 'box', pos: [0, -s * 0.3, s / 2 + 0.01], size: [s * 0.9, 0.08, 0.02], color: '#92400e' },
          { shape: 'box', pos: [0, 0, s / 2 + 0.01], size: [0.08, s * 0.9, 0.02], color: '#92400e' },
        ]));
      }
    }
  } else if (kind === 'castle') {
    const s = 0.8, d = 1.1;
    for (let r = 0; r < 3; r++) {
      [-3, -2, -1, 0, 1, 2, 3].forEach(i => out.push(box(cx + i * s, r * s + s / 2, 0, s - 0.01, s, d, r === 0 && i === 0 ? '#a16207' : '#fbbf24')));
    }
    [-2, -1, 0, 1, 2].forEach(i => { if (i % 2 === 0) out.push(box(cx + i * s, 3 * s + 0.2, 0, 0.4, 0.4, d, '#f59e0b')); });
    [-3, 3].forEach(i => {
      out.push(box(cx + i * s, 3 * s + s / 2, 0, s - 0.01, s, d, '#fcd34d'));
      out.push(box(cx + i * s, 4 * s + s / 2, 0, s - 0.01, s, d, '#fcd34d', [
        { shape: 'cone', pos: [0, s / 2 + 0.45, 0], size: [0.6, 0.9, 0.6], color: '#dc2626' },
        ...(i === 3 ? [
          { shape: 'cyl' as const, pos: [0, s / 2 + 1.2, 0] as [number, number, number], size: [0.025, 0.7, 0.025] as [number, number, number], color: '#d4d4d8' },
          { shape: 'box' as const, pos: [0.2, s / 2 + 1.4, 0] as [number, number, number], size: [0.4, 0.26, 0.02] as [number, number, number], color: '#3b82f6' },
        ] : []),
      ]));
    });
  } else if (kind === 'pins') {
    for (let k = 0; k < 5; k++) {
      for (let j = 0; j <= k; j++) {
        out.push({
          shape: 'cyl', pos: [cx - 1.3 + k * 0.62, 0.65, (j - k / 2) * 0.62], size: [0.23, 1.3, 0.23], color: '#fafafa',
          decor: [
            { shape: 'cyl', pos: [0, 0.26, 0], size: [0.235, 0.08, 0.235], color: '#ef4444' },
            { shape: 'cyl', pos: [0, 0.4, 0], size: [0.235, 0.08, 0.235], color: '#ef4444' },
          ],
        });
      }
    }
  } else if (kind === 'house') {
    const w = 1.2, h = 0.8, d = 1.7;
    [-1, 1].forEach(side => {
      [0, 1, 2].forEach(r => {
        const decor: Decor[] = r === 0 && side < 0
          ? [{ shape: 'box', pos: [0.2, -0.08, d / 2 + 0.01], size: [0.42, 0.62, 0.02], color: '#7c2d12' }]
          : [{ shape: 'box', pos: [0, 0.04, d / 2 + 0.01], size: [0.42, 0.42, 0.02], color: '#7dd3fc' }];
        out.push(box(cx + side * w / 2, h * r + h / 2, 0, w - 0.01, h, d, r % 2 ? '#fecaca' : '#fca5a5', decor));
      });
    });
    const top = 3 * h;
    out.push(box(cx, top + 0.15, 0, 2.9, 0.3, 2.1, '#b91c1c'));
    out.push(box(cx, top + 0.45, 0, 2.1, 0.3, 1.6, '#dc2626'));
    out.push(box(cx, top + 0.75, 0, 1.3, 0.3, 1.1, '#ef4444'));
    out.push(box(cx + 0.35, top + 1.15, 0, 0.3, 0.5, 0.3, '#57534e'));
  } else if (kind === 'barrels') {
    const r = 0.4, h = 0.95;
    const colors = ['#3b82f6', '#ef4444', '#facc15', '#22c55e', '#a855f7', '#f97316'];
    const barrel = (x: number, y: number, c: string): BlockDef => ({
      shape: 'cyl', pos: [x, y, 0], size: [r, h, r], color: c,
      decor: [
        { shape: 'cyl', pos: [0, h * 0.28, 0], size: [r + 0.01, 0.06, r + 0.01], color: '#3f3f46' },
        { shape: 'cyl', pos: [0, -h * 0.28, 0], size: [r + 0.01, 0.06, r + 0.01], color: '#3f3f46' },
      ],
    });
    let i = 0;
    for (let row = 0; row < 4; row++) {
      const n = 4 - row;
      for (let c = 0; c < n; c++) out.push(barrel(cx + (c - (n - 1) / 2) * (2 * r + 0.03), h * row + h / 2, colors[i++ % colors.length]));
    }
  } else if (kind === 'dominos') {
    // Knock the first one and they all go
    for (let i = 0; i < 11; i++) {
      out.push(box(cx - 0.6 + i * 0.9, 0.9, 0, 0.26, 1.8, 1.3, RAINBOW[i % RAINBOW.length], [
        { shape: 'cyl', pos: [-0.14, 0.4, 0], size: [0.1, 0.02, 0.1], color: '#fafafa' },
        { shape: 'cyl', pos: [-0.14, -0.4, 0], size: [0.1, 0.02, 0.1], color: '#fafafa' },
      ]));
    }
  } else {
    // Skyscraper: 3 x 8 floors with lit windows
    const s = 0.85;
    for (let f = 0; f < 8; f++) {
      [-1, 0, 1].forEach(c => {
        out.push(box(cx + c * (s + 0.01), f * s + s / 2, 0, s, s, s, f % 2 ? '#64748b' : '#475569', [
          { shape: 'box', pos: [0, 0.05, s / 2 + 0.01], size: [0.45, 0.4, 0.02], color: (f + c) % 3 ? '#fde68a' : '#93c5fd' },
        ]));
      });
    }
    out.push(box(cx, 8 * s + 0.4, 0, 0.12, 0.8, 0.12, '#e2e8f0', [
      { shape: 'box', pos: [0, 0.42, 0], size: [0.18, 0.12, 0.18], color: '#ef4444' },
    ]));
  }
  return out;
};

// The car's flight after the last ramp (wings lift it a little)
const predictFlight = (track: Track, config: CarConfig) => {
  const end = track.pts[track.pts.length - 1];
  const v = rideSpeed(track, end.p.y, config.engine) * (config.rocket ? 1.25 : 1);
  return { x0: end.p.x, y0: end.p.y, vx: end.t.x * v, vy: end.t.y * v, g: G * (config.wings ? 0.72 : 1) };
};

// Aim a bit below the middle of tall things so they topple
const HIT_HEIGHT: Record<StructureKind, number> = {
  tower: 2.2, wall: 1.6, crates: 2.2, castle: 1.8, pins: 0.9, house: 1.8, barrels: 1.8, dominos: 1.3, skyscraper: 2.4,
};

// Where the car will be at crash height, so structures are always in reach
const predictImpactX = (track: Track, config: CarConfig, hitY = 1.3) => {
  const { x0, y0, vx, vy, g } = predictFlight(track, config);
  const tHit = (vy + Math.sqrt(vy * vy + 2 * g * Math.max(0, y0 - hitY))) / g;
  return x0 + vx * tHit;
};

// Fire ring hangs at the top of the flight arc
const RING_R = 1.5;
const predictRing = (track: Track, config: CarConfig) => {
  const { x0, y0, vx, vy, g } = predictFlight(track, config);
  const t = Math.max(0.25, vy / g);
  return new THREE.Vector3(x0 + vx * t, Math.max(RING_R + 0.4, y0 + vy * t - 0.5 * g * t * t + 0.45), 0);
};

const buildRound = (t: Track, config: CarConfig, kinds: StructureKind[]) => {
  const x = predictImpactX(t, config, HIT_HEIGHT[kinds[0]]) + 0.25;
  return kinds.flatMap((k, i) => buildStructure(k, x + 0.4 + i * 6));
};

const randomKinds = (track: TrackId, prev: StructureKind[] = []): StructureKind[] => {
  const pick = () => STRUCTURES.filter(k => !prev.includes(k))[Math.floor(Math.random() * (STRUCTURES.length - prev.length))] || 'tower';
  const first = pick();
  if (track !== 'mega') return [first];
  const rest = STRUCTURES.filter(k => k !== first);
  return [first, rest[Math.floor(Math.random() * rest.length)]];
};

// ---------------------------------------------------------------------------
// Scene pieces
// ---------------------------------------------------------------------------

const TrackMesh: React.FC<{ track: Track }> = React.memo(({ track }) => {
  const { road, sides, supports } = useMemo(() => {
    const top: number[] = [], topColors: number[] = [], edge: number[] = [];
    const colA = new THREE.Color('#fbbf24'), colB = new THREE.Color('#f59e0b'), loopA = new THREE.Color('#ef4444'), loopB = new THREE.Color('#fafafa');
    const pts = track.pts;
    const quad = (arr: number[], a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
      arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    };
    const corners = (i: number) => {
      const { p, t, u } = pts[i];
      const side = t.clone().cross(u).normalize().multiplyScalar(ROAD_W / 2);
      return {
        L: p.clone().add(side), R: p.clone().sub(side),
        Lt: p.clone().add(side).addScaledVector(u, 0.22), Rt: p.clone().sub(side).addScaledVector(u, 0.22),
        Lb: p.clone().add(side).addScaledVector(u, -0.2), Rb: p.clone().sub(side).addScaledVector(u, -0.2),
      };
    };
    for (let i = 0; i < pts.length - 1; i++) {
      if (pts[i].air || pts[i + 1].air) continue;
      const A = corners(i), B = corners(i + 1);
      quad(top, A.L, B.L, B.R, A.R);
      const band = Math.floor(pts[i].s / 0.8) % 2 === 0;
      const c = pts[i].loop ? (band ? loopA : loopB) : (band ? colA : colB);
      for (let k = 0; k < 6; k++) topColors.push(c.r, c.g, c.b);
      quad(edge, A.Lb, B.Lb, B.Lt, A.Lt);
      quad(edge, A.Rb, B.Rb, B.Rt, A.Rt);
      quad(edge, A.Lb, B.Lb, B.Rb, A.Rb);
    }
    const road = new THREE.BufferGeometry();
    road.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
    road.setAttribute('color', new THREE.Float32BufferAttribute(topColors, 3));
    road.computeVertexNormals();
    const sides = new THREE.BufferGeometry();
    sides.setAttribute('position', new THREE.Float32BufferAttribute(edge, 3));
    sides.computeVertexNormals();
    const supports: { x: number; z: number; h: number }[] = [];
    pts.forEach((p, i) => {
      if (i % 9 !== 0 || p.air || p.loop || p.p.y < 0.7) return;
      supports.push({ x: p.p.x, z: p.p.z, h: p.p.y - 0.2 });
    });
    return { road, sides, supports };
  }, [track]);

  const start = track.pts[0].p;
  return (
    <group>
      <mesh geometry={road} castShadow receiveShadow>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.6} />
      </mesh>
      <mesh geometry={sides} castShadow>
        <meshStandardMaterial color="#c2410c" side={THREE.DoubleSide} roughness={0.7} />
      </mesh>
      {supports.map((s, i) => (
        <mesh key={i} position={[s.x, s.h / 2, s.z]} castShadow>
          <cylinderGeometry args={[0.09, 0.12, s.h, 8]} />
          <meshStandardMaterial color="#78716c" />
        </mesh>
      ))}
      {/* Start tower with a checkered banner */}
      <mesh position={[start.x - 0.2, (start.y - 0.2) / 2, start.z]} castShadow receiveShadow>
        <boxGeometry args={[1.6, start.y - 0.2, ROAD_W + 0.2]} />
        <meshStandardMaterial color="#a8a29e" />
      </mesh>
      {[-1, 1].map(side => (
        <mesh key={side} position={[start.x + 0.3, start.y + 0.9, start.z + side * (ROAD_W / 2 + 0.1)]} castShadow>
          <boxGeometry args={[0.12, 1.8, 0.12]} />
          <meshStandardMaterial color="#3f3f46" />
        </mesh>
      ))}
      {Array.from({ length: 8 }).map((_, i) => (
        <mesh key={i} position={[start.x + 0.3, start.y + 1.75, start.z - ROAD_W / 2 + (i + 0.5) * (ROAD_W + 0.2) / 8 - 0.1]}>
          <boxGeometry args={[0.1, 0.3, (ROAD_W + 0.2) / 8]} />
          <meshStandardMaterial color={i % 2 ? '#18181b' : '#fafafa'} />
        </mesh>
      ))}
    </group>
  );
});

const Scenery: React.FC = React.memo(() => {
  const trees = useMemo(() => Array.from({ length: 26 }, (_, i) => ({
    x: -12 + i * 3.1 + Math.sin(i * 7.3) * 1.2,
    z: -9 - (i % 3) * 3 - Math.cos(i * 3.1),
    s: 0.8 + ((i * 37) % 10) / 12,
  })), []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#86efac" />
      </mesh>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} scale={t.s}>
          <mesh position={[0, 0.5, 0]} castShadow><cylinderGeometry args={[0.15, 0.2, 1, 8]} /><meshStandardMaterial color="#92400e" /></mesh>
          <mesh position={[0, 1.6, 0]} castShadow><coneGeometry args={[0.9, 1.9, 10]} /><meshStandardMaterial color={i % 2 ? '#16a34a' : '#15803d'} /></mesh>
        </group>
      ))}
    </group>
  );
});

const FireRing: React.FC<{ pos: THREE.Vector3; flash: React.MutableRefObject<number> }> = ({ pos, flash }) => {
  const group = useRef<THREE.Group>(null);
  const flames = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    flash.current = Math.max(0, flash.current - dt);
    if (group.current) group.current.scale.setScalar(1 + flash.current * 0.5);
    flames.current?.children.forEach((c, i) => {
      const s = 0.75 + 0.35 * Math.sin(t * 14 + i * 1.7);
      c.scale.set(s, s * (1.1 + 0.3 * Math.sin(t * 9 + i)), s);
    });
  });
  const n = 14;
  return (
    <group ref={group} position={pos} rotation={[0, Math.PI / 2, 0]}>
      <mesh>
        <torusGeometry args={[RING_R, 0.13, 10, 40]} />
        <meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={1.6} metalness={0.3} />
      </mesh>
      <group ref={flames}>
        {Array.from({ length: n }).map((_, i) => {
          const a = (i / n) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * RING_R, Math.sin(a) * RING_R, 0]} rotation={[0, 0, a - Math.PI / 2]}>
              <coneGeometry args={[0.16, 0.55, 8]} />
              <meshStandardMaterial color={i % 2 ? '#fde047' : '#fb923c'} emissive={i % 2 ? '#facc15' : '#f97316'} emissiveIntensity={2} transparent opacity={0.9} />
            </mesh>
          );
        })}
      </group>
      <mesh position={[0, -RING_R - (pos.y - RING_R) / 2, 0]}>
        <cylinderGeometry args={[0.07, 0.09, Math.max(0.1, pos.y - RING_R), 8]} />
        <meshStandardMaterial color="#57534e" />
      </mesh>
    </group>
  );
};

// Quick orange shockwave where the car smashes in
const BoomFX: React.FC<{ boom: React.MutableRefObject<{ t: number; pos: THREE.Vector3 }> }> = ({ boom }) => {
  const ref = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useFrame((_, dt) => {
    const b = boom.current;
    b.t += dt;
    if (!ref.current || !mat.current) return;
    const k = b.t / 0.45;
    ref.current.visible = k < 1;
    if (k >= 1) return;
    ref.current.position.copy(b.pos);
    ref.current.scale.setScalar(0.3 + k * 3.2);
    mat.current.opacity = 0.75 * (1 - k);
  });
  return (
    <mesh ref={ref} visible={false}>
      <icosahedronGeometry args={[1, 1]} />
      <meshStandardMaterial ref={mat} color="#fb923c" emissive="#f97316" emissiveIntensity={1.5} transparent opacity={0.7} flatShading depthWrite={false} />
    </mesh>
  );
};

const BlockMesh = React.forwardRef<THREE.Group, { def: BlockDef }>(({ def }, ref) => (
  <group ref={ref} position={def.pos}>
    <mesh castShadow receiveShadow>
      {def.shape === 'box'
        ? <boxGeometry args={def.size} />
        : <cylinderGeometry args={[def.size[0], def.size[0], def.size[1], 16]} />}
      <meshStandardMaterial color={def.color} roughness={0.55} />
    </mesh>
    {def.decor?.map((d, i) => (
      <mesh key={i} position={d.pos}>
        {d.shape === 'box' && <boxGeometry args={d.size} />}
        {d.shape === 'cyl' && <cylinderGeometry args={[d.size[0], d.size[0], d.size[1], 16]} />}
        {d.shape === 'cone' && <coneGeometry args={[d.size[0], d.size[1], 12]} />}
        <meshStandardMaterial color={d.color} roughness={0.5} />
      </mesh>
    ))}
  </group>
));

// ---------------------------------------------------------------------------
// Game scene: track ride → launch → physics crash → reset
// ---------------------------------------------------------------------------

type Phase = 'idle' | 'ride' | 'fly' | 'done' | 'reset';

interface SceneProps {
  track: Track;
  config: CarConfig;
  blocks: BlockDef[];
  goSignal: number;
  trickSignal: number;
  garageOpen: boolean;
  onPhase: (p: Phase) => void;
  onRoundEnd: (knocked: number, total: number) => void;
  onBonus: (icon: string, coins: number) => void;
}

const TRICK_TIME = 0.6;

const Scene: React.FC<SceneProps> = ({ track, config, blocks, goSignal, trickSignal, garageOpen, onPhase, onRoundEnd, onBonus }) => {
  const carRef = useRef<THREE.Group>(null);
  const live = useRef<CarLive>({ spin: 0, flame: false });
  const phase = useRef<Phase>('idle');
  const sRef = useRef(0);
  const timer = useRef(0);
  const settleTimer = useRef(0);
  const wingTime = useRef(0);
  const engine = useRef<EngineSound | null>(null);
  const resetFrom = useRef<{ p: THREE.Vector3; q: THREE.Quaternion } | null>(null);
  const lookAt = useRef(new THREE.Vector3(0, 2, 0));
  const lastThud = useRef(0);
  const configRef = useRef(config);
  configRef.current = config;
  const trackRef = useRef(track);
  trackRef.current = track;
  const airborne = useRef(false);
  const trick = useRef({ active: false, kind: 'flip' as 'flip' | 'roll', t: 0, count: 0 });
  const ringPassed = useRef(false);
  const ringFlash = useRef(0);
  const ringPos = useMemo(() => predictRing(track, config),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [track, config.engine, config.rocket, config.wings]);
  const ringRef = useRef(ringPos);
  ringRef.current = ringPos;
  const bonusRef = useRef(onBonus);
  bonusRef.current = onBonus;
  const boom = useRef({ t: 99, pos: new THREE.Vector3() });
  const smashed = useRef(false);

  const setPhase = useCallback((p: Phase) => { phase.current = p; timer.current = 0; onPhase(p); }, [onPhase]);

  // --- Physics world ---
  const world = useMemo(() => {
    const w = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) });
    w.allowSleep = true;
    w.broadphase = new CANNON.SAPBroadphase(w);
    (w.solver as CANNON.GSSolver).iterations = 14;
    w.defaultContactMaterial.friction = 0.45;
    w.defaultContactMaterial.restitution = 0.12;
    const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    w.addBody(ground);
    return w;
  }, []);

  const blockBodies = useRef<CANNON.Body[]>([]);
  const blockStart = useRef<{ p: CANNON.Vec3; q: CANNON.Quaternion }[]>([]);
  const blockMeshes = useRef<(THREE.Group | null)[]>([]);
  const carBody = useRef<CANNON.Body | null>(null);

  const onBlockHit = useCallback((e: { contact: CANNON.ContactEquation }) => {
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    const now = performance.now();
    if (v > 1.5 && now - lastThud.current > 60) { lastThud.current = now; playThud(v / 8); }
  }, []);

  useLayoutEffect(() => {
    blockBodies.current.forEach(b => { b.removeEventListener('collide', onBlockHit); world.removeBody(b); });
    blockBodies.current = blocks.map(def => {
      const [a, b, c] = def.size;
      const shape = def.shape === 'box' ? new CANNON.Box(new CANNON.Vec3(a / 2, b / 2, c / 2)) : new CANNON.Cylinder(a, a, b, 12);
      const volume = def.shape === 'box' ? a * b * c : Math.PI * a * a * b;
      const body = new CANNON.Body({
        mass: Math.max(0.06, volume * 0.8),
        shape,
        position: new CANNON.Vec3(...def.pos),
        linearDamping: 0.05,
        angularDamping: 0.1,
      });
      body.sleepSpeedLimit = 0.2;
      body.sleepTimeLimit = 0.4;
      body.addEventListener('collide', onBlockHit);
      world.addBody(body);
      body.sleep(); // stay perfectly still until something hits
      return body;
    });
    blockStart.current = blockBodies.current.map(b => ({ p: b.position.clone(), q: b.quaternion.clone() }));
  }, [blocks, world, onBlockHit]);

  useEffect(() => () => { engine.current?.stop(); }, []);

  // --- GO! ---
  useEffect(() => {
    if (goSignal === 0 || phase.current !== 'idle') return;
    sRef.current = 0;
    setPhase('ride');
    playEngineRev();
    engine.current?.stop();
    engine.current = startEngine();
  }, [goSignal, setPhase]);

  // Tap while flying: salto or barrel roll
  useEffect(() => {
    if (trickSignal === 0 || phase.current !== 'fly' || !airborne.current || trick.current.active) return;
    const tr = trick.current;
    tr.active = true;
    tr.t = 0;
    tr.kind = tr.count % 2 === 0 ? 'flip' : 'roll';
    tr.count++;
    playLaunchWhoosh();
  }, [trickSignal]);

  const finishTrick = () => {
    const tr = trick.current;
    if (!tr.active) return;
    tr.active = false;
    bonusRef.current(tr.kind === 'flip' ? '🔄' : '🌀', 2);
  };

  const placeOnTrack = (s: number) => {
    const car = carRef.current;
    if (!car) return;
    const pose = trackAt(trackRef.current, s);
    car.position.copy(pose.p);
    car.quaternion.copy(poseQuaternion(pose.t, pose.u));
  };

  const launch = () => {
    const car = carRef.current!;
    const tr = trackRef.current, cfg = configRef.current;
    const end = tr.pts[tr.pts.length - 1];
    const v = rideSpeed(tr, end.p.y, cfg.engine) * (cfg.rocket ? 1.25 : 1);
    const { spec, height } = carDims(cfg);
    const body = new CANNON.Body({ mass: spec.mass, linearDamping: 0.02, angularDamping: 0.2 });
    body.addShape(new CANNON.Box(new CANNON.Vec3(spec.len / 2, height / 2, spec.w / 2 + 0.1)), new CANNON.Vec3(0, height / 2, 0));
    body.position.set(car.position.x, car.position.y, car.position.z);
    body.quaternion.set(car.quaternion.x, car.quaternion.y, car.quaternion.z, car.quaternion.w);
    body.velocity.set(end.t.x * v, end.t.y * v, end.t.z * v);
    body.angularVelocity.set(0, 0, -0.6);
    body.allowSleep = false;
    body.addEventListener('collide', (e: { body: CANNON.Body; contact: CANNON.ContactEquation }) => {
      const hit = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (!smashed.current && blockBodies.current.includes(e.body)) smash(body);
      wingTime.current = 99; // wings stop helping once we touch anything
      airborne.current = false;
      finishTrick();
      if (hit > 2) playBounce();
    });
    world.addBody(body);
    carBody.current = body;
    wingTime.current = 0;
    settleTimer.current = 0;
    airborne.current = true;
    smashed.current = false;
    ringPassed.current = false;
    trick.current.active = false;
    playLaunchWhoosh();
    engine.current?.stop();
    engine.current = null;
    setPhase('fly');
  };

  // 💥 First hit on a structure throws the nearby blocks around — always a proper crash
  const smash = (car: CANNON.Body) => {
    smashed.current = true;
    const speed = Math.max(6, car.velocity.length());
    const strength = Math.min(9, speed * 0.55);
    blockBodies.current.forEach(b => {
      const d = b.position.vsub(car.position);
      const dist = d.length();
      if (dist > 2.8) return;
      const fall = 1 - dist / 2.8;
      const dir = new CANNON.Vec3(d.x / (dist || 1) + 0.9, d.y / (dist || 1) * 0.5 + 0.6, d.z / (dist || 1) * 0.6);
      b.wakeUp();
      b.applyImpulse(dir.scale(strength * fall * b.mass), b.position);
      b.angularVelocity.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    });
    boom.current = { t: 0, pos: new THREE.Vector3(car.position.x + 0.6, car.position.y + 0.5, car.position.z) };
    playCrash();
  };

  const countKnocked = () => blockBodies.current.reduce((n, b, i) => {
    const s = blockStart.current[i];
    const moved = b.position.distanceTo(s.p) > 0.3;
    const dq = new THREE.Quaternion(s.q.x, s.q.y, s.q.z, s.q.w).invert().multiply(new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w));
    const tilted = 2 * Math.acos(Math.min(1, Math.abs(dq.w))) > 0.25;
    return n + (moved || tilted ? 1 : 0);
  }, 0);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const car = carRef.current;
    if (!car) return;
    const tr = trackRef.current, cfg = configRef.current;
    timer.current += dt;
    const p = phase.current;

    if (p === 'idle') {
      placeOnTrack(0);
      live.current.spin = 0;
      live.current.flame = false;
    } else if (p === 'ride') {
      const pose = trackAt(tr, sRef.current);
      const v = rideSpeed(tr, pose.p.y, cfg.engine);
      sRef.current += v * dt;
      live.current.spin += (v / carDims(cfg).wr) * dt;
      live.current.flame = cfg.rocket;
      engine.current?.set(v / 11);
      if (sRef.current >= tr.length) { sRef.current = tr.length; placeOnTrack(tr.length); launch(); }
      else placeOnTrack(sRef.current);
    }

    // Physics runs whenever blocks may be moving
    if (p === 'fly' || p === 'done' || p === 'reset' || p === 'idle') {
      const body = carBody.current;
      if (body && p === 'fly' && cfg.wings && wingTime.current < 2.5) {
        wingTime.current += dt;
        body.applyForce(new CANNON.Vec3(0, body.mass * G * 0.28, 0));
      }
      world.step(1 / 60, dt, 4);
      blockBodies.current.forEach((b, i) => {
        const m = blockMeshes.current[i];
        if (!m) return;
        m.position.set(b.position.x, b.position.y, b.position.z);
        m.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      });
      if (body && (p === 'fly' || p === 'done')) {
        car.position.set(body.position.x, body.position.y, body.position.z);
        car.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
        live.current.spin += body.velocity.length() * dt * 2;
        live.current.flame = cfg.rocket && timer.current < 0.8;
      }
    }

    if (p === 'fly' && carBody.current) {
      const body = carBody.current;
      const tr = trick.current;
      if (tr.active) {
        tr.t += dt;
        const axis = body.quaternion.vmult(tr.kind === 'flip' ? new CANNON.Vec3(0, 0, 1) : new CANNON.Vec3(1, 0, 0));
        const w = (Math.PI * 2) / TRICK_TIME;
        body.angularVelocity.set(axis.x * w, axis.y * w, axis.z * w);
        if (tr.t >= TRICK_TIME) { body.angularVelocity.set(0, 0, -0.3); finishTrick(); }
      }
      const ring = ringRef.current;
      if (!ringPassed.current && car.position.x >= ring.x) {
        ringPassed.current = true;
        if (Math.abs(car.position.y + 0.4 - ring.y) < RING_R + 0.2 && Math.abs(car.position.z - ring.z) < RING_R) {
          ringFlash.current = 0.6;
          playCollect();
          bonusRef.current('🔥', 3);
        }
      }
    }

    if (p === 'fly') {
      const body = carBody.current!;
      settleTimer.current = body.velocity.length() < 0.6 ? settleTimer.current + dt : 0;
      if ((settleTimer.current > 0.7 && timer.current > 1.5) || timer.current > 6 || body.position.y < -5) {
        setPhase('done');
      }
    } else if (p === 'done' && timer.current < 99) {
      // Wait for falling towers to come to rest before counting
      const calm = blockBodies.current.every(b => b.sleepState === CANNON.Body.SLEEPING || b.velocity.length() < 0.25);
      if ((calm && timer.current > 0.8) || timer.current > 5) {
        onRoundEnd(countKnocked(), blockBodies.current.length);
        timer.current = 100;
      }
    } else if (p === 'done' && timer.current > 101.4) {
      const body = carBody.current;
      if (body) { world.removeBody(body); carBody.current = null; }
      resetFrom.current = { p: car.position.clone(), q: car.quaternion.clone() };
      setPhase('reset');
    } else if (p === 'reset') {
      const k = Math.min(1, timer.current / 1.4);
      const e = k * k * (3 - 2 * k);
      const start = trackAt(tr, 0);
      const from = resetFrom.current!;
      const arcUp = Math.sin(k * Math.PI) * 3;
      car.position.copy(from.p).lerp(start.p, e);
      car.position.y += arcUp;
      car.quaternion.copy(from.q).slerp(poseQuaternion(start.t, start.u), e);
      live.current.flame = false;
      if (k >= 1) setPhase('idle');
    }

    // --- Camera ---
    const cam = state.camera as THREE.PerspectiveCamera;
    const aspect = state.size.width / state.size.height;
    const target = new THREE.Vector3();
    const desired = new THREE.Vector3();
    const structX = blocks.length ? blocks.reduce((s, b) => s + b.pos[0], 0) / blocks.length : 10;
    if (garageOpen && (p === 'idle')) {
      // Car sits left of centre so the garage panel doesn't cover it
      const shift = aspect > 1 ? 1.8 : 0;
      target.copy(car.position).add(new THREE.Vector3(shift, aspect > 1 ? 0.6 : -0.8, 0));
      desired.copy(car.position).add(new THREE.Vector3(3 + shift, aspect > 1 ? 1.6 : 0.8, aspect > 1 ? 5.5 : 7));
    } else if (p === 'idle' || p === 'reset') {
      const minX = tr.pts[0].p.x - 2, maxX = Math.max(structX + 3, tr.pts[tr.pts.length - 1].p.x + 2);
      const maxY = Math.max(tr.startY + 2.5, 5);
      target.set((minX + maxX) / 2, maxY * 0.42, 0);
      const vFov = cam.fov * Math.PI / 180;
      const distW = (maxX - minX) / 2 / (Math.tan(vFov / 2) * aspect);
      const distH = maxY / 2 / Math.tan(vFov / 2);
      desired.set(target.x, target.y + 1.5, Math.max(distW, distH) * 1.08 + 3);
    } else if (p === 'ride') {
      target.copy(car.position);
      desired.copy(car.position).add(new THREE.Vector3(-2, 2.5, aspect < 1 ? 17 : 12));
    } else {
      target.set((car.position.x + structX) / 2, 1.5, 0);
      desired.set(target.x, 3.2, (aspect < 1 ? 20 : 14) + Math.abs(car.position.x - structX) * 0.3);
    }
    const k = 1 - Math.exp(-dt * (p === 'ride' ? 4 : 2.5));
    cam.position.lerp(desired, k);
    lookAt.current.lerp(target, k);
    cam.lookAt(lookAt.current);
  });

  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#bae6fd', '#86efac', 0.45]} />
      <directionalLight
        position={[10, 22, 12]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-30}
        shadow-camera-right={45}
        shadow-camera-top={25}
        shadow-camera-bottom={-10}
        shadow-camera-far={80}
      />
      <Sky sunPosition={[100, 60, 80]} />
      <Scenery />
      <TrackMesh track={track} />
      <FireRing pos={ringPos} flash={ringFlash} />
      <BoomFX boom={boom} />
      {blocks.map((def, i) => (
        <BlockMesh key={i} def={def} ref={el => { blockMeshes.current[i] = el; }} />
      ))}
      <group ref={carRef}>
        <CarModel config={config} live={live} />
      </group>
    </>
  );
};

// ---------------------------------------------------------------------------
// Garage (upgrades bought with coins)
// ---------------------------------------------------------------------------

interface ShopItem { id: string; icon: React.ReactNode; price: number; }

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#facc15', '#a855f7', '#f97316', '#ec4899', '#18181b'];

const BODY_ITEMS: (ShopItem & { value: BodyType })[] = [
  { id: 'body-race', value: 'race', icon: '🏎️', price: 0 },
  { id: 'body-jeep', value: 'jeep', icon: '🚙', price: 30 },
  { id: 'body-monster', value: 'monster', icon: '🛻', price: 60 },
  { id: 'body-fire', value: 'fire', icon: '🚒', price: 100 },
];
const WHEEL_ITEMS: (ShopItem & { value: 0 | 1 | 2 })[] = [
  { id: 'wheels-0', value: 0, icon: <span className="inline-block w-5 h-5 rounded-full bg-zinc-800 border-4 border-zinc-400" />, price: 0 },
  { id: 'wheels-1', value: 1, icon: <span className="inline-block w-8 h-8 rounded-full bg-zinc-800 border-[6px] border-zinc-400" />, price: 30 },
  { id: 'wheels-2', value: 2, icon: <span className="inline-block w-11 h-11 rounded-full bg-zinc-900 border-[8px] border-zinc-500" />, price: 70 },
];
const ENGINE_ITEMS: (ShopItem & { value: 1 | 2 | 3 })[] = [
  { id: 'engine-1', value: 1, icon: '⚡', price: 0 },
  { id: 'engine-2', value: 2, icon: '⚡⚡', price: 40 },
  { id: 'engine-3', value: 3, icon: '⚡⚡⚡', price: 90 },
];
const EXTRA_ITEMS: (ShopItem & { value: 'rocket' | 'wings' | 'flag' })[] = [
  { id: 'extra-rocket', value: 'rocket', icon: '🚀', price: 50 },
  { id: 'extra-wings', value: 'wings', icon: '🪽', price: 40 },
  { id: 'extra-flag', value: 'flag', icon: '🚩', price: 10 },
];

const Garage: React.FC<{
  config: CarConfig;
  coins: number;
  owned: Set<string>;
  onBuy: (id: string, price: number) => boolean;
  onChange: (c: CarConfig) => void;
  onClose: () => void;
}> = ({ config, coins, owned, onBuy, onChange, onClose }) => {
  const [shake, setShake] = useState<string | null>(null);

  const tile = (item: ShopItem, selected: boolean, apply: () => void) => {
    const has = item.price === 0 || owned.has(item.id);
    return (
      <button
        key={item.id}
        onClick={() => {
          if (!has) {
            if (!onBuy(item.id, item.price)) { setShake(item.id); setTimeout(() => setShake(null), 800); return; }
          }
          playUIClick();
          apply();
        }}
        className={`relative toy-btn rounded-2xl w-[4.5rem] h-[4.5rem] sm:w-20 sm:h-20 flex items-center justify-center text-3xl sm:text-4xl transition-all
          ${selected ? 'bg-green-100 ring-4 ring-green-500' : 'bg-white'} ${shake === item.id ? 'animate-shake' : ''}`}
      >
        <span className={has ? '' : 'opacity-60'}>{item.icon}</span>
        {!has && (
          <span className={`absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-sm font-bold shadow ${coins >= item.price ? 'bg-amber-400 text-amber-950' : 'bg-slate-200 text-slate-500'}`}>
            🪙{item.price}
          </span>
        )}
      </button>
    );
  };

  const row = (label: string, children: React.ReactNode) => (
    <div className="flex items-center gap-3">
      <span className="w-10 text-3xl text-center shrink-0">{label}</span>
      <div className="flex flex-wrap gap-2 sm:gap-3">{children}</div>
    </div>
  );

  return (
    <div className="absolute inset-y-0 right-0 z-40 w-full sm:w-auto sm:max-w-[34rem] p-3 sm:p-4 flex items-end sm:items-center pointer-events-none">
      <div className="pop-in pointer-events-auto w-full bg-white/95 rounded-[28px] shadow-2xl p-4 sm:p-5 max-h-[70vh] sm:max-h-[92vh] overflow-y-auto space-y-4" style={{ touchAction: 'pan-y' }}>
        <div className="flex items-center justify-between">
          <span className="text-3xl">🔧</span>
          <span className="rounded-full bg-amber-100 px-4 py-1 text-2xl font-bold text-amber-700">🪙 {coins}</span>
          <button onClick={onClose} className="toy-btn w-12 h-12 rounded-full bg-green-500 text-white text-2xl font-bold" aria-label="Close garage">✓</button>
        </div>
        {row('🚗', BODY_ITEMS.map(it => tile(it, config.body === it.value, () => onChange({ ...config, body: it.value }))))}
        {row('🎨', COLORS.map(c => (
          <button
            key={c}
            onClick={() => { playUIClick(); onChange({ ...config, color: c }); }}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full transition-transform ${config.color === c ? 'scale-110 ring-4 ring-offset-2 ring-green-500' : 'active:scale-90'}`}
            style={{ background: c, boxShadow: 'inset 0 -5px 0 rgba(0,0,0,0.18)' }}
            aria-label={c}
          />
        )))}
        {row('🛞', WHEEL_ITEMS.map(it => tile(it, config.wheels === it.value, () => onChange({ ...config, wheels: it.value }))))}
        {row('💪', ENGINE_ITEMS.map(it => tile(it, config.engine === it.value, () => onChange({ ...config, engine: it.value }))))}
        {row('✨', EXTRA_ITEMS.map(it => tile(it, config[it.value], () => onChange({ ...config, [it.value]: !config[it.value] }))))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Track picker icons
// ---------------------------------------------------------------------------

const TRACK_ICONS: Record<TrackId, React.ReactNode> = {
  hill: <path d="M4 8 C 6 34, 16 36, 26 36 L 34 36 C 40 36, 42 30, 44 24" />,
  loop: <path d="M4 6 C 6 32, 12 36, 20 36 C 34 36, 34 16, 26 16 C 18 16, 20 36, 34 36 L 38 36 C 42 36, 43 30, 44 26" />,
  jumps: <><path d="M4 6 C 6 30, 10 36, 16 36 L 18 32" /><path d="M24 32 L 26 36 L 30 36 L 32 32" /><path d="M38 32 L 40 36 L 42 34 L 45 26" /></>,
  mega: <path d="M3 2 C 4 30, 8 38, 14 38 C 24 38, 24 22, 18 22 C 12 22, 14 38, 22 38 L 26 38 L 28 34 M 32 34 L 34 38 C 44 38, 44 24, 38 24 C 32 24, 34 38, 42 38 L 45 32" />,
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: CarConfig = { body: 'race', color: '#ef4444', wheels: 0, engine: 1, rocket: false, wings: false, flag: false };

const load = <T,>(key: string, fallback: T): T => {
  try { const v = localStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } as T : fallback; } catch { return fallback; }
};

interface VroomGameProps {
  t: (key: string) => string;
  onBack: () => void;
  language: string;
}

const VroomGame: React.FC<VroomGameProps> = ({ t, onBack, language }) => {
  const [trackId, setTrackId] = useState<TrackId>(() => (localStorage.getItem('vroomTrack') as TrackId) || 'hill');
  const [config, setConfig] = useState<CarConfig>(() => load('vroomCar', DEFAULT_CONFIG));
  const [coins, setCoins] = useState<number>(() => Number(localStorage.getItem('vroomCoins') ?? 10));
  const [owned, setOwned] = useState<Set<string>>(() => new Set(JSON.parse(localStorage.getItem('vroomOwned') || '[]')));
  const [phase, setPhaseState] = useState<Phase>('idle');
  const [garageOpen, setGarageOpen] = useState(false);
  const [goSignal, setGoSignal] = useState(0);
  const [trickSignal, setTrickSignal] = useState(0);
  const [bonuses, setBonuses] = useState<{ id: number; icon: string; coins: number }[]>([]);
  const [reward, setReward] = useState<{ n: number; key: number } | null>(null);
  const [launches, setLaunches] = useState(0);
  const [kinds, setKinds] = useState<StructureKind[]>(() => randomKinds(trackId));
  const trackedRef = useRef(false);

  const track = useMemo(() => buildTrack(trackId), [trackId]);
  // New targets when the structure changes or the landing spot moves (track or upgrades)
  const blocks = useMemo(() => buildRound(track, config, kinds),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [track, kinds, config.engine, config.rocket, config.wings]);

  useEffect(() => { localStorage.setItem('vroomTrack', trackId); }, [trackId]);
  useEffect(() => { localStorage.setItem('vroomCar', JSON.stringify(config)); }, [config]);
  useEffect(() => { localStorage.setItem('vroomCoins', String(coins)); }, [coins]);
  useEffect(() => { localStorage.setItem('vroomOwned', JSON.stringify([...owned])); }, [owned]);

  if (!trackedRef.current) {
    trackScreenView('vroom');
    trackGameStart('vroom');
    trackedRef.current = true;
  }

  const go = useCallback(() => {
    if (phase !== 'idle' || garageOpen) return;
    setGoSignal(n => n + 1);
    setLaunches(n => n + 1);
    trackInteraction('vroom_launch', { item: trackId });
  }, [phase, garageOpen, trackId]);

  // Tapping the screen: GO when waiting, a trick while flying
  const tap = useCallback(() => {
    if (phase === 'fly') { setTrickSignal(n => n + 1); return; }
    go();
  }, [phase, go]);

  const handleBonus = useCallback((icon: string, coins: number) => {
    const id = Date.now() + Math.random();
    setBonuses(b => [...b, { id, icon, coins }]);
    setCoins(c => c + coins);
    playCoin();
    setTimeout(() => setBonuses(b => b.filter(x => x.id !== id)), 1600);
    trackInteraction('vroom_trick', { item: icon });
  }, []);

  const handleRoundEnd = useCallback((knocked: number, total: number) => {
    if (knocked > 0) {
      setReward({ n: knocked, key: Date.now() });
      for (let i = 0; i < Math.min(knocked, 12); i++) setTimeout(playCoin, 250 + i * 90);
      setTimeout(() => setCoins(c => c + knocked), 250);
      if (knocked >= total * 0.5) {
        setTimeout(() => { playFanfare(); say(praiseClip(knocked === total ? 'amazing' : 'great'), language); }, 400);
      }
      // Fresh things to knock over once the car is back
      setTimeout(() => setKinds(prev => randomKinds(trackId, prev)), 2000);
    }
    trackInteraction('vroom_crash', { item: `${knocked}/${total}` });
  }, [language, trackId]);

  const buy = (id: string, price: number) => {
    if (coins < price) { playIncorrectSound(); return false; }
    setCoins(c => c - price);
    setOwned(o => new Set(o).add(id));
    playCollect();
    trackInteraction('vroom_buy', { item: id });
    return true;
  };

  const pickTrack = (id: TrackId) => {
    if (phase !== 'idle' || id === trackId) return;
    playUIClick();
    setTrackId(id);
    setKinds(randomKinds(id));
  };

  const idle = phase === 'idle';

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-sky-200" style={{ touchAction: 'none' }}>
      <div className="absolute inset-0" onPointerDown={() => tap()}>
        <Canvas
          shadows
          camera={{ position: [8, 6, 26], fov: 45, near: 0.1, far: 400 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          dpr={[1, 1.75]}
        >
          <Scene
            track={track}
            config={config}
            blocks={blocks}
            goSignal={goSignal}
            trickSignal={trickSignal}
            garageOpen={garageOpen}
            onPhase={setPhaseState}
            onRoundEnd={handleRoundEnd}
            onBonus={handleBonus}
          />
        </Canvas>
      </div>

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-start justify-between gap-2 p-3 sm:p-4 pointer-events-none">
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => { playUIClick(); onBack(); }}
          className="pointer-events-auto toy-btn w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/95 flex items-center justify-center text-3xl sm:text-4xl"
          aria-label="Home"
        >
          🏠
        </button>
        <div className="mt-1 flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 shadow-lg">
          <span className="text-2xl sm:text-3xl leading-none">🪙</span>
          <span key={coins} className="pop-in text-2xl sm:text-3xl font-bold text-amber-600 tabular-nums">{coins}</span>
        </div>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => { if (!idle) return; playUIClick(); setGarageOpen(o => !o); }}
          className={`pointer-events-auto toy-btn w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-3xl sm:text-4xl ${garageOpen ? 'bg-green-400' : 'bg-white/95'} ${idle ? '' : 'opacity-50'}`}
          aria-label="Garage"
        >
          🔧
        </button>
      </div>

      {/* Coins earned */}
      {reward && (
        <div key={reward.key} className="absolute top-20 left-0 right-0 z-30 flex justify-center pointer-events-none">
          <div className="rounded-full bg-amber-400 px-6 py-3 text-4xl sm:text-5xl font-bold text-white text-outline shadow-2xl" style={{ animation: 'popIn 0.5s cubic-bezier(.34,1.56,.64,1) both, fadeOut 0.6s ease-in 2.4s forwards' }}>
            +{reward.n} 🪙
          </div>
        </div>
      )}
      {/* Trick bonuses */}
      <div className="absolute top-[34%] left-0 right-0 z-30 flex justify-center gap-3 pointer-events-none">
        {bonuses.map(b => (
          <div key={b.id} className="rounded-3xl bg-white/90 px-4 py-2 text-4xl sm:text-5xl font-bold text-amber-500 shadow-xl"
            style={{ animation: 'popIn 0.4s cubic-bezier(.34,1.56,.64,1) both, fadeOut 0.5s ease-in 1.1s forwards' }}>
            {b.icon} +{b.coins}
          </div>
        ))}
      </div>
      <style>{`@keyframes fadeOut { to { opacity: 0; transform: translateY(-20px); } }`}</style>

      {/* Tap hint before the first run */}
      {idle && launches === 0 && !garageOpen && (
        <div className="absolute inset-x-0 top-[28%] z-10 flex flex-col items-center pointer-events-none">
          <div className="tap-hint text-6xl sm:text-7xl">👇</div>
          <div className="mt-2 text-white text-3xl sm:text-4xl font-bold text-outline">{t('vroomGameTitle')}</div>
        </div>
      )}

      {/* Bottom controls: tracks + GO */}
      {!garageOpen && (
        <div className="absolute bottom-0 left-0 right-0 z-30 flex items-end justify-between gap-2 p-3 sm:p-5 pointer-events-none">
          <div className={`pointer-events-auto flex gap-2 sm:gap-3 transition-opacity ${idle ? '' : 'opacity-40'}`}>
            {TRACK_IDS.map(id => (
              <button
                key={id}
                onPointerDown={e => e.stopPropagation()}
                onClick={() => pickTrack(id)}
                className={`toy-btn w-14 h-14 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center ${trackId === id ? 'bg-amber-300 ring-4 ring-white' : 'bg-white/90'}`}
                aria-label={id}
              >
                <svg viewBox="0 0 48 42" className="w-10 h-10 sm:w-14 sm:h-14" fill="none" stroke={id === 'mega' ? '#dc2626' : '#c2410c'} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  {TRACK_ICONS[id]}
                </svg>
              </button>
            ))}
          </div>
          {phase === 'fly' ? (
          <button
            onPointerDown={e => { e.stopPropagation(); tap(); }}
            className="pointer-events-auto shrink-0 rounded-full flex items-center justify-center bg-yellow-400 wiggle-loop active:scale-90"
            style={{ width: 'clamp(84px, 22vmin, 136px)', height: 'clamp(84px, 22vmin, 136px)', boxShadow: '0 6px 25px rgba(0,0,0,0.4), 0 0 0 5px #fff' }}
            aria-label="Trick"
          >
            <span style={{ fontSize: 'clamp(40px, 11vmin, 68px)' }}>🤸</span>
          </button>
          ) : (
          <button
            onPointerDown={e => { e.stopPropagation(); go(); }}
            className={`pointer-events-auto shrink-0 rounded-full flex items-center justify-center transition-transform active:scale-90 ${idle ? 'go-pulse' : 'opacity-50'}`}
            style={{
              width: 'clamp(84px, 22vmin, 136px)', height: 'clamp(84px, 22vmin, 136px)',
              background: 'conic-gradient(from 0deg, #444, #888, #444, #888, #444, #888, #444, #888, #444)',
              boxShadow: '0 6px 25px rgba(0,0,0,0.5), 0 0 0 3px #333',
              padding: 7,
            }}
            aria-label="Go"
          >
            <span className="w-full h-full rounded-full flex items-center justify-center" style={{ background: 'radial-gradient(circle at 40% 35%, #4ade80, #15803d)' }}>
              <span style={{ fontSize: 'clamp(34px, 9vmin, 56px)' }}>{idle ? '🏁' : '💨'}</span>
            </span>
          </button>
          )}
        </div>
      )}

      {garageOpen && (
        <Garage
          config={config}
          coins={coins}
          owned={owned}
          onBuy={buy}
          onChange={setConfig}
          onClose={() => { playUIClick(); setGarageOpen(false); }}
        />
      )}

      <style>{`
        @keyframes pulse-glow { 0%,100% { box-shadow: 0 0 0 3px #333, 0 0 15px rgba(74,222,128,0.4); } 50% { box-shadow: 0 0 0 3px #333, 0 0 35px rgba(74,222,128,0.9); } }
        .go-pulse { animation: pulse-glow 1.4s infinite; }
      `}</style>
    </div>
  );
};

export default VroomGame;
