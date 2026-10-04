// Pre-generates every spoken clip with ElevenLabs into public/audio/<lang>/.
//
//   npm run voices              # all languages, only new/changed clips
//   npm run voices -- --lang lv # one language
//   npm run voices -- --dry     # show what would be generated and the character cost
//   npm run voices -- --force   # regenerate everything
//
// Needs ELEVENLABS_API_KEY in .env.local and ffmpeg on PATH.
// Each language folder gets an index.json that the app reads to know which clips exist.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { allClips } from '../speech/phrases.ts';

const MODEL = 'eleven_v4';

// Chosen by ear, one native voice per language
const VOICES: Record<string, { name: string; id: string }> = {
  lv: { name: 'Baiba', id: 'azBQdzUwIzEtXS9PGiGX' },
  lt: { name: 'Ugnė', id: 'EnnOVsVNRrPWieNQUZem' },
  et: { name: 'Liisa', id: 'xd3ufyLcuKKZZXDZO9H7' },
  en: { name: 'Nichalia', id: 'XfNU2rGpBa01ckF309OY' },
  es: { name: 'Ninoska', id: 'zl1Ut8dvwcVSuQSB9XkG' },
  fr: { name: 'Anaïs', id: '5OnMHwgTFgvPVwE8jP6B' },
  de: { name: 'Irene', id: '8wPhfH9uUzEMHTmRkoAR' },
};

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public', 'audio');
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const force = args.includes('--force');
const onlyLang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : null;

const readKey = () => {
  const envFile = path.join(ROOT, '.env.local');
  const m = fs.existsSync(envFile) && fs.readFileSync(envFile, 'utf8').match(/^ELEVENLABS_API_KEY=(.*)$/m);
  const key = (m ? m[1] : process.env.ELEVENLABS_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (!key && !dry) throw new Error('ELEVENLABS_API_KEY missing from .env.local');
  return key;
};

interface Index { voice: string; model: string; clips: Record<string, string>; }

const synthesize = async (key: string, voiceId: string, text: string, lang: string): Promise<Buffer> => {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL, language_code: lang }),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const body = await res.text();
    // 429 = rate limit, 409 = voice still being added to the library
    if ((res.status === 429 || res.status === 409 || res.status >= 500) && attempt < 6) {
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    throw new Error(`ElevenLabs ${res.status} for "${text}": ${body.slice(0, 200)}`);
  }
};

// Trim leading/trailing silence so playback feels instant, even out loudness, encode small mono mp3
const postProcess = (input: Buffer, outFile: string) => {
  const tmp = `${outFile}.raw.mp3`;
  fs.writeFileSync(tmp, input);
  const trim = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03';
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', tmp,
    '-af', `${trim},areverse,${trim},areverse,loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.01`,
    '-ac', '1', '-ar', '44100', '-b:a', '64k', outFile,
  ]);
  fs.unlinkSync(tmp);
};

const main = async () => {
  const key = readKey();
  const langs = onlyLang ? [onlyLang] : Object.keys(VOICES);
  let totalChars = 0;

  for (const lang of langs) {
    const voice = VOICES[lang];
    if (!voice) throw new Error(`No voice configured for ${lang}`);
    const dir = path.join(OUT, lang);
    fs.mkdirSync(dir, { recursive: true });
    const indexFile = path.join(dir, 'index.json');
    const prev: Index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { voice: '', model: '', clips: {} };
    const sameVoice = prev.voice === voice.id && prev.model === MODEL;

    const wanted = allClips(lang);
    const todo = Object.entries(wanted).filter(([id, text]) =>
      force || !sameVoice || prev.clips[id] !== text || !fs.existsSync(path.join(dir, `${id}.mp3`)));
    const chars = todo.reduce((s, [, text]) => s + text.length, 0);
    totalChars += chars;
    console.log(`${lang} (${voice.name}): ${Object.keys(wanted).length} clips, ${todo.length} to generate, ${chars} chars`);
    if (dry || todo.length === 0) continue;

    const index: Index = { voice: voice.id, model: MODEL, clips: sameVoice ? { ...prev.clips } : {} };
    let next = 0, done = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (next < todo.length) {
        const [id, text] = todo[next++];
        postProcess(await synthesize(key, voice.id, text, lang), path.join(dir, `${id}.mp3`));
        index.clips[id] = text;
        if (++done % 25 === 0) console.log(`  ${lang}: ${done}/${todo.length}`);
      }
    }));

    // Drop clips that are no longer used
    for (const id of Object.keys(index.clips)) {
      if (!(id in wanted)) {
        delete index.clips[id];
        fs.rmSync(path.join(dir, `${id}.mp3`), { force: true });
      }
    }
    const sorted = Object.fromEntries(Object.entries(index.clips).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(indexFile, JSON.stringify({ ...index, clips: sorted }, null, 1) + '\n');
    console.log(`  ${lang}: done`);
  }
  console.log(`Total characters${dry ? ' (dry run)' : ''}: ${totalChars}`);
};

main().catch(e => { console.error(e.message); process.exit(1); });
