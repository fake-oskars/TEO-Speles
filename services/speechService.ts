import { getAudioContext } from './audioService';
import { clipText } from '../speech/phrases';

// Speaks words aloud. First choice is a pre-generated ElevenLabs clip from
// public/audio/<lang>/ (see scripts/generate-voices.mts); if a language or clip
// has none, it falls back to the browser's built-in text-to-speech.
// The browser voice is only used when it matches the chosen language — an English
// voice reading Latvian words would teach the wrong pronunciation, so we stay silent instead.

const LANG_TAGS: Record<string, string> = {
  lv: 'lv-LV',
  en: 'en-GB',
  lt: 'lt-LT',
  et: 'et-EE',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
};

let voices: SpeechSynthesisVoice[] = [];
let enabled = localStorage.getItem('toddlerPopSpeak') !== 'off';
const listeners = new Set<() => void>();

const synth = (): SpeechSynthesis | null =>
  typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

const loadVoices = () => {
  const s = synth();
  if (!s) return;
  voices = s.getVoices();
  listeners.forEach(fn => fn());
};

if (synth()) {
  loadVoices();
  synth()!.addEventListener?.('voiceschanged', loadVoices);
}

const pickVoice = (lang: string): SpeechSynthesisVoice | null => {
  const tag = (LANG_TAGS[lang] || lang).toLowerCase();
  const matching = voices.filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(lang));
  if (matching.length === 0) return null;
  return (
    matching.find(v => v.lang.replace('_', '-').toLowerCase() === tag && v.localService) ||
    matching.find(v => v.lang.replace('_', '-').toLowerCase() === tag) ||
    matching.find(v => v.localService) ||
    matching[0]
  );
};

export const hasVoice = (lang: string): boolean => !!packs[lang]?.clips || !!pickVoice(lang);

export const onVoicesChanged = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const isSpeechEnabled = (): boolean => enabled;

export const setSpeechEnabled = (on: boolean): void => {
  enabled = on;
  localStorage.setItem('toddlerPopSpeak', on ? 'on' : 'off');
  if (!on) stopSpeaking();
};

// iOS only allows speech after it was first started inside a user gesture.
export const unlockSpeech = (): void => {
  const s = synth();
  if (!s) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  s.speak(u);
};

export const speak = (
  text: string,
  lang: string,
  { rate = 0.85, pitch = 1.15, interrupt = true }: { rate?: number; pitch?: number; interrupt?: boolean } = {}
): void => {
  const s = synth();
  if (!s || !enabled || !text) return;
  const voice = pickVoice(lang);
  if (!voice) return;
  try {
    if (interrupt) s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = rate;
    u.pitch = pitch;
    s.speak(u);
  } catch (e) {
    console.error('Speech failed', e);
  }
};

export const stopSpeaking = (): void => {
  synth()?.cancel();
  stopClip();
};

// --- Pre-generated voice clips ---

interface Pack { clips: Record<string, string> | null; ready: boolean; loading?: Promise<void>; }
const packs: Record<string, Pack> = {};
const buffers = new Map<string, Promise<AudioBuffer | null>>();
let playing: AudioBufferSourceNode | null = null;

// Short content hash so a regenerated clip is never served from a stale cache
const version = (text: string) => {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

const clipUrl = (lang: string, id: string, text: string) => `/audio/${lang}/${id}.mp3?v=${version(text)}`;

const loadBuffer = (lang: string, id: string): Promise<AudioBuffer | null> => {
  const key = `${lang}/${id}`;
  let p = buffers.get(key);
  if (!p) {
    const text = packs[lang]?.clips?.[id];
    const ctx = getAudioContext();
    p = !text || !ctx
      ? Promise.resolve(null)
      : fetch(clipUrl(lang, id, text))
          .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
          .then(data => ctx.decodeAudioData(data))
          .catch(() => { buffers.delete(key); return null; });
    buffers.set(key, p);
  }
  return p;
};

// Fetches the language's clip list, then warms up every clip in the background
export const loadVoicePack = (lang: string): Promise<void> => {
  if (packs[lang]) return packs[lang].loading || Promise.resolve();
  const pack: Pack = { clips: null, ready: false };
  packs[lang] = pack;
  pack.loading = fetch(`/audio/${lang}/index.json`, { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : null))
    .then(index => {
      pack.clips = index?.clips || null;
      listeners.forEach(fn => fn());
      if (!pack.clips) return;
      const ids = Object.keys(pack.clips);
      let next = 0;
      const worker = async () => { while (next < ids.length) await loadBuffer(lang, ids[next++]); };
      // Low concurrency so it never competes with what the child is doing
      setTimeout(() => { for (let i = 0; i < 3; i++) worker(); }, 800);
    })
    .catch(() => { pack.clips = null; })
    .finally(() => { pack.ready = true; });
  return pack.loading;
};

const stopClip = () => {
  try { playing?.stop(); } catch { /* already stopped */ }
  playing = null;
};

let sayToken = 0;

// Says one clip (see speech/phrases.ts for ids), interrupting whatever was being said
export const say = (id: string, lang: string): void => {
  if (!enabled) return;
  const token = ++sayToken;
  const pack = packs[lang];
  const fallback = () => speak(clipText(lang, id), lang);

  if (!pack?.clips?.[id]) {
    // Pack may still be loading — wait briefly rather than switching voices mid-game
    if (pack && !pack.ready && pack.loading) {
      pack.loading.then(() => { if (token === sayToken) say(id, lang); });
      return;
    }
    fallback();
    return;
  }

  synth()?.cancel();
  loadBuffer(lang, id).then(buffer => {
    if (token !== sayToken || !enabled) return;
    const ctx = getAudioContext();
    if (!buffer || !ctx) { fallback(); return; }
    if (ctx.state === 'suspended') ctx.resume();
    stopClip();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => { if (playing === source) playing = null; };
    source.start();
    playing = source;
  });
};
