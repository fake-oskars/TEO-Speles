import { ALL_ITEMS, translations } from '../constants';

// Everything the games say out loud, as stable clip ids.
// The same text is used to pre-generate ElevenLabs audio (scripts/generate-voices.mts)
// and as the browser-voice fallback, so both always say the same thing.
//
// Latvian voices mispronounce lone words (e.g. "Govs"), so in Latvian every
// word is said inside a short, grammatically correct sentence.

export const VEHICLE_NAMES = ['Car', 'Taxi', 'Race Car', 'Bus', 'Truck', 'Tractor', 'Police Car', 'Ambulance', 'Fire Truck'];

export const COLOR_KEYS = ['colorRed', 'colorOrange', 'colorYellow', 'colorGreen', 'colorBlue', 'colorPurple', 'colorPink', 'colorBrown', 'colorBlack', 'colorWhite', 'Rainbow'];

export const PRAISE_KEYS = ['amazing', 'great', 'good'];

// Latvian grammatical gender / number: m → "Tas ir", f → "Tā ir", pl → "Tās ir"
const LV_GENDER: Record<string, 'm' | 'f' | 'pl'> = {
  Cow: 'f', Pig: 'f', Dog: 'm', Cat: 'm', Sheep: 'f', Lion: 'f', Monkey: 'm', Elephant: 'm', Giraffe: 'f',
  Apple: 'm', Banana: 'm', Strawberry: 'f', Orange: 'm', Grapes: 'pl',
  Carrot: 'm', Broccoli: 'm', Tomato: 'm', Potato: 'm', 'Bell Pepper': 'f',
  Car: 'f', Bus: 'm', Airplane: 'f', Train: 'm', Boat: 'f', Rocket: 'f',
  Sun: 'f', Star: 'f', Flower: 'f', Tree: 'm',
  Ball: 'f', Balloon: 'm', Gift: 'f', Book: 'f',
  Guitar: 'f', Piano: 'pl', Drum: 'pl',
  Bear: 'm', Tiger: 'm', Rabbit: 'm', Duck: 'f', Frog: 'f', Fish: 'f',
  Pizza: 'f', Cake: 'f', 'Ice Cream': 'm', Cookie: 'm', Sandwich: 'f', 'Hot Dog': 'm',
  House: 'f', Heart: 'f', Crown: 'm', Key: 'f', Clock: 'm', Phone: 'm',
  Horse: 'm', Panda: 'f', Koala: 'f', Penguin: 'm', Owl: 'f', Butterfly: 'm',
  Hamburger: 'm', Donut: 'm', Lollipop: 'f', Candy: 'f', Popcorn: 'm', Pretzel: 'm',
  Umbrella: 'm', Rainbow: 'f', Moon: 'm', Cloud: 'm', Snowflake: 'f', Fire: 'f',
  Bee: 'f', Snail: 'm', Turtle: 'm', Whale: 'm', Dolphin: 'm', Chicken: 'f', Spider: 'm', Dinosaur: 'm', Crocodile: 'm', Mouse: 'f',
  Eyes: 'pl', Nose: 'm', Hand: 'f', Foot: 'f',
  Hat: 'f', Shoe: 'f', Shirt: 'm',
  Cheese: 'm', Bread: 'f', Milk: 'm', Egg: 'f', Watermelon: 'm', Corn: 'f', Cherry: 'm',
  Bed: 'f', Chair: 'm', Lamp: 'f', Pencil: 'm', Scissors: 'pl',
  Leaf: 'f', Mushroom: 'f', Shell: 'm', Rain: 'm',
  Robot: 'm', Bicycle: 'm', Helicopter: 'm', Ghost: 'm',
  Taxi: 'm', 'Police Car': 'f', Ambulance: 'f', 'Fire Truck': 'f', Tractor: 'm', Truck: 'f', 'Race Car': 'f',
};

const LV_PRONOUN = { m: 'Tas ir', f: 'Tā ir', pl: 'Tās ir' };

