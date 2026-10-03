

let audioContext: AudioContext | null = null;
let hasAudioBeenUnlocked = false;

export const getAudioContext = (): AudioContext | null => {
  if (typeof window !== 'undefined') {
    if (!audioContext) {
      try {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.error("Web Audio API is not supported in this browser", e);
        return null;
      }
    }
    return audioContext;
  }
  return null;
};

// This function MUST be called from a direct user interaction (e.g., a click or touchstart event).
export const initializeAudio = (): void => {
  if (hasAudioBeenUnlocked) {
    return;
  }

  const context = getAudioContext();
  if (!context) {
    return;
  }
  
  const playSilentSound = () => {
    // Create an empty buffer and play it.
    // This is a common workaround to unlock the Web Audio API on iOS Safari.
    const buffer = context.createBuffer(1, 1, 22050);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start(0);
  };

  if (context.state === 'suspended') {
    context.resume().then(() => {
      console.log("AudioContext resumed successfully.");
      playSilentSound();
      hasAudioBeenUnlocked = true;
    }).catch(e => console.error("Audio context resume failed: ", e));
  } else {
    // If the context is not suspended, we might still need to play the silent sound
    // to ensure audio works on all iOS versions.
    playSilentSound();
    hasAudioBeenUnlocked = true;
  }
};

const playTone = (frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.5, startOffset: number = 0): void => {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') {
    context.resume();
  }

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, context.currentTime + startOffset);

  gainNode.gain.setValueAtTime(volume, context.currentTime + startOffset);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + startOffset + duration);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);

  oscillator.start(context.currentTime + startOffset);
  oscillator.stop(context.currentTime + startOffset + duration);
};


export const playSound = (frequency: number, duration: number = 0.2): void => {
  try {
    const context = getAudioContext();
    if (!context) return;

    if (context.state === 'suspended') {
      context.resume();
    }

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = 'sine';
    // Add a pitch drop for a "pop" effect
    oscillator.frequency.setValueAtTime(frequency * 1.2, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency, context.currentTime + 0.05);
    
    gainNode.gain.setValueAtTime(0.5, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + duration);
  } catch (error) {
    console.error("Could not play sound:", error);
  }
};

export const playUIClick = (): void => {
  playTone(880, 0.1, 'triangle', 0.3);
};

export const playMenuOpen = (): void => {
  playTone(523.25, 0.1, 'sine', 0.3, 0); // C5
  playTone(659.25, 0.1, 'sine', 0.3, 0.05); // E5
};

export const playMenuClose = (): void => {
  playTone(659.25, 0.1, 'sine', 0.3, 0); // E5
  playTone(523.25, 0.1, 'sine', 0.3, 0.05); // C5
};

export const playCorrectSound = (): void => {
  playTone(523.25, 0.1, 'sine', 0.4, 0);    // C5
  playTone(659.25, 0.1, 'sine', 0.4, 0.1);   // E5
  playTone(783.99, 0.1, 'sine', 0.4, 0.2);   // G5
  playTone(1046.50, 0.15, 'sine', 0.4, 0.3); // C6
};

export const playIncorrectSound = (): void => {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') {
    context.resume();
  }

  const duration = 0.2;
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = 'sine'; // Friendlier than sawtooth
  oscillator.frequency.setValueAtTime(200, context.currentTime); // Start pitch
  oscillator.frequency.exponentialRampToValueAtTime(150, context.currentTime + duration * 0.8); // Drop pitch

  gainNode.gain.setValueAtTime(0.3, context.currentTime); // Gentle volume
  gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);

  oscillator.start();
  oscillator.stop(context.currentTime + duration);
};

export const playEngineRev = (): void => {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') context.resume();

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(80, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(250, context.currentTime + 0.4);
  gainNode.gain.setValueAtTime(0.3, context.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.5);
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.5);
};

export const playLaunchWhoosh = (): void => {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') context.resume();

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(200, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(600, context.currentTime + 0.3);
  gainNode.gain.setValueAtTime(0.4, context.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.3);
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.3);
};

export const playBounce = (): void => {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') context.resume();

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(150, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(60, context.currentTime + 0.15);
  gainNode.gain.setValueAtTime(0.5, context.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.15);
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.15);
};

export const playTransitionSound = (): void => {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === 'suspended') {
      context.resume();
    }

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(100, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(600, context.currentTime + 0.3);

    gainNode.gain.setValueAtTime(0.4, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.3);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.start();
    oscillator.stop(context.currentTime + 0.3);
};

// --- Extra sounds for the toddler games ---

