

let audioContext: AudioContext | null = null;
let hasAudioBeenUnlocked = false;

const getAudioContext = (): AudioContext | null => {
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