const LV_COLORS: Record<string, string> = {
  colorRed: 'Sarkanā krāsa.', colorOrange: 'Oranžā krāsa.', colorYellow: 'Dzeltenā krāsa.', colorGreen: 'Zaļā krāsa.',
  colorBlue: 'Zilā krāsa.', colorPurple: 'Violetā krāsa.', colorPink: 'Rozā krāsa.', colorBrown: 'Brūnā krāsa.',
  colorBlack: 'Melnā krāsa.', colorWhite: 'Baltā krāsa.', Rainbow: 'Varavīksnes krāsas!',
};

const LV_PHRASES: Record<string, string> = {
  'light-red': 'Sarkanā gaisma.',
  'light-yellow': 'Dzeltenā gaisma.',
  'light-green': 'Zaļā gaisma! Aiziet!',
  'praise-amazing': 'Lieliski!',
  'praise-great': 'Lielisks darbs!',
  'praise-good': 'Ļoti labi!',
  arrive: 'Urā! Mēs esam galā!',
};

// Articles for "Where is the …?" — only non-default genders are listed (default: masculine singular)
const ES_GENDER = byGender({
  f: ['Cow', 'Sheep', 'Giraffe', 'Apple', 'Strawberry', 'Orange', 'Carrot', 'Potato', 'Star', 'Flower', 'Ball', 'Guitar', 'Frog', 'Pizza', 'Cookie', 'House', 'Crown', 'Key', 'Butterfly', 'Hamburger', 'Lollipop', 'Moon', 'Cloud', 'Bee', 'Turtle', 'Whale', 'Spider', 'Nose', 'Hand', 'Shirt', 'Milk', 'Watermelon', 'Cherry', 'Bed', 'Chair', 'Lamp', 'Leaf', 'Mushroom', 'Shell', 'Rain', 'Bicycle'],
  fpl: ['Grapes', 'Popcorn', 'Scissors'],
  mpl: ['Eyes'],
});
const FR_GENDER = byGender({
  f: ['Cow', 'Giraffe', 'Apple', 'Banana', 'Strawberry', 'Orange', 'Carrot', 'Tomato', 'Potato', 'Car', 'Rocket', 'Star', 'Flower', 'Ball', 'Guitar', 'Frog', 'Pizza', 'Ice Cream', 'House', 'Crown', 'Key', 'Clock', 'Lollipop', 'Moon', 'Bee', 'Turtle', 'Whale', 'Spider', 'Mouse', 'Hand', 'Shoe', 'Shirt', 'Watermelon', 'Cherry', 'Chair', 'Lamp', 'Leaf', 'Rain'],
  pl: ['Grapes', 'Eyes', 'Scissors'],
});
const DE_GENDER = byGender({
  f: ['Cow', 'Cat', 'Giraffe', 'Banana', 'Strawberry', 'Orange', 'Carrot', 'Tomato', 'Potato', 'Bell Pepper', 'Rocket', 'Sun', 'Flower', 'Guitar', 'Drum', 'Duck', 'Pizza', 'Crown', 'Clock', 'Owl', 'Candy', 'Pretzel', 'Cloud', 'Snowflake', 'Bee', 'Snail', 'Turtle', 'Spider', 'Mouse', 'Nose', 'Hand', 'Milk', 'Watermelon', 'Cherry', 'Lamp', 'Scissors', 'Shell'],
  n: ['Pig', 'Sheep', 'Car', 'Airplane', 'Boat', 'Gift', 'Book', 'Piano', 'Ice Cream', 'Sandwich', 'House', 'Heart', 'Phone', 'Horse', 'Popcorn', 'Fire', 'Chicken', 'Crocodile', 'Shirt', 'Bread', 'Egg', 'Bed', 'Leaf', 'Bicycle', 'Ghost'],
  pl: ['Grapes', 'Eyes'],
});
const EN_PLURAL = new Set(['Grapes', 'Eyes', 'Scissors']);
const FR_ASPIRATED_H = new Set(['Owl', 'Hamburger', 'Hot Dog']);