const sweep = (
  from: number,
  to: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume: number = 0.35,
  startOffset: number = 0
): void => {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') context.resume();
  const start = context.currentTime + startOffset;
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
  gainNode.gain.setValueAtTime(0.0001, start);
  gainNode.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
};

export const playPop = (): void => {
  sweep(500, 1400, 0.09, 'sine', 0.35);
};

export const playBoing = (): void => {
  sweep(160, 520, 0.22, 'sine', 0.35);
  sweep(320, 1040, 0.22, 'triangle', 0.08);
};

export const playCollect = (): void => {
  playTone(987.77, 0.12, 'triangle', 0.3, 0);    // B5
  playTone(1318.51, 0.22, 'triangle', 0.3, 0.07); // E6
};

export const playDing = (high: boolean = false): void => {
  playTone(high ? 1567.98 : 1174.66, 0.5, 'sine', 0.3);
  playTone(high ? 3135.96 : 2349.32, 0.3, 'sine', 0.06);
};

export const playFanfare = (): void => {
  const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
  const times = [0, 0.12, 0.24, 0.36, 0.56, 0.68];
  notes.forEach((f, i) => {
    playTone(f, i === notes.length - 1 ? 0.6 : 0.18, 'triangle', 0.3, times[i]);
    playTone(f / 2, i === notes.length - 1 ? 0.6 : 0.18, 'sine', 0.15, times[i]);
  });
};

export type HornKind = 'car' | 'truck' | 'siren' | 'tractor';

export const playHorn = (kind: HornKind): void => {
  if (kind === 'car') {
    // Beep-beep!
    [0, 0.2].forEach(offset => {
      playTone(415, 0.16, 'square', 0.12, offset);
      playTone(523, 0.16, 'square', 0.1, offset);
    });
  } else if (kind === 'truck') {
    // Deep two-tone honk
    playTone(196, 0.55, 'sawtooth', 0.12);
    playTone(247, 0.55, 'sawtooth', 0.1);
    playTone(98, 0.55, 'square', 0.06);
  } else if (kind === 'siren') {
    // Nee-naw
    for (let i = 0; i < 4; i++) {
      playTone(i % 2 === 0 ? 740 : 988, 0.3, 'triangle', 0.22, i * 0.3);
    }
  } else {
    // Putt-putt tractor
    for (let i = 0; i < 6; i++) {
      sweep(140, 60, 0.09, 'square', 0.14, i * 0.11);
    }
  }
};

// Continuous engine hum whose pitch follows the car's speed (0..1)
export interface EngineSound { set: (speed: number) => void; stop: () => void; }

export const startEngine = (): EngineSound | null => {
  const context = getAudioContext();
  if (!context) return null;
  if (context.state === 'suspended') context.resume();
  const now = context.currentTime;
  const low = context.createOscillator();
  const high = context.createOscillator();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  low.type = 'sawtooth';
  high.type = 'square';
  low.frequency.value = 55;
  high.frequency.value = 111;
  filter.type = 'lowpass';
  filter.frequency.value = 400;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.07, now + 0.25);
  const highGain = context.createGain();
  highGain.gain.value = 0.25;
  low.connect(filter);
  high.connect(highGain);
  highGain.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  low.start();
  high.start();
  let stopped = false;
  return {
    set: (speed: number) => {
      if (stopped) return;
      const s = Math.max(0, Math.min(1, speed));
      const t = context.currentTime;
      low.frequency.setTargetAtTime(50 + 110 * s, t, 0.08);
      high.frequency.setTargetAtTime(101 + 220 * s, t, 0.08);
      filter.frequency.setTargetAtTime(350 + 1100 * s, t, 0.08);
    },
    stop: () => {
      if (stopped) return;
      stopped = true;
      const t = context.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      low.stop(t + 0.35);
      high.stop(t + 0.35);
    },
  };
};

// Short wooden "tok" for blocks hitting each other
export const playThud = (strength: number = 1): void => {
  const s = Math.max(0.2, Math.min(1, strength));
  sweep(180 + Math.random() * 120, 70, 0.12, 'triangle', 0.12 + 0.2 * s);
};

export const playCoin = (): void => {
  playTone(1318.51, 0.07, 'square', 0.08, 0);
  playTone(1975.53, 0.18, 'square', 0.08, 0.06);
};

// Big crunchy crash: a burst of filtered noise plus a low boom
export const playCrash = (): void => {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') context.resume();
  const now = context.currentTime;
  const length = Math.floor(context.sampleRate * 0.5);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2500, now);
  filter.frequency.exponentialRampToValueAtTime(300, now + 0.45);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.35, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  noise.start(now);
  sweep(120, 40, 0.4, 'sine', 0.45);
};