function byGender(groups: Record<string, string[]>): Record<string, string> {
  const map: Record<string, string> = {};
  Object.entries(groups).forEach(([g, names]) => names.forEach(n => { map[n] = g; }));
  return map;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// "Where is the cow?" in each language, grammatically correct
export const findText = (lang: string, item: string, t: (k: string) => string): string => {
  const word = t(item);
  switch (lang) {
    case 'lv': return `Kur ir ${word.toLowerCase()}?`;
    case 'en': return EN_PLURAL.has(item) ? `Where are the ${word.toLowerCase()}?` : `Where is the ${word.toLowerCase()}?`;
    case 'es': {
      const g = ES_GENDER[item] || 'm';
      const art = { m: 'el', f: 'la', mpl: 'los', fpl: 'las' }[g];
      return `¿Dónde ${g.endsWith('pl') ? 'están' : 'está'} ${art} ${word.toLowerCase()}?`;
    }
    case 'fr': {
      const g = FR_GENDER[item] || 'm';
      const w = word.toLowerCase();
      if (g === 'pl') return `Où sont les ${w} ?`;
      const elide = /^[aeiouyéèêâîôœ]/.test(w) || (w.startsWith('h') && !FR_ASPIRATED_H.has(item));
      return `Où est ${elide ? "l'" : g === 'f' ? 'la ' : 'le '}${w} ?`;
    }
    case 'de': {
      const g = DE_GENDER[item] || 'm';
      if (g === 'pl') return `Wo sind die ${word}?`;
      return `Wo ist ${{ m: 'der', f: 'die', n: 'das' }[g]} ${word}?`;
    }
    default: return `${t('findThe')} ${lower(word)}?`; // lt, et: no articles
  }
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// --- Clip ids used by the games ---
export const nameClip = (item: string) => `name-${slug(item)}`;       // "Tā ir govs." / "Cow"
export const findClip = (item: string) => `find-${slug(item)}`;       // "Kur ir govs?"
export const colorClip = (key: string) => `color-${slug(key.replace(/^color/, ''))}`;
export const lightClip = (c: 'red' | 'yellow' | 'green') => `light-${c}`;
export const praiseClip = (key: string) => `praise-${key}`;
export const ARRIVE_CLIP = 'arrive';

// Every clip id, with the text spoken for it in the given language
export const allClips = (lang: string): Record<string, string> => {
  const t = (k: string) => translations[lang]?.[k] || translations.en[k] || k;
  const lv = lang === 'lv';
  const clips: Record<string, string> = {};
  const nouns = [...ALL_ITEMS.map(i => i.name), ...VEHICLE_NAMES.filter(v => !ALL_ITEMS.some(i => i.name === v))];

  nouns.forEach(name => {
    const word = t(name);
    clips[nameClip(name)] = lv ? `${LV_PRONOUN[LV_GENDER[name] || 'm']} ${word.toLowerCase()}.` : word;
  });
  ALL_ITEMS.forEach(({ name }) => { clips[findClip(name)] = findText(lang, name, t); });
  COLOR_KEYS.forEach(key => { clips[colorClip(key)] = lv ? LV_COLORS[key] : t(key); });
  (['red', 'yellow', 'green'] as const).forEach(c => {
    const color = t(`color${c[0].toUpperCase()}${c.slice(1)}`);
    clips[lightClip(c)] = lv ? LV_PHRASES[lightClip(c)] : c === 'green' ? `${color}! ${t('letsGo')}` : color;
  });
  PRAISE_KEYS.forEach(key => { clips[praiseClip(key)] = lv ? LV_PHRASES[praiseClip(key)] : t(key); });
  clips[ARRIVE_CLIP] = lv ? LV_PHRASES[ARRIVE_CLIP] : t('hooray');
  return clips;
};

const clipCache: Record<string, Record<string, string>> = {};

// Text of one clip (used for the browser-voice fallback)
export const clipText = (lang: string, id: string): string => {
  if (!clipCache[lang]) clipCache[lang] = allClips(lang);
  return clipCache[lang][id] || '';
};
